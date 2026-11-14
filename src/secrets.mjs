import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { assert } from './common.mjs';
const secretProcessOptions={encoding:'utf8',windowsHide:true,env:{...process.env,PSModulePath:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules'}};

// Windows CurrentUser DPAPI. Secrets never appear in process arguments or logs.
export function protectFile(file, value) {
  assert(process.platform==='win32','WINDOWS_DPAPI_REQUIRED');
  const proc=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$raw=[Console]::In.ReadToEnd(); ConvertFrom-SecureString (ConvertTo-SecureString $raw -AsPlainText -Force)"],{...secretProcessOptions,input:JSON.stringify(value)});
  assert(proc.status===0 && proc.stdout.trim(),'SECRET_ENCRYPTION_FAILED');mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,proc.stdout.trim(),{mode:0o600});
}
export function unprotectFile(file) {
  assert(process.platform==='win32','WINDOWS_DPAPI_REQUIRED');
  const proc=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$secret=ConvertTo-SecureString ([Console]::In.ReadToEnd().Trim()); $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret); try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }"],{...secretProcessOptions,input:readFileSync(file,'utf8')});
  assert(proc.status===0,'SECRET_DECRYPTION_FAILED');return JSON.parse(proc.stdout);
}
