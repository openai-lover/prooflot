import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { JsonRpcProvider, baseEncode } from 'near-api-js';
import { assert, hash } from '../src/common.mjs';

// Read-only and independent of the app server, DPAPI credentials and wallet SDK UI.
const evidence=JSON.parse(readFileSync(process.argv[2]||new URL('../docs/wallet-testnet-evidence.json',import.meta.url),'utf8'));
const product=JSON.parse(readFileSync(process.argv[3]||new URL('../docs/wallet-product-evidence.json',import.meta.url),'utf8'));
const {listing,report}=product,{hash:reportHash,...body}=report;
const rpc=new JsonRpcProvider({url:'https://test.rpc.fastnear.com'}),contract=evidence.contract;
assert(contract.endsWith('.testnet'),'TESTNET_ONLY');
const view=(method,args)=>rpc.callFunction({contractId:contract,method,args,blockQuery:{finality:'final'}});
const [status,version,job,item,license,tx,account]=await Promise.all([
  rpc.viewNodeStatus(),view('get_version',{version_hash:listing.version_hash}),view('get_job',{job_id:listing.run_id}),view('get_listing',{listing_id:listing.id}),
  view('get_license',{buyer:evidence.accounts.buyer,listing_id:listing.id}),rpc.viewTransactionStatus({txHash:evidence.purchase.tx_hash,accountId:evidence.accounts.buyer,waitUntil:'FINAL'}),rpc.viewAccount({accountId:contract,blockQuery:{finality:'final'}})
]);
const action=tx.transaction.actions[0]?.FunctionCall,args=action?JSON.parse(Buffer.from(action.args,'base64').toString()):{};
const wasmHash=createHash('sha256').update(readFileSync(new URL('../contracts/build/agentproof_registry.wasm',import.meta.url))).digest();
const checks={
  testnet:status.chain_id==='testnet',
  report_content:hash(body)===reportHash&&reportHash===evidence.report_hash,
  creator_ownership:version?.owner===evidence.accounts.creator&&item?.seller===evidence.accounts.creator&&listing.seller==='wallet:testnet:'+evidence.accounts.creator,
  exact_version:listing.version_hash===evidence.bot.hash&&item?.version_hash===listing.version_hash&&job?.version_hash===listing.version_hash,
  exact_terms:version?.terms_hash===listing.terms_hash&&item?.terms_hash===listing.terms_hash&&license?.terms_hash===listing.terms_hash,
  pinned_report:item?.report_hash===reportHash&&job?.report_hash===reportHash,
  manifest_commitment:job?.manifest_hash===report.manifest_hash,
  complete_settled_inspection:job?.state===2&&job.completed_steps===report.completed_steps&&report.completed_steps===report.requested_steps,
  exact_price:item?.price===listing.price_yocto&&action?.deposit===(BigInt(listing.price_yocto)+20000000000000000000000n).toString(),
  buyer_license:license?.buyer===evidence.accounts.buyer&&license?.listing_id===listing.id&&license?.version_hash===listing.version_hash,
  buyer_signed_payment:tx.transaction.signer_id===evidence.accounts.buyer&&tx.transaction.receiver_id===contract&&Object.hasOwn(tx.status,'SuccessValue')&&tx.transaction.actions.length===1&&action?.method_name==='purchase_license',
  exact_purchase_arguments:args.listing_id===listing.id&&args.expected_version_hash===listing.version_hash&&args.expected_terms_hash===listing.terms_hash,
  deployed_wasm:account.code_hash===baseEncode(wasmHash)
};
const withdrawal=evidence.transactions.find(t=>t.status==='FINAL_SUCCESS'&&t.methods.includes('withdraw_credit'));
assert(withdrawal,'WITHDRAWAL_EVIDENCE_MISSING');
const paid=await rpc.viewTransactionStatus({txHash:withdrawal.hash,accountId:evidence.accounts.creator,waitUntil:'FINAL'});
checks.creator_withdrawal=Object.hasOwn(paid.status,'SuccessValue')&&paid.transaction.signer_id===evidence.accounts.creator&&paid.transaction.receiver_id===contract&&paid.transaction.actions[0]?.FunctionCall?.method_name==='withdraw_credit';
for(const [name,ok] of Object.entries(checks))console.log((ok?'PASS ':'FAIL ')+name);
console.log('FINAL · '+contract+' · '+listing.id);
console.log('Public chain identity/payment checks. Python execution remains operator-attested; external wallet UI approval is not asserted.');
assert(Object.values(checks).every(Boolean),'WALLET_PROOF_MISMATCH');
