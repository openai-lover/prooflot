import { DatabaseSync } from 'node:sqlite';
import { assert, canonical, hash, now, uid } from './common.mjs';

export class Store {
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, request_hash TEXT NOT NULL,
        config TEXT NOT NULL, owner TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL, canceled INTEGER NOT NULL DEFAULT 0,
        budget INTEGER NOT NULL CHECK(budget>=0), completed INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, stop_reason TEXT);
      CREATE TABLE IF NOT EXISTS calls(id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), step INTEGER NOT NULL,
        state TEXT NOT NULL, reservation INTEGER NOT NULL CHECK(reservation>=0), actual INTEGER CHECK(actual>=0),
        observation_hash TEXT NOT NULL, details TEXT, created TEXT NOT NULL, UNIQUE(run_id,step));
      CREATE TABLE IF NOT EXISTS budget_entries(id TEXT PRIMARY KEY, run_id TEXT NOT NULL, call_id TEXT, kind TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK(amount>=0), source_key TEXT UNIQUE NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS decisions(run_id TEXT NOT NULL REFERENCES runs(id), step INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(run_id,step));
      CREATE TABLE IF NOT EXISTS reports(hash TEXT PRIMARY KEY, run_id TEXT UNIQUE NOT NULL REFERENCES runs(id), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS listings(id TEXT PRIMARY KEY, version_hash TEXT NOT NULL, report_hash TEXT NOT NULL REFERENCES reports(hash), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS licenses(id TEXT PRIMARY KEY, owner TEXT NOT NULL, listing_id TEXT NOT NULL REFERENCES listings(id),
        receipt_id TEXT UNIQUE NOT NULL, body TEXT NOT NULL, UNIQUE(owner,listing_id));
      CREATE TABLE IF NOT EXISTS settlements(job_id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS immutable_reports_update BEFORE UPDATE ON reports BEGIN SELECT RAISE(ABORT,'IMMUTABLE_REPORT'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_reports_delete BEFORE DELETE ON reports BEGIN SELECT RAISE(ABORT,'IMMUTABLE_REPORT'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_entries_update BEFORE UPDATE ON budget_entries BEGIN SELECT RAISE(ABORT,'APPEND_ONLY_LEDGER'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_entries_delete BEFORE DELETE ON budget_entries BEGIN SELECT RAISE(ABORT,'APPEND_ONLY_LEDGER'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_decisions_update BEFORE UPDATE ON decisions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_DECISION'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_listings_update BEFORE UPDATE ON listings BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LISTING'); END;`);
  }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const r = fn(); this.db.exec('COMMIT'); return r; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
  createRun(config, owner, requestKey) {
    const requestHash = hash({ config, owner });
    return this.transaction(() => {
      const previous = this.db.prepare('SELECT * FROM runs WHERE request_key=?').get(requestKey);
      if (previous) { assert(previous.request_hash === requestHash, 'IDEMPOTENCY_CONFLICT', undefined, 409); return this.getRun(previous.id); }
      const id = uid();
      this.db.prepare('INSERT INTO runs(id,request_key,request_hash,config,owner,mode,status,budget,created) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id, requestKey, requestHash, canonical(config), owner, config.mode, 'queued', config.budget_micros, now());
      return this.getRun(id);
    });
  }
  getRun(id) { const row = this.db.prepare('SELECT * FROM runs WHERE id=?').get(id); assert(row, 'RUN_NOT_FOUND', undefined, 404); return { ...row, config: JSON.parse(row.config) }; }
  listRuns(owner) { return this.db.prepare('SELECT id FROM runs WHERE owner=? ORDER BY created DESC LIMIT 50').all(owner).map(r => this.getRun(r.id)); }
  updateRun(id, status, completed, reason = null) { this.db.prepare('UPDATE runs SET status=?,completed=?,stop_reason=? WHERE id=?').run(status, completed, reason, id); }
  cancel(id) { this.db.prepare('UPDATE runs SET canceled=1 WHERE id=?').run(id); }
  summary(id) {
    const r = this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN state='settled' THEN actual ELSE 0 END),0) AS settled,
      COALESCE(SUM(CASE WHEN state IN ('reserved','unreconciled') THEN reservation ELSE 0 END),0) AS reserved,
      SUM(CASE WHEN state='unreconciled' THEN 1 ELSE 0 END) AS unresolved FROM calls WHERE run_id=?`).get(id);
    return { settled_micros: r.settled, reserved_micros: r.reserved, unresolved_calls: r.unresolved || 0, remaining_micros: this.getRun(id).budget - r.settled - r.reserved };
  }
  reserve(id, step, maxCost, observationHash, dailyCap = 0) {
    return this.transaction(() => {
      const run = this.getRun(id), old = this.db.prepare('SELECT * FROM calls WHERE run_id=? AND step=?').get(id, step);
      // A duplicate reservation never authorizes a second provider request.
      if (old) return { admitted: false, duplicate: true, call: old };
      if (run.canceled) return { admitted: false, reason: 'partial_canceled' };
      if (run.status !== 'running') return { admitted: false, reason: 'failed' };
      const s = this.summary(id);
      if (s.settled_micros + s.reserved_micros + maxCost > run.budget) return { admitted: false, reason: 'partial_budget' };
      if (run.mode === 'live') {
        // Reservations survive midnight and remain a liability until reconciled.
        const used = this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN c.state='settled' AND substr(c.created,1,10)=? THEN c.actual
          WHEN c.state IN ('reserved','unreconciled') THEN c.reservation ELSE 0 END),0) AS amount FROM calls c JOIN runs r ON r.id=c.run_id WHERE r.mode='live'`).get(now().slice(0,10)).amount;
        if (!dailyCap || used + maxCost > dailyCap) return { admitted: false, reason: 'partial_budget' };
      }
      const callId = uid();
      this.db.prepare('INSERT INTO calls(id,run_id,step,state,reservation,observation_hash,created) VALUES(?,?,?,?,?,?,?)')
        .run(callId, id, step, 'reserved', maxCost, observationHash, now());
      this.entry(id, callId, 'reserved', maxCost, callId + ':reserve');
      return { admitted: true, call: this.db.prepare('SELECT * FROM calls WHERE id=?').get(callId) };
    });
  }
  entry(run, call, kind, amount, source) { this.db.prepare('INSERT OR IGNORE INTO budget_entries VALUES(?,?,?,?,?,?,?)').run(uid(), run, call, kind, amount, source, now()); }
  settle(callId, cost, details) {
    return this.transaction(() => {
      const call = this.db.prepare('SELECT * FROM calls WHERE id=?').get(callId); assert(call, 'CALL_NOT_FOUND');
      if (call.state === 'settled') { assert(call.actual === cost, 'SETTLEMENT_CONFLICT'); return false; }
      assert(['reserved','unreconciled'].includes(call.state), 'INVALID_CALL_STATE');
      assert(Number.isSafeInteger(cost) && cost >= 0, 'INVALID_COST');
      this.db.prepare("UPDATE calls SET state='settled',actual=?,details=? WHERE id=?").run(cost, canonical(details), callId);
      this.entry(call.run_id, callId, 'settled', cost, callId + ':settle');
      this.entry(call.run_id, callId, 'released', Math.max(0, call.reservation - cost), callId + ':release');
      return cost > call.reservation ? 'bound_exceeded' : true;
    });
  }
  unresolved(callId, reason) { this.db.prepare("UPDATE calls SET state='unreconciled',details=? WHERE id=? AND state='reserved'").run(canonical({ error: reason }), callId); }
  calls(id) { return this.db.prepare('SELECT * FROM calls WHERE run_id=? ORDER BY step').all(id).map(c => ({ ...c, details: c.details ? JSON.parse(c.details) : null })); }
  entries(id) { return this.db.prepare('SELECT kind,amount,source_key,created FROM budget_entries WHERE run_id=? ORDER BY rowid').all(id); }
  addDecision(id, index, body) { this.db.prepare('INSERT INTO decisions VALUES(?,?,?)').run(id, index, canonical(body)); }
  decisions(id) { return this.db.prepare('SELECT body FROM decisions WHERE run_id=? ORDER BY step').all(id).map(r => JSON.parse(r.body)); }
  saveReport(id, report) { const h = hash(report); this.db.prepare('INSERT INTO reports VALUES(?,?,?)').run(h, id, canonical(report)); return { hash: h, ...report }; }
  report(id) { const r = this.db.prepare('SELECT * FROM reports WHERE run_id=?').get(id); return r ? { hash: r.hash, ...JSON.parse(r.body) } : null; }
  close() { this.db.close(); }
}
