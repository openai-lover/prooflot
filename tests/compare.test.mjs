import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { Service } from '../src/service.mjs';
import { Comparisons } from '../src/compare.mjs';
import { assessReport,periodResults } from '../src/assessment.mjs';
import { ChainMarket } from '../src/chain-market.mjs';
import { syntheticDataset } from '../src/data.mjs';
import { hash } from '../src/common.mjs';
const setup=t=>{const store=new Store();t.after(()=>store.close());const service=new Service(store,{delay:0});return {store,service,compare:new Comparisons(service)};};
const rule=(service,name,owner='seller')=>service.bots.register({name,version:'1',kind:'rules',threshold_bps:name==='Slow'?180:80,lookback:12,owns_rights:true},owner);
async function completed(t,input={}){const context=setup(t),bot=rule(context.service,'Fast'),run=context.service.start({version_id:bot.id,length:48,...input},'seller','assessment-run');await context.service.run(run.id);return {...context,run,report:context.store.report(run.id)};}

test('cost assessment reuses recorded decisions, preserves the report and reveals sample limits',async t=>{
  const {service,store,run,report}=await completed(t),before=JSON.stringify(report),calls=store.calls(run.id).length;
  const a=assessReport(report,service.data(run.config).candles);assert.equal(a.report_hash,report.hash);assert.equal(JSON.stringify(report),before);assert.equal(store.calls(run.id).length,calls);
  assert.ok(a.evidence.fills>0);assert.ok(a.flags.some(f=>f.id==='short_sample'));assert.ok(a.flags.some(f=>f.id==='synthetic'));
  assert.equal(a.cost_scenarios[0].return_bps,report.results.agent.metrics.return_bps);assert.ok(a.cost_scenarios[2].return_bps<a.cost_scenarios[0].return_bps);
  assert.equal(a.periods.length,3);assert.equal(a.periods[0].start,a.evidence.start);assert.equal(a.periods[2].end,a.evidence.end);
  const {hash:expected,...body}=a;assert.equal(hash(body),expected);
});
test('assessment rejects changed market data and reports unsupported cost ranges',async t=>{
  const {service,run,report}=await completed(t,{fee_bps:501});const candles=service.data(run.config).candles;
  assert.equal(assessReport(report,candles).cost_scenarios[1].available,false);
  const changed=structuredClone(candles);changed[0].close='1';assert.throws(()=>assessReport(report,changed),/ASSESSMENT_DATA_MISMATCH/);
});
test('period returns deduplicate terminal points and preserve the observed position path',()=>{
  const curve=[100,110,99,108].map((x,i)=>({at:new Date(Date.UTC(2026,0,1,i)).toISOString(),equity_micros:String(x)}));
  const p=periodResults([...curve,curve.at(-1)]);assert.deepEqual(p.map(x=>x.return_bps),[1000,-1000,909]);assert.equal(p[1].max_drawdown_bps,1000);assert.deepEqual(periodResults(curve.slice(0,2)),[]);
});
test('zero-completion assessment does not invent period returns or elapsed time',async t=>{
  const {service,store}=setup(t),run=service.start({budget_micros:0},'seller','empty-assessment');await service.run(run.id);const a=assessReport(store.report(run.id),service.data(run.config).candles);
  assert.deepEqual(a.periods,[]);assert.equal(a.evidence.duration_seconds,0);assert.ok(a.flags.some(f=>f.id==='partial'));
});
test('comparison executes fresh bot versions with the same frozen CSV, costs and complete window',async t=>{
  const {service,store,compare}=setup(t),a=rule(service,'Fast'),b=rule(service,'Slow');const candles=syntheticDataset(19,24).candles;
  const csv='time,open,high,low,close\n'+candles.map(c=>[c.time,...['open','high','low','close'].map(k=>(Number(c[k])/1e6).toFixed(6))].join(',')).join('\n');
  const data=service.bots.importCSV({csv,source:'Parser test fixture'},'seller');const batch=compare.start({version_ids:[a.id,b.id],dataset_id:data.id,fee_bps:20,slippage_bps:12},'seller');await compare.wait(batch.id);
  const result=compare.get(batch.id,'seller');assert.equal(result.comparable,true);assert.equal(result.synthetic,false);assert.equal(result.rows.length,2);
  assert.equal(result.profile.dataset,data.content_hash);assert.equal(result.profile.fee_bps,20);assert.equal(result.profile.slippage_bps,12);
  for(const r of result.rows){assert.equal(r.completed,13);assert.equal(r.actual_model_cost_micros,0);assert.equal(store.getRun(r.run_id).config.dataset.id,data.id);}
  assert.notEqual(result.rows[0].run_id,result.rows[1].run_id);assert.deepEqual(result.rows[0].window,result.rows[1].window);assert.throws(()=>compare.get(batch.id,'stranger'),/NOT_OWNER/);
});
test('comparison rejects paid inference, private bots and duplicates before creating any runs',t=>{
  const {service,store,compare}=setup(t),privateBot=rule(service,'Private','other');const prompt=service.bots.register({name:'Prompt',kind:'prompt',prompt:'SECRET_PROMPT_SENTINEL',model:'unconfigured',owns_rights:true},'seller');
  for(const [ids,error] of [[[prompt.id,'atlas-v1'],'COMPARISON_NO_PAID_INFERENCE'],[[privateBot.id,'atlas-v1'],'UNKNOWN_VERSION'],[['atlas-v1','atlas-v1'],'SELECT_TWO_OR_THREE_BOTS']])assert.throws(()=>compare.start({version_ids:ids},'seller'),e=>e.code===error);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM runs').get().n,0);
});
test('comparison refuses overlap and fails closed when one execution is interrupted',async t=>{
  const {service,compare}=setup(t);const original=service.run.bind(service);let n=0;
  service.run=async id=>{if(++n===2)throw new Error('test interrupted');return original(id);};
  const batch=compare.start({version_ids:['atlas-v1','atlas-v2'],length:24},'seller');assert.throws(()=>compare.start({version_ids:['atlas-v1','atlas-v2']},'seller'),/COMPARISON_BUSY/);await compare.wait(batch.id);
  const result=compare.get(batch.id,'seller');assert.equal(result.finished,true);assert.equal(result.comparable,false);assert.equal(result.rows[1].status,'failed');assert.equal(result.rows[1].completed,0);assert.equal(compare.active.size,0);
});
test('read-only chain check compares final version, terms, price and report bindings',async t=>{
  const {service,store}=setup(t);const run=service.start({length:24,budget_micros:1000000},'seller','chain-proof-test');await service.run(run.id);
  const l=JSON.parse(store.db.prepare('SELECT body FROM listings').get().body),r=store.report(run.id),chain=new ChainMarket(store);
  store.db.prepare('INSERT INTO chain_listings VALUES(?,?)').run(l.id,JSON.stringify({contract:'test.testnet',job_id:run.id,seller:'seller.testnet'}));
  let mismatch=false,networkChecks=0;const client={contract:'test.testnet',checkNetwork:async()=>networkChecks++,view:async name=>name==='get_listing'?{seller:'seller.testnet',version_hash:l.version_hash,report_hash:r.hash,terms_hash:l.terms_hash,price:mismatch?'1':l.price_yocto}:{report_hash:r.hash,manifest_hash:r.manifest_hash,completed_steps:r.completed_steps,state:2}};
  assert.equal((await chain.verifyListing(l,client)).matches,true);mismatch=true;const proof=await chain.verifyListing(l,client);assert.equal(proof.matches,false);assert.equal(proof.checks.price,false);assert.equal(networkChecks,2);assert.equal(proof.finality,'FINAL');
});
