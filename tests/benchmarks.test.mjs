import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { Service } from '../src/service.mjs';
import { Benchmarks } from '../src/benchmarks.mjs';
import { BenchmarkChain } from '../src/benchmark-chain.mjs';
import { BenchmarkData, BENCHMARK_PROTOCOL, benchmarkCSV } from '../src/benchmark-data.mjs';
import { createListing } from '../src/market.mjs';
import { hash, canonical, uid } from '../src/common.mjs';

const raw=c=>Array.from({length:c.rows},(_,i)=>[Date.parse(c.start)/1000+i*3600,99,105,100,100+(i%5),1]);
const fixtureData=service=>({load:async(c,owner)=>service.bots.importCSV({csv:benchmarkCSV(raw(c),c),source:'Controlled test fixture'},owner)});
function setup(t,options={}){const store=new Store();t.after(()=>store.close());const service=new Service(store,{delay:0});const suite=new Benchmarks(service,{data:fixtureData(service),...options});return {store,service,suite};}
const start=s=>s.start({version_id:'atlas-v1',publish_results:true},'owner');

test('fixed benchmark runs four fresh complete cases, binds data and exposes all attempts',async t=>{
  const {suite,service,store}=setup(t);const attempt=start(suite);await suite.wait(attempt.id);const b=suite.get(attempt.id);
  assert.equal(b.status,'completed');assert.equal(b.verified,false);assert.equal(b.network,'local');
  assert.equal(b.result.cases.length,4);assert.equal(b.result.completed_steps,628);assert.equal(b.result.completed_cases,4);
  assert.equal(b.manifest_hash,hash(b.manifest));assert.equal(b.result_hash,hash(b.result));
  assert.deepEqual(b.manifest.cases.map(c=>c.id),BENCHMARK_PROTOCOL.cases.map(c=>c.id));
  for(const c of b.result.cases){assert.equal(c.completed,157);assert.equal(c.cost_2x.multiplier,2);assert.equal(store.report(c.run_id).model_usage.actual_provider_cost_micros,0);assert.equal(store.getRun(c.run_id).config.dataset.content_hash,c.dataset_hash);
    assert.equal(c.fills,c.metrics.trades);assert.equal(c.order_attempts,c.fills+1,'terminal unfilled record must not count as a trade');}
  const next=start(suite);await suite.wait(next.id);assert.equal(suite.list(b.version.hash).length,2);
  assert.equal(suite.get(next.id).manifest.cases[0].dataset_hash,b.manifest.cases[0].dataset_hash);
  assert.notEqual(suite.get(next.id).manifest.cases[0].run_id,b.manifest.cases[0].run_id);
  assert.equal(service.active.size,0);assert.equal(suite.active.size,0);
});

test('benchmark refuses private, paid, caller-selected cases and overlap before execution',async t=>{
  const {suite,service,store}=setup(t);const secret=service.bots.register({name:'Private',kind:'rules',owns_rights:true},'owner');
  const paid=service.bots.register({name:'Prompt',kind:'prompt',prompt:'SECRET_PROMPT',model:'model-id',owns_rights:true},'owner');
  assert.throws(()=>suite.start({version_id:secret.id,publish_results:true},'owner'),/PUBLIC_LISTING_REQUIRED/);
  assert.throws(()=>suite.start({version_id:paid.id,publish_results:true},'owner'),/BENCHMARK_NO_PAID_INFERENCE/);
  assert.throws(()=>suite.start({version_id:'atlas-v1',publish_results:true,fee_bps:0},'owner'),/FIXED_BENCHMARK_PROTOCOL/);
  assert.throws(()=>suite.start({version_id:'atlas-v1'},'owner'),/PUBLIC_RESULTS_CONFIRMATION_REQUIRED/);
  assert.throws(()=>suite.start(null,'owner'),/INVALID_BENCHMARK_INPUT/);
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM benchmarks').get().n,0);
  const b=start(suite);assert.throws(()=>start(suite),/BENCHMARK_BUSY/);await suite.wait(b.id);
});

test('FINAL commitment precedes every provider call; aggregate proof follows all cases',async t=>{
  let committed=false,finished=false,calls=0;const events=[];
  const anchor={prepare:async(m,record)=>{await Promise.resolve();committed=true;events.push('commit');record({method:'fund_job'});return {manifest_hash:hash(m),network:'testnet'};},
    finish:async(m,r)=>{assert.equal(r.completed_cases,4);assert.equal(calls,628);events.push('finish');finished=true;return {matches:true};}};
  const {suite,service}=setup(t,{anchor});const original=service.provider.bind(service);service.providerFactory=c=>{const provider=original(c),infer=provider.infer.bind(provider);provider.infer=async(...args)=>{assert.equal(committed,true);assert.equal(finished,false);calls++;return infer(...args);};return provider;};
  const b=start(suite);await suite.wait(b.id);assert.equal(suite.get(b.id).verified,true);assert.deepEqual(events,['commit','finish']);
  const journal=suite.get(b.id).events.map(e=>e.kind);assert.ok(journal.indexOf('committed')<journal.indexOf('executing'));assert.ok(journal.indexOf('result')<journal.indexOf('confirmed'));
});

test('failed precommit never starts a provider and remains in public attempt history',async t=>{
  const {suite,service}=setup(t,{anchor:{prepare:async()=>{throw new Error('RPC failure with SECRET');}}});
  service.providerFactory=()=>{assert.fail('No execution before confirmed commitment');};
  const a=start(suite);await suite.wait(a.id);const b=suite.get(a.id);
  assert.equal(b.status,'failed');assert.equal(b.verified,false);assert.equal(b.progress.length,4);assert.ok(b.progress.every(c=>c.status==='failed'&&c.completed===0));
  assert.equal(b.error,'BENCHMARK_INTERRUPTED');assert.equal(JSON.stringify(suite.list()).includes('SECRET'),false);
});

