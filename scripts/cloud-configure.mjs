import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {unprotectFile} from '../src/secrets.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const settings=unprotectFile(resolve(root,'data/cloud-deploy.dpapi'));
const cli=resolve(root,'.tools/vercel/node_modules/vercel/dist/vc.js');
for(const [name,value,sensitive] of [
  ['PROOFLOT_PUBLIC_ORIGIN',settings.origin,false],
  ['PROOFLOT_SANDBOX_NAME',settings.name,false],
  ['PROOFLOT_GATEWAY_SECRET',settings.secret,true]
]){
  const result=spawnSync(process.execPath,[cli,'env','add',name,'--environment','production','--cwd',resolve(root,'deploy/vercel'),'--scope','teamstartup','--yes','--force',sensitive?'--sensitive':'--no-sensitive'],{
    input:value,encoding:'utf8',windowsHide:true,env:{...process.env,CI:'1'},maxBuffer:1e6
  });
  if(result.status!==0){console.error('Could not configure '+name);process.exit(1);}
  console.log('Configured '+name+(sensitive?' (secret)':''));
}
