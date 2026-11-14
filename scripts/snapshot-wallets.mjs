// Explicit maintenance command, never run at application startup.
// Vendor the official executors so a future remote change cannot silently alter a submission.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { walletCompatibility } from './wallet-compat.mjs';
const source='https://raw.githubusercontent.com/hot-dao/near-selector/refs/heads/main/repository/manifest.json';
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('Wallet source unavailable: '+r.status);return r;}
const manifest=await(await get(source)).json(),wallets=[],sources=[];
mkdirSync(new URL('../public/wallet/',import.meta.url),{recursive:true});
for(const id of ['meteor-wallet','nightly-wallet']){
  const wallet=manifest.wallets.find(w=>w.id===id);
  if(!wallet?.features.testnet||!wallet.features.signMessage)throw new Error('Unsupported wallet');
  const upstream=await(await get(wallet.executor)).text();
  const {code,patches}=walletCompatibility(id,upstream);
  writeFileSync(new URL('../public/wallet/'+id+'.js',import.meta.url),code);
  sources.push({id,url:wallet.executor,bytes:Buffer.byteLength(code),sha256:createHash('sha256').update(code).digest('hex'),upstream_sha256:createHash('sha256').update(upstream).digest('hex'),patches});
  // A new local build must not execute the old IndexedDB snapshot on first load.
  const version=patches.length?wallet.version+'-bp.'+createHash('sha256').update(code).digest('hex').slice(0,8):wallet.version;
  wallets.push({...wallet,version,executor:'/wallet/'+id+'.js'});
}
writeFileSync(new URL('../public/wallet/manifest.json',import.meta.url),JSON.stringify({version:'botpassport-wallet-snapshot-1',wallets},null,2));
writeFileSync(new URL('../docs/wallet-adapters.json',import.meta.url),JSON.stringify({source,snapshotted_at:new Date().toISOString(),connector:'@hot-labs/near-connect@0.12.0',sources},null,2));
console.log(JSON.stringify(sources.map(({id,bytes,sha256})=>({id,bytes,sha256}))));
