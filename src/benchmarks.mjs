import { assert, hash, canonical, now, uid, AppError } from './common.mjs';
import { BENCHMARK_PROTOCOL, BENCHMARK_PROTOCOL_HASH, BenchmarkData, benchmarkURL } from './benchmark-data.mjs';
import { assessReport } from './assessment.mjs';

const versionSummary=v=>({id:v.id,hash:v.hash,name:v.name,version:v.version,kind:v.kind||'fixture',terms_hash:v.terms_hash});
const pending=new Set(['queued','running']);
export class Benchmarks {
  constructor(service,{anchor=null,data=new BenchmarkData(service.bots),busy=()=>false}={}) {
    this.service=service;this.store=service.store;this.anchor=anchor;this.data=data;this.busy=busy;this.active=new Set();this.tasks=new Map();
    this.store.db.exec(`CREATE TABLE IF NOT EXISTS benchmarks(id TEXT PRIMARY KEY,version_hash TEXT NOT NULL,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS benchmark_events(attempt_id TEXT NOT NULL REFERENCES benchmarks(id),sequence INTEGER NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(attempt_id,sequence));`);
    for(const table of ['benchmarks','benchmark_events'])for(const operation of ['UPDATE','DELETE'])this.store.db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${operation} BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'APPEND_ONLY_BENCHMARK'); END;`);
  }
  event(id,kind,body={}) {
    const sequence=this.store.db.prepare('SELECT COUNT(*) AS n FROM benchmark_events WHERE attempt_id=?').get(id).n;
    this.store.db.prepare('INSERT INTO benchmark_events VALUES(?,?,?,?)').run(id,sequence,kind,canonical({at:now(),...body}));
  }
  events(id){return this.store.db.prepare('SELECT sequence,kind,body FROM benchmark_events WHERE attempt_id=? ORDER BY sequence').all(id).map(r=>({sequence:r.sequence,kind:r.kind,...JSON.parse(r.body)}));}
  start(input,owner) {
    assert(input&&typeof input==='object'&&!Array.isArray(input),'INVALID_BENCHMARK_INPUT');
    assert(!this.active.size&&!this.service.active.size&&!this.busy(),'BENCHMARK_BUSY',undefined,409);
    assert(input.publish_results===true,'PUBLIC_RESULTS_CONFIRMATION_REQUIRED');
    assert(!Object.keys(input).some(k=>!['version_id','publish_results'].includes(k)),'FIXED_BENCHMARK_PROTOCOL');
    const version=this.service.catalog(owner).find(v=>v.id===input.version_id);assert(version,'UNKNOWN_VERSION');
    assert(version.kind!=='prompt','BENCHMARK_NO_PAID_INFERENCE');
    assert(!version.kind||this.store.db.prepare('SELECT id FROM listings WHERE version_hash=?').get(version.hash),'PUBLIC_LISTING_REQUIRED');
    const id=uid(),body={id,created:now(),version:versionSummary(version),protocol:BENCHMARK_PROTOCOL,protocol_hash:BENCHMARK_PROTOCOL_HASH,network:this.anchor?'testnet':'local'};
    this.store.db.prepare('INSERT INTO benchmarks VALUES(?,?,?)').run(id,version.hash,canonical(body));this.event(id,'started');this.active.add(id);
    const task=this.execute(body,owner).catch(e=>{
      this.abortRuns(id);this.event(id,'failed',{code:e instanceof AppError?e.code:'BENCHMARK_INTERRUPTED'});
    }).finally(()=>{this.active.delete(id);this.tasks.delete(id);});
    this.tasks.set(id,task);return this.get(id);
  }
  async execute(attempt,owner) {
    const id=attempt.id,configs=[],runs=[];
    // Freeze all inputs before creating runs. No external data or paid calls during evaluation.
    for(const c of BENCHMARK_PROTOCOL.cases){const dataset=await this.data.load(c,owner);
      assert(dataset.rows===c.rows&&dataset.start_at===new Date(c.start).toISOString()&&dataset.end_at===new Date(Date.parse(c.end)-3600000).toISOString(),'BENCHMARK_DATA_WINDOW_MISMATCH');
      const input={version_id:attempt.version.id,dataset_id:dataset.id,fee_bps:BENCHMARK_PROTOCOL.fee_bps,slippage_bps:BENCHMARK_PROTOCOL.slippage_bps,budget_micros:100000000};
      const config=this.service.config(input,owner);
      assert(config.initial_equity_micros===BENCHMARK_PROTOCOL.initial_equity_micros&&config.start_index===BENCHMARK_PROTOCOL.start_index&&config.fee_bps===BENCHMARK_PROTOCOL.fee_bps&&config.slippage_bps===BENCHMARK_PROTOCOL.slippage_bps,'BENCHMARK_PROFILE_MISMATCH');
      configs.push({c,input,config});
    }
    for(const {c,input,config} of configs){const run=this.service.start(input,owner,'benchmark:'+id+':'+c.id);this.event(id,'run_queued',{run_id:run.id});runs.push({id:c.id,market:c.market,start:c.start,end:c.end,source_url:benchmarkURL(c),dataset_hash:config.dataset.content_hash,rows:config.length,run_id:run.id,run_manifest_hash:run.config.manifest_hash,requested:config.requested_steps});}
    const manifest={schema:'agentproof-benchmark-manifest-v1',attempt_id:id,protocol_hash:BENCHMARK_PROTOCOL_HASH,version:attempt.version,engine:configs[0].config.engine,
      initial_equity_micros:BENCHMARK_PROTOCOL.initial_equity_micros,fee_bps:BENCHMARK_PROTOCOL.fee_bps,slippage_bps:BENCHMARK_PROTOCOL.slippage_bps,start_index:BENCHMARK_PROTOCOL.start_index,
      cases:runs,requested_steps:runs.reduce((n,c)=>n+c.requested,0)};
    this.event(id,'prepared',{manifest,manifest_hash:hash(manifest)});
    let anchor=null;
    if(this.anchor){anchor=await this.anchor.prepare(manifest,tx=>this.event(id,'transaction',{tx}));this.event(id,'committed',{anchor});}
    // Intentionally awaited: no provider execution is admitted before FINAL commitment.
    this.event(id,'executing');
    for(const c of runs){try{await this.service.run(c.run_id);}catch{const r=this.store.getRun(c.run_id);if(pending.has(r.status)){this.store.updateRun(r.id,'failed',this.store.decisions(r.id).length,'Benchmark case interrupted; no automatic retry.');this.service.finish(r.id);}}
      this.event(id,'case_finished',{case_id:c.id,run_id:c.run_id});}
    const result=this.result(id);this.event(id,'result',{result,result_hash:hash(result)});
    if(this.anchor){const proof=await this.anchor.finish(manifest,result,anchor,tx=>this.event(id,'transaction',{tx}));this.event(id,'confirmed',{proof});}
    this.event(id,'finished');
  }
  abortRuns(id) {
    const queued=this.events(id).filter(e=>e.kind==='run_queued');
    for(const c of queued){const run=this.store.getRun(c.run_id);if(pending.has(run.status)){this.store.updateRun(run.id,'failed',this.store.decisions(run.id).length,'Benchmark interrupted; no automatic retry.');this.service.finish(run.id);}}
  }
  recoverInterrupted() {
    for(const {id} of this.store.db.prepare('SELECT id FROM benchmarks').all())if(!this.get(id).finished){this.abortRuns(id);this.event(id,'interrupted',{code:'SERVER_RESTARTED_NO_RETRY'});}
  }
  async wait(id){await this.tasks.get(id);}
  result(id) {
    const events=this.events(id),prepared=events.find(e=>e.kind==='prepared');assert(prepared,'BENCHMARK_NOT_PREPARED');
    const cases=prepared.manifest.cases.map(c=>{
      const report=this.store.report(c.run_id);if(!report)return {...c,status:'failed',complete:false,completed:0,report_hash:null,metrics:null,cost_2x:null,fills:0};
      const run=this.store.getRun(c.run_id),assessment=assessReport(report,this.service.data(run.config).candles);
      return {...c,status:report.status,complete:report.status==='completed'&&report.completed_steps===c.requested&&report.inspection.publishable,
        completed:report.completed_steps,report_hash:report.hash,metrics:report.results.agent.metrics,buy_hold:report.results.buy_hold.metrics,
        fills:report.results.agent.metrics.trades,order_attempts:report.results.agent.fills.length,cost_2x:assessment.cost_scenarios[1],inspection_pass:report.inspection.publishable};
    });
    return {schema:'agentproof-benchmark-result-v2',attempt_id:id,manifest_hash:prepared.manifest_hash,version_hash:prepared.manifest.version.hash,
      protocol_hash:BENCHMARK_PROTOCOL_HASH,finished_at:now(),cases,completed_steps:cases.reduce((n,c)=>n+c.completed,0),
      completed_cases:cases.filter(c=>c.complete).length,all_completed:cases.every(c=>c.complete),
      meaning:'Four fixed public historical cases, including failures. No unseen holdout, independent attestation, profit guarantee or aggregate portfolio return.'};
  }
  get(id) {
    const row=this.store.db.prepare('SELECT body FROM benchmarks WHERE id=?').get(id);assert(row,'BENCHMARK_NOT_FOUND',undefined,404);
    const base=JSON.parse(row.body),events=this.events(id),prepared=events.find(e=>e.kind==='prepared'),result=events.find(e=>e.kind==='result'),anchor=events.find(e=>e.kind==='committed')?.anchor||null,proof=events.find(e=>e.kind==='confirmed')?.proof||null;
    const last=events.at(-1),finished=['finished','failed','interrupted'].includes(last?.kind);
    const status=last?.kind==='finished'?(result?.result.all_completed?'completed':'incomplete'):last?.kind==='failed'||last?.kind==='interrupted'?last.kind:events.some(e=>e.kind==='executing')?'running':'preparing';
    const progress=(prepared?.manifest.cases||[]).map(c=>{const run=this.store.getRun(c.run_id);return {id:c.id,run_id:c.run_id,status:run.status,completed:run.completed,requested:c.requested};});
    return {...base,status,finished,manifest:prepared?.manifest||null,manifest_hash:prepared?.manifest_hash||null,result:result?.result||null,result_hash:result?.result_hash||null,
      anchor,proof,progress,events,error:last?.code||null,verified:status==='completed'&&proof?.matches===true};
  }
  list(versionHash) {const rows=versionHash?this.store.db.prepare('SELECT id FROM benchmarks WHERE version_hash=? ORDER BY rowid DESC').all(versionHash):this.store.db.prepare('SELECT id FROM benchmarks ORDER BY rowid DESC').all();return rows.map(r=>this.get(r.id));}
  async verify(id) {
    const b=this.get(id);assert(this.anchor&&b.anchor&&b.result,'BENCHMARK_PROOF_NOT_READY',undefined,409);
    assert(hash(b.manifest)===b.manifest_hash&&hash(b.result)===b.result_hash,'BENCHMARK_CONTENT_MISMATCH');
    return this.anchor.verify(b.manifest,b.result,b.anchor);
  }
  evidence(id) {const b=this.get(id);return {...b,reports:(b.manifest?.cases||[]).map(c=>this.store.report(c.run_id))};}
}
