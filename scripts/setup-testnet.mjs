import { setupTestnet } from '../src/near.mjs';
try { const {info}=await setupTestnet(); console.log(JSON.stringify(info,null,2)); }
catch(error) { console.error('Testnet setup failed:',String(error.message).slice(0,1500)); process.exitCode=1; }
