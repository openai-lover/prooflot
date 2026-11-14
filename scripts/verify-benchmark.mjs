import { writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { hash } from '../src/common.mjs';

const base='http://127.0.0.1:'+Number(process.env.PORT||4317);
const first=await fetch(base+'/api/catalog'),cookie=first.headers.get('set-cookie')?.split(';')[0]||'';
const catalog=await first.json();
const requested=process.argv.find(a=>a.startsWith('--version='))?.slice(10);
const version=requested?catalog.versions.find(v=>v.id===requested):process.argv.includes('--python')?catalog.versions.find(v=>v.kind==='python'):catalog.versions.find(v=>v.id==='atlas-v1');
if(!version)throw new Error('Requested public bot version unavailable');
async function api(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json','X-AgentProof':'1'},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok)throw new Error(j.error);return j;}
const started=await api('/api/benchmarks',{version_id:version.id,publish_results:true});
console.log(JSON.stringify({attempt_id:started.id,bot:version.name,version_hash:version.hash,network:started.network}));
let b=started,previous='';const deadline=Date.now()+15*60*1000;
while(!b.finished&&Date.now()<deadline){await delay(2000);b=await api('/api/benchmarks/'+started.id);const progress=b.status+' '+b.progress.reduce((n,c)=>n+c.completed,0)+'/628';if(progress!==previous){console.log(progress);previous=progress;}}
if(!b.finished)throw new Error('Benchmark still running; do not retry automatically');
if(!b.result||hash(b.result)!==b.result_hash||hash(b.manifest)!==b.manifest_hash)throw new Error('Missing or invalid immutable result: '+b.error);
const chain_check=b.anchor?await api('/api/benchmarks/'+b.id+'/verify-chain',{}):null;
const evidence={checked_at:new Date().toISOString(),...b,chain_check};
const file=process.argv.find(a=>a.startsWith('--save='))?.slice(7)||'output/benchmark-latest.json';writeFileSync(file,JSON.stringify(evidence,null,2));
console.log(JSON.stringify({saved:file,status:b.status,verified:b.verified,chain_matches:chain_check?.matches,cases:b.result.cases.map(c=>({id:c.id,completed:c.completed,return_bps:c.metrics?.return_bps,drawdown_bps:c.metrics?.max_drawdown_bps,fills:c.fills})),transactions:b.events.filter(e=>e.kind==='transaction').map(e=>e.tx.url)},null,2));
if(b.status!=='completed'||(b.anchor&&!chain_check.matches))process.exitCode=1;
