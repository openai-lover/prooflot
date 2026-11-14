import { assert } from './common.mjs';
export const BTC_SAMPLE_URL='https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600&start=2026-11-01T00%3A00%3A00Z&end=2026-11-04T00%3A00%3A00Z';
export async function importBtcSample(registry,owner,transport=fetch){
  const source='Coinbase · BTC/USD · 1h · 2026-11-01–03';
  const cached=registry.datasets(owner).find(d=>d.source===source);if(cached)return cached;
  const response=await transport(BTC_SAMPLE_URL,{signal:AbortSignal.timeout(15000)});assert(response.ok,'MARKET_DATA_UNAVAILABLE');
  const raw=await response.json();assert(Array.isArray(raw),'INVALID_MARKET_DATA');
  const start=Date.parse('2026-11-01T00:00:00Z')/1000,end=Date.parse('2026-11-04T00:00:00Z')/1000;
  const rows=raw.filter(r=>Array.isArray(r)&&r[0]>=start&&r[0]<end).sort((a,b)=>a[0]-b[0]);
  assert(rows.length===72 && rows.every((r,i)=>r[0]===start+i*3600 && r.slice(1,5).every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0)),'MARKET_DATA_GAP');
  const csv='time,open,high,low,close\n'+rows.map(r=>[new Date(r[0]*1000).toISOString(),r[3],r[2],r[1],r[4]].join(',')).join('\n');
  return registry.importCSV({csv,source,license:'Fetched from Coinbase Exchange public API for local research. Not redistributed in the source bundle. Subject to source terms; no independent market-data audit.'},owner);
}
