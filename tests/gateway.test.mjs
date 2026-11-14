import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {createGateway} from '../deploy/vercel/api/index.mjs';
const origin='https://prooflot.vercel.app', secret='s'.repeat(64);
const send=(url,options={})=>new Promise((resolve,reject)=>{
  const req=request(url,options,res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{
    const headers=[];for(let i=0;i<res.rawHeaders.length;i+=2)headers.push([res.rawHeaders[i],res.rawHeaders[i+1]]);
    resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers}));
  });});req.on('error',reject);req.end(options.body);
});
async function serve(t,handler){const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));return 'http://127.0.0.1:'+server.address().port;}

test('gateway preserves request paths, sessions, idempotency and downloaded bytes',async t=>{
  const seen=[];const bytes=Buffer.from([0x50,0x4b,3,4,0,255,128,1]);
  const backend=await serve(t,async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    seen.push({url:req.url,headers:req.headers,body:Buffer.concat(chunks).toString()});
    res.setHeader('Set-Cookie',['ap_session=example; Secure; HttpOnly; SameSite=Strict','other=1; Secure']);
    res.setHeader('Content-Disposition','attachment; filename="prooflot.zip"');
    res.setHeader('Content-Type','application/zip');res.end(bytes);
  });
  const gateway=await serve(t,createGateway({getBackend:async()=>backend,env:{PROOFLOT_PUBLIC_ORIGIN:origin,PROOFLOT_GATEWAY_SECRET:secret}}));
  const response=await send(gateway+'/api/purchase?inspect=1',{method:'POST',headers:{host:'prooflot.vercel.app',origin,cookie:'ap_session=test','x-agentproof':'1','content-type':'application/json','idempotency-key':'purchase-1'},body:'{"version":"exact"}'});
  assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  assert.equal(response.headers.getSetCookie().length,2);assert.match(response.headers.get('content-disposition'),/prooflot.zip/);
  assert.equal(seen[0].url,'/api/purchase?inspect=1');assert.equal(seen[0].headers['x-prooflot-gateway'],secret);
  assert.equal(seen[0].headers.cookie,'ap_session=test');assert.equal(seen[0].headers['idempotency-key'],'purchase-1');assert.equal(seen[0].body,'{"version":"exact"}');
  assert.match(seen[0].headers['x-prooflot-client'],/^[a-f0-9]{64}$/);
});

test('gateway rejects forged origins, hosts and large payloads before opening the backend',async t=>{
  let calls=0;
  const gateway=await serve(t,createGateway({getBackend:async()=>{calls++;throw Error('unexpected');},env:{PROOFLOT_PUBLIC_ORIGIN:origin,PROOFLOT_GATEWAY_SECRET:secret}}));
  const base={method:'POST',headers:{host:'prooflot.vercel.app',origin,'x-agentproof':'1','content-type':'application/json'},body:'{}'};
  assert.equal((await send(gateway+'/api/bots',{...base,headers:{...base.headers,origin:'https://attacker.example'}})).status,403);
  assert.equal((await send(gateway+'/api/bots',{...base,headers:{...base.headers,host:'untrusted.example'}})).status,403);
  assert.equal((await send(gateway+'/api/bots',{...base,body:'a'.repeat(240001)})).status,413);
  assert.equal(calls,0);
});

test('an ambiguous POST failure is never automatically replayed',async t=>{
  let writes=0;
  const gateway=await serve(t,createGateway({getBackend:async()=>'https://backend.example',request:async()=>{writes++;throw Error('connection lost after write');},env:{PROOFLOT_PUBLIC_ORIGIN:origin,PROOFLOT_GATEWAY_SECRET:secret}}));
  const response=await send(gateway+'/api/purchase',{method:'POST',headers:{host:'prooflot.vercel.app','x-agentproof':'1','content-type':'application/json'},body:'{}'});
  assert.equal(response.status,503);assert.equal(writes,1);
});
