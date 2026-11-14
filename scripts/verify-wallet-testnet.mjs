import { Account, KeyPair, KeyPairSigner, actions } from 'near-api-js';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestnetClient, cleanJSON, NEAR_EXPLORER } from '../src/near.mjs';
import { protectFile, unprotectFile } from '../src/secrets.mjs';
import { assert, hash, uid } from '../src/common.mjs';

// Separate SDK signing accounts. These are NOT an automated Meteor/Nightly UI test.
// Private keys stay in this test process and in a Windows DPAPI file; they never
// enter the app's HTTP API, browser, evidence file, logs or submission archive.
const base=process.argv.find(a=>a.startsWith('--base='))?.slice(7)||'http://127.0.0.1:4317',client=new TestnetClient();
assert(['http://127.0.0.1:4317','https://prooflot.vercel.app'].includes(base),'UNTRUSTED_TEST_DESTINATION');
await client.checkNetwork();
const secrets=fileURLToPath(new URL('../data/wallet-test-keys.dpapi',import.meta.url));
let keys;
if(existsSync(secrets))keys=unprotectFile(secrets);
else{keys={};const stamp=uid().slice(0,8);for(const role of ['creator','buyer']){const key=KeyPair.fromRandom('ed25519');keys[role]={account_id:role+'-'+stamp+'.'+client.contract,private_key:key.toString(),public_key:key.getPublicKey().toString()};}protectFile(secrets,keys);}
const accounts={};
for(const role of ['creator','buyer']){const k=keys[role];assert(k.account_id.endsWith('.'+client.contract),'WRONG_TEST_ACCOUNT');accounts[role]=new Account(k.account_id,client.provider,KeyPairSigner.fromSecretKey(k.private_key));
  try{await client.provider.viewAccount({accountId:k.account_id,blockQuery:{finality:'final'}});}catch(e){if(!/UNKNOWN_ACCOUNT|does not exist|not exist/.test(String(e)))throw e;await client.account('contract').createAccount({newAccountId:k.account_id,publicKey:k.public_key,nearToTransfer:800000000000000000000000n});}
  const balance=(await accounts[role].getState()).balance.total;if(balance<200000000000000000000000n)await client.account('contract').transfer({receiverId:k.account_id,amount:500000000000000000000000n});
}
const output=path.resolve(process.argv.find(a=>a.startsWith('--save='))?.slice(7)||'output/wallet-testnet-latest.json');
mkdirSync(path.dirname(output),{recursive:true});
const resume=process.argv.includes('--resume');
const evidence=resume?JSON.parse(readFileSync(output,'utf8')):{schema:'botpassport-personal-wallet-flow-v1',started_at:new Date().toISOString(),network:'testnet',contract:client.contract,accounts:{creator:keys.creator.account_id,buyer:keys.buyer.account_id},signing:'Separate test account keys used by near-api-js in a client harness. No app server signing of creator/buyer transactions. External wallet UI approval is not verified.',checks:[],transactions:[]};
assert(!resume||!evidence.finished_at,'ALREADY_COMPLETED','This evidence is complete; do not resume or repeat its payment.');
const save=()=>writeFileSync(output,JSON.stringify(evidence,null,2));
function pass(name,details={}){if(!evidence.checks.some(c=>c.name===name))evidence.checks.push({name,pass:true,...details});save();console.log('PASS '+name);}
async function browser(){const response=await fetch(base+'/api/wallet/session'),cookie=response.headers.get('set-cookie').split(';')[0];
  return async(route,body,expected=200)=>{const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,Origin:base,'X-AgentProof':'1','Content-Type':'application/json','Idempotency-Key':uid()},body:body===undefined?undefined:JSON.stringify(body)}),data=await r.json();assert(r.status===expected,'HTTP_STATUS',`${route}: ${r.status} ${data.error||''} ${data.message||''}`);return data;};}
async function login(request,role){const c=await request('/api/wallet/challenge',{account_id:keys[role].account_id}),s=await accounts[role].getSigner().signNep413Message(keys[role].account_id,{message:c.message,recipient:c.recipient,nonce:Buffer.from(c.nonce,'base64')});
  const input={challenge_id:c.id,account_id:s.accountId,public_key:s.publicKey.toString(),signature:Buffer.from(s.signature).toString('base64')};await request('/api/wallet/verify',input);return input;}
