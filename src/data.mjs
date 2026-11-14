import { assert, hash, integer } from './common.mjs';

export function syntheticDataset(seed = 42, length = 84) {
  integer(seed, 1, 2147483647); integer(length, 24, 240);
  let state = seed >>> 0;
  const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; };
  let price = 100_000_000n;
  const candles = [];
  for (let i = 0; i < length; i++) {
    const open = price;
    const regime = i < length / 3 ? 40 : i < 2 * length / 3 ? -65 : 45;
    const move = BigInt((next() % 401) - 200 + regime);
    price = open * (10000n + move) / 10000n;
    candles.push({ time: new Date(Date.UTC(2026, 9, 1) + i * 3600000).toISOString(), open: String(open),
      high: String((open > price ? open : price) * 10070n / 10000n),
      low: String((open < price ? open : price) * 9930n / 10000n), close: String(price) });
  }
  return { manifest: { name: 'Synthetic three-regime market', symbol: 'SYNTH/USD', interval: '1h', timezone: 'UTC',
    synthetic: true, seed, source: 'AgentProof deterministic xorshift32 generator v1', license: 'Project-generated synthetic data; not market data',
    generator_version: '1', content_hash: hash(candles), start_at: candles[0].time, end_at: candles.at(-1).time }, candles };
}
export function validateCandles(candles) {
  assert(Array.isArray(candles) && candles.length >= 2, 'INSUFFICIENT_DATA');
  let last = -Infinity;
  for (const c of candles) {
    const stamp = Date.parse(c.time);
    assert(Number.isFinite(stamp) && stamp > last, 'UNSORTED_OR_DUPLICATE_TIME'); last = stamp;
    for (const k of ['open', 'high', 'low', 'close']) assert(typeof c[k] === 'string' && /^[1-9]\d*$/.test(c[k]), 'INVALID_PRICE');
    assert(BigInt(c.high) >= BigInt(c.open) && BigInt(c.high) >= BigInt(c.close) && BigInt(c.low) <= BigInt(c.open)
      && BigInt(c.low) <= BigInt(c.close) && BigInt(c.low) <= BigInt(c.high), 'INVALID_OHLC');
  }
}
export function observation(candles, index, position, window = 12) {
  integer(index, window - 1, candles.length - 1);
  return { observed_until: candles[index].time, candles: candles.slice(index - window + 1, index + 1),
    position, allowed_actions: ['BUY', 'SELL', 'HOLD'], execution: 'next candle open, long/flat only' };
}
