import { NearConnector } from '@hot-labs/near-connect';

const $=s=>document.querySelector(s);
const amount=value=>{const n=BigInt(value||'0'),f=String(n%10n**24n).padStart(24,'0').slice(0,5).replace(/0+$/,'');return String(n/10n**24n)+(f?'.'+f:'');};
const pendingKey='botpassport-pending-wallet-v1';
// Diagnostics contain stage names only; never record nonces, signatures or wallet payloads.
const trace=stage=>console.debug('[Prooflot wallet]',stage);
const readPending=()=>{try{return JSON.parse(localStorage.getItem(pendingKey)||'null');}catch{return null;}};
const savePending=value=>{try{value?localStorage.setItem(pendingKey,JSON.stringify(value)):localStorage.removeItem(pendingKey);}catch{}};
const message=e=>{const raw=String(e?.message||e);if(/not enough balance|insufficient (funds|balance)/i.test(raw))return 'Insufficient test NEAR. Top up enough for the transaction and gas.';if(/reject|cancel|closed|User rejected/i.test(raw))return 'Wallet request unfinished. Retry or check an approved transaction.';if(/open popup|popup.*block/i.test(raw))return 'Wallet window blocked. Allow popups for this site and try again.';return e?.message||'Check your wallet connection.';};

export function createWalletUI({api,notify,onChange}) {
  let connector,connectedWallet,session=null,contract=null,busy=false;
  const actionDialog=document.createElement('dialog');actionDialog.className='wallet-dialog';actionDialog.setAttribute('aria-labelledby','wallet-action-title');
  actionDialog.innerHTML='<div class="wallet-heading"><h2 id="wallet-action-title"></h2><button class="dialog-close" aria-label="Close wallet request">×</button></div><span class="wallet-network"><span class="dot"></span>NEAR testnet</span><p class="wallet-account"></p><p class="wallet-status"></p><button class="button primary full" data-wallet-continue></button>';
  document.body.append(actionDialog);
  function requestWalletAction({title,account,description,button},action){
    if(actionDialog.open)return Promise.reject(new Error('Finish the current wallet request first.'));
    actionDialog.querySelector('h2').textContent=title;actionDialog.querySelector('.wallet-account').textContent=account;
    actionDialog.querySelector('.wallet-status').textContent=description;
    const proceed=actionDialog.querySelector('[data-wallet-continue]'),close=actionDialog.querySelector('.dialog-close');proceed.textContent=button;
    return new Promise((resolve,reject)=>{
      const cleanup=()=>{proceed.removeEventListener('click',approve);close.removeEventListener('click',cancel);actionDialog.removeEventListener('cancel',cancel);};
      const cancel=event=>{event?.preventDefault();cleanup();actionDialog.close();reject(new Error('User cancelled wallet request'));};
      // Start inside this app's click event. An approval in a different popup does
      // not give this window user activation for the next Meteor popup.
      const approve=()=>{cleanup();actionDialog.close();try{resolve(action());}catch(e){reject(e);}};
      proceed.addEventListener('click',approve);close.addEventListener('click',cancel);actionDialog.addEventListener('cancel',cancel);actionDialog.showModal();
    });
  }
  const status=text=>{$('#wallet-status').textContent=text;};
  function render(){const button=$('#connect-wallet');button.textContent=session?session.account_id.length>22?session.account_id.slice(0,10)+'…'+session.account_id.slice(-8):session.account_id:'Connect wallet';button.title=session?.account_id||'Connect a NEAR testnet wallet';button.classList.toggle('connected',Boolean(session));
    $('#wallet-account').textContent=session?.account_id||'NEAR testnet';$('#wallet-disconnect').hidden=!session;$('#wallet-connect-action').hidden=Boolean(session);$('#wallet-funds').hidden=!session;
    const pending=readPending();$('#wallet-pending').hidden=!pending||pending.account!==session?.account_id;$('#wallet-notice').hidden=!pending||pending.account!==session?.account_id;
  }
  async function getConnector(){if(connector)return connector;const manifest=await(await fetch('/wallet/manifest.json')).json();manifest.wallets=manifest.wallets.map(w=>({...w,executor:new URL(w.executor,location.origin).href}));
    connector=new NearConnector({network:'testnet',autoConnect:false,manifest,features:{signMessage:true,signInWithoutAddKey:true,signAndSendTransaction:true,testnet:true},providers:{testnet:['https://test.rpc.fastnear.com']},cspNonce:document.querySelector('meta[name="wallet-csp-nonce"]').content,footerBranding:null,logger:{log:label=>trace(String(label).slice(0,100))}});
    connector.on('wallet:signOut',()=>{if(session)logout(false).catch(e=>notify(message(e),true));});return connector;
  }
  async function refresh(){const s=await api('/api/wallet/session');session=s.wallet;contract=s.contract;render();return session;}
  async function connect(){if(busy)throw new Error('Finish the current wallet request first.');busy=true;$('#wallet-dialog').close();$('#connect-wallet').disabled=true;
    try{trace('connect:start');const c=await getConnector();let wallet;try{wallet=(await c.getConnectedWallet()).wallet;}catch{wallet=await c.connect();}trace('connect:wallet-returned');const accounts=await wallet.getAccounts({network:'testnet'}),account=accounts[0]?.accountId;if(!account)throw new Error('Select a testnet account.');
      let challenge;
      const signed=await requestWalletAction({title:'Sign in',account,description:'Sign in with this account. No payment.',button:'Sign in wallet'},async()=>{
        challenge=await api('/api/wallet/challenge',{account_id:account});trace('connect:message-requested');
        return wallet.signMessage({message:challenge.message,recipient:challenge.recipient,nonce:Uint8Array.from(atob(challenge.nonce),c=>c.charCodeAt(0)),signerId:account,network:'testnet'});
      });
      trace('connect:message-returned');session=await api('/api/wallet/verify',{challenge_id:challenge.id,account_id:signed.accountId,public_key:signed.publicKey,signature:signed.signature});connectedWallet=wallet;trace('connect:verified');render();await onChange?.(session);notify('Testnet wallet connected.');return session;
    }catch(e){trace('connect:failed:'+(/closed/i.test(e?.message||'')?'window-closed':/cancel|reject/i.test(e?.message||'')?'rejected':'other'));notify(message(e),true);throw e;}finally{busy=false;$('#connect-wallet').disabled=false;}
  }
  async function logout(disconnect=true){await api('/api/wallet/logout',{});session=null;connectedWallet=null;render();$('#wallet-dialog').close();await onChange?.(null);if(disconnect&&connector)try{await connector.disconnect();}catch{}notify('Wallet disconnected.');}
  async function ensure(){await refresh();if(!session)return connect();const c=await getConnector();try{const current=await c.getConnectedWallet();if(current.accounts.some(a=>a.accountId===session.account_id)){connectedWallet=current.wallet;return session;}}catch{}
    await logout(false);return connect();
  }
  async function sign(transaction){if(transaction.network!=='testnet'||transaction.receiverId!==contract||transaction.signerId!==session?.account_id)throw new Error('Wallet and transaction details do not match.');
    const accounts=await connectedWallet.getAccounts({network:'testnet'});if(!accounts.some(a=>a.accountId===session.account_id)){await logout(false);throw new Error('Wallet account changed. Please reconnect.');}
    const method=transaction.actions.map(a=>a.params?.methodName).join(','),deposit=transaction.actions.reduce((sum,a)=>sum+BigInt(a.params?.deposit||'0'),0n);
    const title=method==='purchase_license'?'Approve purchase':method==='withdraw_credit'?'Approve withdrawal':method==='create_listing'?'Publish listing':'Prepare listing';
    try{const result=await requestWalletAction({title,account:session.account_id,description:method==='withdraw_credit'?'Withdraw available credit to your wallet.':amount(deposit)+' test NEAR + gas',button:'Approve in wallet'},()=>connectedWallet.signAndSendTransaction(transaction));return result?.transaction?.hash||null;}
    catch(error){throw new Error(message(error),{cause:error});}
  }
  async function publish(input,progress=()=>{}){await ensure();let plan=await api('/api/wallet/publications',input);savePending({kind:'publish',input,id:plan.id,account:session.account_id});render();
    for(let i=0;plan.stage!=='complete'&&i<3;i++){progress(plan.transaction.actions.some(a=>a.params.methodName==='create_listing')?'2 / 2 · Approve listing':'1 / 2 · Register version and report');const tx_hash=await sign(plan.transaction);progress('Verifying final testnet result…');plan=await api('/api/wallet/publications/'+plan.id+'/confirm',tx_hash?{tx_hash}:{});}
    if(plan.stage!=='complete')throw new Error('Publication needs confirmation. Resume from your wallet menu.');savePending(null);render();return plan.listing;
  }
  async function purchase(item,progress=()=>{}){await ensure();const input={listing_id:item.id,expected_version_hash:item.version_hash,expected_terms_hash:item.terms_hash};const plan=await api('/api/wallet/purchase/prepare',input);if(plan.stage==='complete')return plan.license;
    savePending({kind:'purchase',input,account:session.account_id});render();progress('Approve payment in your wallet');const tx_hash=await sign(plan.transaction);progress('Verifying license…');const license=await api('/api/wallet/purchase/confirm',{...input,...(tx_hash?{tx_hash}:{})});savePending(null);render();return license;
  }
  async function credit(){if(!session)return;$('#wallet-credit').textContent='Checking…';try{const r=await api('/api/wallet/credit');$('#wallet-credit').textContent=amount(r.credit_yocto)+' test NEAR';$('#wallet-withdraw').disabled=BigInt(r.credit_yocto)===0n;}catch(e){$('#wallet-credit').textContent='Needs review';status(message(e));}}
  async function open(){await refresh();render();status('');$('#wallet-dialog').showModal();await credit();}
  async function resume(){const pending=readPending();if(!session||pending?.account!==session.account_id)return;$('#wallet-resume').disabled=true;status('Checking testnet records…');
    try{if(pending.kind==='publish')await publish(pending.input,status);else{await api('/api/wallet/purchase/confirm',pending.input);savePending(null);render();}status('Verification complete.');await onChange?.(session);notify('Transaction recovered. Check your library or the market.');await credit();}catch(e){status(message(e));}finally{$('#wallet-resume').disabled=false;}}
  $('#connect-wallet').addEventListener('click',()=>session?open().catch(e=>notify(message(e),true)):connect().catch(()=>{}));
  $('#wallet-connect-action').addEventListener('click',()=>connect().catch(()=>{}));
  $('#wallet-disconnect').addEventListener('click',()=>logout().catch(e=>notify(message(e),true)));
  $('#wallet-resume').addEventListener('click',resume);$('#wallet-notice-open').addEventListener('click',()=>open().catch(e=>notify(message(e),true)));
  $('#wallet-clear-pending').addEventListener('click',()=>{savePending(null);render();status('Notice hidden. Approved transactions are not canceled. You can check again from the listing.');});
  $('#wallet-withdraw').addEventListener('click',async()=>{const b=$('#wallet-withdraw');b.disabled=true;try{await ensure();$('#wallet-dialog').close();const plan=await api('/api/wallet/withdraw',{});await sign(plan.transaction);await open();status('Balance refreshed after withdrawal request.');}catch(e){notify(message(e),true);}finally{b.disabled=false;}});
  return {refresh,ensure,connect,publish,purchase,open,get session(){return session;}};
}
