import { TestnetClient, TestnetReader, testnetInfo } from './near.mjs';
import { assert, hash, canonical, uid, now, amount } from './common.mjs';

export class ChainMarket {
  constructor(store){this.store=store;this.tail=Promise.resolve();store.db.exec('CREATE TABLE IF NOT EXISTS chain_listings(id TEXT PRIMARY KEY, body TEXT NOT NULL)');}
  info(){return testnetInfo();}
  get(id){const row=this.store.db.prepare('SELECT body FROM chain_listings WHERE id=?').get(id);return row?JSON.parse(row.body):null;}
  async verifyListing(listing,client=new TestnetReader()){
    const binding=this.get(listing.id);assert(binding,'LISTING_NOT_ON_TESTNET');await client.checkNetwork();
    const report=this.store.report(listing.run_id);
    const [item,job]=await Promise.all([client.view('get_listing',{listing_id:listing.id}),client.view('get_job',{job_id:listing.run_id})]);
    const checks={version:item?.version_hash===listing.version_hash,report:item?.report_hash===report.hash&&job?.report_hash===report.hash,
      terms:item?.terms_hash===listing.terms_hash,price:item?.price===listing.price_yocto,manifest:job?.manifest_hash===report.manifest_hash,
      contract:client.contract===binding.contract,seller:item?.seller===(binding.seller||this.info()?.seller),completed:job?.completed_steps===report.completed_steps && job?.state>=1};
    return {network:'testnet',contract:client.contract,listing_id:listing.id,checked_at:now(),finality:'FINAL',matches:Object.values(checks).every(Boolean),checks,
      meaning:'Final chain state matches these recorded identifiers. Execution truth and performance remain operator-attested.'};
  }
  serial(fn){const result=this.tail.then(fn);this.tail=result.catch(()=>{});return result;}
  publish(listing){return this.serial(async()=>{
    const previous=this.get(listing.id);if(previous)return previous;
    assert(this.info(),'TESTNET_NOT_CONNECTED',undefined,501);assert(amount(listing.price_yocto)<=500000000000000000000000n,'TESTNET_PRICE_LIMIT');
    const client=new TestnetClient();await client.checkNetwork();const run=this.store.getRun(listing.run_id),report=this.store.report(listing.run_id),transactions=[];
    const record=async(role,method,args,deposit)=>{const tx=await client.call(role,method,args,deposit);const {receipt,...publicTx}=tx;transactions.push(publicTx);return tx;};
    const version=await client.view('get_version',{version_hash:listing.version_hash});
    if(!version)await record('seller','register_version',{version_hash:listing.version_hash,terms_hash:listing.terms_hash},'20000000000000000000000');
    else assert(version.owner===client.keys.seller.account_id && version.terms_hash===listing.terms_hash,'CHAIN_VERSION_CONFLICT');
    const job_id=run.id;
    let job=await client.view('get_job',{job_id});
    if(!job){await record('seller','fund_job',{job_id,version_hash:listing.version_hash,manifest_hash:run.config.manifest_hash,service_deposit:'10000000000000000000000',requested_steps:run.config.requested_steps},'40000000000000000000000');job=await client.view('get_job',{job_id});}
    if(job.state===0)await record('contract','commit_result',{job_id,manifest_hash:run.config.manifest_hash,report_hash:report.hash,completed_steps:report.completed_steps});
    if(job.state<2)await record('contract','settle_job',{job_id,charge:String(BigInt(report.completed_steps)*10000000000000000000n),settlement_nonce:hash({job_id,report_hash:report.hash})});
    const old=await client.view('get_listing',{listing_id:listing.id});
    if(!old)await record('seller','create_listing',{listing_id:listing.id,job_id,expected_version_hash:listing.version_hash,price:listing.price_yocto},'20000000000000000000000');
    const current=await client.view('get_listing',{listing_id:listing.id});assert(current?.report_hash===report.hash && current.version_hash===listing.version_hash,'CHAIN_LISTING_MISMATCH');
    const body={network:'testnet',contract:client.contract,listing_id:listing.id,job_id,transactions,confirmed_at:now(),custody:'developer demo accounts; server signs; no personal wallet connection'};
    this.store.db.prepare('INSERT INTO chain_listings VALUES(?,?)').run(listing.id,canonical(body));return body;
  });}
  purchase(owner,listing,expectedVersion,expectedTerms){return this.serial(async()=>{
    assert(listing.version_hash===expectedVersion,'VERSION_MISMATCH',undefined,409);assert(listing.terms_hash===expectedTerms,'TERMS_MISMATCH',undefined,409);
    assert(this.get(listing.id),'LISTING_NOT_ON_TESTNET');
    const prior=this.store.db.prepare('SELECT body FROM licenses WHERE owner=? AND listing_id=?').get(owner,listing.id);
    if(prior){const license=JSON.parse(prior.body);assert(license.network==='testnet','LOCAL_LICENSE_ALREADY_EXISTS');return license;}
    const client=new TestnetClient();await client.checkNetwork();const buyer=client.keys.buyer.account_id;
    assert(!await client.view('get_license',{buyer,listing_id:listing.id}),'DEMO_BUYER_ALREADY_LICENSED','This shared developer test account already bought this listing in another session.',409);
    const tx=await client.call('buyer','purchase_license',{listing_id:listing.id,expected_version_hash:expectedVersion,expected_terms_hash:expectedTerms},String(amount(listing.price_yocto)+20000000000000000000000n));
    const proof=await client.verifyPurchase({hash:tx.hash,buyer,listing_id:listing.id,version_hash:expectedVersion,terms_hash:expectedTerms});
    const body={id:uid(),listing_id:listing.id,owner,version_hash:expectedVersion,terms_hash:expectedTerms,receipt_id:tx.hash,entitlement:'testnet_research_license',network:'testnet',proof,created:now()};
    this.store.db.prepare('INSERT INTO licenses VALUES(?,?,?,?,?)').run(body.id,owner,listing.id,body.receipt_id,canonical(body));return body;
  });}
}
