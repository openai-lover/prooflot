import { assert, integer, amount, ceilDiv, hash } from './common.mjs';
import { validateCandles } from './data.mjs';
import { readFileSync } from 'node:fs';

const SCALE = 100_000_000n;
export function validateDecision(raw) {
  assert(raw && typeof raw === 'object' && !Array.isArray(raw), 'INVALID_DECISION');
  assert(Object.keys(raw).every(k => ['action', 'target_bps', 'reason'].includes(k)), 'UNKNOWN_DECISION_FIELD');
  assert(['BUY', 'SELL', 'HOLD'].includes(raw.action), 'INVALID_ACTION');
  integer(raw.target_bps, 0, 10000, 'INVALID_TARGET');
  assert(raw.action === 'HOLD' || raw.target_bps === (raw.action === 'BUY' ? 10000 : 0), 'LONG_FLAT_ONLY');
  assert(typeof raw.reason === 'string' && raw.reason.length <= 500, 'INVALID_REASON');
  return raw;
}
export function portfolio(initial = '1000000000') { return { cash: String(amount(initial)), quantity: '0' }; }
export function execute(position, decision, candle, feeBps = 10, slippageBps = 5) {
  validateDecision(decision); integer(feeBps, 0, 1000); integer(slippageBps, 0, 1000);
  let cash = amount(position.cash), quantity = amount(position.quantity);
  if (!candle) return { position, fill: { action: decision.action, status: 'unfilled_no_next_candle' } };
  const open = amount(candle.open);
  assert(open > 0n, 'INVALID_PRICE');
  if (decision.action === 'HOLD' || (decision.action === 'BUY' && quantity > 0n)) return { position, fill: null };
  if (decision.action === 'SELL' && quantity === 0n) return { position, fill: { action: 'SELL', at: candle.time, status: 'rejected_no_position' } };
  let price, qty, notional, fee, slip;
  if (decision.action === 'BUY') {
    if (cash === 0n) return { position, fill: { action: 'BUY', at: candle.time, status: 'rejected_no_cash' } };
    price = ceilDiv(open * BigInt(10000 + slippageBps), 10000n);
    const maxNotional = cash * 10000n / BigInt(10000 + feeBps);
    qty = maxNotional * SCALE / price;
    if (qty === 0n) return { position, fill: { action: 'BUY', at: candle.time, status: 'rejected_dust' } };
    notional = ceilDiv(qty * price, SCALE);
    fee = ceilDiv(notional * BigInt(feeBps), 10000n);
    assert(notional + fee <= cash, 'INSUFFICIENT_CASH');
    cash -= notional + fee; quantity += qty;
    slip = ceilDiv((price - open) * qty, SCALE);
  } else {
    price = open * BigInt(10000 - slippageBps) / 10000n; qty = quantity;
    notional = qty * price / SCALE; fee = ceilDiv(notional * BigInt(feeBps), 10000n);
    cash += notional - fee; quantity = 0n; slip = (open - price) * qty / SCALE;
  }
  assert(cash >= 0n && quantity >= 0n, 'NEGATIVE_BALANCE');
  return { position: { cash: String(cash), quantity: String(quantity) }, fill: { action: decision.action, at: candle.time,
    status: 'filled', price_micros: String(price), quantity_atoms: String(qty), notional_micros: String(notional),
    fee_micros: String(fee), slippage_micros: String(slip) } };
}
export function equity(position, price) { return String(amount(position.cash) + amount(position.quantity) * amount(price) / SCALE); }
export function simulate(candles, decisions, config) {
  validateCandles(candles);
  let pos = portfolio(config.initial_equity_micros), peak = amount(config.initial_equity_micros), drawdown = 0n;
  let fees = 0n, slippage = 0n, turnover = 0n, exposed = 0;
  const curve = [{ at: candles[config.start_index].time, equity_micros: config.initial_equity_micros }], fills = [];
  for (let n = 0; n < decisions.length; n++) {
    const { index, decision } = decisions[n];
    assert(index === config.start_index + n, 'NONCONTIGUOUS_DECISIONS');
    const result = execute(pos, decision, candles[index + 1], config.fee_bps, config.slippage_bps);
    pos = result.position;
    if (result.fill) { fills.push({ ...result.fill, decision_index: index }); if (result.fill.status === 'filled') {
      fees += amount(result.fill.fee_micros); slippage += amount(result.fill.slippage_micros); turnover += amount(result.fill.notional_micros);
    } }
    const marked = candles[Math.min(index + 1, candles.length - 1)];
    const value = amount(equity(pos, marked.close));
    if (value > peak) peak = value;
    if (peak > 0n) drawdown = [drawdown, (peak - value) * 10000n / peak].reduce((a, b) => a > b ? a : b);
    if (amount(pos.quantity) > 0n) exposed++;
    curve.push({ at: marked.time, equity_micros: String(value) });
  }
  const ending = amount(curve.at(-1).equity_micros), initial = amount(config.initial_equity_micros);
  return { position: pos, curve, fills, metrics: { ending_equity_micros: String(ending), pnl_micros: String(ending - initial),
    return_bps: Number((ending - initial) * 10000n / initial), max_drawdown_bps: Number(drawdown),
    fee_micros: String(fees), slippage_micros: String(slippage), trades: fills.filter(f => f.status === 'filled').length,
    turnover_bps: Number(turnover * 10000n / initial), exposure_bps: decisions.length ? Math.floor(exposed * 10000 / decisions.length) : 0 } };
}
export function comparison(candles, decisions, config) {
  const cash = decisions.map(d => ({ index: d.index, decision: { action: 'HOLD', target_bps: 0, reason: 'Cash baseline' } }));
  const hold = decisions.map((d, i) => ({ index: d.index, decision: { action: i === 0 ? 'BUY' : 'HOLD', target_bps: 10000, reason: 'Buy & hold baseline' } }));
  return { agent: simulate(candles, decisions, config), before_trading_costs: simulate(candles, decisions, { ...config, fee_bps: 0, slippage_bps: 0 }).metrics,
    cash: simulate(candles, cash, config), buy_hold: simulate(candles, hold, config),
    common_window: { start: candles[config.start_index].time, end: candles[Math.min(config.start_index + decisions.length, candles.length - 1)].time,
      completed_decisions: decisions.length, comparison_policy: 'identical decision indices, next-open fills and valuation horizon' } };
}
export const engineVersion = hash({ engine: 'next-open-long-flat-v1', currency: 'USD micros', quantity_scale: '100000000',
  sources: Object.fromEntries(['engine.mjs','data.mjs','common.mjs','providers.mjs','bot-runner.mjs','bots.mjs','inspection.mjs'].map(name => [name, readFileSync(new URL(name, import.meta.url), 'utf8')])) });
