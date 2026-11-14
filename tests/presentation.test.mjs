import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkoutPanel,productPanel,botCard,reportPanel,inspectionLabel} from '../public/upgrade.js';
const evidence=JSON.parse(readFileSync(new URL('../docs/wallet-product-evidence.json',import.meta.url),'utf8'));

test('purchase summary preserves exact price plus storage allowance, without implying gas is included',()=>{
 const item={name:'<script>bad()</script>',version_hash:'a'.repeat(64),kind:'python',chain:{},price_yocto:'10000000000000000000001'};
 const html=checkoutPanel(item);
 assert.ok(html.includes('0.030000000000000000000001'));
 assert.ok(html.includes('0.02 test NEAR'));
 assert.ok(html.includes('Gas extra'));
 assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('&lt;script&gt;'));
 const local=checkoutPanel({...item,chain:null});
 assert.ok(local.includes('0.010000000000000000000001'));
 assert.ok(!local.includes('Storage allowance'));
});

test('owned product has no buy action; actual risk checks and version evidence remain visible',()=>{
 const owned=productPanel(evidence,{owned:true}),unowned=productPanel(evidence);
 assert.ok(owned.includes('Open my library'));
 assert.ok(!owned.includes('data-buy='));
 assert.ok(unowned.includes('data-buy='));
 assert.ok(unowned.includes(evidence.report.manifest.version.hash.slice(0,12)));
 assert.ok(unowned.includes('test NEAR'));
 const report=reportPanel(evidence.report,{chartHtml:'',listingId:evidence.listing.id,canSell:false});
 for(const c of evidence.report.inspection.checks)assert.ok(report.includes(inspectionLabel(c)));
 assert.ok(!report.includes('data-action="publish"'));
 const synthetic=structuredClone(evidence);
 synthetic.assessment.evidence.data_kind='synthetic';
 synthetic.assessment.evidence.source='AgentProof deterministic xorshift32 generator v1';
 const syntheticProduct=productPanel(synthetic);
 assert.ok(syntheticProduct.includes('Synthetic example'));
 assert.ok(!syntheticProduct.includes(synthetic.assessment.evidence.source));
});

test('market labels retain ETH vs BTC and distinguish synthetic examples',()=>{
 const v={id:'eth-bot',name:'Example',version:'1',kind:'rules',hash:'h'};
 const l={id:'l',chain:{},price_yocto:'1',metrics:{return_bps:0,max_drawdown_bps:0,trades:1},sparkline:[],evidence:{source:'Coinbase · ETH-USD · hourly',synthetic:false}};
 assert.ok(botCard(v,l,false).includes('Coinbase ETH/USD'));
 assert.ok(!botCard(v,l,false).includes('Coinbase BTC/USD'));
 assert.ok(botCard(v,{...l,evidence:{...l.evidence,synthetic:true}},false).includes('Synthetic example'));
});
