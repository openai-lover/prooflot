import { randomBytes } from 'node:crypto';
import { JsonRpcProvider } from 'near-api-js';
import { verifyMessage } from 'near-api-js/nep413';
import { NEAR_RPC } from './near.mjs';
import { assert, canonical, uid } from './common.mjs';

export const walletOwner = account => 'wallet:testnet:' + account;
const accountPattern = /^(?:[a-z0-9]+(?:[-_][a-z0-9]+)*(?:\.[a-z0-9]+(?:[-_][a-z0-9]+)*)*\.testnet|[a-f0-9]{64})$/;

export class WalletAuth {
  constructor(store, provider = new JsonRpcProvider({url:NEAR_RPC}), clock = Date.now) {
    this.store=store;this.provider=provider;this.clock=clock;
    store.db.exec(`CREATE TABLE IF NOT EXISTS wallet_challenges(id TEXT PRIMARY KEY, session TEXT NOT NULL, body TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS wallet_sessions(session TEXT PRIMARY KEY, account_id TEXT NOT NULL, public_key TEXT NOT NULL, expires INTEGER NOT NULL);`);
  }
  session(session) {
    const row=this.store.db.prepare('SELECT * FROM wallet_sessions WHERE session=?').get(session);
    return row && row.expires>this.clock() ? {account_id:row.account_id,public_key:row.public_key,owner:walletOwner(row.account_id),network:'testnet',expires_at:row.expires} : null;
  }
  challenge(session, accountId, origin) {
    assert(typeof accountId==='string' && accountId.length<=64 && accountPattern.test(accountId),'TESTNET_ACCOUNT_REQUIRED');
    const recent=this.store.db.prepare('SELECT body FROM wallet_challenges WHERE session=? ORDER BY rowid DESC LIMIT 8').all(session);
    assert(recent.filter(r=>JSON.parse(r.body).issued_at>this.clock()-60000).length<8,'AUTH_RATE_LIMIT',undefined,429);
    const id=uid(),expires=this.clock()+300000;
    const body={id,account_id:accountId,network:'testnet',nonce:randomBytes(32).toString('base64'),recipient:origin,issued_at:this.clock(),expires_at:expires,
      message:`Sign in to Prooflot\nAccount: ${accountId}\nNetwork: testnet\nOrigin: ${origin}\nChallenge: ${id}\nExpires: ${new Date(expires).toISOString()}\nThis signature only signs you in. It does not authorize any transaction.`};
    this.store.db.prepare('INSERT INTO wallet_challenges(id,session,body) VALUES(?,?,?)').run(id,session,canonical(body));
    return body;
  }
  async verify(session, input, origin) {
    const row=this.store.db.prepare('SELECT * FROM wallet_challenges WHERE id=? AND session=?').get(String(input.challenge_id),session);
    assert(row && !row.used,'CHALLENGE_INVALID',undefined,401);
    const challenge=JSON.parse(row.body);
    assert(challenge.expires_at>this.clock(),'CHALLENGE_EXPIRED',undefined,401);
    assert(challenge.recipient===origin && input.account_id===challenge.account_id,'CHALLENGE_BINDING_MISMATCH',undefined,401);
    assert(typeof input.public_key==='string' && /^ed25519:[1-9A-HJ-NP-Za-km-z]{42,44}$/.test(input.public_key),'INVALID_PUBLIC_KEY');
    assert(typeof input.signature==='string' && /^[A-Za-z0-9+/]{86}==$/.test(input.signature),'INVALID_SIGNATURE');
    // Consume before the asynchronous RPC call. A challenge can never win two concurrent requests.
    const changed=this.store.db.prepare('UPDATE wallet_challenges SET used=1 WHERE id=? AND used=0').run(challenge.id);
    assert(changed.changes===1,'CHALLENGE_INVALID',undefined,401);
    try {
      await this.checkNetwork();
      await verifyMessage({signerAccountId:challenge.account_id,signerPublicKey:input.public_key,signature:Buffer.from(input.signature,'base64'),
        payload:{message:challenge.message,recipient:challenge.recipient,nonce:Buffer.from(challenge.nonce,'base64')},
        provider:{viewAccessKey:args=>this.provider.viewAccessKey({...args,blockQuery:{finality:'final'}})}});
    } catch { assert(false,'WALLET_SIGNATURE_REJECTED','Could not verify the wallet signature and testnet account key.',401); }
    this.store.db.prepare('INSERT INTO wallet_sessions VALUES(?,?,?,?) ON CONFLICT(session) DO UPDATE SET account_id=excluded.account_id,public_key=excluded.public_key,expires=excluded.expires')
      .run(session,challenge.account_id,input.public_key,this.clock()+12*60*60*1000);
    return this.session(session);
  }
  async checkNetwork(){assert((await this.provider.viewNodeStatus()).chain_id==='testnet','TESTNET_ONLY');}
  async require(session, recheck=false) {
    const identity=this.session(session);assert(identity,'WALLET_REQUIRED','Connect your testnet wallet.',401);
    if(recheck){try{await this.checkNetwork();const key=await this.provider.viewAccessKey({accountId:identity.account_id,publicKey:identity.public_key,blockQuery:{finality:'final'}});assert(key.permission==='FullAccess','WALLET_KEY_REVOKED');}
      catch{this.logout(session);assert(false,'WALLET_REAUTH_REQUIRED','Account key changed. Reconnect your wallet.',401);}}
    return identity;
  }
  logout(session){this.store.db.prepare('DELETE FROM wallet_sessions WHERE session=?').run(session);this.store.db.prepare('UPDATE wallet_challenges SET used=1 WHERE session=?').run(session);}
}
