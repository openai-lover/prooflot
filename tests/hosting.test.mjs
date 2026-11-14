import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { createApp } from '../src/server.mjs';
import { requestOrigin } from '../src/http-origin.mjs';

const secret = 'a'.repeat(64), origin = 'https://prooflot.vercel.app';
test('public backend rejects direct access and untrusted gateway headers', () => {
  for (const supplied of ['', 'a', 'b'.repeat(64)]) {
    assert.throws(() => requestOrigin({headers:{host:'internal.example','x-prooflot-gateway':supplied}},origin,secret), /GATEWAY_REQUIRED/);
  }
  assert.equal(requestOrigin({headers:{host:'internal.example','x-prooflot-gateway':secret}},origin,secret), origin);
  assert.throws(() => requestOrigin({headers:{host:'public.example'}},'', ''), /LOCAL_HOST_REQUIRED/);
  assert.throws(() => requestOrigin({headers:{}},'http://prooflot.vercel.app',secret), /INVALID_PUBLIC_ORIGIN/);
});

test('hosted session cookies are secure, CSRF and NEP-413 bind to the public HTTPS origin', async t => {
  const store = new Store(), app = createApp({store,publicOrigin:origin,gatewaySecret:secret});
  await new Promise(resolve => app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));store.close();});
  const base = 'http://127.0.0.1:'+app.server.address().port;
  assert.equal((await fetch(base+'/api/health')).status,403);
  const headers={'x-prooflot-gateway':secret};
  for(let i=0;i<3;i++)assert.equal((await fetch(base+'/api/health',{headers})).status,200);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM local_sessions').get().n,0);
  const catalog=await fetch(base+'/api/catalog',{headers});
  assert.equal(catalog.status,200); assert.match(catalog.headers.get('set-cookie'), /; Secure/);
  headers.cookie=catalog.headers.get('set-cookie').split(';')[0];
  headers['content-type']='application/json'; headers['x-agentproof']='1';
  const body=JSON.stringify({account_id:'buyer.testnet'});
  const bad=await fetch(base+'/api/wallet/challenge',{method:'POST',headers:{...headers,origin:'https://attacker.example'},body});
  assert.equal(bad.status,403);
  const ok=await fetch(base+'/api/wallet/challenge',{method:'POST',headers:{...headers,origin},body});
  assert.equal(ok.status,200); const challenge=await ok.json();
  assert.equal(challenge.recipient,origin); assert.ok(challenge.message.includes(origin));
});
