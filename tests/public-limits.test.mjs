import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicLimits} from '../src/public-limits.mjs';

test('cloud execution and mutation limits survive cookie changes and expire',()=>{
  let now=0;const limits=new PublicLimits(()=>now);
  for(let i=0;i<8;i++)limits.admit('same-client','/api/listings/example/retest');
  assert.throws(()=>limits.admit('same-client','/api/runs'),e=>e.code==='RATE_LIMIT'&&e.status===429);
  for(let i=0;i<32;i++)limits.admit('same-client','/api/verify-report');
  assert.throws(()=>limits.admit('same-client','/api/bots'),e=>e.code==='RATE_LIMIT'&&e.status===429);
  now=60000;limits.admit('same-client','/api/runs');
});
test('rotating client identities cannot bypass the global mutation budget',()=>{
  let now=0;const limits=new PublicLimits(()=>now);
  for(let i=0;i<600;i++)limits.admit('client-'+i,'/api/bots');
  assert.throws(()=>limits.admit('client-601','/api/bots'),e=>e.code==='RATE_LIMIT'&&e.status===429);
  now=3600000;limits.admit('client-602','/api/bots');assert.equal(limits.clients.size,1);
});