async function sign(role,transaction,success=true){assert(transaction.signerId===keys[role].account_id && transaction.receiverId===client.contract && transaction.network==='testnet','WRONG_TRANSACTION');
  let raw;try{raw=await accounts[role].signAndSendTransaction({receiverId:transaction.receiverId,actions:transaction.actions.map(a=>actions.functionCall(a.params.methodName,a.params.args,BigInt(a.params.gas),BigInt(a.params.deposit))),waitUntil:'FINAL'});}catch(e){if(success||!e.transactionResult)throw e;raw=e.transactionResult;}
  const receipt=cleanJSON(raw);
  assert(Object.hasOwn(receipt.status,success?'SuccessValue':'Failure'),'UNEXPECTED_CHAIN_STATUS');
  const tx={hash:receipt.transaction.hash,signer:receipt.transaction.signer_id,methods:transaction.actions.map(a=>a.params.methodName),status:success?'FINAL_SUCCESS':'EXPECTED_FINAL_FAILURE',url:NEAR_EXPLORER+'/txns/'+receipt.transaction.hash};evidence.transactions.push(tx);save();return tx.hash;}
async function waitRun(request,id){const end=Date.now()+120000;while(Date.now()<end){const r=await request('/api/runs/'+id);if(!['running','queued'].includes(r.status))return request('/api/runs/'+id+'/report');await new Promise(r=>setTimeout(r,500));}throw new Error('Run timeout');}

