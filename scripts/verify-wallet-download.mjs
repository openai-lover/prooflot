import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, sep } from 'node:path';
import { KeyPairSigner } from 'near-api-js';
import { unprotectFile } from '../src/secrets.mjs';
import { assert } from '../src/common.mjs';
import { verifyPackage } from './verify-package.mjs';

// Reuse only the isolated test buyer, never the developer shared buyer or a user's wallet.
const base='http://127.0.0.1:4317',keys=unprotectFile(new URL('../data/wallet-test-keys.dpapi',import.meta.url)),e=JSON.parse(readFileSync(process.argv[2]||new URL('../docs/wallet-testnet-evidence.json',import.meta.url),'utf8'));
assert(e.accounts.buyer===keys.buyer.account_id,'TEST_BUYER_MISMATCH');
const first=await fetch(base+'/api/wallet/session'),cookie=first.headers.get('set-cookie').split(';')[0];
const request=(url,body)=>fetch(base+url,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:base,'X-AgentProof':'1','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
const challenge=await(await request('/api/wallet/challenge',{account_id:keys.buyer.account_id})).json();
const signed=await KeyPairSigner.fromSecretKey(keys.buyer.private_key).signNep413Message(keys.buyer.account_id,{message:challenge.message,recipient:challenge.recipient,nonce:Buffer.from(challenge.nonce,'base64')});
assert((await request('/api/wallet/verify',{challenge_id:challenge.id,account_id:signed.accountId,public_key:signed.publicKey.toString(),signature:Buffer.from(signed.signature).toString('base64')})).ok,'LOGIN_FAILED');
const licenses=await(await request('/api/licenses')).json(),license=licenses.find(l=>l.listing_id===e.listing_id);assert(license,'LICENSE_MISSING');
const route='/api/licenses/'+license.id+'/download',response=await request(route);assert(response.ok&&response.headers.get('content-type')==='application/zip','ZIP_FAILED');
const zip=Buffer.from(await response.arrayBuffer());assert(zip.readUInt32LE(0)===0x04034b50,'INVALID_ZIP');
writeFileSync(new URL('../output/purchased-signal-check.zip',import.meta.url),zip);
const saved=readFileSync(new URL('../output/purchased-signal-check.zip',import.meta.url)),sha=createHash('sha256').update(saved).digest('hex');
assert(sha===response.headers.get('x-content-sha256')&&response.headers.get('x-bot-version')===license.version_hash,'SAVED_BYTES_MISMATCH');
const directory=resolve('output','verified-package-'+Date.now());mkdirSync(directory,{recursive:true});
let offset=0;
while(saved.readUInt32LE(offset)===0x04034b50){
  const size=saved.readUInt32LE(offset+18),length=saved.readUInt16LE(offset+26),name=saved.subarray(offset+30,offset+30+length).toString('utf8');
  assert(/^[a-zA-Z0-9_.-]{1,80}$/.test(name),'UNSAFE_ZIP_NAME');const target=resolve(directory,name);assert(target.startsWith(directory+sep),'UNSAFE_ZIP_PATH');
  const start=offset+30+length;writeFileSync(target,saved.subarray(start,start+size));offset=start+size;
}
const verification=verifyPackage(directory,license.version_hash);
assert((await fetch(base+route)).status===403,'ANONYMOUS_ZIP_ACCESS');
await request('/api/wallet/logout',{});assert((await request(route)).status===403,'LOGGED_OUT_ZIP_ACCESS');
const evidence={schema:'botpassport-saved-package-v1',checked_at:new Date().toISOString(),buyer:e.accounts.buyer,listing_id:license.listing_id,filename:'purchased-signal-check.zip',bytes:saved.length,sha256:sha,verification,checks:['wallet-authenticated download','actual disk write and readback','HTTP SHA-256 and version match','offline source/report/license verification','anonymous access denied','logout access denied']};
writeFileSync('output/final-download-evidence.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify({pass:true,...evidence},null,2));
