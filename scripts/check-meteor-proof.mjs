// Public, read-only verification. No wallet, browser, app server or private key.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {JsonRpcProvider,baseEncode} from 'near-api-js';
import {assert,hash} from '../src/common.mjs';

const evidence=JSON.parse(readFileSync(process.argv[2]||new URL('../docs/meteor-wallet-evidence.json',import.meta.url),'utf8'));
const product=JSON.parse(readFileSync(new URL('../docs/wallet-product-evidence.json',import.meta.url),'utf8'));
const {contract,buyer,listing_id,version_hash,terms_hash,report_hash,purchase}=evidence;
assert(contract.endsWith('.testnet')&&buyer.endsWith('.testnet'),'TESTNET_ONLY');
const rpc=new JsonRpcProvider({url:'https://test.rpc.fastnear.com'});
const view=(method,args)=>rpc.callFunction({contractId:contract,method,args,blockQuery:{finality:'final'}});
const [status,tx,item,license,version,job,account]=await Promise.all([
  rpc.viewNodeStatus(),rpc.viewTransactionStatus({txHash:purchase.tx_hash,accountId:buyer,waitUntil:'FINAL'}),
  view('get_listing',{listing_id}),view('get_license',{buyer,listing_id}),view('get_version',{version_hash}),
  view('get_job',{job_id:product.listing.run_id}),rpc.viewAccount({accountId:contract,blockQuery:{finality:'final'}})
]);
const action=tx.transaction.actions[0]?.FunctionCall;
const args=action?JSON.parse(Buffer.from(action.args,'base64').toString()):{};
const {hash:originalHash,...reportBody}=product.report;
const wasm=createHash('sha256').update(readFileSync(new URL('../contracts/build/agentproof_registry.wasm',import.meta.url))).digest();
const checks={
  testnet:status.chain_id==='testnet',
  personal_buyer_signature:tx.transaction.signer_id===buyer&&tx.transaction.receiver_id===contract,
  final_success:Object.hasOwn(tx.status,'SuccessValue'),
  exact_purchase:tx.transaction.actions.length===1&&action?.method_name==='purchase_license'&&args.listing_id===listing_id&&args.expected_version_hash===version_hash&&args.expected_terms_hash===terms_hash,
  exact_payment:String(action?.deposit)===purchase.deposit_yocto&&BigInt(action.deposit)===BigInt(item.price)+20000000000000000000000n,
  buyer_license:license?.buyer===buyer&&license.listing_id===listing_id&&license.version_hash===version_hash&&license.terms_hash===terms_hash,
  seller_ownership:item?.seller===version?.owner&&item.version_hash===version_hash&&version.terms_hash===terms_hash,
  report_content:hash(reportBody)===originalHash&&originalHash===report_hash,
  completed_inspection:job?.state===2&&job.report_hash===report_hash&&item.report_hash===report_hash&&job.completed_steps===product.report.completed_steps,
  deployed_contract:account.code_hash===baseEncode(wasm)
};
for(const [name,ok] of Object.entries(checks))console.log((ok?'PASS ':'FAIL ')+name);
assert(Object.values(checks).every(Boolean),'METEOR_CHAIN_PROOF_MISMATCH');
console.log(`${Object.keys(checks).length} public checks passed. FINAL ${purchase.tx_hash}`);
console.log('Browser interaction and ZIP/retest observations are separately recorded in meteor-wallet-evidence.json; public RPC alone does not prove those observations.');
