import { mkdirSync, writeFileSync } from 'node:fs';
import { Store } from '../src/store.mjs';
import { Service } from '../src/service.mjs';
import { ChainMarket } from '../src/chain-market.mjs';
import { createListing } from '../src/market.mjs';
import { TestnetClient, testnetInfo, cleanJSON } from '../src/near.mjs';
import { uid, hash } from '../src/common.mjs';
import assert from 'node:assert/strict';

mkdirSync('data',{recursive:true});mkdirSync('output',{recursive:true});
const store=new Store('data/agentproof.sqlite'),service=new Service(store,{delay:0}),chain=new ChainMarket(store);
const evidence={network:'testnet',started_at:new Date().toISOString(),deployment:testnetInfo(),checks:[],transactions:[]};
const check=(name,value)=>{assert.ok(value,name);evidence.checks.push({name,passed:true});console.log('PASS '+name);};
try{
  const client=new TestnetClient();await client.checkNetwork();
  const bot=service.bots.register({kind:'rules',name:'Proof Trend',version:'1.0',description:'Creator-owned momentum bot, verified through the real testnet license flow.',threshold_bps:120,lookback:8,owns_rights:true},'verification-seller');
  const run=service.start({version_id:bot.id,length:48,budget_micros:0},'verification-seller','testnet-'+uid());await service.run(run.id);const report=store.report(run.id);
  check('custom bot executes without any LLM API key',report.completed_steps===report.requested_steps && report.model_usage.actual_provider_cost_micros===0);
  check('saved decisions reproduce the exact report',service.replay(run.id).matches);
  const listing=createListing(store,run.id,bot.hash,'verification-seller','10000000000000000000000');
  const anchored=await chain.publish(listing);evidence.transactions.push(...anchored.transactions);console.log('ANCHORED '+listing.id);
  const chainReport=await client.view('get_job',{job_id:run.id});check('on-chain report, manifest and version match',chainReport.report_hash===report.hash && chainReport.manifest_hash===report.manifest_hash && chainReport.version_hash===bot.hash);
  async function rejected(name,code,role,method,args,deposit){try{await client.call(role,method,args,deposit);throw new Error('EXPECTED_REJECTION_MISSING');}catch(error){check(name,String(error).includes(code));}}
  await rejected('wrong-version purchase rejected on-chain','VERSION_OR_TERMS_MISMATCH','buyer','purchase_license',{listing_id:listing.id,expected_version_hash:'f'.repeat(64),expected_terms_hash:listing.terms_hash},'30000000000000000000000');
  await rejected('buyer cannot attest a report','OPERATOR_ONLY','buyer','commit_result',{job_id:run.id,manifest_hash:report.manifest_hash,report_hash:report.hash,completed_steps:37});
  const license=await chain.purchase('verification-buyer',listing,bot.hash,listing.terms_hash);check('purchase receipt verified against final chain state',license.proof.finality==='FINAL');evidence.purchase=license.proof;
  await rejected('duplicate payment rejected on-chain','ALREADY_LICENSED','buyer','purchase_license',{listing_id:listing.id,expected_version_hash:bot.hash,expected_terms_hash:listing.terms_hash},'30000000000000000000000');
  const before=await client.view('get_credit',{account:client.keys.seller.account_id});check('seller credited the license payment',BigInt(before)>=BigInt(listing.price_yocto));
  const withdrawal=await client.call('seller','withdraw_credit',{},'1');evidence.transactions.push({...withdrawal,receipt:undefined});check('seller withdrawal callback cleared credit',await client.view('get_credit',{account:client.keys.seller.account_id})==='0');
  const retest=service.start({version_id:bot.id,length:48,budget_micros:0},'verification-buyer','buyer-'+uid());await service.run(retest.id);check('buyer retests the exact purchased version',store.getRun(retest.id).config.version.hash===license.version_hash && hash(store.report(retest.id).results)===hash(report.results));
  assert.throws(()=>createListing(store,retest.id,bot.hash,'verification-buyer'),/NOT_BOT_AUTHOR/);check('buyer cannot resell the creator-owned version',true);
  evidence.report_hash=report.hash;evidence.listing_id=listing.id;evidence.finished_at=new Date().toISOString();evidence.success=true;
}catch(error){evidence.success=false;evidence.error=String(error.message).slice(0,2000);console.error(evidence.error);process.exitCode=1;}
finally{writeFileSync('output/testnet-evidence.json',JSON.stringify(cleanJSON(evidence),null,2));store.close();}
