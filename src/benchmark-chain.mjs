import { TestnetClient } from './near.mjs';
import { assert, hash, now } from './common.mjs';

// Shares the market's signing queue; simultaneous actions cannot reuse a nonce.
export class BenchmarkChain {
  constructor(market, factory=()=>new TestnetClient()) { this.market=market;this.factory=factory; }
  prepare(manifest, record) { return this.market.serial(async()=>{
    const client=this.factory();await client.checkNetwork();
    const {version}=manifest, job_id='suite-'+manifest.attempt_id, manifest_hash=hash(manifest);
    const call=async(role,method,args,deposit)=>{const {receipt,...tx}=await client.call(role,method,args,deposit);record(tx);return tx;};
    const versionOnChain=await client.view('get_version',{version_hash:version.hash});
    if(!versionOnChain)await call('seller','register_version',{version_hash:version.hash,terms_hash:version.terms_hash},'20000000000000000000000');
    else assert(versionOnChain.terms_hash===version.terms_hash,'CHAIN_VERSION_CONFLICT');
    let job=await client.view('get_job',{job_id});
    if(!job){await call('seller','fund_job',{job_id,version_hash:version.hash,manifest_hash,service_deposit:'10000000000000000000000',requested_steps:manifest.requested_steps},'40000000000000000000000');job=await client.view('get_job',{job_id});}
    assert(job?.state===0&&job.manifest_hash===manifest_hash&&job.version_hash===version.hash&&job.requested_steps===manifest.requested_steps,'BENCHMARK_COMMITMENT_MISMATCH');
    return {network:'testnet',contract:client.contract,job_id,manifest_hash,finality:'FINAL',confirmed_at:now()};
  }); }
  finish(manifest,result,anchor,record) { return this.market.serial(async()=>{
    const client=this.factory();await client.checkNetwork();assert(client.contract===anchor.contract,'CHAIN_CONTRACT_MISMATCH');
    const job_id=anchor.job_id,report_hash=hash(result),manifest_hash=hash(manifest);
    const job=await client.view('get_job',{job_id});
    assert(job?.manifest_hash===manifest_hash&&job.version_hash===manifest.version.hash,'BENCHMARK_COMMITMENT_MISMATCH');
    const call=async(method,args)=>{const {receipt,...tx}=await client.call('contract',method,args);record(tx);};
    if(job.state===0)await call('commit_result',{job_id,manifest_hash,report_hash,completed_steps:result.completed_steps});
    else assert(job.report_hash===report_hash,'CHAIN_RESULT_CONFLICT');
    if(job.state<2)await call('settle_job',{job_id,charge:'0',settlement_nonce:hash({job_id,report_hash})});
    const proof=await this.verify(manifest,result,anchor,client);assert(proof.matches,'BENCHMARK_FINAL_MISMATCH');return proof;
  }); }
  async verify(manifest,result,anchor,client=this.factory()) {
    await client.checkNetwork();const job=await client.view('get_job',{job_id:anchor.job_id});
    const checks={contract:client.contract===anchor.contract,manifest:job?.manifest_hash===hash(manifest)&&anchor.manifest_hash===hash(manifest),
      version:job?.version_hash===manifest.version.hash,report:job?.report_hash===hash(result),
      requested:job?.requested_steps===manifest.requested_steps,completed:job?.completed_steps===result.completed_steps,settled:job?.state===2};
    return {network:'testnet',contract:client.contract,job_id:anchor.job_id,checked_at:now(),finality:'FINAL',checks,matches:Object.values(checks).every(Boolean),
      meaning:'Checks the precommitted identifiers and final aggregate result. The operator executes the bot; this is not a TEE, execution proof or performance guarantee.'};
  }
}
