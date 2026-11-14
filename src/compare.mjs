import { assert, uid, hash, canonical, now } from './common.mjs';

export class Comparisons {
  constructor(service){this.service=service;this.store=service.store;this.active=new Set();this.tasks=new Map();
    this.store.db.exec('CREATE TABLE IF NOT EXISTS comparisons(id TEXT PRIMARY KEY,owner TEXT NOT NULL,body TEXT NOT NULL)');}
  start(input,owner){
    assert(!this.active.size && !this.service.active.size,'COMPARISON_BUSY',undefined,409);
    assert(Array.isArray(input.version_ids)&&input.version_ids.length>=2&&input.version_ids.length<=3&&new Set(input.version_ids).size===input.version_ids.length,'SELECT_TWO_OR_THREE_BOTS');
    const available=this.service.catalog(owner);
    const versions=input.version_ids.map(id=>{const v=available.find(v=>v.id===id);assert(v,'UNKNOWN_VERSION');assert(v.kind!=='prompt','COMPARISON_NO_PAID_INFERENCE','Comparisons support Python, rules and free examples.');return v;});
    const common={dataset_id:input.dataset_id,seed:input.seed??42,length:input.length??84,fee_bps:input.fee_bps??10,slippage_bps:input.slippage_bps??5,mode:'fixture',scenario:'normal',budget_micros:100000000};
    // Validate every candidate before creating any run. Private inputs remain owner-scoped.
    const configs=versions.map(v=>this.service.config({...common,version_id:v.id},owner));
    const profile=c=>({dataset:c.dataset.content_hash||hash(this.service.data(c).candles),engine:c.engine,start_index:c.start_index,length:c.length,initial_equity_micros:c.initial_equity_micros,fee_bps:c.fee_bps,slippage_bps:c.slippage_bps});
    const shared=profile(configs[0]);assert(configs.every(c=>hash(profile(c))===hash(shared)),'COMPARISON_PROFILE_MISMATCH');
    const id=uid(),runs=versions.map(v=>this.service.start({...common,version_id:v.id},owner,'compare:'+id+':'+v.id));
    const body={id,created:now(),profile:shared,profile_hash:hash(shared),source:configs[0].dataset.source||'Synthetic example',synthetic:configs[0].dataset.synthetic,run_ids:runs.map(r=>r.id)};
    this.store.db.prepare('INSERT INTO comparisons VALUES(?,?,?)').run(id,owner,canonical(body));this.active.add(id);
    const task=this.execute(body).finally(()=>{this.active.delete(id);this.tasks.delete(id);});this.tasks.set(id,task);return this.get(id,owner);
  }
  async execute(batch){
    for(const id of batch.run_ids){try{await this.service.run(id);}catch{const r=this.store.getRun(id);if(['queued','running'].includes(r.status)){this.store.updateRun(id,'failed',r.completed,'Comparison interrupted. No automatic retry.');this.service.finish(id);}}}
  }
  async wait(id){await this.tasks.get(id);}
  get(id,owner){
    const row=this.store.db.prepare('SELECT owner,body FROM comparisons WHERE id=?').get(id);assert(row,'COMPARISON_NOT_FOUND',undefined,404);assert(row.owner===owner,'NOT_OWNER',undefined,403);
    const b=JSON.parse(row.body),rows=b.run_ids.map(id=>{const r=this.store.getRun(id),p=this.store.report(id);return {run_id:id,version_id:r.config.version.id,version_hash:r.config.version.hash,name:r.config.version.name,version:r.config.version.version,
      status:r.status,completed:r.completed,requested:r.config.requested_steps,metrics:p?.results.agent.metrics||null,curve:p?.results.agent.curve||[],buy_hold:p?.results.buy_hold.metrics||null,
      window:p?.results.common_window||null,report_hash:p?.hash||null,inspection:p?.inspection||null,actual_model_cost_micros:p?.model_usage.actual_provider_cost_micros??0};});
    const finished=rows.every(r=>!['queued','running'].includes(r.status));
    const comparable=finished&&rows.every(r=>r.status==='completed'&&r.completed===r.requested&&r.inspection?.publishable)&&rows.every(r=>hash(r.window)===hash(rows[0].window));
    return {...b,rows,finished,comparable,status:finished?(comparable?'completed':'incomplete'):'running',meaning:'Same frozen data, fees, slippage, initial equity and evaluation window. Fresh bot executions; no paid model inference.'};
  }
}
