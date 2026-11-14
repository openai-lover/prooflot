import { assert, AppError, hash, integer } from './common.mjs';

export const fixturePrices = Object.freeze({ id: 'fixture-illustrative-v1', currency: 'USD micros', input_per_million: 10_000_000,
  output_per_million: 20_000_000, max_input_tokens: 1500, max_output_tokens: 600, synthetic: true });
export function tokenCost(input, output, prices) {
  integer(input, 0, 100000000); integer(output, 0, 100000000);
  return Number((BigInt(input) * BigInt(prices.input_per_million) + BigInt(output) * BigInt(prices.output_per_million) + 999999n) / 1000000n);
}
export class FixtureProvider {
  constructor(scenario = 'normal') { this.scenario = scenario; this.prices = fixturePrices; this.mode = 'fixture'; this.model = 'deterministic-fixture-v1'; }
  maxCost() { return tokenCost(1500, 600, this.prices); }
  async infer(obs, version, step) {
    if (this.scenario === 'timeout' && step === 3) throw new AppError('PROVIDER_UNCERTAIN', 'Fixture timeout: processing unknown');
    const first = BigInt(obs.candles[0].close), last = BigInt(obs.candles.at(-1).close);
    const threshold = version.threshold_bps;
    const change = (last - first) * 10000n / first;
    const held = BigInt(obs.position.quantity) > 0n;
    const action = change > BigInt(threshold) && !held ? 'BUY' : change < -BigInt(threshold) && held ? 'SELL' : 'HOLD';
    const input = 720 + step % 7 * 13, output = 240 + step % 5 * 17;
    return { decision: this.scenario === 'invalid' && step === 2 ? { action: 'TRANSFER', target_bps: 20000, reason: 'Deliberately invalid fixture' }
      : { action, target_bps: action === 'BUY' ? 10000 : action === 'SELL' ? 0 : held ? 10000 : 0, reason: 'Synthetic fixture decision; no language model was called.' },
      input_tokens: input, output_tokens: output, reasoning_tokens: 0, cost_micros: tokenCost(input, output, this.prices),
      provider_request_id: 'fixture-' + hash({ obs, version: version.id }).slice(0,16), latency_ms: 0 };
  }
}
export function liveConfiguration(env = process.env) {
  const number = name => { const raw = env[name] || '0'; return /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : 0; };
  return { model: env.NEAR_AI_MODEL || '', daily_cap: number('LIVE_APPROVED_DAILY_MICROS'), supports_temperature:env.LIVE_SUPPORTS_TEMPERATURE?.toLowerCase()!=='false',
    approved: Boolean(env.NEAR_AI_API_KEY) && number('LIVE_APPROVED_DAILY_MICROS') > 0 && env.LIVE_ALLOW_ESTIMATED_CAP === 'true',
    prices: { id: 'operator-supplied-near-ai-prices', currency: 'USD micros', synthetic: false,
      input_per_million: number('LIVE_INPUT_MICROS_PER_MILLION'), output_per_million: number('LIVE_OUTPUT_MICROS_PER_MILLION'),
      max_input_tokens: number('LIVE_INPUT_TOKEN_BOUND') || 8192, max_output_tokens: number('LIVE_MAX_OUTPUT_TOKENS') || 256,
      bound_verified: false }, strict_cap_supported: false };
}
export class NearAIProvider {
  constructor(config = liveConfiguration(), key = process.env.NEAR_AI_API_KEY, transport = fetch) {
    assert(config.approved && key && config.model, 'LIVE_NOT_APPROVED', 'A server-side key, model, daily budget and estimated-cap opt-in are required.', 403);
    for (const k of ['input_per_million','output_per_million','max_input_tokens','max_output_tokens']) integer(config.prices[k], 1, 1000000000, 'LIVE_PRICE_REQUIRED');
    this.config = config; this.prices = config.prices; this.key = key; this.transport = transport; this.mode = 'live'; this.model = config.model;
  }
  maxCost() { return tokenCost(this.prices.max_input_tokens, this.prices.max_output_tokens, this.prices); }
  async infer(obs, version) {
    const system = version.prompt + '\nReturn only JSON: {"action":"BUY|SELL|HOLD","target_bps":0|10000,"reason":"short explanation"}. No tools. Long/flat only.';
    const input = JSON.stringify(obs);
    // Byte length is only a preflight heuristic; this is NOT a tokenizer-backed bound.
    assert(Buffer.byteLength(system + input) + 128 <= this.prices.max_input_tokens, 'INPUT_ENVELOPE_EXCEEDED');
    let response, body;
    const start = performance.now();
    try {
      response = await this.transport('https://cloud-api.near.ai/v1/chat/completions', {
        method: 'POST', signal: AbortSignal.timeout(30000), headers: { Authorization: 'Bearer ' + this.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, messages: [{ role: 'system', content: system }, { role: 'user', content: input }],
          max_tokens: this.prices.max_output_tokens, ...(this.config.supports_temperature!==false?{temperature:0}:{}), stream: false }) });
      body = await response.json();
    } catch { throw new AppError('PROVIDER_UNCERTAIN', 'Provider response unavailable; reservation retained.'); }
    if (!response.ok) throw new AppError('PROVIDER_UNCERTAIN', 'Provider request failed; billing is unconfirmed.');
    const usage = body.usage;
    if (!Number.isSafeInteger(usage?.prompt_tokens) || !Number.isSafeInteger(usage?.completion_tokens)) throw new AppError('PROVIDER_UNCERTAIN', 'Usage missing.');
    let decision;
    try { decision = JSON.parse(body.choices?.[0]?.message?.content || ''); } catch { decision = null; }
    // completion_tokens already includes reasoning tokens; do not add them twice.
    return { decision, input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens,
      reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
      cost_micros: tokenCost(usage.prompt_tokens, usage.completion_tokens, this.prices),
      provider_request_id: String(response.headers.get('x-request-id') || body.id || '').slice(0,160), latency_ms: Math.round(performance.now() - start) };
  }
}
