// Explicit, operator-run provisioning. Public requests never create infrastructure.
import { Sandbox, Drive } from '@vercel/sandbox';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { protectFile, unprotectFile } from '../src/secrets.mjs';
import { PYTHON_IMAGE } from '../src/bot-runner.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const origin = process.argv[2];
if (!origin || new URL(origin).origin !== origin || !origin.startsWith('https://')) throw Error('Pass the assigned HTTPS production origin.');
const envFile = resolve(root, 'deploy/vercel/.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const secretFile = resolve(root, 'data/cloud-deploy.dpapi');
const settings = existsSync(secretFile) ? unprotectFile(secretFile) : {
  name: 'prooflot-market-v1', secret: randomBytes(32).toString('hex')
};
if (settings.origin && settings.origin !== origin) throw Error('Existing deployment origin differs. Review the deployment settings before changing it.');
settings.origin = origin;
protectFile(secretFile, settings);
const keys = unprotectFile(resolve(root, 'data/testnet-keys.dpapi'));
const publicInfo = JSON.parse(readFileSync(resolve(root, 'data/testnet-public.json'), 'utf8'));
if (publicInfo.network !== 'testnet' || keys.contract.account_id !== publicInfo.contract) throw Error('TESTNET_ONLY');
publicInfo.key_custody = 'Vercel Sandbox environment; development testnet operator accounts only. Personal wallets sign locally.';
const environment = {
  HOST:'0.0.0.0', PORT:'4317', AGENTPROOF_DATA_DIR:'/prooflot-data',
  PROOFLOT_PUBLIC_ORIGIN:origin, PROOFLOT_GATEWAY_SECRET:settings.secret,
  PROOFLOT_TESTNET_INFO:JSON.stringify(publicInfo),
  PROOFLOT_TESTNET_KEYS:JSON.stringify({contract:keys.contract,seller:keys.seller}),
  NODE_ENV:'production'
};
async function command(sandbox, cmd, args, extra={}) {
  const result = await sandbox.runCommand({cmd,args,cwd:'/vercel/prooflot',timeoutMs:360000,...extra});
  if(result.exitCode!==0) {
    // Commands never print environment values. Redact secrets again defensively.
    let error = (await result.stderr()).slice(-1800);
    for(const value of [settings.secret,keys.contract.private_key,keys.seller.private_key,process.env.VERCEL_OIDC_TOKEN]) if(value)error=error.replaceAll(value,'[redacted]');
    throw Error(`${cmd} exited ${result.exitCode}: ${error}`);
  }
  return result;
}
function sourceFiles() {
  const files=[];
  function visit(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
    const name=resolve(dir,entry.name);
    if(entry.isDirectory())visit(name);
    else if(entry.isFile()) {
      let content=readFileSync(name);
      if(name.endsWith('.sh'))content=Buffer.from(content.toString('utf8').replaceAll('\r\n','\n'));
      files.push({path:'/vercel/prooflot/'+relative(root,name).replaceAll('\\','/'),content});
    }
  }}
  for(const dir of ['src','public','scripts'])visit(resolve(root,dir));
  for(const file of ['package.json','package-lock.json'])files.push({path:'/vercel/prooflot/'+file,content:readFileSync(resolve(root,file))});
  return files;
}
async function seedDatabase(sandbox) {
  const check = await sandbox.runCommand({cmd:'test',args:['-f','/prooflot-data/agentproof.sqlite']});
  if(check.exitCode===0){console.log('Persistent database exists; preserved.');return;}
  const out=resolve(root,'output/cloud');mkdirSync(out,{recursive:true});
  const copy=resolve(out,'seed-'+Date.now()+'.sqlite');
  const source=new DatabaseSync(resolve(root,'data/agentproof.sqlite'),{readOnly:true});
  source.prepare('VACUUM INTO ?').run(copy);source.close();
  const db=new DatabaseSync(copy);
  db.exec('DELETE FROM wallet_sessions; DELETE FROM wallet_challenges; DELETE FROM local_sessions; VACUUM;');
  const counts={};for(const table of ['reports','listings','licenses'])counts[table]=db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;
  db.close();
  const content=readFileSync(copy);
  await sandbox.writeFiles([{path:'/prooflot-data/agentproof.sqlite',content}]);
  console.log(JSON.stringify({seeded:counts,bytes:content.length,sha256:createHash('sha256').update(content).digest('hex'),sessionsMigrated:0}));
}
try {
  console.log('Creating or locating the persistent data drive.');
  const drive=await Drive.getOrCreate({name:'prooflot-data',maxSize:1024**3,region:'iad1'});
  const sandbox=await Sandbox.getOrCreate({
    name:settings.name,image:'vercel/sandbox/node:24',ports:[4317],timeout:40*60000,
    resources:{vcpus:1},region:'iad1',persistent:true,mounts:{'/prooflot-data':drive},env:environment,
    snapshotExpiration:30*86400000,keepLastSnapshots:{count:1,expiration:30*86400000},resume:true,
    onCreate:async()=>console.log('Created isolated cloud backend.')
  });
  await command(sandbox,'bash',['-lc','sudo mkdir -p /vercel/prooflot && sudo chown "$(id -u):$(id -g)" /vercel/prooflot /prooflot-data'],{cwd:'/tmp'});
  console.log('Uploading reviewed application source.');
  let batch=[],bytes=0;
  for(const file of sourceFiles()){
    if(bytes+file.content.length>8e6&&batch.length){await sandbox.writeFiles(batch);batch=[];bytes=0;}
    batch.push(file);bytes+=file.content.length;
  }
  if(batch.length)await sandbox.writeFiles(batch);
  await seedDatabase(sandbox);
  console.log('Installing runtime dependencies.');
  await command(sandbox,'npm',['ci','--no-audit','--no-fund']);
  await command(sandbox,'bash',['-lc','command -v dockerd >/dev/null || (sudo apt-get update -qq && sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io)']);
  await command(sandbox,'bash',['scripts/cloud-start.sh']);
  console.log('Preparing the pinned, isolated Python image.');
  await command(sandbox,'docker',['pull',PYTHON_IMAGE]);
  await command(sandbox,'node',['scripts/cloud-health.mjs']);
  const backend=sandbox.domain(4317);
  const direct=await fetch(backend+'/api/health');
  if(direct.status!==403)throw Error('Direct backend access was not rejected.');
  const result={origin,sandbox:settings.name,backend,directAccessStatus:direct.status,readyAt:new Date().toISOString()};
  writeFileSync(resolve(root,'output/cloud/provision.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} catch(error) {
  let message=String(error.message||error.name);
  for(const value of [settings.secret,keys.contract.private_key,keys.seller.private_key,process.env.VERCEL_OIDC_TOKEN])if(value)message=message.replaceAll(value,'[redacted]');
  console.error(message.slice(0,2400));process.exitCode=1;
}
