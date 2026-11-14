import { assert, hash, canonical, uid, integer } from './common.mjs';
import { validateCandles } from './data.mjs';

export const BOT_TERMS = { version: 'research-license-1', scope: 'Non-exclusive personal research license to this exact source/config version. No redistribution, resale or live-money management rights. Seller must own the uploaded code. No promised returns.', network: 'near-testnet' };
export class BotRegistry {
  constructor(store) {
    this.store = store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS bots(id TEXT PRIMARY KEY, owner TEXT NOT NULL, hash TEXT UNIQUE NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS datasets(id TEXT PRIMARY KEY, owner TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS immutable_bots BEFORE UPDATE ON bots BEGIN SELECT RAISE(ABORT,'immutable version'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_datasets BEFORE UPDATE ON datasets BEGIN SELECT RAISE(ABORT,'immutable dataset'); END;`);
  }
  register(input, owner) {
    assert(input && ['rules','python','prompt'].includes(input.kind), 'INVALID_BOT_KIND');
    assert(typeof input.name === 'string' && input.name.trim().length >= 2 && input.name.length <= 60, 'INVALID_BOT_NAME');
    assert(input.owns_rights === true, 'RIGHTS_CONFIRMATION_REQUIRED');
    const artifact = { id: uid(), name: input.name.trim(), version: String(input.version || '1.0').slice(0,30), owner,
      kind: input.kind, description: String(input.description || '').slice(0,400), terms_hash: hash(BOT_TERMS),
      runtime: input.kind === 'python' ? 'python-3.12-isolated-jsonl-v1' : input.kind === 'rules' ? 'momentum-rules-v1' : 'near-ai-cloud',
      created: new Date().toISOString() };
    if (input.kind === 'rules') {
      artifact.threshold_bps = integer(input.threshold_bps ?? 100, 0, 5000);
      artifact.lookback = integer(input.lookback ?? 12, 2, 12);
    } else {
      const field = input.kind === 'python' ? 'source' : 'prompt';
      assert(typeof input[field] === 'string' && input[field].length >= 10 && Buffer.byteLength(input[field]) <= 24000, 'INVALID_BOT_SOURCE');
      artifact[field] = input[field];
      if (input.kind === 'python') assert(/def\s+decide\s*\(/.test(input.source), 'DECIDE_FUNCTION_REQUIRED');
      artifact.source_hash = hash({ [field]: input[field] });
      if(input.kind==='prompt'){assert(typeof input.model==='string' && input.model.length>2 && input.model.length<=160,'MODEL_ID_REQUIRED');artifact.model=input.model;artifact.provider='near-ai-cloud';}
    }
    artifact.hash = hash(artifact);
    this.store.db.prepare('INSERT INTO bots VALUES(?,?,?,?)').run(artifact.id, owner, artifact.hash, canonical(artifact));
    return this.public(artifact);
  }
  public(artifact) { const { source, prompt, ...visible } = artifact; return visible; }
  get(id) { const row = this.store.db.prepare('SELECT body FROM bots WHERE id=? OR hash=?').get(id,id); return row ? JSON.parse(row.body) : null; }
  accessible(id, owner) {
    const bot = this.get(id); assert(bot, 'UNKNOWN_VERSION', undefined, 404);
    const listed = this.store.db.prepare('SELECT id FROM listings WHERE version_hash=?').get(bot.hash);
    assert(bot.owner === owner || listed, 'PRIVATE_BOT', undefined, 403); return bot;
  }
  catalog(owner) {
    return this.store.db.prepare('SELECT body FROM bots WHERE owner=? OR hash IN (SELECT version_hash FROM listings) ORDER BY rowid DESC').all(owner || '').map(row => this.public(JSON.parse(row.body)));
  }
  importCSV(input, owner) {
    assert(typeof input.csv === 'string' && Buffer.byteLength(input.csv) <= 200000, 'INVALID_CSV');
    assert(typeof input.source === 'string' && input.source.trim().length >= 3 && input.source.length <= 300, 'DATA_SOURCE_REQUIRED');
    const lines = input.csv.trim().split(/\r?\n/);
    assert(lines.shift()?.trim() === 'time,open,high,low,close', 'CSV_HEADER_EXPECTED');
    assert(lines.length >= 24 && lines.length <= 720, 'CSV_REQUIRES_24_TO_720_ROWS');
    const price = raw => { assert(/^\d{1,12}(\.\d{1,6})?$/.test(raw), 'CSV_PRICE_DECIMAL_REQUIRED'); const [whole, fraction=''] = raw.split('.'); return String(BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'))); };
    const candles = lines.map(line => { const values=line.trim().split(','); assert(values.length===5,'CSV_COLUMN_COUNT');
      assert(/^\d{4}-\d\d-\d\dT.*Z$/.test(values[0]) && Number.isFinite(Date.parse(values[0])), 'CSV_UTC_TIME_REQUIRED');
      return { time:new Date(values[0]).toISOString(), open:price(values[1]),high:price(values[2]),low:price(values[3]),close:price(values[4]) }; });
    validateCandles(candles);
    const id=uid(), manifest={id, kind:'user_upload',synthetic:false, source:input.source.trim(), license:String(input.license || 'User-provided; rights not independently verified').slice(0,300), content_hash:hash(candles), rows:candles.length, start_at:candles[0].time,end_at:candles.at(-1).time};
    this.store.db.prepare('INSERT INTO datasets VALUES(?,?,?)').run(id,owner,canonical({manifest,candles})); return manifest;
  }
  datasets(owner) { return this.store.db.prepare('SELECT body FROM datasets WHERE owner=?').all(owner).map(row=>JSON.parse(row.body).manifest); }
  dataset(id, owner, internal=false) {
    const row=this.store.db.prepare('SELECT owner,body FROM datasets WHERE id=?').get(id); assert(row,'DATASET_NOT_FOUND',undefined,404);
    const shared=this.store.db.prepare('SELECT r.config FROM runs r JOIN listings l ON l.report_hash IN (SELECT hash FROM reports WHERE run_id=r.id)').all().some(r=>JSON.parse(r.config).dataset.id===id);
    assert(internal || row.owner===owner || shared,'PRIVATE_DATASET',undefined,403); return JSON.parse(row.body);
  }
}
