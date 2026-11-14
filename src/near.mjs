import { Account, JsonRpcProvider, KeyPairSigner, KeyPair, actions, baseEncode } from 'near-api-js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { assert, hash } from './common.mjs';
import { protectFile, unprotectFile } from './secrets.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
export const NEAR_RPC='https://test.rpc.fastnear.com';
export const NEAR_EXPLORER='https://testnet.nearblocks.io';
const credentialPath=path.join(root,'data','testnet-keys.dpapi');
const publicPath=path.join(root,'data','testnet-public.json');
export const cleanJSON=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v));
export function testnetInfo(){
  if(process.env.PROOFLOT_TESTNET_INFO){const info=JSON.parse(process.env.PROOFLOT_TESTNET_INFO);assert(info.network==='testnet'&&info.contract?.endsWith('.testnet'),'TESTNET_ONLY');return info;}
  return existsSync(publicPath)?JSON.parse(readFileSync(publicPath,'utf8')):null;
}
export function saveTestnetInfo(info){mkdirSync(path.dirname(publicPath),{recursive:true});writeFileSync(publicPath,JSON.stringify(info,null,2));}
export class TestnetReader {
  constructor(contract=testnetInfo()?.contract){this.provider=new JsonRpcProvider({url:NEAR_RPC});this.contract=contract;assert(this.contract?.endsWith('.testnet'),'TESTNET_NOT_CONNECTED',undefined,503);}
  async checkNetwork(){const status=await this.provider.viewNodeStatus();assert(status.chain_id==='testnet','TESTNET_ONLY');return cleanJSON(status);}
  async view(method,args={}){return this.provider.callFunction({contractId:this.contract,method,args,blockQuery:{finality:'final'}});}
  async verifyPurchase({hash:txHash,buyer,listing_id,version_hash,terms_hash}){
    assert(/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(txHash),'INVALID_TX_HASH');
    const tx=cleanJSON(await this.provider.viewTransactionStatus({txHash,accountId:buyer,waitUntil:'FINAL'}));
    assert(tx.status && Object.hasOwn(tx.status,'SuccessValue') && tx.transaction?.signer_id===buyer && tx.transaction?.receiver_id===this.contract,'INVALID_CHAIN_RECEIPT');
    const action=tx.transaction.actions.find(a=>a.FunctionCall?.method_name==='purchase_license')?.FunctionCall;
    assert(action,'WRONG_CHAIN_METHOD'); const args=JSON.parse(Buffer.from(action.args,'base64').toString());
    assert(args.listing_id===listing_id && args.expected_version_hash===version_hash && args.expected_terms_hash===terms_hash,'CHAIN_ARGUMENT_MISMATCH');
    const license=await this.view('get_license',{buyer,listing_id});assert(license?.version_hash===version_hash && license.terms_hash===terms_hash,'CHAIN_LICENSE_MISSING');
    return {network:'testnet',contract:this.contract,tx_hash:txHash,buyer,listing_id,version_hash,terms_hash,finality:'FINAL',explorer:NEAR_EXPLORER+'/txns/'+txHash};
  }
}
export class TestnetClient extends TestnetReader {
  constructor(keys){const saved=keys || (process.env.PROOFLOT_TESTNET_KEYS?JSON.parse(process.env.PROOFLOT_TESTNET_KEYS):unprotectFile(credentialPath));super(saved.contract.account_id);this.keys=saved;}
  account(role){const entry=this.keys[role];assert(entry?.account_id.endsWith('.testnet'),'TESTNET_ONLY');return new Account(entry.account_id,this.provider,KeyPairSigner.fromSecretKey(entry.private_key));}
  async call(role,method,args,deposit='0'){
    const receipt=await this.account(role).callFunctionRaw({contractId:this.contract,methodName:method,args,deposit:BigInt(deposit),gas:100000000000000n,waitUntil:'FINAL'});
    const value=cleanJSON(receipt);assert(value.status && Object.hasOwn(value.status,'SuccessValue'),'CHAIN_EXECUTION_FAILED');
    return {method,signer:value.transaction.signer_id,receiver:value.transaction.receiver_id,hash:value.transaction.hash,url:NEAR_EXPLORER+'/txns/'+value.transaction.hash,status:'FINAL_SUCCESS',receipt:value};
  }
}
export async function setupTestnet(){
  let keys;
  if(existsSync(credentialPath))keys=unprotectFile(credentialPath);
  else{const id='agentproof-'+hash({time:Date.now()}).slice(0,10)+'.testnet';keys={};for(const [role,account_id] of Object.entries({contract:id,seller:'seller.'+id,buyer:'buyer.'+id})){const key=KeyPair.fromRandom('ed25519');keys[role]={account_id,private_key:key.toString(),public_key:key.getPublicKey().toString()};}protectFile(credentialPath,keys);}
  const client=new TestnetClient(keys);await client.checkNetwork();
  const exists=async id=>{try{await client.provider.viewAccount({accountId:id,blockQuery:{finality:'final'}});return true;}catch(e){if(/UNKNOWN_ACCOUNT|does not exist|not exist/i.test(String(e)))return false;throw e;}};
  if(!await exists(keys.contract.account_id)){
    const response=await fetch('https://helper.nearprotocol.com/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({newAccountId:keys.contract.account_id,newAccountPublicKey:keys.contract.public_key}),signal:AbortSignal.timeout(60000)});
    assert(response.ok,'FAUCET_UNAVAILABLE');const receipt=await response.json();assert(receipt.status && Object.hasOwn(receipt.status,'SuccessValue'),'FAUCET_CREATION_FAILED');
  }
  for(const role of ['seller','buyer']){
    if(!await exists(keys[role].account_id))await client.account('contract').createAccount({newAccountId:keys[role].account_id,publicKey:keys[role].public_key,nearToTransfer:2000000000000000000000000n});
    else {const state=await client.account(role).getState();if(state.balance.total<100000000000000000000000n)await client.account('contract').transfer({receiverId:keys[role].account_id,amount:2000000000000000000000000n});}
  }
  const wasm=readFileSync(path.join(root,'contracts','build','agentproof_registry.wasm'));
  let initialized=false;try{await client.view('get_liabilities');initialized=true;}catch{}
  if(!initialized){const receipt=await client.account('contract').signAndSendTransaction({receiverId:client.contract,actions:[actions.deployContract(wasm),actions.functionCall('new',{operator:client.contract},100000000000000n,0n)],waitUntil:'FINAL'});assert(Object.hasOwn(receipt.status,'SuccessValue'),'DEPLOY_FAILED');}
  else if((await client.account('contract').getState()).codeHash!==baseEncode(createHash('sha256').update(wasm).digest())){const receipt=await client.account('contract').deployContract(wasm);assert(Object.hasOwn(receipt.status,'SuccessValue'),'DEPLOY_FAILED');}
  const info={network:'testnet',contract:client.contract,seller:keys.seller.account_id,buyer:keys.buyer.account_id,rpc:NEAR_RPC,explorer:NEAR_EXPLORER+'/address/'+client.contract,wasm_sha256:createHash('sha256').update(wasm).digest('hex'),key_custody:'local Windows DPAPI; developer demo accounts, not a user wallet',connected_at:new Date().toISOString()};
  saveTestnetInfo(info);return {client,info};
}
