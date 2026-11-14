import { readFileSync } from 'node:fs';
import { JsonRpcProvider } from 'near-api-js';
import { assert, hash } from '../src/common.mjs';
import { BENCHMARK_PROTOCOL_HASH } from '../src/benchmark-data.mjs';

// Public read-only verification: no wallet, DPAPI file, API key or server required.
const evidence=JSON.parse(readFileSync(process.argv[2]||new URL('../docs/benchmark-evidence.json',import.meta.url),'utf8'));
const {manifest,result,anchor}=evidence;
assert(manifest&&result&&anchor,'BENCHMARK_EVIDENCE_REQUIRED');
assert(hash(evidence.protocol)===BENCHMARK_PROTOCOL_HASH&&manifest.protocol_hash===BENCHMARK_PROTOCOL_HASH,'PROTOCOL_MISMATCH');
assert(hash(manifest)===evidence.manifest_hash&&hash(result)===evidence.result_hash,'LOCAL_HASH_MISMATCH');
assert(result.manifest_hash===evidence.manifest_hash&&result.version_hash===manifest.version.hash,'LOCAL_BINDING_MISMATCH');
assert(anchor.contract.endsWith('.testnet')&&anchor.job_id==='suite-'+manifest.attempt_id,'TESTNET_BINDING_REQUIRED');
const rpc=new JsonRpcProvider({url:'https://test.rpc.fastnear.com'});
assert((await rpc.viewNodeStatus()).chain_id==='testnet','TESTNET_ONLY');
const job=await rpc.callFunction({contractId:anchor.contract,method:'get_job',args:{job_id:anchor.job_id},blockQuery:{finality:'final'}});
const checks={manifest:job?.manifest_hash===evidence.manifest_hash,version:job?.version_hash===manifest.version.hash,report:job?.report_hash===evidence.result_hash,
  requested:job?.requested_steps===manifest.requested_steps,completed:job?.completed_steps===result.completed_steps,settled:job?.state===2,
  four_fixed_cases:result.cases.length===4&&result.cases.every((c,i)=>c.id===evidence.protocol.cases[i].id&&c.run_id===manifest.cases[i].run_id&&c.dataset_hash===manifest.cases[i].dataset_hash),
  filled_trade_counts:result.schema==='agentproof-benchmark-result-v2'&&result.cases.every(c=>c.fills===c.metrics?.trades)};
for(const [name,ok] of Object.entries(checks))console.log((ok?'PASS ':'FAIL ')+name);
console.log('FINAL · '+anchor.contract+' · '+anchor.job_id);
console.log('Identity and contract state only. Bot execution and data collection remain operator-attested.');
assert(Object.values(checks).every(Boolean),'PUBLIC_PROOF_MISMATCH');
