import { hash } from './common.mjs';

export function inspectRun(config, decisions, ledger, results) {
  const checks=[]; const add=(id,label,status,detail)=>checks.push({id,label,status,detail});
  const invalid=decisions.filter(x=>x.validation!=='valid').length;
  add('output','주문 형식',invalid?'fail':'pass',`${invalid} rejected / ${decisions.length} decisions`);
  add('completion','시험 완료 범위',decisions.length===config.requested_steps?'pass':'warn',`${decisions.length} / ${config.requested_steps} decisions. Partial results must not be presented as a full test.`);
  add('cost','비용 확정',ledger.unresolved_calls?'fail':'pass',`${ledger.unresolved_calls} unresolved calls; reservation ledger retained.`);
  add('causality','플랫폼 미래 데이터 차단','pass','The runner supplies only closed candles through t; execution uses t+1 open. This does not prove absence of hardcoded or pretrained future knowledge.');
  add('dataset','데이터 출처','warn',config.dataset.synthetic?'Synthetic fixture: no historical market-performance evidence.':'User-supplied historical data: source and redistribution rights require independent verification.');
  const dd=results.agent.metrics.max_drawdown_bps;
  add('drawdown','최대 낙폭',dd>2000?'warn':'pass',`${(dd/100).toFixed(2)}% on this tested interval. This threshold is a review heuristic.`);
  add('coverage','검증 범위','warn','Single asset, long/flat, candle execution. No order-book fill simulation, live trading, independent audit or future-return guarantee.');
  if(config.version.kind==='python') add('isolation','코드 실행 환경','pass','Python container: network disabled, read-only filesystem, non-root, capability drop, CPU/memory/PID/time limits. Container isolation is not a complete security audit.');
  if(config.mode==='live') add('llm','LLM 재현성','warn','Model inference can vary and model training may contain future knowledge. Replay verifies recorded decisions only.');
  return { schema:'agentproof-inspection-v1', verdict:checks.some(c=>c.status==='fail')?'failed':'review_required',
    publishable:decisions.length>0 && !checks.some(c=>c.status==='fail'), checks,
    source_hash:config.version.source_hash || hash({threshold_bps:config.version.threshold_bps}),
    meaning:'Measured checks with explicit limits; not a safety certification or profitability rating.' };
}
