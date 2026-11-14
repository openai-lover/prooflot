import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.mjs';
import { Service, TERMS } from './service.mjs';
import { assert, AppError, hash, uid } from './common.mjs';
import { createListing, purchaseDemo } from './market.mjs';
import { ChainMarket } from './chain-market.mjs';
import { importBtcSample } from './market-data.mjs';
import { assessReport } from './assessment.mjs';
import { Comparisons } from './compare.mjs';
import { Benchmarks } from './benchmarks.mjs';
import { BenchmarkChain } from './benchmark-chain.mjs';
import { WalletAuth } from './wallet-auth.mjs';
import { WalletMarket } from './wallet-market.mjs';
import { randomBytes, createHash } from 'node:crypto';
import { artifactPackage } from './artifact-download.mjs';
import { requestOrigin } from './http-origin.mjs';
import { PublicLimits } from './public-limits.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
export function createApp({ store, delay = 10, benchmarkAnchor, benchmarkData, walletProvider, walletClients,
  publicOrigin = process.env.PROOFLOT_PUBLIC_ORIGIN || '', gatewaySecret = process.env.PROOFLOT_GATEWAY_SECRET || '' } = {}) {
  if (!store) { const dir = path.resolve(process.env.AGENTPROOF_DATA_DIR || path.join(root, 'data')); mkdirSync(dir, { recursive: true }); store = new Store(path.join(dir, 'agentproof.sqlite')); }
  const service = new Service(store, { delay }); service.recoverInterrupted();
  const chain = new ChainMarket(store);
  const walletAuth=new WalletAuth(store,walletProvider),walletMarket=new WalletMarket(store,chain,walletClients);
  const comparisons = new Comparisons(service);
  const benchmarks = new Benchmarks(service,{anchor:benchmarkAnchor===undefined?(chain.info()?new BenchmarkChain(chain):null):benchmarkAnchor,...(benchmarkData?{data:benchmarkData(service)}:{}),busy:()=>comparisons.active.size});
  benchmarks.recoverInterrupted();
  const assessment = id => {const run=store.getRun(id),report=store.report(id);assert(report,'REPORT_NOT_READY',undefined,409);return assessReport(report,service.data(run.config).candles);};
  store.db.exec('CREATE TABLE IF NOT EXISTS local_sessions(token_hash TEXT PRIMARY KEY, owner TEXT UNIQUE NOT NULL)');
  const limits = new Map();
  const publicLimits = new PublicLimits();
  function owner(req, res) {
    let token = /(?:^|;\s*)ap_session=([a-f0-9-]{36})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    const session = token ? store.db.prepare('SELECT owner FROM local_sessions WHERE token_hash=?').get(hash({ token })) : null;
    if (session) return session.owner;
    token = uid(); const identity = uid();
    store.db.prepare('INSERT INTO local_sessions VALUES(?,?)').run(hash({ token }), identity);
    res.setHeader('Set-Cookie', 'ap_session=' + token + '; HttpOnly; SameSite=Strict; Path=/' + (publicOrigin ? '; Secure' : ''));
    return identity;
  }
  const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
  const ownRun = (id, user) => { const r = store.getRun(id); assert(r.owner === user, 'NOT_OWNER', undefined, 403); return r; };
  const input = async req => {
    let body = ''; for await (const chunk of req) { body += chunk; assert(Buffer.byteLength(body) <= 240000, 'BODY_TOO_LARGE', undefined, 413); }
    try { return JSON.parse(body || '{}'); } catch { throw new AppError('INVALID_JSON'); }
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store');
    const cspNonce=randomBytes(18).toString('base64');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${cspNonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://raw.githubusercontent.com https://storage.herewallet.app; connect-src 'self' https://test.rpc.fastnear.com https://rpc.testnet.near.org https://*.meteorwallet.app wss://*.meteorwallet.app; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`);
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const origin = requestOrigin(req, publicOrigin, gatewaySecret);
      const url = new URL(req.url, origin), route = url.pathname;
      if (req.method === 'POST') {
        assert(req.headers['x-agentproof'] === '1', 'CSRF_HEADER_REQUIRED', undefined, 403);
        if (req.headers.origin) assert(req.headers.origin === origin, 'ORIGIN_REJECTED', undefined, 403);
        assert((req.headers['content-type'] || '').startsWith('application/json'), 'JSON_REQUIRED');
        if(publicOrigin)publicLimits.admit(String(req.headers['x-prooflot-client']||'gateway'),route);
      }
      if(req.method==='GET' && ['/assets/glass-version.png','/assets/intro-passport-v2.png'].includes(route)){res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=86400'});res.end(readFileSync(path.join(root,'public',route.slice(1))));return;}
      if(req.method==='GET' && route==='/assets/fonts/PretendardVariable-1.3.9.woff2'){res.writeHead(200,{'Content-Type':'font/woff2','Cache-Control':'public, max-age=31536000, immutable'});res.end(readFileSync(path.join(root,'public',route.slice(1))));return;}
      if(req.method==='GET' && ['/assets/logo.svg','/assets/favicon.svg'].includes(route)){res.writeHead(200,{'Content-Type':'image/svg+xml'});res.end(readFileSync(path.join(root,'public',route.slice(1))));return;}
      if (req.method === 'GET' && ['/', '/index.html', '/app.js', '/download.js', '/upgrade.js', '/benchmark-ui.js', '/style.css', '/benchmark.css','/wallet.bundle.js','/wallet.css','/product.css','/onboarding.js','/onboarding.css','/wallet/manifest.json','/wallet/meteor-wallet.js','/wallet/nightly-wallet.js'].includes(route)) {
        const name = route === '/' ? 'index.html' : route.slice(1);
        res.writeHead(200, { 'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.css') ? 'text/css; charset=utf-8' : name.endsWith('.json')?'application/json; charset=utf-8':'application/javascript; charset=utf-8' });
        const content=readFileSync(path.join(root,'public',name),'utf8');res.end(name.endsWith('.html')?content.replaceAll('@@BP_CSP@@',cspNonce):content); return;
      }
      if (route === '/api/health' && req.method === 'GET') return send(res, 200, { ok: true, hosting: publicOrigin ? 'vercel' : 'local', network: chain.info() ? 'testnet' : 'simulation', live_executed_by_setup: false, version: '0.2.0' });
      const session=owner(req,res),identity=walletAuth.session(session),user=identity?.owner||session;
      if(route==='/api/wallet/session' && req.method==='GET')return send(res,200,{connected:Boolean(identity),wallet:identity,contract:chain.info()?.contract||null});
      if(route==='/api/wallet/challenge' && req.method==='POST'){const b=await input(req);return send(res,200,walletAuth.challenge(session,b.account_id,url.origin));}
      if(route==='/api/wallet/verify' && req.method==='POST')return send(res,200,await walletAuth.verify(session,await input(req),url.origin));
      if(route==='/api/wallet/logout' && req.method==='POST'){walletAuth.logout(session);return send(res,200,{connected:false});}
      if(route==='/api/wallet/publications' && req.method==='POST')return send(res,200,await walletMarket.preparePublication(await walletAuth.require(session,true),await input(req)));
      const publication=route.match(/^\/api\/wallet\/publications\/([a-f0-9-]{36})\/confirm$/);
      if(publication && req.method==='POST'){const b=await input(req);return send(res,200,await walletMarket.advancePublication(await walletAuth.require(session,true),publication[1],b.tx_hash));}
      if(route==='/api/wallet/purchase/prepare' && req.method==='POST')return send(res,200,await walletMarket.preparePurchase(await walletAuth.require(session,true),await input(req)));
      if(route==='/api/wallet/purchase/confirm' && req.method==='POST')return send(res,200,await walletMarket.confirmPurchase(await walletAuth.require(session,true),await input(req)));
      if(route==='/api/wallet/credit' && req.method==='GET')return send(res,200,await walletMarket.credit(await walletAuth.require(session)));
      if(route==='/api/wallet/withdraw' && req.method==='POST')return send(res,200,await walletMarket.withdraw(await walletAuth.require(session,true)));
      if (route === '/api/catalog' && req.method === 'GET') return send(res, 200, { versions: service.catalog(user).map(v=>({...v,can_sell:v.kind?v.owner===user:true})), terms: TERMS,
        live: { enabled: service.live.approved, strict_cap_supported: false, verified: false }, network: chain.info()?'testnet_personal_wallet':'local_simulation', testnet_connected: Boolean(chain.info()), testnet:chain.info(), wallet:identity });
      if (route === '/api/bots' && req.method === 'POST') return send(res,201,service.bots.register(await input(req),user));
      if (route === '/api/datasets' && req.method === 'POST') return send(res,201,service.bots.importCSV(await input(req),user));
      if (route === '/api/datasets' && req.method === 'GET') return send(res,200,service.bots.datasets(user));
      if (route === '/api/datasets/btc-sample' && req.method === 'POST') return send(res,200,await importBtcSample(service.bots,user));
      if (route === '/api/runs/estimate' && req.method === 'POST') return send(res, 200, service.estimate(await input(req),user));
      if (route === '/api/benchmarks' && req.method === 'GET') return send(res,200,benchmarks.list(url.searchParams.get('version_hash')));
      if (route === '/api/benchmarks' && req.method === 'POST') return send(res,202,benchmarks.start(await input(req),user));
      const benchmarkRoute=route.match(/^\/api\/benchmarks\/([a-f0-9-]{36})(?:\/(evidence|verify-chain))?$/);
      if(benchmarkRoute){const id=benchmarkRoute[1],action=benchmarkRoute[2];
        if(!action&&req.method==='GET')return send(res,200,benchmarks.get(id));
        if(action==='evidence'&&req.method==='GET')return send(res,200,benchmarks.evidence(id));
        if(action==='verify-chain'&&req.method==='POST')return send(res,200,await benchmarks.verify(id));}
      if (route === '/api/comparisons' && req.method === 'POST') {assert(!benchmarks.active.size,'BENCHMARK_BUSY',undefined,409);return send(res,202,comparisons.start(await input(req),user));}
      const comparisonRoute=route.match(/^\/api\/comparisons\/([a-f0-9-]{36})$/);
      if(comparisonRoute && req.method==='GET')return send(res,200,comparisons.get(comparisonRoute[1],user));
      if (route === '/api/runs' && req.method === 'POST') {
        assert(!comparisons.active.size&&!benchmarks.active.size,'COMPARISON_BUSY',undefined,409);
        const key = req.headers['idempotency-key']; assert(typeof key === 'string' && /^[a-zA-Z0-9:-]{8,100}$/.test(key), 'IDEMPOTENCY_KEY_REQUIRED');
        const stamp = Date.now(), recent = (limits.get(user) || []).filter(t => stamp - t < 60000);
        assert(recent.length < 12, 'RATE_LIMIT', undefined, 429); limits.set(user, [...recent, stamp]);
        assert(service.active.size < 2, 'CONCURRENCY_LIMIT', undefined, 429);
        const run = service.start(await input(req), user, user + ':' + key);
        service.run(run.id).catch(() => process.stderr.write('Run failed; inspect the redacted run status.\n'));
        return send(res, 202, { id: run.id });
      }
      if (route === '/api/runs' && req.method === 'GET') return send(res, 200, store.listRuns(user).map(r => ({ id: r.id, status: r.status, completed: r.completed,
        requested: r.config.requested_steps, mode: r.mode, created: r.created, name:r.config.version.name, version: r.config.version.version, ledger: store.summary(r.id) })));
      const match = route.match(/^\/api\/runs\/([a-f0-9-]{36})(?:\/(cancel|report|assessment|ledger|replay|retest|settlement|refund|listing))?$/);
      if (match) {
        const id = match[1], action = match[2], run = ownRun(id, user);
        if (!action && req.method === 'GET') return send(res, 200, { ...run, config:{...run.config,version:service.bots.public(run.config.version)}, ledger: store.summary(id), calls: store.calls(id), decisions: store.decisions(id) });
        if (action === 'cancel' && req.method === 'POST') { store.cancel(id); return send(res, 200, { cancel_requested: true }); }
        if (action === 'report' && req.method === 'GET') { const report = store.report(id); assert(report, 'REPORT_NOT_READY', undefined, 409); return send(res, 200, report); }
        if (action === 'assessment' && req.method === 'GET') return send(res,200,assessment(id));
        if (action === 'ledger' && req.method === 'GET') return send(res, 200, { summary: store.summary(id), entries: store.entries(id) });
        if (action === 'replay' && req.method === 'POST') return send(res, 200, service.replay(id));
        if (action === 'settlement' && req.method === 'GET') return send(res, 200, service.settlement.get(id));
        if (action === 'refund' && req.method === 'POST') { const args = await input(req), job = service.settlement.withdraw(id, user);
          return send(res, 200, service.settlement.callback(id, job.transfer_nonce, args.simulate_failure !== true)); }
        if (action === 'listing' && req.method === 'POST') { const args = await input(req);assert(args.network!=='testnet' && !identity,'PERSONAL_WALLET_PUBLICATION_REQUIRED','Use wallet publication to list this bot.',409);const listing=createListing(store,id,args.version_hash,user,args.price_yocto);return send(res,200,{...listing,chain:chain.get(listing.id)}); }
        if (action === 'retest' && req.method === 'POST') {
          assert(!comparisons.active.size&&!benchmarks.active.size,'COMPARISON_BUSY',undefined,409);
          assert(service.active.size < 2, 'CONCURRENCY_LIMIT', undefined, 429);
          const key = req.headers['idempotency-key']; assert(typeof key === 'string' && /^[a-zA-Z0-9:-]{8,100}$/.test(key), 'IDEMPOTENCY_KEY_REQUIRED');
          const c = run.config;
          const fresh = service.start({ mode: c.mode, version_id: c.version.id, dataset_id:c.dataset.id, seed: c.seed, length: c.length, budget_micros: c.budget_micros,
            fee_bps: c.fee_bps, slippage_bps: c.slippage_bps, scenario: c.scenario, strict_cap: c.strict_cap }, user, user + ':' + key);
          service.run(fresh.id).catch(() => {}); return send(res, 202, { id: fresh.id, source_run_id: id, kind: c.mode === 'fixture' ? 'new_fixture_evaluation' : c.mode === 'live' ? 'fresh_llm_inference' : 'fresh_bot_execution' });
        }
      }
      if (route === '/api/listings' && req.method === 'GET') return send(res, 200, store.db.prepare('SELECT body FROM listings ORDER BY rowid DESC LIMIT 60').all().map(r => {const l=JSON.parse(r.body),p=store.report(l.run_id);return {...l,chain:chain.get(l.id),metrics:p?.results.agent.metrics,sparkline:p?.results.agent.curve.filter((_,i,all)=>i%Math.max(1,Math.ceil(all.length/24))===0||i===all.length-1)||[],version:p?.manifest.version.version,evidence:p?{source:p.manifest.dataset.source||'Synthetic example',synthetic:p.manifest.dataset.synthetic,candles:p.manifest.length,completed:p.completed_steps,requested:p.requested_steps,window:p.results.common_window,fee_bps:p.manifest.fee_bps,slippage_bps:p.manifest.slippage_bps}:null};}));
      const listingRoute=route.match(/^\/api\/listings\/([a-f0-9-]{36})\/(report|retest|assessment|evidence|verify-chain)$/);
      if(listingRoute){const lrow=store.db.prepare('SELECT body FROM listings WHERE id=?').get(listingRoute[1]);assert(lrow,'LISTING_NOT_FOUND',undefined,404);const listing=JSON.parse(lrow.body);
        if(listingRoute[2]==='report' && req.method==='GET')return send(res,200,store.report(listing.run_id));
        if(listingRoute[2]==='assessment' && req.method==='GET')return send(res,200,assessment(listing.run_id));
        if(listingRoute[2]==='evidence' && req.method==='GET')return send(res,200,{schema:'agentproof-evidence-v1',listing,terms:store.getRun(listing.run_id).config.terms,report:store.report(listing.run_id),assessment:assessment(listing.run_id),chain:chain.get(listing.id)});
        if(listingRoute[2]==='verify-chain' && req.method==='POST')return send(res,200,await chain.verifyListing(listing));
        if(listingRoute[2]==='retest' && req.method==='POST'){const c=store.getRun(listing.run_id).config;
          assert(!comparisons.active.size&&!benchmarks.active.size,'COMPARISON_BUSY',undefined,409);
          assert(service.active.size < 2, 'CONCURRENCY_LIMIT', undefined, 429);
          const fresh=service.start({mode:c.mode,version_id:c.version.id,dataset_id:c.dataset.id,seed:c.seed,length:c.length,budget_micros:c.budget_micros,fee_bps:c.fee_bps,slippage_bps:c.slippage_bps,strict_cap:c.strict_cap},user,user+':'+uid());
          service.run(fresh.id).catch(()=>{});return send(res,202,{id:fresh.id});}}
      if (route === '/api/licenses' && req.method === 'GET') return send(res, 200, store.db.prepare('SELECT body FROM licenses WHERE owner=? ORDER BY rowid DESC').all(user).map(r => JSON.parse(r.body)));
      if (route === '/api/licenses/demo-purchase' && req.method === 'POST') { const b = await input(req); assert(!chain.get(b.listing_id),'TESTNET_PURCHASE_REQUIRED',undefined,403); return send(res, 200, purchaseDemo(store, user, b.listing_id, b.expected_version_hash, b.expected_terms_hash)); }
      if (route === '/api/licenses/testnet-purchase' && req.method === 'POST') throw new AppError('PERSONAL_WALLET_REQUIRED','Sign the purchase with your personal wallet. Shared developer payments are disabled.',401);
      if (route === '/api/licenses/verify' && req.method === 'POST') throw new AppError('WALLET_IMPORT_NOT_SUPPORTED', 'External-wallet receipt import is not supported. The testnet purchase route verifies final chain state server-side; client success flags never grant access.', 501);
      const artifact = route.match(/^\/api\/licenses\/([a-f0-9-]{36})\/(artifact|download)$/);
      if (artifact && req.method === 'GET') {
        const row = store.db.prepare('SELECT * FROM licenses WHERE id=? AND owner=?').get(artifact[1], user); assert(row, 'LICENSE_REQUIRED', undefined, 403);
        if(JSON.parse(row.body).custody==='personal_wallet')await walletAuth.require(session,true);
        const listing = JSON.parse(store.db.prepare('SELECT body FROM listings WHERE id=?').get(row.listing_id).body), run = store.getRun(listing.run_id);
        if(artifact[2]==='download'){
          const zip=artifactPackage(run.config.version,run.config.terms||TERMS,JSON.parse(row.body),store.report(run.id));
          res.writeHead(200,{'Content-Type':'application/zip','Content-Length':String(zip.length),'Cache-Control':'private, no-store',
            'X-Content-SHA256':createHash('sha256').update(zip).digest('hex'),'X-Bot-Version':listing.version_hash,
            'Content-Disposition':'attachment; filename="prooflot-'+listing.version_hash.slice(0,12)+'.zip"'});
          res.end(zip);return;
        }
        res.setHeader('Content-Disposition', 'attachment; filename="prooflot-bot.json"');
        return send(res, 200, { artifact: run.config.version, terms: run.config.terms || TERMS, license: JSON.parse(row.body), disclaimer: run.config.version.kind?'Exact registered bot version. Testnet tokens have no monetary value. Research license terms apply.':'Public MIT example; local or testnet demo entitlement does not restrict the MIT license.' });
      }
      if (route === '/api/verify-report' && req.method === 'POST') { const b = await input(req), { hash: expected, ...body } = b;
        return send(res, 200, { matches: hash(body) === expected, actual_hash: hash(body), meaning: 'Content identity only; does not verify performance or author honesty.' }); }
      throw new AppError('NOT_FOUND', undefined, 404);
    } catch (err) { if (!res.headersSent) send(res, err instanceof AppError ? err.status : 500, { error: err instanceof AppError ? err.code : 'INTERNAL_ERROR', message: err instanceof AppError ? err.message : 'Internal error; no secrets or raw provider response exposed.' }); else res.end(); }
  });
  server.requestTimeout = 35000; server.headersTimeout = 10000;
  return { server, store, service, chain, comparisons, benchmarks, walletAuth, walletMarket };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp(); const port = Number(process.env.PORT || 4317);
  app.server.listen(port, '127.0.0.1', () => process.stdout.write('AgentProof local preview: http://127.0.0.1:' + port + '\nBot marketplace; personal wallets sign testnet purchases.\n'));
}