const seller=await browser(),buyer=await browser(),stranger=await browser();
const signed=await login(seller,'creator');await seller('/api/wallet/verify',signed,401);await login(buyer,'buyer');pass('NEP-413 account ownership and replay rejection');
const source=`def decide(obs):
    closes = [int(c['close']) for c in obs['candles']]
    change = (closes[-1] - closes[0]) * 10000 // closes[0]
    held = int(obs['position']['quantity']) > 0
    if change > 35 and not held:
        return {'action': 'BUY', 'target_bps': 10000, 'reason': 'Closed-candle trend'}
    if change < -35 and held:
        return {'action': 'SELL', 'target_bps': 0, 'reason': 'Trend reversed'}
    return {'action': 'HOLD', 'target_bps': 10000 if held else 0, 'reason': 'Wait'}
`;
const botName=process.argv.find(a=>a.startsWith('--name='))?.slice(7)||'Signal Check',botVersion=process.argv.find(a=>a.startsWith('--version='))?.slice(10)||'1.0';
const bot=resume?(await seller('/api/catalog')).versions.find(b=>b.id===evidence.bot.id):await seller('/api/bots',{kind:'python',name:botName,version:botVersion,description:'Returns to cash when momentum reverses. Retest the exact same code.',source,owns_rights:true},201);evidence.bot={id:bot.id,hash:bot.hash,owner:bot.owner};
if(!resume)assert(!(await buyer('/api/catalog')).versions.some(v=>v.id===bot.id),'PRIVATE_SOURCE_LEAK');
const dataset=resume?null:await seller('/api/datasets/btc-sample',{});const started=resume?{id:evidence.run_id}:await seller('/api/runs',{version_id:bot.id,dataset_id:dataset.id,budget_micros:0},202);const report=await waitRun(seller,started.id);
assert(report.status==='completed' && report.inspection.publishable && report.completed_steps===report.requested_steps,'INCOMPLETE_INSPECTION');evidence.run_id=started.id;evidence.report_hash=report.hash;pass('Creator Python upload and real-data inspection completed',{decisions:report.completed_steps,source:report.manifest.dataset.source});
let plan=await seller('/api/wallet/publications',{run_id:started.id,version_hash:bot.hash,price_yocto:'10000000000000000000000'});
if(plan.stage!=='complete')assert(!(await buyer('/api/listings')).some(l=>l.id===plan.listing.id),'PREMATURE_PUBLICATION');pass('Unapproved publication stays private');
for(let i=0;plan.stage!=='complete'&&i<3;i++){const tx_hash=await sign('creator',plan.transaction);plan=await seller('/api/wallet/publications/'+plan.id+'/confirm',{tx_hash});}
assert(plan.stage==='complete','PUBLICATION_INCOMPLETE');const listing=plan.listing;evidence.listing_id=listing.id;evidence.publication=listing.chain;pass('Creator signed version registration and sale; operator only attested report');
const proof=await buyer('/api/listings/'+listing.id+'/verify-chain',{});assert(proof.matches,'CHAIN_BINDING_MISMATCH');
const publicReport=await buyer('/api/listings/'+listing.id+'/report');assert(!JSON.stringify(publicReport).includes(source),'PUBLIC_SOURCE_LEAK');const {hash:reportHash,...reportBody}=publicReport;assert(hash(reportBody)===reportHash,'REPORT_HASH_MISMATCH');pass('Buyer inspected exact report and FINAL chain binding');
const purchase={listing_id:listing.id,expected_version_hash:listing.version_hash,expected_terms_hash:listing.terms_hash};
await buyer('/api/wallet/purchase/prepare',{...purchase,expected_version_hash:'f'.repeat(64)},409);if(!resume||!evidence.purchase)await buyer('/api/wallet/purchase/confirm',{...purchase,success:true},409);await stranger('/api/wallet/purchase/prepare',purchase,401);pass('Wrong version, forged success and unauthenticated purchase rejected');
const prepared=await buyer('/api/wallet/purchase/prepare',purchase);
const purchaseTransaction=prepared.transaction||{network:'testnet',signerId:keys.buyer.account_id,receiverId:client.contract,actions:[{type:'FunctionCall',params:{methodName:'purchase_license',args:purchase,gas:'100000000000000',deposit:String(BigInt(listing.price_yocto)+20000000000000000000000n)}}]};
if(prepared.stage!=='complete'){const wrong=structuredClone(purchaseTransaction);wrong.actions[0].params.args.expected_terms_hash='f'.repeat(64);await sign('buyer',wrong,false);assert(!await client.view('get_license',{buyer:keys.buyer.account_id,listing_id:listing.id}),'REJECTED_TX_GRANTED_LICENSE');pass('Contract rejected modified terms without granting license');}
const creditBefore=BigInt(await client.view('get_credit',{account:keys.creator.account_id}));
const tx_hash=prepared.stage==='complete'?evidence.purchase.tx_hash:await sign('buyer',purchaseTransaction);const license=await buyer('/api/wallet/purchase/confirm',{...purchase,tx_hash});evidence.purchase=license.proof;
assert(license.proof.buyer===keys.buyer.account_id && license.custody==='personal_wallet','WRONG_BUYER');
const creditAfter=BigInt(await client.view('get_credit',{account:keys.creator.account_id}));if(prepared.stage!=='complete')assert(creditAfter-creditBefore===BigInt(listing.price_yocto),'SELLER_PRICE_NOT_CREDITED');pass('Buyer signed payment; exact price credited to creator');
await sign('buyer',purchaseTransaction,false);assert(BigInt(await client.view('get_credit',{account:keys.creator.account_id}))===creditAfter,'DOUBLE_CREDIT');pass('Duplicate payment rejected atomically; no duplicate seller credit');
const artifact=await buyer('/api/licenses/'+license.id+'/artifact');const {hash:artifactHash,...artifactBody}=artifact.artifact;assert(hash(artifactBody)===artifactHash && artifactHash===bot.hash && artifact.artifact.source===source,'WRONG_ARTIFACT');
await stranger('/api/licenses/'+license.id+'/artifact',undefined,403);await seller('/api/licenses/'+license.id+'/artifact',undefined,403);pass('Downloaded exact Python source; other accounts denied buyer entitlement');
const freshBrowser=await browser();await login(freshBrowser,'buyer');const recovered=await freshBrowser('/api/wallet/purchase/confirm',purchase);assert(recovered.id===license.id,'LICENSE_NOT_RECOVERED');
assert((await freshBrowser('/api/licenses')).some(l=>l.id===license.id),'CROSS_SESSION_LICENSE_MISSING');pass('Same wallet recovers purchase in a new browser session without payment');
const retest=await freshBrowser('/api/listings/'+listing.id+'/retest',{},202),again=await waitRun(freshBrowser,retest.id);assert(again.status==='completed' && again.run_id!==report.run_id && again.manifest.version.hash===artifactHash,'RETEST_VERSION_MISMATCH');
const decisions=r=>r.decisions.map(({call_id,...entry})=>entry);assert(hash(decisions(again))===hash(decisions(report)) && hash(again.results)===hash(report.results),'NONDETERMINISTIC_TEST_BOT');assert(again.decisions.every(d=>!report.decisions.some(old=>old.call_id===d.call_id)),'REUSED_EXECUTION');
evidence.retest={run_id:again.run_id,report_hash:again.hash,version_hash:again.manifest.version.hash,completed_steps:again.completed_steps,metrics:again.results.agent.metrics};pass('Buyer freshly executed the purchased Python version in isolated Docker');
const withdrawal=await seller('/api/wallet/withdraw',{});await sign('creator',withdrawal.transaction);assert(await client.view('get_credit',{account:keys.creator.account_id})==='0','WITHDRAW_FAILED');pass('Creator withdrew sale proceeds and unused deposits to own test wallet');
await freshBrowser('/api/wallet/logout',{});await freshBrowser('/api/licenses/'+license.id+'/artifact',undefined,403);pass('Logout removes download authorization');
writeFileSync(output.replace(/\.json$/,'')+'-product.json',JSON.stringify(await buyer('/api/listings/'+listing.id+'/evidence'),null,2));
evidence.finished_at=new Date().toISOString();evidence.passed=evidence.checks.length;save();console.log(JSON.stringify({saved:output,passed:evidence.passed,listing_id:listing.id,report_hash:report.hash,retest:again.run_id}));