test('one failed case cannot disappear or produce a completed benchmark',async t=>{
  const {suite,service}=setup(t);const run=service.run.bind(service);let count=0;
  service.run=async id=>{if(++count===2)throw new Error('interrupted');return run(id);};
  const a=start(suite);await suite.wait(a.id);const b=suite.get(a.id);
  assert.equal(count,4);assert.equal(b.status,'incomplete');assert.equal(b.result.completed_cases,3);assert.equal(b.result.cases[1].complete,false);
  assert.equal(b.result.cases[1].status,'failed');assert.equal(b.result.cases.length,4);assert.equal(b.verified,false);
});

test('final chain failure does not label a complete local result as verified',async t=>{
  const anchor={prepare:async m=>({manifest_hash:hash(m)}),finish:async()=>{throw new Error('offline');}};
  const {suite}=setup(t,{anchor});const a=start(suite);await suite.wait(a.id);const b=suite.get(a.id);
  assert.equal(b.status,'failed');assert.equal(b.result.completed_cases,4);assert.equal(b.verified,false);assert.equal(b.proof,null);
});

test('attempts and all events reject update/delete, including failures and result hashes',async t=>{
  const {suite,store}=setup(t);const a=start(suite);await suite.wait(a.id);
  for(const table of ['benchmarks','benchmark_events']){assert.throws(()=>store.db.exec('DELETE FROM '+table),/APPEND_ONLY_BENCHMARK/);assert.throws(()=>store.db.exec('UPDATE '+table+" SET body='{}'"),/APPEND_ONLY_BENCHMARK/);}
});

test('recovery marks unfinished attempts publicly without running or silently retrying',t=>{
  const {suite,store,service}=setup(t);const id=uid(),version=service.catalog('owner')[0];
  store.db.prepare('INSERT INTO benchmarks VALUES(?,?,?)').run(id,version.hash,canonical({id,version,protocol:BENCHMARK_PROTOCOL,network:'local'}));suite.event(id,'started');
  service.run=()=>assert.fail('No restart execution');suite.recoverInterrupted();suite.recoverInterrupted();
  assert.equal(suite.get(id).status,'interrupted');assert.equal(suite.get(id).events.filter(e=>e.kind==='interrupted').length,1);
});

test('market snapshots reject missing/duplicate hours and ignore user labels when caching',async t=>{
  const {service}=setup(t);const c=BENCHMARK_PROTOCOL.cases[0],rows=raw(c);
  assert.throws(()=>benchmarkCSV(rows.slice(1),c),/BENCHMARK_DATA_GAP/);
  assert.throws(()=>benchmarkCSV([...rows.slice(1),rows[1]],c),/BENCHMARK_DATA_GAP/);
  assert.equal(benchmarkCSV([...rows,[Date.parse(c.end)/1000,99,105,100,101,1]],c),benchmarkCSV(rows,c));
  let fetches=0;const data=new BenchmarkData(service.bots,async()=>{fetches++;return {ok:true,json:async()=>rows};});
  const a=await data.load(c,'owner'),b=await data.load(c,'different-owner');assert.equal(fetches,1);assert.equal(a.content_hash,b.content_hash);assert.notEqual(a.id,b.id);
});

test('chain verification compares all identifiers, counts and final state',async()=>{
  let job=null;const version={hash:'a'.repeat(64),terms_hash:'b'.repeat(64)},manifest={attempt_id:uid(),version,requested_steps:628};
  const client={contract:'demo.testnet',keys:{seller:{account_id:'seller.demo.testnet'}},checkNetwork:async()=>{},
    view:async method=>method==='get_version'?{owner:'seller.demo.testnet',terms_hash:version.terms_hash}:job,
    call:async(role,method,args)=>{if(method==='fund_job')job={...args,state:0};if(method==='commit_result')job={...job,...args,state:1};if(method==='settle_job')job.state=2;return {method,hash:'tx',receipt:{}};}};
  const chain=new BenchmarkChain({serial:fn=>fn()},()=>client),txs=[];const anchor=await chain.prepare(manifest,t=>txs.push(t));
  assert.match(anchor.job_id,/^[A-Za-z0-9_-]{1,80}$/);
  const result={completed_steps:628,all_completed:true};assert.equal((await chain.finish(manifest,result,anchor,t=>txs.push(t))).matches,true);
  assert.deepEqual(txs.map(t=>t.method),['fund_job','commit_result','settle_job']);assert.ok(txs.every(t=>!Object.hasOwn(t,'receipt')));
  job.completed_steps=627;assert.equal((await chain.verify(manifest,result,anchor)).matches,false);
  job.completed_steps=628;job.manifest_hash='c'.repeat(64);assert.equal((await chain.verify(manifest,result,anchor)).checks.manifest,false);
});

test('custom partial executions cannot become new marketplace listings',async t=>{
  const {service,store}=setup(t);const v=service.bots.register({name:'Partial',kind:'rules',owns_rights:true},'owner');
  const original=service.provider.bind(service);service.providerFactory=c=>{const p=original(c),infer=p.infer.bind(p);p.infer=async(...args)=>{const r=await infer(...args);service.kill=true;return r;};return p;};
  const run=service.start({version_id:v.id,length:24},'owner','partial-sale-test');await service.run(run.id);
  assert.equal(store.report(run.id).completed_steps,1);assert.equal(store.report(run.id).inspection.publishable,true);
  assert.throws(()=>createListing(store,run.id,v.hash,'owner'),/Complete the inspection/);
});
