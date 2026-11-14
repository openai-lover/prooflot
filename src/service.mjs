import { assert, AppError, hash, clone, integer, now, uid, canonical } from './common.mjs';
import { syntheticDataset, observation } from './data.mjs';
import { comparison, portfolio, execute, validateDecision, engineVersion } from './engine.mjs';
import { FixtureProvider, NearAIProvider, liveConfiguration } from './providers.mjs';
import { DemoSettlement, createListing } from './market.mjs';
import { BotRegistry, BOT_TERMS } from './bots.mjs';
import { RulesProvider, PythonProvider } from './bot-runner.mjs';
import { inspectRun } from './inspection.mjs';

export const TERMS = { version: 'demo-1', scope: 'Personal research use of the exact prompt/config artifact. Public sample strategies, no investment rights, no return guarantee, no copy protection.', network: 'local-demo' };
const definitions = [
  { id: 'atlas-v1', name: 'Atlas', version: '1.0', threshold_bps: 80, description: 'Momentum decisions with a fixed observation window.',
    prompt: 'You are a research agent. Assess only the provided closed candles and virtual position. Prefer staying flat when evidence is weak. Never request payments, tools, code execution or leverage.' },
  { id: 'atlas-v2', name: 'Atlas', version: '1.1', threshold_bps: 180, description: 'A more selective variant for buyer retests.',
    prompt: 'You are a conservative research agent. Assess only the provided closed candles and virtual position. Trade only on strong trend evidence. Never request payments, tools, code execution or leverage.' }
];
export function versionFor(id, mode, model) {
  const def = definitions.find(v => v.id === id); assert(def, 'UNKNOWN_VERSION');
  const artifact = { ...def, provider: mode === 'live' ? 'near-ai-cloud' : 'fixture', model,
    model_revision: null, protection: mode === 'live' ? 'unverified' : 'not_applicable', runtime_digest: engineVersion,
    prompt_hash: hash({ prompt: def.prompt }), terms_hash: hash(TERMS) };
  return { ...artifact, hash: hash(artifact) };
}
export class Service {
  constructor(store, opts = {}) { this.store = store; this.bots = new BotRegistry(store); this.active = new Set(); this.delay = opts.delay ?? 90; this.live = opts.live || liveConfiguration(); this.providerFactory = opts.providerFactory; this.settlement = new DemoSettlement(store); this.kill = false; }
  catalog(owner) { return [...this.bots.catalog(owner), ...definitions.map(v => { const version = versionFor(v.id, 'fixture', 'deterministic-fixture-v1'); const { prompt, ...publicVersion } = version; return publicVersion; })]; }
  data(config) { return config.dataset.id ? this.bots.dataset(config.dataset.id, null, true) : syntheticDataset(config.seed, config.length); }
  provider(config) { return config.mode === 'rules' ? new RulesProvider() : config.mode === 'python' ? new PythonProvider() : config.mode === 'live' ? new NearAIProvider(this.live) : new FixtureProvider(config.scenario); }
  config(input, owner) {
    assert(input && typeof input === 'object', 'INVALID_CONFIG');
    assert(['fixture','live','rules','python'].includes(input.mode || 'fixture'), 'INVALID_MODE');
    const custom = input.version_id && !input.version_id.startsWith('atlas-') ? this.bots.accessible(input.version_id, owner) : null;
    const mode = custom ? custom.kind === 'prompt' ? 'live' : custom.kind : input.mode || 'fixture';
    assert(custom || ['fixture','live'].includes(mode), 'CUSTOM_BOT_REQUIRED');
    const provider = this.provider({ mode, scenario: input.scenario || 'normal' });
    if(custom?.kind==='prompt')assert(custom.model===provider.model,'MODEL_CONFIG_MISMATCH','The registered model must match the configured NEAR AI model.');
    assert(['normal','timeout','invalid'].includes(input.scenario || 'normal'), 'UNKNOWN_SCENARIO');
    if (mode === 'live') { assert(input.strict_cap === false, 'STRICT_CAP_UNAVAILABLE', 'The provider token bound is not verified; strict-cap live execution is disabled.'); assert((input.scenario || 'normal') === 'normal', 'LIVE_SCENARIO_INVALID'); }
    const dataset = input.dataset_id ? this.bots.dataset(input.dataset_id,owner) : syntheticDataset(input.seed ?? 42, input.length ?? 84);
    const budget = integer(input.budget_micros ?? 240000, 0, 100_000_000, 'INVALID_BUDGET');
    const config = { mode, provider_model:provider.model, model_revision:null, version: custom || versionFor(input.version_id || 'atlas-v1', mode, provider.model), dataset: dataset.manifest,
      terms: clone(custom ? BOT_TERMS : TERMS), length: dataset.candles.length, seed: dataset.manifest.seed ?? null, start_index: 11, requested_steps: dataset.candles.length - 11,
      budget_micros: budget, initial_equity_micros: '1000000000', fee_bps: integer(input.fee_bps ?? 10, 0, 1000),
      slippage_bps: integer(input.slippage_bps ?? 5, 0, 1000), engine: engineVersion, prices: clone(provider.prices),
      scenario: input.scenario || 'normal', strict_cap: mode !== 'live', price_kind: mode === 'fixture' ? 'illustrative_fixture' : mode === 'live' ? 'operator_price_snapshot' : 'no_provider_charge',
      canonical_format: 'agentproof-json-v1: sorted keys, integer numbers, UTF-8, no whitespace' };
    config.manifest_hash = hash(config); return config;
  }
  estimate(input, owner) {
    const config = this.config(input, owner), provider = this.provider(config);
    return { config: {...config,version:this.bots.public(config.version)}, requested_calls: config.requested_steps, reservation_per_call_micros: provider.maxCost(),
      maximum_planned_micros: provider.maxCost() * config.requested_steps, strict_cap: config.strict_cap,
      actual_provider_cost_micros: config.mode === 'live' ? null : 0 };
  }
  start(input, owner, key) { const config = this.config(input, owner); return this.store.createRun(config, owner, key); }
  async run(id) {
    if (this.active.has(id)) return;
    assert(this.active.size < 2, 'CONCURRENCY_LIMIT', undefined, 429);
    let run = this.store.getRun(id); if (run.status !== 'queued') return;
    this.active.add(id); const config = run.config, dataset = this.data(config); let provider;
    this.store.updateRun(id, 'running', 0); let state = 'completed', stopReason = null, pos = portfolio(config.initial_equity_micros), completed = 0;
    try {
      provider = this.providerFactory ? this.providerFactory(config) : this.provider(config);
      // Demo pricing is a fixed, non-convertible tariff; never an exchange rate.
      this.settlement.fund(id, run.owner, config.manifest_hash, '1000000000000000000000000');
      for (let step = 0; step < config.requested_steps; step++) {
        if (this.kill || this.store.getRun(id).canceled) { state = 'partial_canceled'; stopReason = 'New calls stopped; existing liabilities retained.'; break; }
        const index = config.start_index + step, obs = observation(dataset.candles, index, pos);
        obs.trading_costs = { fee_bps: config.fee_bps, slippage_bps: config.slippage_bps };
        const reserved = this.store.reserve(id, index, provider.maxCost(), hash(obs), this.live.daily_cap);
        if (!reserved.admitted) { state = reserved.reason || 'failed'; stopReason = 'Next reservation would exceed available budget, or request already exists.'; break; }
        let response;
        try { response = await provider.infer(obs, config.version, step); }
        catch { this.store.unresolved(reserved.call.id, 'provider_processing_unknown'); state = 'failed'; stopReason = 'Usage unknown. Reservation retained; no automatic retry.'; break; }
        const details = { input_tokens: response.input_tokens, output_tokens: response.output_tokens, reasoning_tokens: response.reasoning_tokens,
          provider_request_id: response.provider_request_id, latency_ms: response.latency_ms };
        const settled = this.store.settle(reserved.call.id, response.cost_micros, details);
        if (settled === 'bound_exceeded') { this.kill = true; state = 'failed'; stopReason = 'Observed cost exceeded reservation. Actual cost recorded; live execution halted.'; break; }
        let decision, validation = 'valid';
        try { decision = validateDecision(response.decision); } catch { validation = 'rejected'; decision = { action: 'HOLD', target_bps: 0, reason: 'Invalid model action rejected; HOLD fallback.' }; }
        // Do not publish the model's free-text rationale or private prompt.
        const safeDecision = { ...decision, reason: validation === 'valid' ? 'Decision accepted; model rationale withheld.' : decision.reason };
        pos = execute(pos, safeDecision, dataset.candles[index + 1], config.fee_bps, config.slippage_bps).position;
        this.store.addDecision(id, index, { index, observed_until: obs.observed_until, observation_hash: hash(obs), decision: safeDecision,
          validation, mode: config.mode, call_id: reserved.call.id });
        completed++; this.store.updateRun(id, 'running', completed);
        if (this.delay) await new Promise(resolve => setTimeout(resolve, this.delay));
      }
    } catch (e) { state = 'failed'; stopReason = e instanceof AppError ? e.code : 'INTERNAL_RUN_ERROR'; }
    finally {
      provider?.close?.();
      this.store.updateRun(id, state, completed, stopReason);
      try { this.finish(id); } finally { this.active.delete(id); }
    }
  }
  finish(id) {
    const existing = this.store.report(id); if (existing) return existing;
    const run = this.store.getRun(id), config = run.config, data = this.data(config), decisions = this.store.decisions(id);
    const results = comparison(data.candles, decisions, config), ledger = this.store.summary(id);
    const calls = this.store.calls(id);
    const publicVersion = this.bots.public(config.version);
    const report = { schema: 'agentproof-report-v1', run_id: id, mode: config.mode, data_kind: config.dataset.synthetic ? 'synthetic' : 'user_upload', evidence: 'operator_recorded_not_independently_verified',
      inspection: inspectRun(config, decisions, ledger, results),
      status: run.status, stop_reason: run.stop_reason, requested_steps: config.requested_steps, completed_steps: decisions.length,
      manifest_hash: config.manifest_hash, manifest: { ...config, version: publicVersion }, results, ledger,
      model_usage: { calls: calls.length, input_tokens: calls.reduce((n,c) => n + (c.details?.input_tokens || 0), 0),
        output_tokens: calls.reduce((n,c) => n + (c.details?.output_tokens || 0), 0), invalid_decisions: decisions.filter(d => d.validation !== 'valid').length,
        actual_provider_cost_micros: config.mode === 'live' ? ledger.settled_micros : 0, usage_complete: ledger.unresolved_calls === 0 },
      decisions, research_adjusted_reference_pnl_micros: String(BigInt(results.agent.metrics.pnl_micros) - BigInt(ledger.settled_micros)),
      limitations: [config.dataset.synthetic ? 'Synthetic data: no investment-performance claim.' : 'Historical data: source rights and completeness are not independently audited; past returns do not predict future returns.',
        ...(config.mode === 'fixture' ? ['Fixture costs are illustrative; no LLM request is made.'] : []),
        ...(config.mode === 'live' ? ['Provider billing bounds and model revision are unverified; strict live caps are unavailable.', 'Historical replay can contain model-training future knowledge.'] : []),
        'Candle fills omit order-book liquidity and market impact.', 'Hash matching checks content identity, not performance truth.',
        'Fixed-log replay is deterministic; a fresh bot execution may differ.',
        'Source code may contain prior knowledge that the observation boundary cannot detect.',
        'License network and finality are established by the separate purchase receipt, not this report.'],
      canonical_format: 'agentproof-json-v1' };
    const saved = this.store.saveReport(id, report);
    const job = this.settlement.get(id);
    if (job) {
      this.settlement.commit(id, config.manifest_hash, saved.hash);
      // Retain the whole demo deposit while provider usage is unknown.
      if (ledger.unresolved_calls === 0) this.settlement.settle(id, String(BigInt(decisions.length) * 1000000000000000000000n), 'settlement:' + id);
    }
    if (decisions.length && !config.version.kind) createListing(this.store, id, config.version.hash, run.owner);
    return saved;
  }
  recoverInterrupted() {
    const rows = this.store.db.prepare("SELECT id FROM runs WHERE status IN ('queued','running')").all();
    for (const { id } of rows) {
      this.store.db.prepare("UPDATE calls SET state='unreconciled' WHERE run_id=? AND state='reserved'").run(id);
      this.store.updateRun(id, 'failed', this.store.decisions(id).length, 'Server restarted; no request replay. Outstanding reservations retained.'); this.finish(id);
    }
  }
  replay(id) {
    const run = this.store.getRun(id), expected = this.store.report(id); assert(expected, 'REPORT_NOT_READY', undefined, 409);
    const results = comparison(this.data(run.config).candles, this.store.decisions(id), run.config);
    return { mode: 'recorded_decision_replay', matches: hash(results) === hash(expected.results), expected_hash: hash(expected.results), actual_hash: hash(results), provider_calls: 0 };
  }
}
