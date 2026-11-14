import { TestnetReader, TestnetClient, NEAR_EXPLORER, cleanJSON } from './near.mjs';
import { createListing } from './market.mjs';
import { assert, hash, canonical, uid, now, amount } from './common.mjs';
import { walletOwner } from './wallet-auth.mjs';

const STORAGE='20000000000000000000000';
const JOB_DEPOSIT='40000000000000000000000';
const SERVICE_DEPOSIT='10000000000000000000000';
const call=(methodName,args,deposit='0')=>({type:'FunctionCall',params:{methodName,args,gas:'100000000000000',deposit}});
const publicTx=({receipt,...tx})=>tx;

// Only the report attestation uses the operator key. Creator and buyer actions are
// returned as unsigned wallet requests and confirmed against FINAL chain state.
export class WalletMarket {
  constructor(store,chain,{reader=()=>new TestnetReader(),operator=()=>new TestnetClient()}={}) {
    this.store=store;this.chain=chain;this.reader=reader;this.operator=operator;
    store.db.exec('CREATE TABLE IF NOT EXISTS wallet_publications(id TEXT PRIMARY KEY, run_id TEXT UNIQUE NOT NULL, owner TEXT NOT NULL, body TEXT NOT NULL)');
  }
  listing(id){const row=this.store.db.prepare('SELECT body FROM listings WHERE id=?').get(id);assert(row,'LISTING_NOT_FOUND',undefined,404);return JSON.parse(row.body);}
  transaction(client,account,actions){return {network:'testnet',signerId:account,receiverId:client.contract,actions};}
  save(record){this.store.db.prepare('INSERT INTO wallet_publications VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(record.id,record.listing.run_id,record.owner,canonical(record));return record;}
  load(id,owner){const row=this.store.db.prepare('SELECT body FROM wallet_publications WHERE id=? AND owner=?').get(id,owner);assert(row,'PUBLICATION_NOT_FOUND',undefined,404);return JSON.parse(row.body);}
  async verifyTransaction(client,txHash,expected) {
    assert(typeof txHash==='string'&&/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(txHash),'INVALID_TX_HASH');
    const result=cleanJSON(await client.provider.viewTransactionStatus({txHash,accountId:expected.signerId,waitUntil:'FINAL'}));
    const tx=result.transaction;
    assert(result.status && Object.hasOwn(result.status,'SuccessValue') && tx?.hash===txHash && tx.signer_id===expected.signerId && tx.receiver_id===expected.receiverId,'INVALID_CHAIN_RECEIPT',undefined,409);
    assert(tx.actions.length===expected.actions.length,'CHAIN_ACTION_MISMATCH',undefined,409);
    tx.actions.forEach((a,i)=>{const f=a.FunctionCall,p=expected.actions[i].params;
      assert(f && f.method_name===p.methodName && String(f.deposit)===p.deposit && String(f.gas)===p.gas,'CHAIN_ACTION_MISMATCH',undefined,409);
      let args;try{args=JSON.parse(Buffer.from(f.args,'base64').toString());}catch{assert(false,'CHAIN_ARGUMENT_MISMATCH');}
      assert(hash(args)===hash(p.args),'CHAIN_ARGUMENT_MISMATCH',undefined,409);
    });
    return {hash:txHash,signer:tx.signer_id,receiver:tx.receiver_id,methods:expected.actions.map(a=>a.params.methodName),status:'FINAL_SUCCESS',url:NEAR_EXPLORER+'/txns/'+txHash};
  }
  async preparePublication(identity,input) {
    const owner=identity.owner;
    const run=this.store.getRun(input.run_id);
    assert(run.owner===owner && run.config.version.owner===owner,'WALLET_AUTHOR_REQUIRED','Only bots registered and tested by this wallet can be sold.',403);
    assert(amount(input.price_yocto)>0n && amount(input.price_yocto)<=500000000000000000000000n,'TESTNET_PRICE_LIMIT');
    let record=this.store.db.prepare('SELECT body FROM wallet_publications WHERE run_id=?').get(run.id);
    if(record){record=JSON.parse(record.body);assert(record.owner===owner && record.listing.price_yocto===input.price_yocto && record.listing.version_hash===input.version_hash,'PUBLICATION_CONFLICT','The prepared listing price and version cannot be changed.',409);}
    else {
      const listing=createListing(this.store,run.id,input.version_hash,owner,input.price_yocto,false);
      record={id:uid(),owner,account_id:identity.account_id,listing:{...listing,network:'testnet_wallet'},transactions:[],created_at:now(),pending_transaction:null};this.save(record);
    }
    return this.advancePublication(identity,record.id);
  }
  advancePublication(identity,id,txHash) {return this.chain.serial(async()=>{
    const record=this.load(id,identity.owner),client=this.reader();await client.checkNetwork();
    const l=record.listing,report=this.store.report(l.run_id),run=this.store.getRun(l.run_id),account=identity.account_id;
    if(txHash && !record.transactions.some(t=>t.hash===txHash)) {
      assert(record.pending_transaction,'NO_PENDING_TRANSACTION',undefined,409);
      record.transactions.push(await this.verifyTransaction(client,txHash,record.pending_transaction));record.pending_transaction=null;this.save(record);
    }
    const transaction=actions=>{record.pending_transaction=this.transaction(client,account,actions);this.save(record);return {id,listing:l,stage:'wallet',transaction:record.pending_transaction,attached_yocto:String(actions.reduce((s,a)=>s+BigInt(a.params.deposit),0n))};};
    const version=await client.view('get_version',{version_hash:l.version_hash});
    if(version)assert(version.owner===account && version.terms_hash===l.terms_hash,'CHAIN_VERSION_CONFLICT');
    let job=await client.view('get_job',{job_id:l.run_id});
    if(job)assert(job.buyer===account && job.manifest_hash===report.manifest_hash && job.version_hash===l.version_hash && job.requested_steps===run.config.requested_steps,'CHAIN_JOB_CONFLICT');
    if(!version||!job){const actions=[];
      if(!version)actions.push(call('register_version',{version_hash:l.version_hash,terms_hash:l.terms_hash},STORAGE));
      if(!job)actions.push(call('fund_job',{job_id:l.run_id,version_hash:l.version_hash,manifest_hash:report.manifest_hash,service_deposit:SERVICE_DEPOSIT,requested_steps:run.config.requested_steps},JOB_DEPOSIT));
      return transaction(actions);
    }
    if(job.state<2){const operator=this.operator();assert(operator.contract===client.contract,'CHAIN_CONTRACT_MISMATCH');
      if(job.state===0){record.transactions.push(publicTx(await operator.call('contract','commit_result',{job_id:l.run_id,manifest_hash:report.manifest_hash,report_hash:report.hash,completed_steps:report.completed_steps})));this.save(record);}
      else assert(job.report_hash===report.hash && job.completed_steps===report.completed_steps,'CHAIN_REPORT_CONFLICT');
      // Python/rules inspection has no provider charge. Refund the service deposit as claimable credit.
      record.transactions.push(publicTx(await operator.call('contract','settle_job',{job_id:l.run_id,charge:'0',settlement_nonce:hash({job_id:l.run_id,report_hash:report.hash,wallet:true})})));this.save(record);
      job=await client.view('get_job',{job_id:l.run_id});
    }
    assert(job.state===2 && job.report_hash===report.hash && job.completed_steps===report.completed_steps,'CHAIN_REPORT_CONFLICT');
    const item=await client.view('get_listing',{listing_id:l.id});
    if(!item)return transaction([call('create_listing',{listing_id:l.id,job_id:l.run_id,expected_version_hash:l.version_hash,price:l.price_yocto},STORAGE)]);
    assert(item.seller===account && item.version_hash===l.version_hash && item.report_hash===l.report_hash && item.terms_hash===l.terms_hash && item.price===l.price_yocto,'CHAIN_LISTING_MISMATCH');
    const binding={network:'testnet',contract:client.contract,listing_id:l.id,job_id:l.run_id,seller:account,transactions:record.transactions,confirmed_at:now(),custody:'personal_wallet',finality:'FINAL'};
    this.store.transaction(()=>{
      const existing=this.store.db.prepare('SELECT body FROM listings WHERE id=?').get(l.id);
      if(existing)assert(hash(JSON.parse(existing.body))===hash(l),'LISTING_CONFLICT');
      else this.store.db.prepare('INSERT INTO listings VALUES(?,?,?,?)').run(l.id,l.version_hash,l.report_hash,canonical(l));
      this.store.db.prepare('INSERT INTO chain_listings VALUES(?,?) ON CONFLICT(id) DO NOTHING').run(l.id,canonical(binding));
      record.pending_transaction=null;record.completed_at=now();this.save(record);
    });
    return {id,stage:'complete',listing:{...l,chain:this.chain.get(l.id)}};
  });}
  async preparePurchase(identity,input) {
    const listing=this.listing(input.listing_id);
    assert(input.expected_version_hash===listing.version_hash,'VERSION_MISMATCH',undefined,409);
    assert(input.expected_terms_hash===listing.terms_hash,'TERMS_MISMATCH',undefined,409);
    const client=this.reader();const checked=await this.chain.verifyListing(listing,client);assert(checked.matches,'CHAIN_LISTING_MISMATCH');
    const license=await client.view('get_license',{buyer:identity.account_id,listing_id:listing.id});
    if(license)return {stage:'complete',license:await this.confirmPurchase(identity,input)};
    const transaction=this.purchaseTransaction(client,identity.account_id,listing);
    return {stage:'wallet',listing,transaction,attached_yocto:transaction.actions[0].params.deposit,storage_allowance_yocto:STORAGE};
  }
  purchaseTransaction(client,buyer,l){return this.transaction(client,buyer,[call('purchase_license',{listing_id:l.id,expected_version_hash:l.version_hash,expected_terms_hash:l.terms_hash},String(amount(l.price_yocto)+BigInt(STORAGE)))]);}
  async confirmPurchase(identity,input) {
    const listing=this.listing(input.listing_id),client=this.reader(),buyer=identity.account_id;
    assert(input.expected_version_hash===listing.version_hash && input.expected_terms_hash===listing.terms_hash,'VERSION_OR_TERMS_MISMATCH',undefined,409);
    const checked=await this.chain.verifyListing(listing,client);assert(checked.matches,'CHAIN_LISTING_MISMATCH');
    let tx=null;if(input.tx_hash)tx=await this.verifyTransaction(client,input.tx_hash,this.purchaseTransaction(client,buyer,listing));
    const license=await client.view('get_license',{buyer,listing_id:listing.id});
    assert(license && license.buyer===buyer && license.listing_id===listing.id && license.version_hash===listing.version_hash && license.terms_hash===listing.terms_hash,'CHAIN_LICENSE_MISSING','Purchase not confirmed for this wallet. Complete the wallet payment, then check again.',409);
    const receipt_id=['near','testnet',client.contract,buyer,listing.id].join(':');
    const proof={network:'testnet',contract:client.contract,buyer,listing_id:listing.id,version_hash:listing.version_hash,terms_hash:listing.terms_hash,finality:'FINAL',checked_at:now(),tx_hash:tx?.hash||null,explorer:tx?.url||NEAR_EXPLORER+'/address/'+client.contract};
    return this.store.transaction(()=>{
      const prior=this.store.db.prepare('SELECT body FROM licenses WHERE owner=? AND listing_id=?').get(identity.owner,listing.id);
      if(prior){const old=JSON.parse(prior.body);assert(old.network==='testnet' && old.proof?.buyer===buyer,'LICENSE_CONFLICT');return old;}
      const body={id:uid(),listing_id:listing.id,owner:walletOwner(buyer),version_hash:listing.version_hash,terms_hash:listing.terms_hash,receipt_id,entitlement:'testnet_research_license',network:'testnet',custody:'personal_wallet',proof,created:now()};
      this.store.db.prepare('INSERT INTO licenses VALUES(?,?,?,?,?)').run(body.id,body.owner,listing.id,receipt_id,canonical(body));return body;
    });
  }
  async credit(identity){const client=this.reader();await client.checkNetwork();return {account_id:identity.account_id,network:'testnet',credit_yocto:await client.view('get_credit',{account:identity.account_id})};}
  async withdraw(identity){const client=this.reader(),credit=await this.credit(identity);assert(BigInt(credit.credit_yocto)>0n,'NO_CREDIT');return {...credit,transaction:this.transaction(client,identity.account_id,[call('withdraw_credit',{},'1')])};}
}
