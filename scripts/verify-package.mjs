// This verifier reads JSON and source bytes. It never executes the purchased bot.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (ok,message) => {if (!ok) throw new Error(message);};
function canonical(value) {
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'){assert(Number.isSafeInteger(value),'Invalid numeric value');return String(value);}
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  assert(typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype,'Invalid JSON value');
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
const hash = value => sha256(canonical(value));
export function verifyPackage(directory, expectedVersion) {
  const read = name => readFileSync(resolve(directory,name));
  const passport = JSON.parse(read('passport.json'));
  assert(passport.schema==='botpassport-package-v1','Unknown package schema');
  assert(Array.isArray(passport.files)&&passport.files.length>=5&&passport.files.length<=12,'Invalid file manifest');
  const names=new Set();
  for(const item of passport.files){
    assert(/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(item.name)&&item.name!=='passport.json'&&!names.has(item.name),'Invalid or duplicate file name');
    names.add(item.name);
    const bytes=read(item.name);
    assert(bytes.byteLength===item.bytes&&sha256(bytes)===item.sha256,'File changed: '+item.name);
  }
  for(const name of ['bot.json','report.json','license.json','README.txt','verify.mjs'])assert(names.has(name),'Missing '+name);
  const bot=JSON.parse(read('bot.json')),report=JSON.parse(read('report.json')),{terms,license}=JSON.parse(read('license.json'));
  const {hash:versionHash,...versionBody}=bot,{hash:reportHash,...reportBody}=report;
  assert(hash(versionBody)===versionHash&&versionHash===passport.version_hash,'Bot version hash mismatch');
  if(expectedVersion)assert(versionHash===expectedVersion,'Purchased version mismatch');
  assert(hash(reportBody)===reportHash&&reportHash===passport.report_hash,'Report hash mismatch');
  assert(report.manifest.version.hash===versionHash,'Report belongs to another version');
  assert(license.version_hash===versionHash&&license.terms_hash===hash(terms)&&bot.terms_hash===hash(terms),'License or terms mismatch');
  if(bot.kind==='python'){assert(names.has('bot.py')&&read('bot.py').toString('utf8')===bot.source,'Python source mismatch');assert(hash({source:bot.source})===bot.source_hash,'Source hash mismatch');}
  if(bot.kind==='prompt'){assert(names.has('prompt.txt')&&read('prompt.txt').toString('utf8')===bot.prompt,'Prompt mismatch');assert(hash({prompt:bot.prompt})===bot.source_hash,'Prompt hash mismatch');}
  return {matches:true,version_hash:versionHash,report_hash:reportHash,files:passport.files.length,network:license.network,
    scope:'Content identity only. Verify the expected version against the marketplace or NEAR record. No independent execution, license-chain validation, safety or profit certification.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try {console.log(JSON.stringify(verifyPackage(process.argv[2]||dirname(fileURLToPath(import.meta.url)),process.argv[3]),null,2));}
  catch(error){console.error('VERIFICATION FAILED: '+error.message);process.exitCode=1;}
}
