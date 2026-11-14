import { existsSync } from 'node:fs';
import { unprotectFile } from '../src/secrets.mjs';
import { fileURLToPath } from 'node:url';
const saved=fileURLToPath(new URL('../data/ai-settings.dpapi',import.meta.url));
if(existsSync(saved)){const settings=unprotectFile(saved);for(const [key,value] of Object.entries(settings))if(/^(NEAR_AI_|LIVE_)/.test(key))process.env[key]=String(value);}
const {createApp}=await import('../src/server.mjs');
const app=createApp();const port=Number(process.env.PORT||4317);
const bind = process.env.HOST || '127.0.0.1';
app.server.listen(port,bind,()=>console.log('Prooflot: '+(process.env.PROOFLOT_PUBLIC_ORIGIN || 'http://127.0.0.1:'+port)+'\nBot marketplace. Personal wallets sign testnet purchases.'));
