import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { createApp } from '../src/server.mjs';
import { benchmarkCSV } from '../src/benchmark-data.mjs';
import {createHash} from 'node:crypto';

async function app(t,options={}) {
  const store=new Store(), result=createApp({store,delay:0,...options}); await new Promise(r=>result.server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>result.server.close(r));store.close();});
  const url='http://127.0.0.1:'+result.server.address().port;
  const initial=await fetch(url+'/api/catalog'); const cookie=initial.headers.get('set-cookie').split(';')[0];
  const request=(route,body,extra={})=>fetch(url+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-AgentProof':'1',Cookie:cookie,...extra},body:body===undefined?undefined:JSON.stringify(body)});
  return {...result,url,cookie,request};
}
test('HTTP flow: run, report, hash verify, local license, exact artifact',async t=>{
  const {request,store,service}=await app(t); const started=await request('/api/runs',{}, {'Idempotency-Key':'http-flow-key'});assert.equal(started.status,202); const {id}=await started.json();
  while(service.active.size) await new Promise(r=>setTimeout(r,5));
  const report=await (await request('/api/runs/'+id+'/report')).json(); assert.equal(report.status,'partial_budget');
  assert.equal((await (await request('/api/verify-report',report)).json()).matches,true);
  const tampered={...report,completed_steps:999}; assert.equal((await (await request('/api/verify-report',tampered)).json()).matches,false);
  const [listing]=await (await request('/api/listings')).json(); const purchase=await request('/api/licenses/demo-purchase',{listing_id:listing.id,expected_version_hash:listing.version_hash,expected_terms_hash:listing.terms_hash});assert.equal(purchase.status,200); const license=await purchase.json();
  const artifact=await (await request('/api/licenses/'+license.id+'/artifact')).json();assert.equal(artifact.artifact.hash,listing.version_hash);assert.equal(artifact.license.entitlement,'local_demo_only');
  const download=await request('/api/licenses/'+license.id+'/download'),zip=Buffer.from(await download.arrayBuffer());
  assert.equal(download.headers.get('x-bot-version'),listing.version_hash);
  assert.equal(download.headers.get('x-content-sha256'),createHash('sha256').update(zip).digest('hex'));
  assert.equal(Number(download.headers.get('content-length')),zip.length);
  assert.equal(download.headers.get('cache-control'),'private, no-store');
  assert.ok(zip.includes(Buffer.from('passport.json'))&&zip.includes(Buffer.from('verify.mjs')));
});
test('T17 forged client chain success never grants an entitlement',async t=>{const {request}=await app(t);const result=await request('/api/licenses/verify',{success:true,tx_hash:'fake',buyer:'fake.testnet'});assert.equal(result.status,501);assert.deepEqual(await(await request('/api/licenses')).json(),[]);});

test('testnet listings cannot bypass payment through the local demo route',async t=>{
  const {request,store,service}=await app(t);
  await request('/api/runs',{}, {'Idempotency-Key':'paid-listing-bypass'});
  while(service.active.size) await new Promise(r=>setTimeout(r,5));
  const [listing]=await(await request('/api/listings')).json();
  store.db.prepare('INSERT INTO chain_listings VALUES(?,?)').run(listing.id,JSON.stringify({network:'testnet',listing_id:listing.id}));
  const result=await request('/api/licenses/demo-purchase',{listing_id:listing.id,expected_version_hash:listing.version_hash,expected_terms_hash:listing.terms_hash});
  assert.equal(result.status,403);
  assert.equal((await result.json()).error,'TESTNET_PURCHASE_REQUIRED');
  assert.deepEqual(await(await request('/api/licenses')).json(),[]);
});
test('HTTP rejects cross-origin mutations and unknown origins, protects artifacts',async t=>{const {request,url}=await app(t); assert.equal((await request('/api/runs',{}, {'Origin':'https://evil.example','Idempotency-Key':'bad-origin-key'})).status,403);assert.equal((await fetch(url+'/api/runs',{method:'POST',body:'{}'})).status,403);assert.equal((await request('/api/licenses/00000000-0000-0000-0000-000000000000/artifact')).status,403);});
test('HTTP owner isolation and public listing do not expose session credentials',async t=>{const {request,url,cookie,service}=await app(t);const {id}=await(await request('/api/runs',{}, {'Idempotency-Key':'isolate-key'})).json();while(service.active.size)await new Promise(r=>setTimeout(r,5));const stranger=await fetch(url+'/api/runs/'+id);assert.equal(stranger.status,403);const listings=await(await request('/api/listings')).json();assert.equal(JSON.stringify(listings).includes(cookie.split('=')[1]),false);});
test('HTTP assets include security headers, creator studio and truthful research status',async t=>{const {url}=await app(t);const res=await fetch(url);assert.equal(res.status,200);assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/);const html=await res.text();for(const name of ['market','studio','lab','reports','licenses'])assert.ok(html.includes('view-'+name));assert.ok(html.includes('Purchases use test tokens'));assert.ok(html.includes('Register & test'));assert.ok(html.includes('lang="en"'));const image=await fetch(url+'/assets/glass-version.png');assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.equal((await fetch(url+'/download.js')).status,200);});

