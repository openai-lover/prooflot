import { readFileSync } from 'node:fs';
import { hash, assert } from './common.mjs';
import { simulate } from './engine.mjs';

export const assessmentVersion = hash({schema:'assessment-v1',source:readFileSync(new URL('./assessment.mjs',import.meta.url),'utf8')});
export function periodResults(curve) {
  const points=curve.filter((p,i)=>!i||p.at!==curve[i-1].at), count=points.length-1;
  if(count<3)return [];
  return [0,1,2].map(i=>{
    const from=Math.floor(count*i/3),to=Math.floor(count*(i+1)/3),part=points.slice(from,to+1);
    const first=BigInt(part[0].equity_micros),last=BigInt(part.at(-1).equity_micros);let peak=first,dd=0n;
    for(const p of part){const n=BigInt(p.equity_micros);if(n>peak)peak=n;if(peak>0n){const d=(peak-n)*10000n/peak;if(d>dd)dd=d;}}
    return {label:['초반','중반','후반'][i],start:part[0].at,end:part.at(-1).at,return_bps:first>0n?Number((last-first)*10000n/first):null,max_drawdown_bps:Number(dd)};
  });
}
export function assessReport(report,candles) {
  const {manifest:c,decisions,results}=report;
  assert(candles.length===c.length,'ASSESSMENT_DATA_MISMATCH');
  if(c.dataset.content_hash)assert(hash(candles)===c.dataset.content_hash,'ASSESSMENT_DATA_MISMATCH');
  const net=results.agent.metrics, periods=periodResults(results.agent.curve);
  const spans=candles.slice(1).map((p,i)=>Date.parse(p.time)-Date.parse(candles[i].time));
  const irregular=spans.filter(x=>x!==spans[0]).length;
  const flags=[];
  if(c.dataset.synthetic)flags.push({id:'synthetic',label:'합성 데이터',detail:'실제 시장 성과를 보여주는 결과가 아니에요.'});
  if(candles.length<168)flags.push({id:'short_sample',label:'짧은 관찰 구간',detail: `${candles.length}개 캔들만 관찰했어요. 더 긴 구간의 결과가 필요해요.`});
  if(net.trades<10)flags.push({id:'few_fills',label:'체결 표본 부족',detail:`체결 ${net.trades}회로 여러 시장 상황의 성과를 판단하기 어려워요.`});
  if(irregular)flags.push({id:'irregular',label:'시간 간격 확인',detail:'캔들 간격이 일정하지 않은 구간이 있어요.'});
  if(report.completed_steps!==report.requested_steps)flags.push({id:'partial',label:'일부 구간만 완료',detail:'완료한 구간까지의 결과예요.'});
  const costs=[1,2,3].map(multiplier=>{
    const fee=c.fee_bps*multiplier,slip=c.slippage_bps*multiplier;
    if(fee>1000||slip>1000)return {multiplier,available:false,reason:'ENGINE_COST_LIMIT'};
    const m=multiplier===1?net:simulate(candles,decisions,{...c,fee_bps:fee,slippage_bps:slip}).metrics;
    return {multiplier,available:true,fee_bps:fee,slippage_bps:slip,return_bps:m.return_bps,max_drawdown_bps:m.max_drawdown_bps,fee_micros:m.fee_micros,slippage_micros:m.slippage_micros};
  });
  const body={schema:'agentproof-assessment-v1',report_hash:report.hash,version_hash:c.version.hash,analyzer_hash:assessmentVersion,
    evidence:{data_kind:report.data_kind,source:c.dataset.source||'Synthetic fixture',dataset_hash:c.dataset.content_hash||hash(candles),candles:candles.length,
      start:results.common_window.start,end:results.common_window.end,duration_seconds:Math.max(0,Math.floor((Date.parse(results.common_window.end)-Date.parse(results.common_window.start))/1000)),
      fills:net.trades,completed:report.completed_steps,requested:report.requested_steps,irregular_intervals:irregular},
    net_return_bps:net.return_bps,excess_vs_hold_bps:net.return_bps-results.buy_hold.metrics.return_bps,
    trading_cost_drag_bps:results.before_trading_costs.return_bps-net.return_bps,
    flags,periods,cost_scenarios:costs,
    method:'Saved-decision cost replay; the bot is not rerun under changed costs. Period returns retain the original position path. These are not holdout tests or forward performance.',
    sample_policy:'168 candles and 10 fills are disclosure heuristics, not statistical confidence thresholds or safety ratings.'};
  return {...body,hash:hash(body)};
}
