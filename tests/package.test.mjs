import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {artifactPackage} from '../src/artifact-download.mjs';
import {hash} from '../src/common.mjs';
import {verifyPackage} from '../scripts/verify-package.mjs';
import {versionFor,TERMS} from '../src/service.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(t,python=true){
  const directory=mkdtempSync(join(tmpdir(),'botpassport-package-'));
  t.after(()=>{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+requireSeparator()));rmSync(directory,{recursive:true,force:true});});
  const source='def decide(observation):\n    return {"action": "HOLD", "target_bps": 0, "reason": "Wait"}\n';
  let bot=python?{id:'example',name:'Example',version:'1.0',kind:'python',source,source_hash:hash({source}),terms_hash:hash(TERMS)}:versionFor('atlas-v1','fixture','deterministic-fixture-v1');
  if(python)bot={...bot,hash:hash(bot)};
  const body={manifest:{version:bot},results:{example:true}};
  const report={...body,hash:hash(body)},license={version_hash:bot.hash,terms_hash:hash(TERMS),network:'none'};
  const zip=artifactPackage(bot,TERMS,license,report);
  let offset=0;
  while(zip.readUInt32LE(offset)===0x04034b50){const size=zip.readUInt32LE(offset+18),length=zip.readUInt16LE(offset+26),name=zip.subarray(offset+30,offset+30+length).toString('utf8');assert.match(name,/^[A-Za-z0-9_.-]+$/);const start=offset+30+length;writeFileSync(join(directory,name),zip.subarray(start,start+size));offset=start+size;}
  return {directory,bot,report};
}
function requireSeparator(){return process.platform==='win32'?'\\':'/';}
function rewriteChecksum(directory,name){const file=join(directory,'passport.json'),manifest=JSON.parse(readFileSync(file)),bytes=readFileSync(join(directory,name));Object.assign(manifest.files.find(f=>f.name===name),{bytes:bytes.length,sha256:sha(bytes)});writeFileSync(file,JSON.stringify(manifest));}
test('portable Python package verifies bytes, source, report, license and pinned version without executing source',t=>{const f=fixture(t);assert.equal(verifyPackage(f.directory,f.bot.hash).matches,true);assert.throws(()=>verifyPackage(f.directory,'0'.repeat(64)),/Purchased version mismatch/);});
test('portable verifier also accepts the original public fixture artifact',t=>{const f=fixture(t,false);assert.equal(verifyPackage(f.directory,f.bot.hash).matches,true);});
test('modified source is rejected even after its manifest checksum is replaced',t=>{const f=fixture(t);writeFileSync(join(f.directory,'bot.py'),'changed');assert.throws(()=>verifyPackage(f.directory),/File changed/);rewriteChecksum(f.directory,'bot.py');assert.throws(()=>verifyPackage(f.directory),/Python source mismatch/);});
test('a substituted report cannot be paired with a different purchased bot',t=>{const f=fixture(t);const {hash:old,...body}=f.report;body.manifest.version.hash='0'.repeat(64);const replacement={...body,hash:hash(body)};writeFileSync(join(f.directory,'report.json'),JSON.stringify(replacement));rewriteChecksum(f.directory,'report.json');const file=join(f.directory,'passport.json'),manifest=JSON.parse(readFileSync(file));manifest.report_hash=replacement.hash;writeFileSync(file,JSON.stringify(manifest));assert.throws(()=>verifyPackage(f.directory),/Report belongs to another version/);});
test('portable manifest cannot read files outside its package directory',t=>{const f=fixture(t);const file=join(f.directory,'passport.json'),manifest=JSON.parse(readFileSync(file));manifest.files[0].name='../secret';writeFileSync(file,JSON.stringify(manifest));assert.throws(()=>verifyPackage(f.directory),/Invalid or duplicate file name/);});
