import { assert, amount, hashString, canonical, uid, now } from './common.mjs';

// Executable local model of settlement rules. Never a blockchain transaction.
export class DemoSettlement {
  constructor(store) { this.store = store; }
  get(id) { const r = this.store.db.prepare('SELECT body FROM settlements WHERE job_id=?').get(id); return r ? JSON.parse(r.body) : null; }
  save(id, body) { this.store.db.prepare('INSERT INTO settlements VALUES(?,?) ON CONFLICT(job_id) DO UPDATE SET body=excluded.body').run(id, canonical(body)); return body; }
  fund(id, owner, manifestHash, deposit) {
    hashString(manifestHash); assert(amount(deposit) > 0n, 'ZERO_DEPOSIT');
    return this.store.transaction(() => {
      const old = this.get(id);
      if (old) { assert(old.owner === owner && old.manifest_hash === manifestHash && old.deposit === deposit, 'JOB_CONFLICT'); return old; }
      return this.save(id, { mode: 'local_simulation', network: 'none', owner, manifest_hash: manifestHash, deposit,
        charge: '0', refundable: '0', pending: '0', withdrawn: '0', status: 'funded', report_hash: null, nonce: null });
    });
  }
  commit(id, manifestHash, reportHash) {
    return this.store.transaction(() => {
      const job = this.get(id); assert(job && job.manifest_hash === manifestHash, 'MANIFEST_MISMATCH'); hashString(reportHash);
      if (job.report_hash) { assert(job.report_hash === reportHash, 'REPORT_CONFLICT'); return job; }
      assert(job.status === 'funded', 'JOB_NOT_FUNDED'); job.report_hash = reportHash; return this.save(id, job);
    });
  }
  settle(id, charge, nonce) {
    return this.store.transaction(() => {
      const job = this.get(id); assert(job?.report_hash, 'REPORT_REQUIRED');
      if (job.nonce) { assert(job.nonce === nonce && job.charge === charge, 'ALREADY_SETTLED'); return job; }
      assert(amount(charge) <= amount(job.deposit), 'OVERCHARGE');
      job.charge = charge; job.refundable = String(amount(job.deposit) - amount(charge)); job.nonce = nonce; job.status = 'settled';
      return this.save(id, job);
    });
  }
  withdraw(id, owner) {
    return this.store.transaction(() => {
      const job = this.get(id); assert(job?.owner === owner, 'NOT_OWNER', undefined, 403);
      assert(job.status === 'settled' && amount(job.refundable) > 0n && job.pending === '0', 'NOT_WITHDRAWABLE');
      job.pending = job.refundable; job.refundable = '0'; job.status = 'refund_pending'; job.transfer_nonce = uid();
      return this.save(id, job);
    });
  }
  callback(id, nonce, success) {
    return this.store.transaction(() => {
      const job = this.get(id); assert(job && job.transfer_nonce === nonce, 'CALLBACK_NONCE_MISMATCH');
      if (job.status !== 'refund_pending') return job;
      if (success) { job.withdrawn = String(amount(job.withdrawn) + amount(job.pending)); job.status = 'refunded'; }
      else { job.refundable = job.pending; job.status = 'settled'; }
      job.pending = '0'; return this.save(id, job);
    });
  }
}
export function createListing(store, runId, versionHash, seller, price = '50000000000000000000000', persist = true) {
  const run = store.getRun(runId), report = store.report(runId); assert(run.owner === seller, 'NOT_OWNER', undefined, 403);
  if (run.config.version.owner) { assert(run.config.version.owner === seller, 'NOT_BOT_AUTHOR', undefined, 403); assert(report?.inspection?.publishable, 'INSPECTION_FAILED');
    assert(report.status==='completed'&&report.completed_steps===report.requested_steps,'FULL_RUN_REQUIRED','Complete the inspection before listing this bot.'); }
  assert(report && report.completed_steps > 0, 'REPORT_REQUIRED');
  assert(report.manifest.version.hash === versionHash, 'VERSION_MISMATCH'); assert(amount(price) > 0n, 'INVALID_PRICE');
  const old = store.db.prepare('SELECT body FROM listings WHERE report_hash=?').get(report.hash); if (old) return JSON.parse(old.body);
  const body = { id: uid(), version_hash: versionHash, report_hash: report.hash, seller, price_yocto: price,
    terms_hash: report.manifest.version.terms_hash, name:run.config.version.name, kind:run.config.version.kind || 'fixture', inspection:report.inspection || null,
    network: 'local_simulation', created: now(), run_id: runId };
  if(persist)store.db.prepare('INSERT INTO listings VALUES(?,?,?,?)').run(body.id, versionHash, report.hash, canonical(body));
  return body;
}
export function purchaseDemo(store, owner, id, expectedVersion, expectedTerms) {
  return store.transaction(() => {
    const row = store.db.prepare('SELECT body FROM listings WHERE id=?').get(id); assert(row, 'LISTING_NOT_FOUND', undefined, 404);
    const listing = JSON.parse(row.body);
    assert(listing.version_hash === expectedVersion, 'VERSION_MISMATCH', undefined, 409);
    assert(listing.terms_hash === expectedTerms, 'TERMS_MISMATCH', undefined, 409);
    const old = store.db.prepare('SELECT body FROM licenses WHERE owner=? AND listing_id=?').get(owner, id); if (old) return JSON.parse(old.body);
    const body = { id: uid(), listing_id: id, owner, version_hash: listing.version_hash, terms_hash: listing.terms_hash,
      receipt_id: 'local:' + uid(), entitlement: 'local_demo_only', network: 'none', created: now() };
    store.db.prepare('INSERT INTO licenses VALUES(?,?,?,?,?)').run(body.id, owner, id, body.receipt_id, canonical(body)); return body;
  });
}
