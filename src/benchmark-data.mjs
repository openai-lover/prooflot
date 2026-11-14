import { assert, canonical, hash } from './common.mjs';

// A versioned, public protocol. Callers cannot choose assets, dates or costs.
const cases = ['BTC-USD', 'ETH-USD'].flatMap(market => [
  ['oct', '2026-10-19T00:00:00Z', '2026-10-26T00:00:00Z'],
  ['nov', '2026-11-02T00:00:00Z', '2026-11-09T00:00:00Z'],
].map(([period, start, end]) => ({ id: market.toLowerCase() + '-' + period, market, start, end, rows: 168, granularity: 3600 })));
export const BENCHMARK_PROTOCOL = JSON.parse(canonical({
  id: 'agentproof-public-4-v1', cases, fee_bps: 10, slippage_bps: 5,
  initial_equity_micros: '1000000000', start_index: 11,
  semantics: 'Four independent historical spot windows; each starts in cash. No annualization or pooled return. Public historical data, not an unseen holdout.',
  cost_stress: '2x fees and slippage, recorded-decision replay only',
}));
export const BENCHMARK_PROTOCOL_HASH = hash(BENCHMARK_PROTOCOL);
export const benchmarkURL = c => 'https://api.exchange.coinbase.com/products/' + c.market + '/candles?' + new URLSearchParams({granularity:String(c.granularity),start:c.start,end:c.end});

export function benchmarkCSV(raw, c) {
  assert(Array.isArray(raw), 'INVALID_MARKET_DATA');
  const start=Date.parse(c.start)/1000, end=Date.parse(c.end)/1000;
  const rows=raw.filter(r=>Array.isArray(r)&&r[0]>=start&&r[0]<end).sort((a,b)=>a[0]-b[0]);
  assert(rows.length===c.rows && rows.every((r,i)=>r.length>=5&&r[0]===start+i*c.granularity&&r.slice(1,5).every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0)), 'BENCHMARK_DATA_GAP');
  return 'time,open,high,low,close\n'+rows.map(r=>[new Date(r[0]*1000).toISOString(),r[3],r[2],r[1],r[4]].join(',')).join('\n');
}

export class BenchmarkData {
  constructor(registry, transport=fetch) {
    this.registry=registry;this.db=registry.store.db;this.transport=transport;
    this.db.exec(`CREATE TABLE IF NOT EXISTS benchmark_data(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS benchmark_data_update BEFORE UPDATE ON benchmark_data BEGIN SELECT RAISE(ABORT,'IMMUTABLE_BENCHMARK_DATA'); END;
      CREATE TRIGGER IF NOT EXISTS benchmark_data_delete BEFORE DELETE ON benchmark_data BEGIN SELECT RAISE(ABORT,'IMMUTABLE_BENCHMARK_DATA'); END;`);
  }
  async load(c, owner) {
    const key=BENCHMARK_PROTOCOL_HASH+':'+c.id;
    const cached=this.db.prepare('SELECT body FROM benchmark_data WHERE id=?').get(key);
    let snapshot=cached?JSON.parse(cached.body):null;
    if(!snapshot){
      const response=await this.transport(benchmarkURL(c),{signal:AbortSignal.timeout(15000)});
      assert(response.ok,'MARKET_DATA_UNAVAILABLE');
      const csv=benchmarkCSV(await response.json(),c);
      snapshot={csv,source:'Coinbase · '+c.market+' · 1h · '+c.start.slice(0,10)+'–'+c.end.slice(0,10)+' (end exclusive)',
        license:'Public API data frozen locally for research. Source terms apply; raw candles excluded from the submission bundle.'};
      // Validate OHLC before freezing. User datasets with a matching label never enter this cache.
      const checked=this.registry.importCSV(snapshot,owner);
      snapshot.content_hash=checked.content_hash;
      this.db.prepare('INSERT INTO benchmark_data VALUES(?,?)').run(key,canonical(snapshot));
      return checked;
    }
    const dataset=this.registry.importCSV(snapshot,owner);
    assert(dataset.content_hash===snapshot.content_hash,'BENCHMARK_CACHE_MISMATCH');
    return dataset;
  }
}
