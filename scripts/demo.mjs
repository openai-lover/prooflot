import { mkdirSync, writeFileSync } from 'node:fs';
import { Store } from '../src/store.mjs';
import { Service } from '../src/service.mjs';
import { purchaseDemo } from '../src/market.mjs';
const s=new Store(), a=new Service(s,{delay:0});
const run=a.start({budget_micros:240000},'cli-demo','offline-demo-v1'); await a.run(run.id);
const report=s.report(run.id), listing=JSON.parse(s.db.prepare('SELECT body FROM listings').get().body);
const license=purchaseDemo(s,'cli-demo',listing.id,listing.version_hash,listing.terms_hash);
const evidence={mode:'fixture',actual_provider_spend_micros:0,near_transactions:[],report,replay:a.replay(run.id),license};
mkdirSync('output',{recursive:true});writeFileSync('output/demo-evidence.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify({status:report.status,completed:report.completed_steps,requested:report.requested_steps,simulated_cost_micros:report.ledger.settled_micros,
  actual_provider_spend_micros:0,replay_matches:evidence.replay.matches,license:license.entitlement,near_transactions:0,evidence:'output/demo-evidence.json'},null,2));s.close();
