import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { hash, canonical, clone } from '../src/common.mjs';
import { syntheticDataset, observation, validateCandles } from '../src/data.mjs';
import { portfolio, execute, comparison, validateDecision } from '../src/engine.mjs';
import { Store } from '../src/store.mjs';
import { Service, versionFor } from '../src/service.mjs';
import { FixtureProvider, NearAIProvider, liveConfiguration } from '../src/providers.mjs';
import { DemoSettlement, createListing, purchaseDemo } from '../src/market.mjs';

const buy = { action:'BUY',target_bps:10000,reason:'test' }, sell = { action:'SELL',target_bps:0,reason:'test' }, hold = {action:'HOLD',target_bps:0,reason:'test'};
function setup(t, opts={}) { const s = new Store(); t.after(() => s.close()); return { s, a:new Service(s,{delay:0,...opts}) }; }
async function run(t, input={}, opts={}) { const {s,a}=setup(t,opts); const r=a.start(input,'owner','key-0001'); await a.run(r.id); return {s,a,r:s.getRun(r.id),report:s.report(r.id)}; }
test('T01 future candles cannot enter an earlier observation', () => { const data=syntheticDataset().candles, copy=clone(data); copy[30].close='1'; assert.equal(hash(observation(data,20,portfolio())),hash(observation(copy,20,portfolio()))); });
test('T02 decisions fill only at the next open; final decision unfilled', () => { const c=syntheticDataset().candles; const result=execute(portfolio(),buy,c[12],0,0); assert.equal(result.fill.at,c[12].time); assert.equal(result.fill.price_micros,c[12].open); assert.equal(execute(portfolio(),buy,undefined).fill.status,'unfilled_no_next_candle'); });
test('T03 reject NaN, unsupported actions, out-of-range targets and selling empty inventory', () => { for(const value of [{...buy,target_bps:NaN},{...buy,target_bps:10001},{...buy,action:'TRANSFER'},{...buy,target_bps:5000}]) assert.throws(()=>validateDecision(value)); assert.equal(execute(portfolio(),sell,syntheticDataset().candles[1]).fill.status,'rejected_no_position'); assert.equal(execute(portfolio('0'),buy,syntheticDataset().candles[1]).position.cash,'0'); });
test('T04 fees/slippage are charged in exact integer units', () => { const candle=syntheticDataset().candles[12]; const clean=execute(portfolio(),buy,candle,0,0), costly=execute(portfolio(),buy,candle,100,100); assert.ok(BigInt(costly.position.quantity)<BigInt(clean.position.quantity)); assert.ok(BigInt(costly.fill.fee_micros)>0n); assert.ok(BigInt(costly.fill.slippage_micros)>0n); assert.ok(BigInt(costly.position.cash)>=0n); assert.equal(BigInt(costly.position.cash)+BigInt(costly.fill.notional_micros)+BigInt(costly.fill.fee_micros),1000000000n); });
test('T05 stops before reserving a call that cannot fit; partial report remains', async t => { const {s,r,report}=await run(t); assert.equal(r.status,'partial_budget'); assert.ok(r.completed>0 && r.completed<r.config.requested_steps); assert.ok(s.summary(r.id).remaining_micros<27000); assert.ok(s.summary(r.id).settled_micros<=r.budget); assert.equal(report.completed_steps,r.completed); });
test('T06 two workers compete for one final reservation; only one admitted', async () => {
  const dir=mkdtempSync(path.join(tmpdir(),'agentproof-race-')), dbPath=path.join(dir,'race.sqlite');
  const s=new Store(dbPath), a=new Service(s,{delay:0}), r=a.start({budget_micros:100000},'owner','race-key-1'); s.updateRun(r.id,'running',0);
  const signal=new SharedArrayBuffer(4); const workers=[1,2].map(step=>new Worker(new URL('./race-worker.mjs',import.meta.url),{workerData:{path:dbPath,id:r.id,step,signal}}));
  const outputs=workers.map(w=>new Promise((resolve,reject)=>{ w.on('error',reject); w.on('message',m=>{if(!m.ready) resolve(m);}); }));
  await Promise.all(workers.map(w=>new Promise(resolve=>w.once('message',resolve)))); Atomics.store(new Int32Array(signal),0,1); Atomics.notify(new Int32Array(signal),0);
  const results=await Promise.all(outputs); assert.equal(results.filter(x=>x.admitted).length,1); assert.equal(s.summary(r.id).reserved_micros,60000); await Promise.all(workers.map(w=>w.terminate())); s.close();
});
test('T07 timeout keeps liability and suppresses automatic retry/refund', async t => { const {s,a,r,report}=await run(t,{scenario:'timeout'}); assert.equal(r.status,'failed'); assert.equal(report.ledger.unresolved_calls,1); assert.equal(report.ledger.reserved_micros,27000); assert.equal(s.calls(r.id).length,4); assert.equal(a.settlement.get(r.id).status,'funded'); await a.run(r.id); assert.equal(s.calls(r.id).length,4); });
test('T08 reservation and settlement duplicates cannot spend twice', t => { const {s,a}=setup(t); const r=a.start({},'owner','dup-key-1'); assert.equal(a.start({},'owner','dup-key-1').id,r.id); assert.throws(()=>a.start({seed:43},'owner','dup-key-1'),/IDEMPOTENCY_CONFLICT/); s.updateRun(r.id,'running',0); const c=s.reserve(r.id,11,27000,'b'.repeat(64)); assert.equal(s.reserve(r.id,11,27000,'b'.repeat(64)).admitted,false); s.settle(c.call.id,10000,{usage:'test'}); assert.equal(s.settle(c.call.id,10000,{usage:'test'}),false); assert.equal(s.summary(r.id).settled_micros,10000); assert.equal(s.entries(r.id).length,3); });
test('T09 cancellation retains in-flight cost and sends no additional request', async t => {
  let release; const provider=new FixtureProvider(), {s,a}=setup(t,{providerFactory:()=>({maxCost:()=>27000,infer:async (...args)=>{await new Promise(r=>release=r);return provider.infer(...args);}})});
  const r=a.start({},'owner','cancel-key'); const pending=a.run(r.id); await new Promise(resolve=>setImmediate(resolve)); assert.equal(s.summary(r.id).reserved_micros,27000);
  s.cancel(r.id); release(); await pending; assert.equal(s.getRun(r.id).status,'partial_canceled'); assert.equal(s.calls(r.id).length,1); assert.ok(s.summary(r.id).settled_micros>0);
});
test('T10 recorded decisions reproduce identical results without provider calls', async t => { const {s,a,r}=await run(t); const n=s.calls(r.id).length; assert.equal(a.replay(r.id).matches,true); assert.equal(a.replay(r.id).provider_calls,0); assert.equal(s.calls(r.id).length,n); });
test('T11 new run is immutable and separate even with identical configuration', async t => { const {s,a,r,report}=await run(t); const other=a.start({},'owner','another-key'); await a.run(other.id); assert.notEqual(other.id,r.id); assert.equal(s.report(r.id).hash,report.hash); assert.notEqual(s.report(other.id).hash,report.hash); });
test('T12 all baselines use the exact completed horizon', async t => { const {report}=await run(t); for(const key of ['agent','cash','buy_hold']) assert.equal(report.results[key].curve.length,report.completed_steps+1); assert.equal(report.results.agent.curve.at(-1).at,report.results.buy_hold.curve.at(-1).at); assert.equal(report.results.cash.metrics.return_bps,0); });
test('T13 another version cannot reuse the report for a listing', async t => { const {s,r}=await run(t); assert.throws(()=>createListing(s,r.id,'a'.repeat(64),'owner'),/VERSION_MISMATCH/); assert.throws(()=>createListing(s,r.id,r.config.version.hash,'stranger'),/NOT_OWNER/); });
test('T14 purchase checks exact version and terms; repeat is idempotent', async t => { const {s}=await run(t); const l=JSON.parse(s.db.prepare('SELECT body FROM listings').get().body); assert.throws(()=>purchaseDemo(s,'buyer',l.id,'a'.repeat(64),l.terms_hash),/VERSION_MISMATCH/); assert.throws(()=>purchaseDemo(s,'buyer',l.id,l.version_hash,'b'.repeat(64)),/TERMS_MISMATCH/); const first=purchaseDemo(s,'buyer',l.id,l.version_hash,l.terms_hash); assert.equal(purchaseDemo(s,'buyer',l.id,l.version_hash,l.terms_hash).id,first.id); assert.equal(first.network,'none'); });
test('T15 local settlement model rejects overcharge, wrong manifest and double withdrawal', t => { const {s}=setup(t), d=new DemoSettlement(s); d.fund('job','buyer','a'.repeat(64),'100'); assert.throws(()=>d.commit('job','b'.repeat(64),'c'.repeat(64)),/MANIFEST_MISMATCH/); d.commit('job','a'.repeat(64),'c'.repeat(64)); assert.throws(()=>d.settle('job','101','n'),/OVERCHARGE/); d.settle('job','20','n'); assert.throws(()=>d.settle('job','21','x'),/ALREADY_SETTLED/); d.withdraw('job','buyer'); assert.throws(()=>d.withdraw('job','buyer'),/NOT_WITHDRAWABLE/); });
test('T16 failed simulated transfer restores refund; duplicate callback cannot pay twice', t => { const {s}=setup(t), d=new DemoSettlement(s); d.fund('job','buyer','a'.repeat(64),'100'); d.commit('job','a'.repeat(64),'b'.repeat(64)); d.settle('job','20','n'); const pending=d.withdraw('job','buyer'); const failed=d.callback('job',pending.transfer_nonce,false); assert.equal(failed.refundable,'80'); const again=d.withdraw('job','buyer'); const done=d.callback('job',again.transfer_nonce,true); assert.equal(done.withdrawn,'80'); assert.equal(d.callback('job',again.transfer_nonce,true).withdrawn,'80'); assert.equal(BigInt(done.charge)+BigInt(done.refundable)+BigInt(done.pending)+BigInt(done.withdrawn),BigInt(done.deposit)); });
test('T18 every fixture report labels synthetic data and zero real provider spend', async t => { const {report}=await run(t); assert.equal(report.mode,'fixture'); assert.equal(report.data_kind,'synthetic'); assert.equal(report.model_usage.actual_provider_cost_micros,0); assert.equal(report.manifest.prices.synthetic,true); });
test('T19 live calls require server approval; free fixtures work without a key', t => { const {a}=setup(t,{live:liveConfiguration({})}); assert.throws(()=>a.start({mode:'live'},'owner','live-key-1'),/required/); assert.equal(a.start({},'owner','fixture-key').mode,'fixture'); });
test('T20 raw model rationale and API keys do not enter reports', async t => {
  const fixture=new FixtureProvider(); const {report}=await run(t,{}, {providerFactory:()=>({maxCost:()=>27000,infer:async(...args)=>{const result=await fixture.infer(...args);result.decision.reason='SECRET-DO-NOT-LOG';return result;}})});
  assert.equal(JSON.stringify(report).includes('SECRET-DO-NOT-LOG'),false); assert.equal('prompt' in report.manifest.version,false);
});
test('T21 seed, price-relevant fees, budget and prompt version change the manifest hash', t => { const {a}=setup(t); const original=a.config({}); for(const b of [{seed:43},{fee_bps:11},{budget_micros:240001},{version_id:'atlas-v2'}]) assert.notEqual(a.config(b).manifest_hash,original.manifest_hash); });
test('T22 strict live mode is rejected even when an operator has enabled the adapter', t => {
  const original=process.env.NEAR_AI_API_KEY;
  process.env.NEAR_AI_API_KEY='unit-test-placeholder';
  try {
    const config=liveConfiguration({NEAR_AI_API_KEY:'unit-test-placeholder',NEAR_AI_MODEL:'unit-test-model',LIVE_ALLOW_ESTIMATED_CAP:'true',
      LIVE_APPROVED_DAILY_MICROS:'1000000',LIVE_INPUT_MICROS_PER_MILLION:'1000000',LIVE_OUTPUT_MICROS_PER_MILLION:'1000000'});
    const {a}=setup(t,{live:config}); assert.equal(a.live.strict_cap_supported,false); assert.equal(a.live.prices.bound_verified,false);
    assert.throws(()=>a.config({mode:'live',strict_cap:true}),e=>e.code==='STRICT_CAP_UNAVAILABLE');
    assert.equal(a.config({mode:'live',strict_cap:false}).strict_cap,false);
  } finally { if(original===undefined) delete process.env.NEAR_AI_API_KEY; else process.env.NEAR_AI_API_KEY=original; }
});
test('project daily cap spans runs and retains unresolved reservations from an earlier day', t => {
  const {s,a}=setup(t); const config={...a.config({}),mode:'live'};
  const first=s.createRun(config,'owner','daily-first'), second=s.createRun(config,'owner','daily-second');
  s.updateRun(first.id,'running',0); s.updateRun(second.id,'running',0);
  assert.equal(s.reserve(first.id,11,40000,'a'.repeat(64),60000).admitted,true);
  s.db.prepare("UPDATE calls SET created='2026-01-01T00:00:00.000Z',state='unreconciled' WHERE run_id=?").run(first.id);
  assert.equal(s.reserve(second.id,11,40000,'b'.repeat(64),60000).admitted,false);
});
test('invalid model output becomes HOLD while its actual usage stays charged', async t => { const {report}=await run(t,{scenario:'invalid'}); assert.equal(report.model_usage.invalid_decisions,1); assert.equal(report.decisions[2].decision.action,'HOLD'); assert.ok(report.ledger.settled_micros>0); });
test('zero budget produces a truthful zero-completion partial report', async t => { const {s,r,report}=await run(t,{budget_micros:0}); assert.equal(r.status,'partial_budget'); assert.equal(report.completed_steps,0); assert.equal(s.calls(r.id).length,0); assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM listings').get().n,0); });
test('full window completes; terminal action without a next candle is explicitly unfilled', async t => { const {report}=await run(t,{budget_micros:3000000}); assert.equal(report.status,'completed'); assert.equal(report.completed_steps,report.requested_steps); assert.equal(report.results.agent.fills.at(-1).status,'unfilled_no_next_candle'); });
test('malformed candle order and zero price are rejected', () => { const c=syntheticDataset().candles; const reversed=clone(c); reversed.reverse(); assert.throws(()=>validateCandles(reversed),/UNSORTED/); const zero=clone(c); zero[0].close='0'; assert.throws(()=>validateCandles(zero),/INVALID_PRICE/); });
test('append-only report and ledger database constraints reject changes', async t => { const {s,r}=await run(t); assert.throws(()=>s.db.prepare('UPDATE reports SET body=? WHERE run_id=?').run('{}',r.id),/IMMUTABLE_REPORT/); assert.throws(()=>s.db.prepare('DELETE FROM budget_entries WHERE run_id=?').run(r.id),/APPEND_ONLY_LEDGER/); });
test('restart marks outstanding requests unresolved instead of retrying them', t => { const {s,a}=setup(t); const r=a.start({},'owner','restart-key'); s.updateRun(r.id,'running',0); s.reserve(r.id,11,27000,'b'.repeat(64)); a.recoverInterrupted(); assert.equal(s.getRun(r.id).status,'failed'); assert.equal(s.summary(r.id).reserved_micros,27000); assert.equal(s.summary(r.id).unresolved_calls,1); });
test('provider adapter uses usage including reasoning once, with mocked transport only', async () => {
  let sent; const config={approved:true,model:'test-model',daily_cap:1000000,prices:{input_per_million:1000000,output_per_million:2000000,max_input_tokens:8192,max_output_tokens:256}};
  const provider=new NearAIProvider(config,'unit-test-placeholder',async (url, options)=>{sent={url,body:JSON.parse(options.body)}; return new Response(JSON.stringify({id:'mock-request',choices:[{message:{content:JSON.stringify(hold)}}],usage:{prompt_tokens:100,completion_tokens:50,completion_tokens_details:{reasoning_tokens:20}}}),{headers:{'Content-Type':'application/json'}});});
  const result=await provider.infer(observation(syntheticDataset().candles,11,portfolio()),versionFor('atlas-v1','live','test-model'));
  assert.equal(result.cost_micros,200); assert.equal(result.reasoning_tokens,20); assert.equal(sent.body.max_tokens,256); assert.equal(sent.url,'https://cloud-api.near.ai/v1/chat/completions'); assert.equal(sent.body.tools,undefined);
});
test('provider cost overrun records true cost and halts execution', async t => { const f=new FixtureProvider(); const {a,report}=await run(t,{}, {providerFactory:()=>({maxCost:()=>27000,infer:async(...args)=>({...await f.infer(...args),cost_micros:28000})})}); assert.equal(report.status,'failed'); assert.equal(report.ledger.settled_micros,28000); assert.equal(a.kill,true); });
test('canonical hash is key-order independent and rejects floating/invalid numbers', () => { assert.equal(hash({b:2,a:1}),hash({a:1,b:2})); assert.throws(()=>canonical({v:NaN})); assert.throws(()=>canonical({v:0.1})); });