test('HTTP comparison is owner scoped and public evidence excludes private source',async t=>{
  const {request,url,comparisons}=await app(t);const source='def decide(observation):\n    return {"action":"HOLD","target_bps":0,"reason":"SOURCE_SENTINEL"}';
  const privateBot=await(await request('/api/bots',{name:'Private Python',kind:'python',source,owns_rights:true})).json();
  const started=await request('/api/comparisons',{version_ids:['atlas-v1','atlas-v2'],length:24});assert.equal(started.status,202);const batch=await started.json();await comparisons.wait(batch.id);
  const result=await(await request('/api/comparisons/'+batch.id)).json();assert.equal(result.comparable,true);assert.equal((await fetch(url+'/api/comparisons/'+batch.id)).status,403);
  const a=await(await request('/api/runs/'+result.rows[0].run_id+'/assessment')).json();assert.equal(a.report_hash,result.rows[0].report_hash);assert.equal((await fetch(url+'/api/runs/'+result.rows[0].run_id+'/assessment')).status,403);
  const [listing]=await(await request('/api/listings')).json();const evidence=await(await fetch(url+'/api/listings/'+listing.id+'/evidence')).json();assert.equal(evidence.assessment.report_hash,evidence.report.hash);assert.equal(evidence.listing.version_hash,evidence.report.manifest.version.hash);assert.equal(JSON.stringify(evidence).includes('SOURCE_SENTINEL'),false);assert.ok(listing.sparkline.length>0);
  assert.ok(privateBot.id);assert.equal((await fetch(url+'/upgrade.js')).status,200);
});


test('HTTP public benchmark publishes all cases without private source and blocks overlapping runs',async t=>{
  let release;const gate=new Promise(resolve=>release=resolve);
  const benchmarkData=service=>({load:async(c,owner)=>{await gate;return service.bots.importCSV({source:'HTTP benchmark test data',csv:benchmarkCSV(Array.from({length:c.rows},(_,i)=>[Date.parse(c.start)/1000+i*3600,99,105,100,101,1]),c)},owner);}});
  const {request,benchmarks,url}=await app(t,{benchmarkAnchor:null,benchmarkData});
  const rejected=await request('/api/benchmarks',{version_id:'atlas-v1',publish_results:true,cases:[]});assert.equal(rejected.status,400);
  const response=await request('/api/benchmarks',{version_id:'atlas-v1',publish_results:true});assert.equal(response.status,202);const b=await response.json();
  try{const overlap=await request('/api/runs',{}, {'Idempotency-Key':'benchmark-overlap'});assert.equal(overlap.status,409);}finally{release();}
  await benchmarks.wait(b.id);
  const publicResult=await (await fetch(url+'/api/benchmarks/'+b.id)).json();assert.equal(publicResult.result.completed_cases,4);assert.equal(publicResult.verified,false);
  const evidence=await (await fetch(url+'/api/benchmarks/'+b.id+'/evidence')).json();assert.equal(evidence.reports.length,4);
  assert.ok(evidence.reports.every(r=>!r.manifest.version.prompt&&!r.manifest.version.source));
  const history=await (await fetch(url+'/api/benchmarks?version_hash='+b.version.hash)).json();assert.equal(history.length,1);
  const noProof=await request('/api/benchmarks/'+b.id+'/verify-chain',{});assert.equal(noProof.status,409);
  const invalid=await request('/api/benchmarks',{version_id:'atlas-v1',publish_results:true},{Origin:'https://evil.example'});assert.equal(invalid.status,403);
});
