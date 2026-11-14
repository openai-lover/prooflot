import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { Service } from '../src/service.mjs';
import { createListing, purchaseDemo } from '../src/market.mjs';
import { syntheticDataset } from '../src/data.mjs';
import { PythonProvider } from '../src/bot-runner.mjs';
import { portfolio } from '../src/engine.mjs';
import { observation } from '../src/data.mjs';
import { importBtcSample } from '../src/market-data.mjs';
const setup=t=>{const store=new Store();t.after(()=>store.close());return {store,service:new Service(store,{delay:0})};};
const rules={name:'Creator trend',kind:'rules',threshold_bps:100,lookback:8,owns_rights:true};
test('creator can register, run, inspect, price, sell; buyer can retest but not resell',async t=>{
  const {store,service}=setup(t),bot=service.bots.register(rules,'seller');
  assert.throws(()=>service.start({version_id:bot.id},'stranger','private'),/PRIVATE_BOT/);
  const run=service.start({version_id:bot.id,length:48,budget_micros:0},'seller','seller-run');await service.run(run.id);
  const report=store.report(run.id);assert.equal(report.completed_steps,37);assert.equal(report.inspection.publishable,true);assert.equal(report.model_usage.actual_provider_cost_micros,0);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM listings').get().n,0);
  const listing=createListing(store,run.id,bot.hash,'seller','12300000000000000000000');assert.equal(listing.price_yocto,'12300000000000000000000');
  purchaseDemo(store,'buyer',listing.id,bot.hash,listing.terms_hash);
  const retest=service.start({version_id:bot.id,length:48,budget_micros:0},'buyer','buyer-run');await service.run(retest.id);
  assert.deepEqual(store.report(retest.id).results,report.results);assert.throws(()=>createListing(store,retest.id,bot.hash,'buyer'),/NOT_BOT_AUTHOR/);
  assert.throws(()=>store.db.prepare('UPDATE bots SET body=? WHERE id=?').run('{}',bot.id),/immutable version/);
});
test('private code never appears in catalog, estimate or report; invalid actions block sale',async t=>{
  const {store,service}=setup(t),source='def decide(observation):\n    return {"action":"TRANSFER","target_bps":0,"reason":"PRIVATE_CODE_SENTINEL"}';
  const bot=service.bots.register({...rules,kind:'python',source},'seller');
  assert.equal(JSON.stringify(service.catalog('seller')).includes('PRIVATE_CODE_SENTINEL'),false);
  assert.equal(JSON.stringify(service.estimate({version_id:bot.id},'seller')).includes('PRIVATE_CODE_SENTINEL'),false);
  service.providerFactory=()=>({maxCost:()=>0,infer:async()=>({decision:{action:'TRANSFER'},input_tokens:0,output_tokens:0,cost_micros:0,reasoning_tokens:0,provider_request_id:null,latency_ms:0})});
  const run=service.start({version_id:bot.id,length:24},'seller','invalid-run');await service.run(run.id);const report=store.report(run.id);
  assert.equal(report.inspection.publishable,false);assert.equal(JSON.stringify(report).includes('PRIVATE_CODE_SENTINEL'),false);
  assert.throws(()=>createListing(store,run.id,bot.hash,'seller'),/INSPECTION_FAILED/);
});
test('CSV import rejects malformed OHLC and runs the frozen uploaded dataset',async t=>{
  const {store,service}=setup(t),bot=service.bots.register(rules,'seller');
  const format=p=>(Number(p)/1000000).toFixed(6);const csv='time,open,high,low,close\n'+syntheticDataset(5,24).candles.map(c=>[c.time,...['open','high','low','close'].map(k=>format(c[k]))].join(',')).join('\n');
  const dataset=service.bots.importCSV({csv,source:'User fixture for parser test'},'seller');
  assert.throws(()=>service.bots.dataset(dataset.id,'stranger'),/PRIVATE_DATASET/);
  const run=service.start({version_id:bot.id,dataset_id:dataset.id,budget_micros:0},'seller','csv-run');await service.run(run.id);assert.equal(store.report(run.id).data_kind,'user_upload');assert.equal(service.replay(run.id).matches,true);
  assert.throws(()=>service.bots.importCSV({csv:csv.replace('time,open,high,low,close','open,close'),source:'test'},'seller'),/CSV_HEADER/);
});
test('real isolated Python executes uploaded code with no network or host mount',{skip:process.env.RUN_DOCKER_TESTS!=='1'},async()=>{
  const provider=new PythonProvider();try{const source=`import os, socket\ndef decide(obs):\n    try:\n        socket.create_connection(("1.1.1.1",443),timeout=0.2)\n        action="TRANSFER"\n    except OSError:\n        action="HOLD"\n    assert os.getuid()!=0\n    assert not os.environ.get("NEAR_AI_API_KEY")\n    return {"action":action,"target_bps":0,"reason":"isolated"}\n`;
    const r=await provider.infer(observation(syntheticDataset().candles,11,portfolio()),{source});assert.equal(r.decision.action,'HOLD');assert.equal(r.cost_micros,0);
  }finally{provider.close();}
});
test('public market importer rejects missing hours and uses only the requested closed interval',async t=>{
  const {service}=setup(t),start=Date.parse('2026-11-01T00:00:00Z')/1000;
  const rows=Array.from({length:73},(_,i)=>[start+i*3600,99,101,100,100.5,12]).reverse();
  const mock=async()=>({ok:true,json:async()=>rows});const d=await importBtcSample(service.bots,'seller',mock);assert.equal(d.rows,72);assert.equal(d.end_at,'2026-11-03T23:00:00.000Z');
  await assert.rejects(()=>importBtcSample(service.bots,'other',async()=>({ok:true,json:async()=>rows.slice(2)})),/MARKET_DATA_GAP/);
});
