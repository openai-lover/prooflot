import { crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { assert } from './common.mjs';

// Small, uncompressed ZIP32. Fixed filenames only; no uploaded paths or programs
// are executed while packaging. Node 24 supplies the ZIP CRC-32 primitive.
export function zipFiles(files) {
  const locals=[],directory=[];let offset=0;
  for(const [name,value] of Object.entries(files)){
    assert(/^[a-zA-Z0-9_.-]{1,80}$/.test(name),'INVALID_ZIP_NAME');
    const filename=Buffer.from(name),data=Buffer.from(value,'utf8'),crc=crc32(data),header=Buffer.alloc(30),entry=Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(0x21,12);
    header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(filename.length,26);
    entry.writeUInt32LE(0x02014b50,0);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(0x21,14);
    entry.writeUInt32LE(crc,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE(offset,42);
    locals.push(header,filename,data);directory.push(entry,filename);offset+=header.length+filename.length+data.length;
  }
  const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(directory.length/2,8);end.writeUInt16LE(directory.length/2,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,central,end]);
}
export function artifactPackage(version,terms,license,report) {
  const json=v=>JSON.stringify(v,null,2)+'\n';
  const files={'bot.json':json(version),'license.json':json({terms,license}),'report.json':json(report),
    'README.txt':`Prooflot\n\n${version.name} v${version.version}\nVersion: ${version.hash}\nReport: ${report.hash}\n\nbot.json is the exact registered artifact, including its source/config and hash.\nlicense.json contains the research terms and purchase record. Testnet purchases include NEAR proof; local simulations do not.\nreport.json is the immutable inspection report.\n${version.kind==='python'?'bot.py exports decide(observation); it is not a standalone live-trading program.\n':''}\nRetest this version from My library in Prooflot. Do not relist someone else's source.\nLocal simulation or testnet only. Backtests do not guarantee future returns.\n`};
  if(version.kind==='python')files['bot.py']=version.source;
  if(version.kind==='prompt')files['prompt.txt']=version.prompt;
  files['verify.mjs']=readFileSync(new URL('../scripts/verify-package.mjs',import.meta.url),'utf8');
  files['README.txt']+='\nVerify offline (Node.js 24): extract the ZIP, then run node verify.mjs\nFor an independent expected-version check: node verify.mjs . <purchased-version-hash>\nThe verifier never executes the bot. It checks file bytes, version, report and license bindings.\nIt does not independently validate on-chain ownership or execution.\n';
  files['passport.json']=json({schema:'botpassport-package-v1',version_hash:version.hash,report_hash:report.hash,
    files:Object.entries(files).map(([name,value])=>({name,bytes:Buffer.byteLength(value),sha256:createHash('sha256').update(value).digest('hex')}))});
  return zipFiles(files);
}
