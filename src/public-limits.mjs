import { assert } from './common.mjs';

// One persistent backend owns admission; limits are not split between gateway
// instances. Client keys are HMACs of Vercel's overwritten forwarding header.
export class PublicLimits {
  constructor(clock=Date.now){this.clock=clock;this.clients=new Map();this.global={start:clock(),count:0};}
  admit(client,route){
    const now=this.clock();
    if(now-this.global.start>=3600000)this.global={start:now,count:0};
    for(const [key,value] of this.clients)if(now-value.start>=60000)this.clients.delete(key);
    let entry=this.clients.get(client);
    if(!entry){assert(this.clients.size<4096,'RATE_LIMIT',undefined,429);entry={start:now,count:0,runs:0};this.clients.set(client,entry);}
    const execution=route==='/api/runs'||route==='/api/comparisons'||route==='/api/benchmarks'||route.endsWith('/retest');
    assert(entry.count<40 && this.global.count<600 && (!execution||entry.runs<8),'RATE_LIMIT','Too many requests. Please wait before retrying.',429);
    entry.count++;this.global.count++;if(execution)entry.runs++;
  }
}
