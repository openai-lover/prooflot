import { spawn } from 'node:child_process';
import { AppError, uid } from './common.mjs';

export const PYTHON_IMAGE='python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df';
const runner=`import sys,json,contextlib,io
source=json.loads(sys.stdin.readline())["source"]
scope={}
with contextlib.redirect_stdout(io.StringIO()):
 exec(compile(source,"uploaded_bot.py","exec"),scope)
for line in sys.stdin:
 try:
  observation=json.loads(line)
  with contextlib.redirect_stdout(io.StringIO()):
   decision=scope["decide"](observation)
  print(json.dumps({"decision":decision},allow_nan=False),flush=True)
 except Exception:
  print('{"decision":null}',flush=True)
`;
const prices=Object.freeze({id:'local-bot-no-provider-charge',currency:'USD micros',synthetic:false,input_per_million:0,output_per_million:0,max_input_tokens:0,max_output_tokens:0});
const result=decision=>({decision,input_tokens:0,output_tokens:0,reasoning_tokens:0,cost_micros:0,provider_request_id:null,latency_ms:0});
export class RulesProvider {
  constructor(){this.model='rules-v1';this.prices=prices;}
  maxCost(){return 0;}
  async infer(obs,version){const candles=obs.candles.slice(-(version.lookback||12)),first=BigInt(candles[0].close),last=BigInt(candles.at(-1).close),change=(last-first)*10000n/first,held=BigInt(obs.position.quantity)>0n;
    const action=change>BigInt(version.threshold_bps)&&!held?'BUY':change< -BigInt(version.threshold_bps)&&held?'SELL':'HOLD';
    return result({action,target_bps:action==='BUY'?10000:action==='SELL'?0:held?10000:0,reason:'Uploaded rule configuration executed.'});}
}
export class PythonProvider {
  constructor(){this.model='python-3.12';this.prices=prices;this.name='agentproof-bot-'+uid();this.buffer='';this.pending=null;}
  maxCost(){return 0;}
  start(source){
    this.child=spawn('docker',['run','--rm','--pull=never','--name',this.name,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','32','--memory','128m','--memory-swap','128m','--cpus','0.5','--user','65534:65534','--ulimit','nofile=64:64','--tmpfs','/tmp:rw,noexec,nosuid,size=16m','-i',PYTHON_IMAGE,'python','-I','-u','-c',runner],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    this.child.on('error',()=>this.fail()); this.child.on('exit',()=>this.fail());
    this.child.stderr.on('data',()=>{});
    this.child.stdout.on('data',chunk=>{this.buffer+=chunk.toString();if(Buffer.byteLength(this.buffer)>65536)return this.fail();
      const n=this.buffer.indexOf('\n');if(n>=0){const line=this.buffer.slice(0,n);this.buffer=this.buffer.slice(n+1);const pending=this.pending;this.pending=null;
        if(!pending)return this.fail();clearTimeout(pending.timer);try{pending.resolve(result(JSON.parse(line).decision));}catch{pending.reject(new AppError('BOT_PROTOCOL_ERROR'));this.close();}}});
    this.child.stdin.on('error',()=>this.fail());this.child.stdin.write(JSON.stringify({source})+'\n');
  }
  fail(){if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(new AppError('BOT_RUNNER_FAILED','Bot exited, timed out or Docker is unavailable. No host execution fallback.'));this.pending=null;}this.close();}
  infer(obs,version){if(!this.child)this.start(version.source);return new Promise((resolve,reject)=>{this.pending={resolve,reject,timer:setTimeout(()=>this.fail(),8000)};this.child.stdin.write(JSON.stringify(obs)+'\n');});}
  close(){if(this.closed)return;this.closed=true;if(this.child){this.child.stdin.end();this.child.kill();const cleanup=spawn('docker',['rm','-f',this.name],{stdio:'ignore',windowsHide:true});cleanup.on('error',()=>{});}}
}
