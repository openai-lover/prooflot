var mt=Object.create;var Be=Object.defineProperty;var yt=Object.getOwnPropertyDescriptor;var bt=Object.getOwnPropertyNames;var vt=Object.getPrototypeOf,xt=Object.prototype.hasOwnProperty;var h=(s,e)=>()=>{try{return e||s((e={exports:{}}).exports,e),e.exports}catch(t){throw e=0,t}};var kt=(s,e,t,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of bt(e))!xt.call(s,r)&&r!==t&&Be(s,r,{get:()=>e[r],enumerable:!(n=yt(e,r))||n.enumerable});return s};var At=(s,e,t)=>(t=s!=null?mt(vt(s)):{},kt(e||!s||!s.__esModule?Be(t,"default",{value:s,enumerable:!0}):t,s));var ie=h(D=>{"use strict";Object.defineProperty(D,"__esModule",{value:!0});D.LocalStorage=void 0;var ae=class{async get(e){return typeof window>"u"?null:localStorage.getItem(e)}async set(e,t){typeof window>"u"||localStorage.setItem(e,t)}async remove(e){typeof window>"u"||localStorage.removeItem(e)}};D.LocalStorage=ae});var He=h(le=>{"use strict";Object.defineProperty(le,"__esModule",{value:!0});le.encodeBase58=St;var ze="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";function St(s){if(s.length===0)return"";let e=0,t=0;for(;t<s.length&&s[t]===0;)e++,t++;let n=[0];for(;t<s.length;t++){let o=s[t];for(let a=0;a<n.length;++a)o+=n[a]<<8,n[a]=o%58,o=o/58|0;for(;o>0;)n.push(o%58),o=o/58|0}for(;n.length>0&&n[n.length-1]===0;)n.pop();let r="";for(let o=0;o<e;o++)r+=ze[0];for(let o=n.length-1;o>=0;--o)r+=ze[n[o]];return r}});var $=h(F=>{"use strict";Object.defineProperty(F,"__esModule",{value:!0});F.nearActionsToConnectorActions=void 0;var Ct=He(),_t=s=>{try{return JSON.parse(new TextDecoder().decode(s))}catch{return s}},Pt=s=>s.enum!=null?s.enum==="fullAccess":"fullAccess"in s,Et=s=>s.enum!=null?s.enum==="AccountId":"AccountId"in s,It=s=>s.map(e=>{if("type"in e)return e;if(e.signedDelegate)throw new Error("SignedDelegate actions cannot be sent through the wallet connector; wallets sign delegates via signDelegateActions");if(e.functionCall)return{type:"FunctionCall",params:{methodName:e.functionCall.methodName,args:_t(e.functionCall.args),gas:e.functionCall.gas.toString(),deposit:e.functionCall.deposit.toString()}};if(e.deployGlobalContract)return{type:"DeployGlobalContract",params:{code:e.deployGlobalContract.code,deployMode:Et(e.deployGlobalContract.deployMode)?"AccountId":"CodeHash"}};if(e.createAccount)return{type:"CreateAccount"};if(e.useGlobalContract){let t=e.useGlobalContract.contractIdentifier;return{type:"UseGlobalContract",params:{contractIdentifier:t.AccountId!=null?{accountId:t.AccountId}:{codeHash:(0,Ct.encodeBase58)(t.CodeHash)}}}}if(e.deployContract)return{type:"DeployContract",params:{code:e.deployContract.code}};if(e.deleteAccount)return{type:"DeleteAccount",params:{beneficiaryId:e.deleteAccount.beneficiaryId}};if(e.deleteKey)return{type:"DeleteKey",params:{publicKey:e.deleteKey.publicKey.toString()}};if(e.transfer)return{type:"Transfer",params:{deposit:e.transfer.deposit.toString()}};if(e.stake)return{type:"Stake",params:{stake:e.stake.stake.toString(),publicKey:e.stake.publicKey.toString()}};if(e.addKey){let{permission:t}=e.addKey.accessKey,n;if(t.functionCall)n={receiverId:t.functionCall.receiverId,allowance:t.functionCall.allowance?.toString(),methodNames:t.functionCall.methodNames};else if(Pt(t))n="FullAccess";else throw new Error("Unsupported access-key permission on AddKey: only functionCall and fullAccess can be sent through the wallet connector (pass a ConnectorAction otherwise)");return{type:"AddKey",params:{publicKey:e.addKey.publicKey.toString(),accessKey:{nonce:Number(e.addKey.accessKey.nonce),permission:n}}}}throw new Error("Unsupported action type")});F.nearActionsToConnectorActions=It});var W=h(P=>{"use strict";Object.defineProperty(P,"__esModule",{value:!0});P.isGasKeyAction=void 0;P.assertGasKeyActionsSupported=Nt;var Mt=s=>s.type==="TransferToGasKey"||s.type==="WithdrawFromGasKey"||s.type==="AddKey"&&s.params.gasKeyInfo!=null;P.isGasKeyAction=Mt;function Nt(s,e,t){if(s?.gasKeys)return;let n=e.filter(P.isGasKeyAction).map(r=>r.type);if(n.length!==0)throw new Error(`${t} does not advertise gas-key support (manifest features.gasKeys), so ${[...new Set(n)].join(", ")} cannot be sent through it; a wallet that does not know gasKeyInfo could add a plain key instead. Sign locally with a full-access key, or use a wallet whose manifest sets features.gasKeys.`)}});var U=h(R=>{"use strict";Object.defineProperty(R,"__esModule",{value:!0});R.uuid4=void 0;var $t=()=>typeof window<"u"&&typeof window.crypto<"u"&&typeof window.crypto.randomUUID=="function"?window.crypto.randomUUID():"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(s){let e=Math.random()*16|0;return(s==="x"?e:e&3|8).toString(16)});R.uuid4=$t});var he=h(G=>{"use strict";Object.defineProperty(G,"__esModule",{value:!0});G.ParentFrameWallet=void 0;var ce=$(),de=W(),Wt=U(),ue=class{connector;manifest;constructor(e,t){this.connector=e,this.manifest=t}callParentFrame(e,t){let n=(0,Wt.uuid4)();return window.parent.postMessage({type:"near-wallet-injected-request",id:n,method:e,params:t},"*"),new Promise((r,o)=>{let a=i=>{i.data.type==="near-wallet-injected-response"&&i.data.id===n&&(window.removeEventListener("message",a),i.data.success?r(i.data.result):o(i.data.error))};window.addEventListener("message",a)})}async signIn(e){let t=await this.callParentFrame("near:signIn",{network:e?.network??this.connector.network,addFunctionCallKey:e?.addFunctionCallKey});return Array.isArray(t)?t:[t]}async signInAndSignMessage(e){let t=await this.callParentFrame("near:signInAndSignMessage",{network:e?.network??this.connector.network,addFunctionCallKey:e?.addFunctionCallKey,messageParams:e.messageParams});return Array.isArray(t)?t:[t]}async signOut(e){let t={...e,network:e?.network??this.connector.network};await this.callParentFrame("near:signOut",t)}async getAccounts(e){let t={...e,network:e?.network??this.connector.network};return this.callParentFrame("near:getAccounts",t)}async signAndSendTransaction(e){let t=(0,ce.nearActionsToConnectorActions)(e.actions);(0,de.assertGasKeyActionsSupported)(this.manifest.features,t,this.manifest.name);let n={...e,actions:t,network:e.network??this.connector.network};return this.callParentFrame("near:signAndSendTransaction",n)}async signAndSendTransactions(e){let t=e.transactions.map(r=>({actions:(0,ce.nearActionsToConnectorActions)(r.actions),receiverId:r.receiverId}));(0,de.assertGasKeyActionsSupported)(this.manifest.features,t.flatMap(r=>r.actions),this.manifest.name);let n={...e,transactions:t,network:e.network??this.connector.network};return this.callParentFrame("near:signAndSendTransactions",n)}async signMessage(e){let t={...e,network:e.network??this.connector.network};return this.callParentFrame("near:signMessage",t)}async signDelegateActions(e){let t={...e,delegateActions:e.delegateActions.map(n=>({...n,actions:(0,ce.nearActionsToConnectorActions)(n.actions)})),network:e.network||this.connector.network};return(0,de.assertGasKeyActionsSupported)(this.manifest.features,t.delegateActions.flatMap(n=>n.actions),this.manifest.name),this.callParentFrame("near:signDelegateActions",t)}};G.ParentFrameWallet=ue});var we=h(B=>{"use strict";Object.defineProperty(B,"__esModule",{value:!0});B.parseUrl=void 0;var jt=s=>{try{return new URL(s)}catch{return null}};B.parseUrl=jt});var Ve=h(z=>{"use strict";Object.defineProperty(z,"__esModule",{value:!0});z.copyText=void 0;var Lt=async s=>{try{await navigator.clipboard.writeText(s);return}catch{}let e=document.createElement("textarea");e.value=s,e.setAttribute("readonly",""),e.style.position="fixed",e.style.opacity="0",document.body.appendChild(e),e.select();try{if(!document.execCommand("copy"))throw new Error("Copy failed")}finally{e.remove()}};z.copyText=Lt});var Ye=h(k=>{"use strict";Object.defineProperty(k,"__esModule",{value:!0});k.openExternalLink=k.openTelegramLink=k.isTelegramMiniApp=void 0;var ge=()=>{let s=window?.Telegram?.WebApp;return!s||!s.platform||s.platform==="unknown"?null:s},qt=()=>{try{return location.hash.includes("tgWebAppData")?!0:!!sessionStorage.getItem("__telegram__initParams")}catch{return!1}},Tt=()=>typeof window>"u"?!1:!!ge()||!!window.TelegramWebviewProxy||qt();k.isTelegramMiniApp=Tt;var Je=(s,e)=>{let t=window.TelegramWebviewProxy;if(t?.postEvent)return t.postEvent(s,JSON.stringify(e));let n=window.external;if(n&&"notify"in n)return n.notify(JSON.stringify({eventType:s,eventData:e}));window.parent!==window&&window.parent.postMessage(JSON.stringify({eventType:s,eventData:e}),"https://web.telegram.org")},Ot=s=>{let e=ge();if(e)return e.openTelegramLink(s.toString());Je("web_app_open_tg_link",{path_full:s.pathname+s.search})};k.openTelegramLink=Ot;var Kt=s=>{let e=ge();if(e)return e.openLink(s.toString());Je("web_app_open_link",{url:s.toString()})};k.openExternalLink=Kt});var pe=h(H=>{"use strict";Object.defineProperty(H,"__esModule",{value:!0});H.EventEmitter=void 0;var fe=class{events={};on(e,t){this.events[e]||(this.events[e]=[]),this.events[e].push(t)}emit(e,t){this.events[e]?.forEach(n=>n(t))}off(e,t){this.events[e]=this.events[e]?.filter(n=>n!==t)}once(e,t){let n=r=>{t(r),this.off(e,n)};this.on(e,n)}removeAllListeners(e){e?delete this.events[e]:this.events={}}};H.EventEmitter=fe});var J=h(V=>{"use strict";Object.defineProperty(V,"__esModule",{value:!0});V.escapeHtml=Xe;V.html=Dt;function Xe(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}var me=Symbol("htmlTag");function Dt(s,...e){let t=s[0];for(let n=0;n<e.length;n++){for(let r of Array.isArray(e[n])?e[n]:[e[n]]){let o=r?.[me]?r[me]:Xe(String(r??""));t+=o}t+=s[n+1]}return Object.freeze({[me]:t,get html(){return t}})}});var Ze=h(Y=>{"use strict";Object.defineProperty(Y,"__esModule",{value:!0});Y.css=void 0;var Ft=s=>`
${s} * {
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  -ms-overflow-style: none; 
  scrollbar-width: none; 
  color: #fff;
}

${s} *::-webkit-scrollbar { 
  display: none;
}

${s} p,
${s} h1,
${s} h2,
${s} h3,
${s} h4,
${s} h5,
${s} h6 {
  margin: 0;
}

${s} .modal-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 100000000;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    transition: opacity 0.2s ease-in-out;
}

@media (max-width: 600px) {
  ${s} .modal-container {
    justify-content: flex-end;
  }
}

${s} .modal-content {
  display: flex;
  flex-direction: column;
  align-items: center;

  max-width: 420px;
  max-height: 615px;
  width: 100%;
  border-radius: 24px;
  background: #0d0d0d;
  border: 1.5px solid rgba(255, 255, 255, 0.1);
  transition: transform 0.2s ease-in-out;
}

@media (max-width: 600px) {
  ${s} .modal-content {
    max-width: 100%;
    width: 100%;
    max-height: 80%;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border: none;
    border-top: 1.5px solid rgba(255, 255, 255, 0.1);
  }
}


${s} .modal-header {
  display: flex;
  padding: 16px;
  gap: 16px;
  align-self: stretch;
  align-items: center;
  justify-content: center;
  position: relative;
}

${s} .modal-header button {
  position: absolute;
  right: 16px;
  top: 16px;
  width: 32px;
  height: 32px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s ease-in-out;
  border: none;
  background: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

${s} .modal-header button:hover {
  background: rgba(255, 255, 255, 0.04);
}
  
${s} .modal-header p {
  color: #fff;
  text-align: center;
  font-size: 24px;
  font-style: normal;
  font-weight: 600;
  line-height: normal;
  margin: 0;
}


${s} .modal-body {
  display: flex;
  padding: 16px;
  flex-direction: column;
  align-items: flex-start;
  text-align: center;
  gap: 8px;
  overflow: auto;

  border-radius: 24px;
  background: rgba(255, 255, 255, 0.08);
  width: 100%;
  flex: 1;
}

${s} .modal-body textarea {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  background: #0d0d0d;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.1);
  outline: none;
  font-size: 16px;
  transition: background 0.2s ease-in-out;
  font-family: monospace;
  font-size: 12px;
}

${s} .modal-body button {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  background: #fff;
  color: #000;
  border: none;
  cursor: pointer;
  font-size: 16px;
  transition: background 0.2s ease-in-out;
  margin-top: 16px;
}

${s} .footer {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 16px 24px;
  color: #fff;
  gap: 12px;
}

${s} .modal-body p {
  color: rgba(255, 255, 255, 0.9);
  text-align: center;
  font-size: 16px;
  font-style: normal;
  font-weight: 500;
  line-height: normal;
  letter-spacing: -0.8px;
}

${s} .footer img {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}

${s} .get-wallet-link {
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
  font-size: 16px;
  font-style: normal;
  font-weight: 500;
  margin-left: auto;
  text-decoration: none;
  transition: color 0.2s ease-in-out;
  cursor: pointer;
}
  
${s} .get-wallet-link:hover {
  color: rgba(255, 255, 255, 1);
}


${s} .connect-item {
  display: flex;
  padding: 8px;
  align-items: center;
  gap: 12px;
  align-self: stretch;
  cursor: pointer;

  transition: background 0.2s ease-in-out;
  border-radius: 24px;
}

${s} .connect-item img {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  object-fit: cover;
  flex-shrink: 0;
}

${s} .connect-item-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  text-align: left;
  flex: 1;
  margin-top: -2px;
}

${s} .connect-item-info .wallet-address {
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  font-style: normal;
  font-weight: 400;
  line-height: normal;
}

${s} .connect-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

${s} .connect-item img {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  object-fit: cover;
}

${s} .connect-item p {
  color: rgba(255, 255, 255, 0.9);
  text-align: center;
  font-size: 18px;
  font-style: normal;
  font-weight: 600;
  line-height: normal;
  letter-spacing: -0.36px;
  margin: 0;
}
`;Y.css=Ft});var be=h(X=>{"use strict";Object.defineProperty(X,"__esModule",{value:!0});X.Popup=void 0;var Rt=Ze(),Ut=J(),Qe=`n${Math.random().toString(36).substring(2,15)}`;if(typeof document<"u"){let s=document.createElement("style");s.textContent=(0,Rt.css)(`.${Qe}`),document.head.append(s)}var ye=class{delegate;isClosed=!1;root=document.createElement("div");state={};constructor(e){this.delegate=e}get dom(){return(0,Ut.html)``}disposables=[];addListener(e,t,n){let r=typeof e=="string"?this.root.querySelector(e):e;r&&(r.addEventListener(t,n),this.disposables.push(()=>r.removeEventListener(t,n)))}handlers(){this.disposables.forEach(r=>r()),this.disposables=[];let e=this.root.querySelector(".modal-container"),t=this.root.querySelector(".modal-content");t.onclick=r=>r.stopPropagation(),e.onclick=()=>{this.delegate.onReject(),this.destroy()};let n=r=>{r.key==="Escape"&&(this.delegate.onReject(),this.destroy())};document.addEventListener("keydown",n),this.disposables.push(()=>document.removeEventListener("keydown",n))}update(e){this.state={...this.state,...e},this.root.innerHTML=this.dom.html,this.handlers()}create({show:e=!0}){this.root.className=`${Qe} hot-connector-popup`,this.root.style.display="none",this.root.innerHTML=this.dom.html,document.body.append(this.root),this.handlers();let t=this.root.querySelector(".modal-container"),n=this.root.querySelector(".modal-content");n.style.transform="translateY(50px)",t.style.opacity="0",e&&setTimeout(()=>this.show(),10)}show(){let e=this.root.querySelector(".modal-container"),t=this.root.querySelector(".modal-content");t.style.transform="translateY(50px)",e.style.opacity="0",this.root.style.display="block",setTimeout(()=>{t.style.transform="translateY(0)",e.style.opacity="1"},100)}hide(){let e=this.root.querySelector(".modal-container"),t=this.root.querySelector(".modal-content");t.style.transform="translateY(50px)",e.style.opacity="0",setTimeout(()=>{this.root.style.display="none"},200)}destroy(){this.isClosed||(this.isClosed=!0,this.disposables.forEach(e=>e()),this.disposables=[],this.hide(),setTimeout(()=>{this.root.remove()},200))}};X.Popup=ye});var et=h(Z=>{"use strict";Object.defineProperty(Z,"__esModule",{value:!0});Z.IframeWalletPopup=void 0;var ve=J(),Gt=be(),xe=class extends Gt.Popup{delegate;constructor(e){super(e),this.delegate=e}handlers(){super.handlers(),this.addListener("button","click",()=>this.delegate.onApprove())}create(){super.create({show:!1}),this.root.querySelector(".modal-body").appendChild(this.delegate.iframe),this.delegate.iframe.style.width="100%",this.delegate.iframe.style.height="720px",this.delegate.iframe.style.border="none"}get footer(){if(!this.delegate.footer)return"";let{icon:e,heading:t}=this.delegate.footer;return(0,ve.html)`
      <div class="footer">
        ${e?(0,ve.html)`<img src="${e}" alt="${t}" />`:""}
        <p>${t}</p>
      </div>
    `}get dom(){return(0,ve.html)`<div class="modal-container">
      <div class="modal-content">
        <div class="modal-body" style="padding: 0; overflow: auto;"></div>
        ${this.footer}
      </div>
    </div>`}};Z.IframeWalletPopup=xe});var tt=h(Q=>{"use strict";Object.defineProperty(Q,"__esModule",{value:!0});Q.NEAR_CONNECT_VERSION=void 0;Q.NEAR_CONNECT_VERSION="0.12.0"});var nt=h(ke=>{"use strict";Object.defineProperty(ke,"__esModule",{value:!0});var Bt=tt();async function zt(s){let e=await s.executor.getAllStorage(),t=s.executor.connector.providers,n=s.executor.manifest,r=s.id,o=s.code.replaceAll(".localStorage",".sandboxedLocalStorage").replaceAll("window.top","window.selector").replaceAll("window.open","window.selector.open"),a=s.cspNonce?` nonce="${s.cspNonce.replace(/[^A-Za-z0-9+/=]/g,"")}"`:"";return`
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body>
      <div id="root"></div>

      <style>
        :root {
          --background-color: rgb(40, 40, 40);
          --text-color: rgb(255, 255, 255);
          --border-color: rgb(209, 209, 209);
        }

        * {
          font-family: system-ui, Avenir, Helvetica, Arial, sans-serif
        }

        body, html {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          background-color: var(--background-color);
          color: var(--text-color);
        }

        #root {
          display: none;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          width: 100vw;
          background: radial-gradient(circle at center, #2c2c2c 0%, #1a1a1a 100%);
          text-align: center;
        }

        #root * {
          box-sizing: border-box;
          font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
          line-height: 1.5;
          color-scheme: light dark;
          color: rgb(255, 255, 255);
          font-synthesis: none;
          text-rendering: optimizeLegibility;
          -webkit-font-smoothing: antialiased;
        }

        .prompt-container img {
          width: 100px;
          height: 100px;
          object-fit: cover;
          border-radius: 12px;
        }

        .prompt-container h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
          margin-top: 16px;
        }

        .prompt-container p {
          margin: 0;
          font-size: 16px;
          font-weight: 500;
          color: rgb(209, 209, 209);
        }

        .prompt-container button {
          background-color: #131313;
          border: none;
          border-radius: 12px;
          padding: 12px 24px;
          cursor: pointer;
          transition: border-color 0.25s;
          color: #fff;
          outline: none;
          font-size: 14px;
          font-weight: 500;
          font-family: inherit;
          margin-top: 16px;
        }
      </style>


      <script${a}>
      window.sandboxedLocalStorage = (() => {
        let storage = ${JSON.stringify(e)}

        return {
          setItem: function(key, value) {
            window.selector.storage.set(key, value)
            storage[key] = value || '';
          },
          getItem: function(key) {
            return key in storage ? storage[key] : null;
          },
          removeItem: function(key) {
            window.selector.storage.remove(key)
            delete storage[key];
          },
          get length() {
            return Object.keys(storage).length;
          },
          key: function(i) {
            const keys = Object.keys(storage);
            return keys[i] || null;
          },
        };
      })();

      const showPrompt = async (args) => {
        const root = document.getElementById("root");   
        root.style.display = "flex";
        root.innerHTML = \`
          <div class="prompt-container">
            <img src="${n.icon}" />
            <h1>${n.name}</h1>
            <p>\${args.title}</p>
            <button>\${args.button}</button>
          </div>
        \`;

        return new Promise((resolve) => {
          root.querySelector("button")?.addEventListener("click", () => {
            root.innerHTML = "";
            resolve(true);
          });
        });
      }

      class ProxyWindow {
        constructor(url, features) {
          this.closed = false;
          this.windowIdPromise = window.selector.call("open", { url, features });

          window.addEventListener("message", async (event) => {            
            if (event.data.origin !== "${r}") return;
            if (!event.data.method?.startsWith("proxy-window:")) return;
            const method = event.data.method.replace("proxy-window:", "");
            if (method === "closed" && event.data.windowId === await this.id()) this.closed = true;
          });
        } 

        async id() {
          return await this.windowIdPromise;
        }

        async focus() {
          await window.selector.call("panel.focus", { windowId: await this.id() });
        }

        async postMessage(data) {
          window.selector.call("panel.postMessage", { windowId: await this.id(), data });
        }

        async close() {
          await window.selector.call("panel.close", { windowId: await this.id() });
        }
      }

      window.selector = {
        wallet: null,
        location: "${window.location.href}",
        nearConnectVersion: "${Bt.NEAR_CONNECT_VERSION}",
        
        outerHeight: ${window.outerHeight},
        screenY: ${window.screenY},
        outerWidth: ${window.outerWidth},
        screenX: ${window.screenX},

        providers: {
          mainnet: ${JSON.stringify(t.mainnet)},
          testnet: ${JSON.stringify(t.testnet)},
        },

        uuid() {
          return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });
        },

        walletConnect: {
          connect(params) {
            return window.selector.call("walletConnect.connect", params);
          },
          disconnect(params) {
            return window.selector.call("walletConnect.disconnect", params);
          },
          request(params) {
            return window.selector.call("walletConnect.request", params);
          },
          getProjectId() {
            return window.selector.call("walletConnect.getProjectId", {});
          },
          getSession() {
            return window.selector.call("walletConnect.getSession", {});
          },
        },
      
        async ready(wallet) {
          wallet.manifest = ${JSON.stringify(n)};
          window.parent.postMessage({ method: "wallet-ready", origin: "${r}" }, "*");
          window.selector.wallet = wallet;
        },

        async call(method, params) {
          const id = window.selector.uuid();
          window.parent.postMessage({ method, params, id, origin: "${r}" }, "*");

          return new Promise((resolve, reject) => {
            const handler = (event) => {
              if (event.data.id !== id || event.data.origin !== "${r}") return;
              window.removeEventListener("message", handler);

              if (event.data.status === "failed") reject(event.data.result);
              else resolve(event.data.result);
            };

            window.addEventListener("message", handler);
          });
        },

        panelClosed(windowId) {
          window.parent.postMessage({ 
            method: "panel.closed", 
            origin: "${r}", 
            result: { windowId } 
          }, "*");
        },

        open(url, _, params) {
          return new ProxyWindow(url, params)
        },

        external(entity, key, ...args) {
          return window.selector.call("external", { entity, key, args: args || [] });
        },

        openNativeApp(url) {
          return window.selector.call("open.nativeApp", { url });
        },

        ui: {
          async whenApprove(options) {
            window.selector.ui.showIframe();
            await showPrompt(options);
            window.selector.ui.hideIframe();
          },

          async showIframe() {
            return await window.selector.call("ui.showIframe");
          },

          async hideIframe() {
            return await window.selector.call("ui.hideIframe");
          },
        },

        storage: {
          async set(key, value) {
            await window.selector.call("storage.set", { key, value });
          },
      
          async get(key) {
            return await window.selector.call("storage.get", { key });
          },
      
          async remove(key) {
            await window.selector.call("storage.remove", { key });
          },

          async keys() {
            return await window.selector.call("storage.keys", {});
          },
        },
      };

      // Clipboard API often rejects inside the sandbox (Android WebView), copy through the dApp page then.
      // Plain assignment to navigator.clipboard is a no-op (getter on the prototype), so redefine the method
      const clipboard = navigator.clipboard || {};
      const nativeWriteText = clipboard.writeText ? clipboard.writeText.bind(clipboard) : null;
      Object.defineProperty(clipboard, "writeText", {
        configurable: true,
        value: async (text) => {
          try {
            if (nativeWriteText) return await nativeWriteText(text);
          } catch {}
          await window.selector.call("clipboard.writeText", { text });
        },
      });
      if (!navigator.clipboard) Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });

      window.addEventListener("message", async (event) => {
        if (event.data.origin !== "${r}") return;
        if (!event.data.method?.startsWith("wallet:")) return;
      
        const wallet = window.selector.wallet;
        const method = event.data.method.replace("wallet:", "");
        const payload = { id: event.data.id, origin: "${r}", method };
      
        if (wallet == null || typeof wallet[method] !== "function") {
          const data = { ...payload, status: "failed", result: "Method not found" };
          window.parent.postMessage(data, "*");
          return;
        }
        
        try {
          const result = await wallet[method](event.data.params);
          window.parent.postMessage({ ...payload, status: "success", result }, "*");
        } catch (error) {
          const data = { ...payload, status: "failed", result: error };
          window.parent.postMessage(data, "*");
        }
      });
      <\/script>

      <script type="module"${a}>${o}<\/script>
    </body>
  </html>
    `}ke.default=zt});var st=h(j=>{"use strict";var Ht=j&&j.__importDefault||function(s){return s&&s.__esModule?s:{default:s}};Object.defineProperty(j,"__esModule",{value:!0});var Vt=pe(),Jt=U(),Yt=et(),Xt=Ht(nt()),Ae=class{executor;origin;disposed=!1;iframe=document.createElement("iframe");events=new Vt.EventEmitter;popup;handler;readyPromiseResolve;readyPromise=new Promise(e=>{this.readyPromiseResolve=e});constructor(e,t,n,r){this.executor=e,this.origin=(0,Jt.uuid4)(),this.handler=a=>{a.data.origin===this.origin&&(a.data.method==="wallet-ready"&&this.readyPromiseResolve(),n(this,a))},window.addEventListener("message",this.handler);let o=[];this.executor.checkPermissions("usb")&&o.push("usb *;"),this.executor.checkPermissions("hid")&&o.push("hid *;"),this.executor.checkPermissions("clipboardRead")&&o.push("clipboard-read;"),this.executor.checkPermissions("clipboardWrite")&&o.push("clipboard-write;"),this.executor.checkPermissions("bluetooth")&&o.push("bluetooth *;"),this.iframe.allow=o.join(" "),this.iframe.setAttribute("sandbox","allow-scripts"),(0,Xt.default)({id:this.origin,executor:this.executor,code:t,cspNonce:r}).then(a=>{this.executor.connector.logger?.log("Iframe code injected"),this.iframe.srcdoc=a}),this.popup=new Yt.IframeWalletPopup({footer:this.executor.connector.footerBranding,iframe:this.iframe,onApprove:()=>{},onReject:()=>{this.disposed=!0,window.removeEventListener("message",this.handler),this.events.emit("close",{}),this.popup.destroy()}}),this.popup.create()}on(e,t){this.events.on(e,t)}show(){this.popup.show()}hide(){this.popup.hide()}postMessage(e){if(this.disposed)return;let t=this.iframe.contentWindow;if(!t)throw new Error(`Iframe not loaded for ${e?.method??"unknown method"}`);t.postMessage({...e,origin:this.origin},"*")}dispose(){this.disposed=!0,window.removeEventListener("message",this.handler),this.popup.destroy()}};j.default=Ae});var ot=h(L=>{"use strict";var Zt=L&&L.__importDefault||function(s){return s&&s.__esModule?s:{default:s}};Object.defineProperty(L,"__esModule",{value:!0});var A=we(),Ce=U(),Qt=Ve(),Se=Ye(),en=Zt(st()),tn=(0,Ce.uuid4)(),_e=class{connector;manifest;activePanels={};storageSpace;constructor(e,t){this.connector=e,this.manifest=t,this.storageSpace=t.id}checkPermissions(e,t){if(e==="walletConnect")return!!this.manifest.permissions.walletConnect;if(e==="external"){let n=this.manifest.permissions.external;return!n||!t?.entity?!1:n.includes(t.entity)}if(e==="allowsOpen"){let n=(0,A.parseUrl)(t?.url||""),r=this.manifest.permissions.allowsOpen;return!n||!r||!Array.isArray(r)||r.length===0?!1:r.some(a=>{let i=(0,A.parseUrl)(a);return!(!i||n.protocol!==i.protocol||i.hostname&&n.hostname!==i.hostname||i.pathname&&i.pathname!=="/"&&n.pathname!==i.pathname)})}return this.manifest.permissions[e]}assertPermissions(e,t,n){if(!this.checkPermissions(t,n.data.params))throw e.postMessage({...n.data,status:"failed",result:"Permission denied"}),new Error("Permission denied")}_onMessage=async(e,t)=>{let n=o=>{e.postMessage({...t.data,status:"success",result:o})},r=o=>{e.postMessage({...t.data,status:"failed",result:o})};if(t.data.method==="ui.showIframe"){e.show(),n(null);return}if(t.data.method==="ui.hideIframe"){e.hide(),n(null);return}if(t.data.method==="storage.set"){this.assertPermissions(e,"storage",t),localStorage.setItem(`${this.storageSpace}:${t.data.params.key}`,t.data.params.value),n(null);return}if(t.data.method==="storage.get"){this.assertPermissions(e,"storage",t);let o=localStorage.getItem(`${this.storageSpace}:${t.data.params.key}`);n(o);return}if(t.data.method==="storage.keys"){this.assertPermissions(e,"storage",t);let o=Object.keys(localStorage).filter(a=>a.startsWith(`${this.storageSpace}:`));n(o);return}if(t.data.method==="storage.remove"){this.assertPermissions(e,"storage",t),localStorage.removeItem(`${this.storageSpace}:${t.data.params.key}`),n(null);return}if(t.data.method==="panel.focus"){let o=this.activePanels[t.data.params.windowId];o&&o.focus(),n(null);return}if(t.data.method==="panel.postMessage"){let o=this.activePanels[t.data.params.windowId];o&&o.postMessage(t.data.params.data,"*"),n(null);return}if(t.data.method==="panel.close"){let o=this.activePanels[t.data.params.windowId];o&&o.close(),delete this.activePanels[t.data.params.windowId],n(null);return}if(t.data.method==="walletConnect.connect"){this.assertPermissions(e,"walletConnect",t);try{if(!this.connector.walletConnect)throw new Error("WalletConnect is not configured");let a=await(await this.connector.walletConnect).connect(t.data.params);a.approval(),n({uri:a.uri})}catch(o){r(o)}return}if(t.data.method==="walletConnect.getProjectId"){if(!this.connector.walletConnect)throw new Error("WalletConnect is not configured");this.assertPermissions(e,"walletConnect",t);let o=await this.connector.walletConnect;n(o.core.projectId);return}if(t.data.method==="walletConnect.disconnect"){this.assertPermissions(e,"walletConnect",t);try{if(!this.connector.walletConnect)throw new Error("WalletConnect is not configured");let a=await(await this.connector.walletConnect).disconnect(t.data.params);n(a)}catch(o){r(o)}return}if(t.data.method==="walletConnect.getSession"){this.assertPermissions(e,"walletConnect",t);try{if(!this.connector.walletConnect)throw new Error("WalletConnect is not configured");let o=await this.connector.walletConnect,a=o.session.keys[o.session.keys.length-1],i=a?o.session.get(a):null;n(i?{topic:i.topic,namespaces:i.namespaces}:null)}catch(o){r(o)}return}if(t.data.method==="walletConnect.request"){this.assertPermissions(e,"walletConnect",t);try{if(!this.connector.walletConnect)throw new Error("WalletConnect is not configured");let a=await(await this.connector.walletConnect).request(t.data.params);n(a)}catch(o){r(o)}return}if(t.data.method==="clipboard.writeText"){this.assertPermissions(e,"clipboardWrite",t);try{await(0,Qt.copyText)(t.data.params.text),n(null)}catch(o){r(o)}return}if(t.data.method==="external"){this.assertPermissions(e,"external",t);try{let{entity:o,key:a,args:i}=t.data.params,c=o.split(".").reduce((m,v)=>m[v],window);o==="nightly.near"&&a==="signTransaction"&&(i[0].encode=()=>i[0]);let g=typeof c[a]=="function"?await c[a](...i||[]):c[a];n(g)}catch(o){r(o)}return}if(t.data.method==="open"){this.assertPermissions(e,"allowsOpen",t);let o=(0,A.parseUrl)(t.data.params.url);if(o&&o.protocol==="https:"&&(0,Se.isTelegramMiniApp)()){o.hostname==="t.me"?(0,Se.openTelegramLink)(o):(0,Se.openExternalLink)(o),n(null);return}let a=window.open(t.data.params.url,"_blank",t.data.params.features),i=a?(0,Ce.uuid4)():null,c=g=>{let m=(0,A.parseUrl)(t.data.params.url);m&&m.origin===g.origin&&e.postMessage(g.data)};if(n(i),window.addEventListener("message",c),a&&i){this.activePanels[i]=a;let g=setInterval(()=>{if(!a?.closed)return;window.removeEventListener("message",c);let m={method:"proxy-window:closed",windowId:i};delete this.activePanels[i],clearInterval(g);try{e.postMessage(m)}catch{}},500)}return}if(t.data.method==="open.nativeApp"){this.assertPermissions(e,"allowsOpen",t);let o=(0,A.parseUrl)(t.data.params.url);if(!o||["https","http","javascript:","file:","data:","blob:","about:"].includes(o.protocol))throw r("Invalid URL"),new Error("[open.nativeApp] Invalid URL");let i=document.createElement("iframe");i.src=t.data.params.url,i.style.display="none",document.body.appendChild(i),e.postMessage({...t.data,status:"success",result:null});return}};actualCode=null;async checkNewVersion(e,t){if(this.actualCode)return this.connector.logger?.log("New version of code already checked"),this.actualCode;let n=(0,A.parseUrl)(e.manifest.executor);if(n||(n=(0,A.parseUrl)(location.origin+e.manifest.executor)),!n)throw new Error("Invalid executor URL");n.searchParams.set("nonce",tn);let r=await fetch(n.toString()).then(o=>{if(!o.ok)throw new Error(`Failed to load executor: ${o.status}`);return o.text()});return this.connector.logger?.log("New version of code fetched"),this.actualCode=r,r===t?(this.connector.logger?.log("New version of code is the same as the current version"),this.actualCode):(await this.connector.db.setItem(`${this.manifest.id}:${this.manifest.version}`,r).then(()=>this.connector.logger?.log("New version of code saved to cache")).catch(o=>this.connector.logger?.log("Failed to cache new version of code",o)),r)}async loadCode(){let e=await this.connector.db.getItem(`${this.manifest.id}:${this.manifest.version}`).catch(()=>null);this.connector.logger?.log("Code loaded from cache",e!==null);let t=this.checkNewVersion(this,e);return e||await t}async call(e,t){this.connector.logger?.log("Add to queue",e,t),this.connector.logger?.log("Calling method",e,t);let n=await this.loadCode();this.connector.logger?.log("Code loaded, preparing");let r=new en.default(this,n,this._onMessage,this.connector.cspNonce);this.connector.logger?.log("Code loaded, iframe initialized"),await r.readyPromise,this.connector.logger?.log("Iframe ready");let o=(0,Ce.uuid4)();return new Promise((a,i)=>{try{let c=g=>{g.data.id!==o||g.data.origin!==r.origin||(r.dispose(),window.removeEventListener("message",c),this.connector.logger?.log("postMessage",{result:g.data,request:{method:e,params:t}}),g.data.status==="failed"?i(g.data.result):a(g.data.result))};window.addEventListener("message",c),r.postMessage({method:e,params:t,id:o}),r.on("close",()=>i(new Error("Wallet closed")))}catch(c){this.connector.logger?.log("Iframe error",c),i(c)}})}async getAllStorage(){let e=Object.keys(localStorage).filter(n=>n.startsWith(`${this.storageSpace}:`)),t={};for(let n of e)t[n.replace(`${this.storageSpace}:`,"")]=localStorage.getItem(n);return t}async clearStorage(){let e=Object.keys(localStorage).filter(t=>t.startsWith(`${this.storageSpace}:`));for(let t of e)localStorage.removeItem(t)}};L.default=_e});var Ie=h(S=>{"use strict";var nn=S&&S.__importDefault||function(s){return s&&s.__esModule?s:{default:s}};Object.defineProperty(S,"__esModule",{value:!0});S.SandboxWallet=void 0;var Pe=$(),Ee=W(),sn=nn(ot()),ee=class{connector;manifest;executor;constructor(e,t){this.connector=e,this.manifest=t,this.executor=new sn.default(e,t)}async signIn(e){return this.executor.call("wallet:signIn",{network:e?.network??this.connector.network,addFunctionCallKey:e?.addFunctionCallKey})}async signInAndSignMessage(e){return this.executor.call("wallet:signInAndSignMessage",{network:e?.network??this.connector.network,addFunctionCallKey:e?.addFunctionCallKey,messageParams:e.messageParams})}async signOut(e){let t={...e,network:e?.network??this.connector.network};await this.executor.call("wallet:signOut",t),await this.executor.clearStorage()}async getAccounts(e){let t={...e,network:e?.network??this.connector.network};return this.executor.call("wallet:getAccounts",t)}async signAndSendTransaction(e){let t=(0,Pe.nearActionsToConnectorActions)(e.actions);(0,Ee.assertGasKeyActionsSupported)(this.manifest.features,t,this.manifest.name);let n={...e,actions:t,network:e.network??this.connector.network};return this.executor.call("wallet:signAndSendTransaction",n)}async signAndSendTransactions(e){let t=e.transactions.map(r=>({actions:(0,Pe.nearActionsToConnectorActions)(r.actions),receiverId:r.receiverId}));(0,Ee.assertGasKeyActionsSupported)(this.manifest.features,t.flatMap(r=>r.actions),this.manifest.name);let n={...e,transactions:t,network:e.network??this.connector.network};return this.executor.call("wallet:signAndSendTransactions",n)}async signMessage(e){let t={...e,network:e.network??this.connector.network};return this.executor.call("wallet:signMessage",t)}async signDelegateActions(e){let t={...e,delegateActions:e.delegateActions.map(n=>({...n,actions:(0,Pe.nearActionsToConnectorActions)(n.actions)})),network:e.network??this.connector.network};return(0,Ee.assertGasKeyActionsSupported)(this.manifest.features,t.delegateActions.flatMap(n=>n.actions),this.manifest.name),this.executor.call("wallet:signDelegateActions",t)}};S.SandboxWallet=ee;S.default=ee});var We=h(te=>{"use strict";Object.defineProperty(te,"__esModule",{value:!0});te.InjectedWallet=void 0;var Me=$(),Ne=W(),$e=class{connector;wallet;constructor(e,t){this.connector=e,this.wallet=t}get manifest(){return this.wallet.manifest}async signIn({addFunctionCallKey:e,network:t}){return this.wallet.signIn({network:t??this.connector.network,addFunctionCallKey:e})}async signInAndSignMessage(e){return this.wallet.signInAndSignMessage({network:e?.network??this.connector.network,addFunctionCallKey:e.addFunctionCallKey,messageParams:e.messageParams})}async signOut(e){await this.wallet.signOut({network:e?.network??this.connector.network})}async getAccounts(e){return this.wallet.getAccounts({network:e?.network??this.connector.network})}async signAndSendTransaction(e){let t=(0,Me.nearActionsToConnectorActions)(e.actions);(0,Ne.assertGasKeyActionsSupported)(this.manifest.features,t,this.manifest.name);let n=e.network??this.connector.network,r=await this.wallet.signAndSendTransaction({...e,actions:t,network:n});if(!r)throw new Error("No result from wallet");return Array.isArray(r.transactions)?r.transactions[0]:r}async signAndSendTransactions(e){let t=e.network??this.connector.network,n=e.transactions.map(o=>({actions:(0,Me.nearActionsToConnectorActions)(o.actions),receiverId:o.receiverId}));(0,Ne.assertGasKeyActionsSupported)(this.manifest.features,n.flatMap(o=>o.actions),this.manifest.name);let r=await this.wallet.signAndSendTransactions({...e,transactions:n,network:t});if(!r)throw new Error("No result from wallet");return Array.isArray(r.transactions)?r.transactions:r}async signMessage(e){return this.wallet.signMessage({...e,network:e.network??this.connector.network})}async signDelegateActions(e){let t=e.delegateActions.map(n=>({...n,actions:(0,Me.nearActionsToConnectorActions)(n.actions)}));return(0,Ne.assertGasKeyActionsSupported)(this.manifest.features,t.flatMap(n=>n.actions),this.manifest.name),this.wallet.signDelegateActions({...e,delegateActions:t,network:e.network??this.connector.network})}};te.InjectedWallet=$e});var rt=h(ne=>{"use strict";Object.defineProperty(ne,"__esModule",{value:!0});ne.NearWalletsPopup=void 0;var E=J(),on=we(),rn=be(),an={id:"custom-wallet",name:"Custom Wallet",icon:"https://www.mynearwallet.com/images/webclip.png",description:"Custom wallet for NEAR.",website:"",version:"1.0.0",executor:"your-executor-url.js",type:"sandbox",platform:{},features:{signMessage:!0,signInWithoutAddKey:!0,signInAndSignMessage:!0,signAndSendTransaction:!0,signAndSendTransactions:!0,signDelegateActions:!0},permissions:{storage:!0,allowsOpen:[]}},je=class extends rn.Popup{delegate;constructor(e){super(e),this.delegate=e,this.update({wallets:e.wallets,showSettings:!1})}handlers(){super.handlers(),this.addListener(".settings-button","click",()=>this.update({showSettings:!0})),this.addListener(".back-button","click",()=>this.update({showSettings:!1})),this.root.querySelectorAll(".connect-item").forEach(e=>{e instanceof HTMLDivElement&&this.addListener(e,"click",()=>this.delegate.onSelect(e.dataset.type))}),this.root.querySelectorAll(".remove-wallet-button").forEach(e=>{e instanceof SVGSVGElement&&this.addListener(e,"click",async t=>{t.stopPropagation(),await this.delegate.onRemoveDebugManifest(e.dataset.type);let n=this.state.wallets.filter(r=>r.id!==e.dataset.type);this.update({wallets:n})})}),this.addListener(".add-debug-manifest-button","click",async()=>{try{let e=this.root.querySelector("#debug-manifest-input")?.value??"",t=await this.delegate.onAddDebugManifest(e);this.update({showSettings:!1,wallets:[t,...this.state.wallets]})}catch(e){alert(`Something went wrong: ${e}`)}})}create(){super.create({show:!0})}walletDom(e){let t=(0,E.html)`
      <svg
        class="remove-wallet-button"
        data-type="${e.id}"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style="margin-right: 4px;"
      >
        <path d="M18 6L6 18" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M6 6L18 18" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `;return(0,E.html)`
      <div class="connect-item" data-type="${e.id}">
        <img style="background: #333" src="${e.icon}" alt="${e.name}" />
        <div class="connect-item-info">
          <span>${e.name}</span>
          <span class="wallet-address">${(0,on.parseUrl)(e.website)?.hostname}</span>
        </div>
        ${e.debug?t:""}
      </div>
    `}get footer(){if(!this.delegate.footer)return"";let{icon:e,heading:t,link:n,linkText:r}=this.delegate.footer;return(0,E.html)`
      <div class="footer">
        ${e?(0,E.html)`<img src="${e}" alt="${t}" />`:""}
        <p>${t}</p>
        <a class="get-wallet-link" href="${n}" target="_blank">${r}</a>
      </div>
    `}get dom(){return this.state.showSettings?(0,E.html)`
        <div class="modal-container">
          <div class="modal-content">
            <div class="modal-header">
              <button class="back-button" style="left: 16px; right: unset;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15 18L9 12L15 6" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
              <p>Settings</p>
            </div>

            <div class="modal-body">
              <p style="text-align: left;">
                You can add your wallet to dapp for debug,
                <a href="https://github.com/azbang/hot-connector" target="_blank">read the documentation.</a> Paste your manifest and click "Add".
              </p>

              <textarea style="width: 100%;" id="debug-manifest-input" rows="10">${JSON.stringify(an,null,2)}</textarea>
              <button class="add-debug-manifest-button">Add</button>
            </div>

            ${this.footer}
          </div>
        </div>
      `:(0,E.html)`<div class="modal-container">
      <div class="modal-content">
        <div class="modal-header">
          <p>Select wallet</p>
          <button class="settings-button">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="2" fill="rgba(255,255,255,0.5)" />
              <circle cx="19" cy="12" r="2" fill="rgba(255,255,255,0.5)" />
              <circle cx="5" cy="12" r="2" fill="rgba(255,255,255,0.5)" />
            </svg>
          </button>
        </div>

        <div class="modal-body">${this.state.wallets.map(e=>this.walletDom(e))}</div>

        ${this.footer}
      </div>
    </div>`}};ne.NearWalletsPopup=je});var at=h(qe=>{"use strict";Object.defineProperty(qe,"__esModule",{value:!0});var Le=class{dbName;storeName;version;constructor(e,t){this.dbName=e,this.storeName=t,this.version=1}getDb(){return new Promise((e,t)=>{if(typeof window>"u"||typeof indexedDB>"u"){t(new Error("IndexedDB is not available (SSR environment)"));return}let n=indexedDB.open(this.dbName,this.version);n.onerror=r=>{console.error("Error opening database:",r.target.error),t(new Error("Error opening database"))},n.onsuccess=r=>{e(n.result)},n.onupgradeneeded=r=>{let o=n.result;o.objectStoreNames.contains(this.storeName)||o.createObjectStore(this.storeName)}})}async getItem(e){let t=await this.getDb();if(typeof e=="number"&&(e=e.toString()),typeof e!="string")throw new Error("Key must be a string");return new Promise((n,r)=>{if(!this.storeName){r(new Error("Store name not set"));return}let o=t.transaction(this.storeName,"readonly");o.onerror=c=>r(o.error);let i=o.objectStore(this.storeName).get(e);i.onerror=c=>r(i.error),i.onsuccess=()=>{n(i.result),t.close()}})}async setItem(e,t){let n=await this.getDb();if(typeof e=="number"&&(e=e.toString()),typeof e!="string")throw new Error("Key must be a string");return new Promise((r,o)=>{if(!this.storeName){o(new Error("Store name not set"));return}let a=n.transaction(this.storeName,"readwrite");a.onerror=g=>o(a.error);let c=a.objectStore(this.storeName).put(t,e);c.onerror=g=>o(c.error),c.onsuccess=()=>{n.close(),r()}})}async removeItem(e){let t=await this.getDb();if(typeof e=="number"&&(e=e.toString()),typeof e!="string")throw new Error("Key must be a string");return new Promise((n,r)=>{if(!this.storeName){r(new Error("Store name not set"));return}let o=t.transaction(this.storeName,"readwrite");o.onerror=c=>r(o.error);let i=o.objectStore(this.storeName).delete(e);i.onerror=c=>r(i.error),i.onsuccess=()=>{t.close(),n()}})}async keys(){let e=await this.getDb();return new Promise((t,n)=>{if(!this.storeName){n(new Error("Store name not set"));return}let r=e.transaction(this.storeName,"readonly");r.onerror=i=>n(r.error);let a=r.objectStore(this.storeName).getAllKeys();a.onerror=i=>n(a.error),a.onsuccess=()=>{t(a.result),e.close()}})}async count(){let e=await this.getDb();return new Promise((t,n)=>{if(!this.storeName){n(new Error("Store name not set"));return}let r=e.transaction(this.storeName,"readonly");r.onerror=i=>n(r.error);let a=r.objectStore(this.storeName).count();a.onerror=i=>n(a.error),a.onsuccess=()=>{t(a.result),e.close()}})}async length(){return this.count()}async clear(){let e=await this.getDb();return new Promise((t,n)=>{if(!this.storeName){n(new Error("Store name not set"));return}let r=e.transaction(this.storeName,"readwrite");r.onerror=i=>n(r.error);let a=r.objectStore(this.storeName).clear();a.onerror=i=>n(a.error),a.onsuccess=()=>{e.close(),t()}})}};qe.default=Le});var lt=h(I=>{"use strict";var ln=I&&I.__importDefault||function(s){return s&&s.__esModule?s:{default:s}};Object.defineProperty(I,"__esModule",{value:!0});I.NearConnector=void 0;var cn=pe(),dn=rt(),un=ie(),hn=ln(at()),wn=he(),gn=We(),it=Ie(),fn=["https://raw.githubusercontent.com/hot-dao/near-selector/refs/heads/main/repository/manifest.json","https://cdn.jsdelivr.net/gh/azbang/hot-connector/repository/manifest.json"];function pn(s){return e=>Object.entries(s).length===0?!0:Object.entries(s).filter(([t,n])=>n===!0).every(([t])=>e.manifest.features?.[t]===!0)}var Te=class{storage;events;db;logger;wallets=[];manifest={wallets:[],version:"1.0.0"};features={};network="mainnet";providers={mainnet:[],testnet:[]};walletConnect;footerBranding;excludedWallets=[];autoConnect;cspNonce;whenManifestLoaded;constructor(e){this.db=new hn.default("hot-connector","wallets"),this.storage=e?.storage??new un.LocalStorage,this.events=e?.events??new cn.EventEmitter,this.logger=e?.logger,this.cspNonce=e?.cspNonce,this.network=e?.network??"mainnet",this.walletConnect=e?.walletConnect,this.autoConnect=e?.autoConnect??!0,this.providers=e?.providers??{mainnet:[],testnet:[]},this.excludedWallets=e?.excludedWallets??[],this.features=e?.features??{},e?.footerBranding!==void 0?this.footerBranding=e?.footerBranding:this.footerBranding={icon:"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%20512%20512%22%20class%3D%22size-7%22%3E%3Crect%20width%3D%22512%22%20height%3D%22512%22%20fill%3D%22%2300ec97%22%20rx%3D%22110%22%2F%3E%3Cpath%20fill%3D%22%23000%22%20d%3D%22M373.89%20106.199a31.95%2031.95%200%200%200-27.213%2015.207l-62.631%2092.979a6.67%206.67%200%200%200-.989%205.001%206.66%206.66%200%200%200%202.837%204.235%206.67%206.67%200%200%200%208.032-.494l61.643-53.47c1.02-.924%202.599-.827%203.523.193.419.473.644%201.074.644%201.697v167.402a2.49%202.49%200%200%201-2.502%202.491%202.48%202.48%200%200%201-1.912-.891L168.976%20117.497a31.93%2031.93%200%200%200-24.356-11.298h-6.508c-17.623%200-31.917%2014.294-31.917%2031.917v235.767c0%2017.623%2014.294%2031.917%2031.917%2031.917a31.94%2031.94%200%200%200%2027.213-15.206l62.631-92.98a6.66%206.66%200%200%200-1.847-9.236%206.67%206.67%200%200%200-8.033.494l-61.643%2053.471c-1.02.923-2.599.826-3.522-.194a2.5%202.5%200%200%201-.634-1.697V173.008a2.49%202.49%200%200%201%202.502-2.492c.731%200%201.439.322%201.912.891l186.313%20223.096a31.95%2031.95%200%200%200%2024.357%2011.297h6.508c17.623%200%2031.927-14.272%2031.938-31.895V138.116c0-17.623-14.294-31.917-31.917-31.917%22%2F%3E%3C%2Fsvg%3E",heading:"NEAR Connector",link:"https://wallet.near.org",linkText:"Don't have a wallet?"},this.whenManifestLoaded=new Promise(async t=>{e?.manifest==null||typeof e.manifest=="string"?this.manifest=await this._loadManifest(e?.manifest).catch(()=>({wallets:[],version:"1.0.0"})):this.manifest=e?.manifest??{wallets:[],version:"1.0.0"};let n=new Set(this.excludedWallets);n.delete("hot-wallet"),this.manifest.wallets=this.manifest.wallets.filter(r=>!(r.permissions.walletConnect&&!this.walletConnect||n.has(r.id))),await new Promise(r=>setTimeout(r,100)),t()}),typeof window<"u"&&(window.addEventListener("near-wallet-injected",this._handleNearWalletInjected),window.dispatchEvent(new Event("near-selector-ready")),window.addEventListener("message",async t=>{t.data.type==="near-wallet-injected"&&(await this.whenManifestLoaded.catch(()=>{}),this.wallets=this.wallets.filter(n=>n.manifest.id!==t.data.manifest.id),this.wallets.unshift(new wn.ParentFrameWallet(this,t.data.manifest)),this.events.emit("selector:walletsChanged",{}),this.autoConnect&&this.connect({walletId:t.data.manifest.id}))})),this.whenManifestLoaded.then(()=>{typeof window<"u"&&window.parent.postMessage({type:"near-selector-ready"},"*"),this.manifest.wallets.forEach(t=>this.registerWallet(t)),this.storage.get("debug-wallets").then(t=>{JSON.parse(t??"[]").forEach(r=>this.registerDebugWallet(r))})})}get availableWallets(){return this.wallets.filter(t=>Object.entries(this.features).every(([n,r])=>!(r&&!t.manifest.features?.[n]))).filter(t=>!(this.network==="testnet"&&!t.manifest.features?.testnet))}_handleNearWalletInjected=e=>{this.wallets=this.wallets.filter(t=>t.manifest.id!==e.detail.manifest.id),this.wallets.unshift(new gn.InjectedWallet(this,e.detail)),this.events.emit("selector:walletsChanged",{})};async _loadManifest(e){let t=e?[e]:fn;for(let n of t){let r=await fetch(n).catch(()=>null);if(!(!r||!r.ok))return await r.json()}throw new Error("Failed to load manifest")}async switchNetwork(e,t){this.network!==e&&(await this.disconnect().catch(()=>{}),this.network=e,await this.connect(t))}async registerWallet(e){if(e.type!=="sandbox")throw new Error("Only sandbox wallets are supported");this.wallets.find(t=>t.manifest.id===e.id)||(this.wallets.push(new it.SandboxWallet(this,e)),this.events.emit("selector:walletsChanged",{}))}async registerDebugWallet(e){let t=typeof e=="string"?JSON.parse(e):e;if(t.type!=="sandbox")throw new Error("Only sandbox wallets type are supported");if(!t.id)throw new Error("Manifest must have an id");if(!t.name)throw new Error("Manifest must have a name");if(!t.icon)throw new Error("Manifest must have an icon");if(!t.website)throw new Error("Manifest must have a website");if(!t.version)throw new Error("Manifest must have a version");if(!t.executor)throw new Error("Manifest must have an executor");if(!t.features)throw new Error("Manifest must have features");if(!t.permissions)throw new Error("Manifest must have permissions");if(this.wallets.find(r=>r.manifest.id===t.id))throw new Error("Wallet already registered");t.debug=!0,this.wallets.unshift(new it.SandboxWallet(this,t)),this.events.emit("selector:walletsChanged",{});let n=this.wallets.filter(r=>r.manifest.debug).map(r=>r.manifest);return this.storage.set("debug-wallets",JSON.stringify(n)),t}async removeDebugWallet(e){this.wallets=this.wallets.filter(n=>n.manifest.id!==e);let t=this.wallets.filter(n=>n.manifest.debug).map(n=>n.manifest);this.storage.set("debug-wallets",JSON.stringify(t)),this.events.emit("selector:walletsChanged",{})}async selectWallet({features:e={}}={}){return await this.whenManifestLoaded.catch(()=>{}),new Promise((t,n)=>{let r=new dn.NearWalletsPopup({footer:this.footerBranding,wallets:this.availableWallets.filter(pn(e)).map(o=>o.manifest),onRemoveDebugManifest:async o=>this.removeDebugWallet(o),onAddDebugManifest:async o=>this.registerDebugWallet(o),onReject:()=>(n(new Error("User rejected")),r.destroy()),onSelect:o=>(t(o),r.destroy())});r.create()})}async connect(e={}){let t=e.walletId,n=e.signMessageParams;await this.whenManifestLoaded.catch(()=>{}),t||(t=await this.selectWallet({features:{signInAndSignMessage:e.signMessageParams!=null?!0:void 0,signInWithFunctionCallKey:e.addFunctionCallKey!=null?!0:void 0}}));try{let r=await this.wallet(t);this.logger?.log("Wallet available to connect",r),await this.storage.set("selected-wallet",t),this.logger?.log(`Set preferred wallet, try to signIn${n!=null?" (with signed message)":""}`,t);let o;if(e.addFunctionCallKey!=null&&(this.logger?.log("Adding function call access key during sign in with params",e.addFunctionCallKey),o={...e.addFunctionCallKey,gasAllowance:e.addFunctionCallKey.gasAllowance??{amount:"250000000000000000000000",kind:"limited"}}),n!=null){let a=await r.signInAndSignMessage({addFunctionCallKey:o,messageParams:n,network:this.network});if(!a?.length)throw new Error("Failed to sign in");this.logger?.log("Signed in to wallet (with signed message)",t,a),this.events.emit("wallet:signInAndSignMessage",{wallet:r,accounts:a,success:!0}),this.events.emit("wallet:signIn",{wallet:r,accounts:a.map(i=>({accountId:i.accountId,publicKey:i.publicKey})),success:!0,source:"signInAndSignMessage"})}else{let a=await r.signIn({addFunctionCallKey:o,network:this.network});if(!a?.length)throw new Error("Failed to sign in");this.logger?.log("Signed in to wallet",t,a),this.events.emit("wallet:signIn",{wallet:r,accounts:a,success:!0,source:"signIn"})}return r}catch(r){throw this.logger?.log("Failed to connect to wallet",r),r}}async disconnect(e){e||(e=await this.wallet()),await e.signOut({network:this.network}),await this.storage.remove("selected-wallet"),this.events.emit("wallet:signOut",{success:!0})}async getConnectedWallet(){await this.whenManifestLoaded.catch(()=>{});let e=await this.storage.get("selected-wallet"),t=this.wallets.find(r=>r.manifest.id===e);if(!t)throw new Error("No wallet selected");let n=await t.getAccounts();if(!n?.length)throw new Error("No accounts found");return{wallet:t,accounts:n}}async wallet(e){if(await this.whenManifestLoaded.catch(()=>{}),!e)return this.getConnectedWallet().then(({wallet:n})=>n).catch(async()=>{throw await this.storage.remove("selected-wallet"),new Error("No accounts found")});let t=this.wallets.find(n=>n.manifest.id===e);if(!t)throw new Error("Wallet not found");return t}async use(e){await this.whenManifestLoaded.catch(()=>{}),this.wallets=this.wallets.map(t=>new Proxy(t,{get(n,r,o){let a=Reflect.get(n,r,o);if(r in e&&typeof a=="function"){let i=e[r];return function(...c){let g=()=>a.apply(n,c);return c.length>0?i.call(this,...c,g):i.call(this,void 0,g)}}return a}}))}on(e,t){this.events.on(e,t)}once(e,t){this.events.once(e,t)}off(e,t){this.events.off(e,t)}removeAllListeners(e){this.events.removeAllListeners(e)}};I.NearConnector=Te});var dt=h(p=>{"use strict";Object.defineProperty(p,"__esModule",{value:!0});p.assertGasKeyActionsSupported=p.isGasKeyAction=p.nearActionsToConnectorActions=p.NearConnector=p.InjectedWallet=p.SandboxWallet=p.ParentFrameWallet=p.LocalStorage=void 0;var mn=ie();Object.defineProperty(p,"LocalStorage",{enumerable:!0,get:function(){return mn.LocalStorage}});var yn=he();Object.defineProperty(p,"ParentFrameWallet",{enumerable:!0,get:function(){return yn.ParentFrameWallet}});var bn=Ie();Object.defineProperty(p,"SandboxWallet",{enumerable:!0,get:function(){return bn.SandboxWallet}});var vn=We();Object.defineProperty(p,"InjectedWallet",{enumerable:!0,get:function(){return vn.InjectedWallet}});var xn=lt();Object.defineProperty(p,"NearConnector",{enumerable:!0,get:function(){return xn.NearConnector}});var kn=$();Object.defineProperty(p,"nearActionsToConnectorActions",{enumerable:!0,get:function(){return kn.nearActionsToConnectorActions}});var ct=W();Object.defineProperty(p,"isGasKeyAction",{enumerable:!0,get:function(){return ct.isGasKeyAction}});Object.defineProperty(p,"assertGasKeyActionsSupported",{enumerable:!0,get:function(){return ct.assertGasKeyActionsSupported}})});var wt=At(dt(),1),u=s=>document.querySelector(s),ut=s=>{let e=BigInt(s||"0"),t=String(e%10n**24n).padStart(24,"0").slice(0,5).replace(/0+$/,"");return String(e/10n**24n)+(t?"."+t:"")},Oe="botpassport-pending-wallet-v1",C=s=>console.debug("[Prooflot wallet]",s),ht=()=>{try{return JSON.parse(localStorage.getItem(Oe)||"null")}catch{return null}},M=s=>{try{s?localStorage.setItem(Oe,JSON.stringify(s)):localStorage.removeItem(Oe)}catch{}},x=s=>{let e=String(s?.message||s);return/not enough balance|insufficient (funds|balance)/i.test(e)?"Insufficient test NEAR. Top up enough for the transaction and gas.":/reject|cancel|closed|User rejected/i.test(e)?"Wallet request unfinished. Retry or check an approved transaction.":/open popup|popup.*block/i.test(e)?"Wallet window blocked. Allow popups for this site and try again.":s?.message||"Check your wallet connection."};function Vn({api:s,notify:e,onChange:t}){let n,r,o=null,a=null,i=!1,c=document.createElement("dialog");c.className="wallet-dialog",c.setAttribute("aria-labelledby","wallet-action-title"),c.innerHTML='<div class="wallet-heading"><h2 id="wallet-action-title"></h2><button class="dialog-close" aria-label="Close wallet request">\xD7</button></div><span class="wallet-network"><span class="dot"></span>NEAR testnet</span><p class="wallet-account"></p><p class="wallet-status"></p><button class="button primary full" data-wallet-continue></button>',document.body.append(c);function g({title:l,account:d,description:w,button:y},b){if(c.open)return Promise.reject(new Error("Finish the current wallet request first."));c.querySelector("h2").textContent=l,c.querySelector(".wallet-account").textContent=d,c.querySelector(".wallet-status").textContent=w;let f=c.querySelector("[data-wallet-continue]"),_=c.querySelector(".dialog-close");return f.textContent=y,new Promise((pt,Re)=>{let Ue=()=>{f.removeEventListener("click",Ge),_.removeEventListener("click",K),c.removeEventListener("cancel",K)},K=re=>{re?.preventDefault(),Ue(),c.close(),Re(new Error("User cancelled wallet request"))},Ge=()=>{Ue(),c.close();try{pt(b())}catch(re){Re(re)}};f.addEventListener("click",Ge),_.addEventListener("click",K),c.addEventListener("cancel",K),c.showModal()})}let m=l=>{u("#wallet-status").textContent=l};function v(){let l=u("#connect-wallet");l.textContent=o?o.account_id.length>22?o.account_id.slice(0,10)+"\u2026"+o.account_id.slice(-8):o.account_id:"Connect wallet",l.title=o?.account_id||"Connect a NEAR testnet wallet",l.classList.toggle("connected",!!o),u("#wallet-account").textContent=o?.account_id||"NEAR testnet",u("#wallet-disconnect").hidden=!o,u("#wallet-connect-action").hidden=!!o,u("#wallet-funds").hidden=!o;let d=ht();u("#wallet-pending").hidden=!d||d.account!==o?.account_id,u("#wallet-notice").hidden=!d||d.account!==o?.account_id}async function Ke(){if(n)return n;let l=await(await fetch("/wallet/manifest.json")).json();return l.wallets=l.wallets.map(d=>({...d,executor:new URL(d.executor,location.origin).href})),n=new wt.NearConnector({network:"testnet",autoConnect:!1,manifest:l,features:{signMessage:!0,signInWithoutAddKey:!0,signAndSendTransaction:!0,testnet:!0},providers:{testnet:["https://test.rpc.fastnear.com"]},cspNonce:document.querySelector('meta[name="wallet-csp-nonce"]').content,footerBranding:null,logger:{log:d=>C(String(d).slice(0,100))}}),n.on("wallet:signOut",()=>{o&&q(!1).catch(d=>e(x(d),!0))}),n}async function se(){let l=await s("/api/wallet/session");return o=l.wallet,a=l.contract,v(),o}async function N(){if(i)throw new Error("Finish the current wallet request first.");i=!0,u("#wallet-dialog").close(),u("#connect-wallet").disabled=!0;try{C("connect:start");let l=await Ke(),d;try{d=(await l.getConnectedWallet()).wallet}catch{d=await l.connect()}C("connect:wallet-returned");let w=await d.getAccounts({network:"testnet"}),y=w[0]?.accountId;if(!y)throw new Error("Select a testnet account.");let b,f=await g({title:"Sign in",account:y,description:"Sign in with this account. No payment.",button:"Sign in wallet"},async()=>(b=await s("/api/wallet/challenge",{account_id:y}),C("connect:message-requested"),d.signMessage({message:b.message,recipient:b.recipient,nonce:Uint8Array.from(atob(b.nonce),_=>_.charCodeAt(0)),signerId:y,network:"testnet"})));return C("connect:message-returned"),o=await s("/api/wallet/verify",{challenge_id:b.id,account_id:f.accountId,public_key:f.publicKey,signature:f.signature}),r=d,C("connect:verified"),v(),await t?.(o),e("Testnet wallet connected."),o}catch(l){throw C("connect:failed:"+(/closed/i.test(l?.message||"")?"window-closed":/cancel|reject/i.test(l?.message||"")?"rejected":"other")),e(x(l),!0),l}finally{i=!1,u("#connect-wallet").disabled=!1}}async function q(l=!0){if(await s("/api/wallet/logout",{}),o=null,r=null,v(),u("#wallet-dialog").close(),await t?.(null),l&&n)try{await n.disconnect()}catch{}e("Wallet disconnected.")}async function T(){if(await se(),!o)return N();let l=await Ke();try{let d=await l.getConnectedWallet();if(d.accounts.some(w=>w.accountId===o.account_id))return r=d.wallet,o}catch{}return await q(!1),N()}async function oe(l){if(l.network!=="testnet"||l.receiverId!==a||l.signerId!==o?.account_id)throw new Error("Wallet and transaction details do not match.");if(!(await r.getAccounts({network:"testnet"})).some(f=>f.accountId===o.account_id))throw await q(!1),new Error("Wallet account changed. Please reconnect.");let w=l.actions.map(f=>f.params?.methodName).join(","),y=l.actions.reduce((f,_)=>f+BigInt(_.params?.deposit||"0"),0n),b=w==="purchase_license"?"Approve purchase":w==="withdraw_credit"?"Approve withdrawal":w==="create_listing"?"Publish listing":"Prepare listing";try{return(await g({title:b,account:o.account_id,description:w==="withdraw_credit"?"Withdraw available credit to your wallet.":ut(y)+" test NEAR + gas",button:"Approve in wallet"},()=>r.signAndSendTransaction(l)))?.transaction?.hash||null}catch(f){throw new Error(x(f),{cause:f})}}async function De(l,d=()=>{}){await T();let w=await s("/api/wallet/publications",l);M({kind:"publish",input:l,id:w.id,account:o.account_id}),v();for(let y=0;w.stage!=="complete"&&y<3;y++){d(w.transaction.actions.some(f=>f.params.methodName==="create_listing")?"2 / 2 \xB7 Approve listing":"1 / 2 \xB7 Register version and report");let b=await oe(w.transaction);d("Verifying final testnet result\u2026"),w=await s("/api/wallet/publications/"+w.id+"/confirm",b?{tx_hash:b}:{})}if(w.stage!=="complete")throw new Error("Publication needs confirmation. Resume from your wallet menu.");return M(null),v(),w.listing}async function gt(l,d=()=>{}){await T();let w={listing_id:l.id,expected_version_hash:l.version_hash,expected_terms_hash:l.terms_hash},y=await s("/api/wallet/purchase/prepare",w);if(y.stage==="complete")return y.license;M({kind:"purchase",input:w,account:o.account_id}),v(),d("Approve payment in your wallet");let b=await oe(y.transaction);d("Verifying license\u2026");let f=await s("/api/wallet/purchase/confirm",{...w,...b?{tx_hash:b}:{}});return M(null),v(),f}async function Fe(){if(o){u("#wallet-credit").textContent="Checking\u2026";try{let l=await s("/api/wallet/credit");u("#wallet-credit").textContent=ut(l.credit_yocto)+" test NEAR",u("#wallet-withdraw").disabled=BigInt(l.credit_yocto)===0n}catch(l){u("#wallet-credit").textContent="Needs review",m(x(l))}}}async function O(){await se(),v(),m(""),u("#wallet-dialog").showModal(),await Fe()}async function ft(){let l=ht();if(!(!o||l?.account!==o.account_id)){u("#wallet-resume").disabled=!0,m("Checking testnet records\u2026");try{l.kind==="publish"?await De(l.input,m):(await s("/api/wallet/purchase/confirm",l.input),M(null),v()),m("Verification complete."),await t?.(o),e("Transaction recovered. Check your library or the market."),await Fe()}catch(d){m(x(d))}finally{u("#wallet-resume").disabled=!1}}}return u("#connect-wallet").addEventListener("click",()=>o?O().catch(l=>e(x(l),!0)):N().catch(()=>{})),u("#wallet-connect-action").addEventListener("click",()=>N().catch(()=>{})),u("#wallet-disconnect").addEventListener("click",()=>q().catch(l=>e(x(l),!0))),u("#wallet-resume").addEventListener("click",ft),u("#wallet-notice-open").addEventListener("click",()=>O().catch(l=>e(x(l),!0))),u("#wallet-clear-pending").addEventListener("click",()=>{M(null),v(),m("Notice hidden. Approved transactions are not canceled. You can check again from the listing.")}),u("#wallet-withdraw").addEventListener("click",async()=>{let l=u("#wallet-withdraw");l.disabled=!0;try{await T(),u("#wallet-dialog").close();let d=await s("/api/wallet/withdraw",{});await oe(d.transaction),await O(),m("Balance refreshed after withdrawal request.")}catch(d){e(x(d),!0)}finally{l.disabled=!1}}),{refresh:se,ensure:T,connect:N,publish:De,purchase:gt,open:O,get session(){return o}}}export{Vn as createWalletUI};
