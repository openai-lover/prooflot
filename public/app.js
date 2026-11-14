import { createDownloadFlow } from './download.js';
import './onboarding.js';
import {createWalletUI} from './wallet.bundle.js';
import {benchmarkPanel, benchmarkHistory, benchmarkProductLink} from './benchmark-ui.js';
import {botCard, assessmentPanel, productPanel, comparisonPanel, nearPrice, icon, checkoutPanel, licenseCard, reportPanel, sourceLabel} from './upgrade.js';
const $ = s => document.querySelector(s);
const state = { view: 'market', catalog: null, runs: [], current: null, selected: null, report: null, poll: null, compareSelected: new Set(), marketFilter: 'all', comparison: null, product: null, sales: [], benchmarks: [], benchmark: null, licenses: [] };
const escape = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const short = x => String(x || '').slice(0, 10) + '…' + String(x || '').slice(-6);
const signed = n => (n >= 0 ? '+' : '') + (n / 100).toFixed(2) + '%';
function money(value, digits = 4) { let n = BigInt(value || 0), sign = n < 0n ? '-' : ''; if (n < 0n) n = -n; const whole = (n / 1000000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); return sign + '$' + whole + '.' + String(n % 1000000n).padStart(6, '0').slice(0, digits); }
function micros(value) { if (!/^\d{1,3}(\.\d{1,6})?$/.test(value)) throw new Error('Enter a USD amount with up to six decimal places.'); const [w, f = ''] = value.split('.'); return Number(BigInt(w) * 1000000n + BigInt(f.padEnd(6, '0'))); }
const labels = { queued: 'Pending', running: 'Running', completed: 'Complete', partial_budget: 'Budget limit', partial_canceled: 'Stopped', failed: 'Failed' };
const badge = status => `<span class="badge ${status === 'completed' ? '' : status === 'failed' ? 'red' : 'amber'}">${escape(labels[status] || status)}</span>`;
async function api(url, body, method = body === undefined ? 'GET' : 'POST', key) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-AgentProof': '1', ...(key ? { 'Idempotency-Key': key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await r.json(); if (!r.ok) { const friendly={WALLET_REQUIRED:'Connect your testnet wallet.',WALLET_SIGNATURE_REJECTED:'Signature could not be verified. Reconnect your wallet.',PRIVATE_BOT:'Connect the account that registered this bot.',COMPARISON_BUSY:'Wait for the current test to finish.',RATE_LIMIT:'Please try again shortly.',VERSION_MISMATCH:'The version does not match the inspected bot.',VERSION_OR_TERMS_MISMATCH:'Purchase terms changed. Review the listing again.',INSPECTION_FAILED:'Review the failed inspection checks first.',TESTNET_PRICE_LIMIT:'Enter a price above 0 and up to 0.5 test NEAR.'}; const e = new Error(friendly[value.error]||(value.message!==value.error?value.message:'The request could not be completed. Please try again.')); e.code = value.error; throw e; } return value;
}
const wallet=createWalletUI({api,notify:(m,e)=>toast(m,e),onChange:async()=>{
  clearTimeout(state.poll);state.current=null;state.licenses=[];state.selected=null;state.report=null;state.comparison=null;state.compareSelected.clear();sessionStorage.removeItem('agentproof-comparison');
  $('#report-content').innerHTML='<div class="empty-state"><h2>Your wallet’s reports will appear here.</h2></div>';
  $('#comparison-result').innerHTML='';$('#progress-content').hidden=true;$('#progress-empty').hidden=false;
  await refreshCatalog();await refreshDatasets();await refreshRuns();renderSelection();if(state.view==='licenses')await refreshLicenses();
}});
let toastTimer;
function toast(message, error = false) { $('#toast').textContent = message; $('#toast').className = 'toast' + (error ? ' error' : ''); $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 6500); }
function view(name,loadBenchmark=true){
 const changed=state.view!==name;if(changed)window.scrollTo({top:0});state.view=name;document.body.dataset.view=name;
 document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!=='view-'+name);
 document.querySelectorAll('[data-view]').forEach(el=>{const active=el.dataset.view===name||(name==='product'&&el.dataset.view==='market');el.classList.toggle('active',active);el.setAttribute('aria-current',active?'page':'false');});
 $('#page-title').textContent={market:'Market',studio:'Register bot',lab:'Backtest',reports:'Inspection',licenses:'My library',product:'Bot details',compare:'Compare bots',benchmarks:'Benchmarks'}[name];
 if(name==='reports')refreshRuns().then(()=>{if(!state.report&&state.runs.length)showReport(state.runs[0].id);});
 if(name==='licenses')refreshLicenses();if(name==='benchmarks'&&loadBenchmark)openBenchmarks();
 $('#compare-tray').hidden=state.compareSelected.size===0||name==='compare';history.replaceState(null,'','#'+name);
 if(changed&&!$('#intro-dialog').open&&!document.documentElement.hasAttribute('data-intro-transition')&&!matchMedia('(prefers-reduced-motion: reduce)').matches)$('#view-'+name).animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:370,easing:'cubic-bezier(.22,1,.36,1)'});
}
window.addEventListener('bp:navigate',event=>{if(['market','studio'].includes(event.detail))view(event.detail);});

function inputs() { const v=state.catalog?.versions.find(v=>v.id===$('#version').value); return { version_id: $('#version').value, dataset_id:$('#dataset').value || undefined, mode: v?.kind==='prompt'?'live':$('#mode').value, seed: Number($('#seed').value), length: Number($('#length').value), budget_micros: micros($('#budget').value.trim()), fee_bps: Number($('#fee').value), slippage_bps: Number($('#slippage').value), scenario: v?.kind?'normal':$('#scenario').value, strict_cap: v?.kind==='prompt'?false:$('#mode').value !== 'live' }; }
const row = (label, value) => `<div class="definition-row"><span>${escape(label)}</span><b>${escape(value)}</b></div>`;
async function estimate(){try{const v=state.catalog?.versions.find(v=>v.id===$('#version').value);if(v?.kind){const mode=v.kind==='prompt'?'live':v.kind;$('#mode').innerHTML=`<option value="${mode}">${{python:'Python · free',rules:'Rules · free',live:'NEAR AI Cloud'}[mode]}</option>`;}else if(!$('#mode option[value="fixture"]'))$('#mode').innerHTML='<option value="fixture">Free example</option><option value="live">NEAR AI Cloud</option>';$('#mode').disabled=Boolean(v?.kind);$('#scenario').disabled=Boolean(v?.kind);$('#budget-section').hidden=['python','rules'].includes(v?.kind);$('#synthetic-fields').hidden=Boolean($('#dataset').value);const e=await api('/api/runs/estimate',inputs());$('#estimate-count').textContent=e.requested_calls;$('#estimate-detail').innerHTML=row('Execution cost',e.config.mode==='live'?'Up to '+money(e.config.budget_micros,2):'Free')+row('Starting capital','$1,000')+row('Trading fee',e.config.fee_bps/100+'%')+row('Data',sourceLabel(e.config.dataset));$('#budget-section label').firstChild.textContent=e.config.mode==='live'?'Maximum AI cost':'Simulated budget';$('#budget').setAttribute('aria-label',e.config.mode==='live'?'Maximum AI cost in USD':'Simulated budget in USD');if(e.config.mode==='fixture')$('#estimate-detail').innerHTML+='<p class="small-note">Example calls use simulated costs to demonstrate budget limits.</p>';if(e.config.mode==='live')$('#estimate-detail').innerHTML+='<p class="small-note">The provider cost ceiling is an estimate. Missing responses may still incur charges.</p>';}catch(e){$('#estimate-detail').textContent=e.message;}}
function visibleVersions(){const seen=new Set();return state.catalog.versions.filter(v=>{const key=[v.owner||'sample',v.name,v.version,v.kind].join('|');if(seen.has(key)&&!state.compareSelected.has(v.id))return false;seen.add(key);return true;});}
function agentCards(){
  const all=visibleVersions(),query=$('#market-search').value.trim().toLowerCase();
  const listed=new Set(state.sales.map(l=>l.version_hash));const versions=all.filter(v=>(state.marketFilter==='all'||(v.kind||'fixture')===state.marketFilter)&&v.name.toLowerCase().includes(query)).sort((a,b)=>Number(listed.has(b.hash))-Number(listed.has(a.hash)));$('#market-count').textContent=versions.length+'';
  $('#stat-versions').innerHTML=all.length+'<span></span>';
  $('#agent-grid').innerHTML=versions.length?versions.map(v=>botCard(v,state.sales.find(l=>l.version_hash===v.hash),state.compareSelected.has(v.id),state.benchmarks.find(b=>b.version.hash===v.hash),state.licenses.some(l=>state.sales.some(sale=>sale.id===l.listing_id&&sale.version_hash===v.hash)))).join(''):'<p class="subtle">No bots found.</p>';
}
function renderSelection(){const selected=[...state.compareSelected].map(id=>state.catalog.versions.find(v=>v.id===id)).filter(Boolean);
  $('#compare-count').textContent=selected.length+' bots';$('#compare-names').textContent=selected.map(v=>v.name+' v'+v.version).join(' · ');
  $('#compare-tray').hidden=!selected.length||state.view==='compare';$('#open-comparison').disabled=selected.length<2;
  $('#compare-selection').innerHTML=selected.map(v=>'<span class="selected-bot">'+escape(v.name)+' <small>v'+escape(v.version)+'</small><button type="button" data-compare-toggle="'+v.id+'" aria-label="'+escape(v.name)+' Remove from comparison">×</button></span>').join('')||'<span class="subtle">Choose bots from the market.</span>';
  $('#start-comparison').disabled=selected.length<2||Boolean(state.comparison&&!state.comparison.finished);agentCards();
}
function clearFinishedComparison(){if(state.comparison?.finished){state.comparison=null;sessionStorage.removeItem('agentproof-comparison');$('#comparison-result').innerHTML='';$('#start-comparison').textContent='Start comparison';}}
function lockComparison(locked){document.querySelectorAll('#compare-form input,#compare-form select,#compare-load-data,#compare-selection button').forEach(el=>el.disabled=locked);}
function toggleCompare(id){if(state.comparison&&!state.comparison.finished)return toast('Wait for the comparison to finish before changing bots.');clearFinishedComparison();const v=state.catalog.versions.find(v=>v.id===id);if(!v||v.kind==='prompt')return;
  if(state.compareSelected.has(id))state.compareSelected.delete(id);else{if(state.compareSelected.size>=3)return toast('Compare up to three bots.');state.compareSelected.add(id);}renderSelection();
}
async function openProduct(id){try{const evidence=await api('/api/listings/'+id+'/evidence');state.product=evidence;
  if(!listings.some(l=>l.id===id))listings.push({...evidence.listing,chain:evidence.chain});view('product');history.replaceState(null,'','#product/'+id);
  $('#product-content').innerHTML=productPanel(evidence,{owned:state.licenses.some(l=>l.listing_id===id)});$('#product-content .product-performance').insertAdjacentHTML('afterend',benchmarkProductLink(evidence.report.manifest.version,state.benchmarks));window.scrollTo({top:0});
}catch(e){toast(e.message,true);}}
async function startComparison(event){event?.preventDefault();if(state.compareSelected.size<2)return toast('Choose at least two bots.');$('#start-comparison').disabled=true;
  try{state.comparison=await api('/api/comparisons',{version_ids:[...state.compareSelected],dataset_id:$('#compare-dataset').value||undefined,fee_bps:Number($('#compare-fee').value),slippage_bps:Number($('#compare-slip').value)});sessionStorage.setItem('agentproof-comparison',state.comparison.id);lockComparison(true);view('compare');await pollComparison();}
  catch(e){$('#start-comparison').disabled=false;toast(e.code==='COMPARISON_BUSY'?'Wait for the current test to finish.':e.message,true);}}
async function pollComparison(){if(!state.comparison)return;try{const b=await api('/api/comparisons/'+state.comparison.id);state.comparison=b;$('#comparison-result').innerHTML=comparisonPanel(b);$('#start-comparison').textContent=b.finished?'Compare again':'Comparing…';$('#start-comparison').disabled=!b.finished||state.compareSelected.size<2;
  lockComparison(!b.finished);if(!b.finished)setTimeout(pollComparison,450);else{await refreshRuns();await refreshCatalog();toast(b.comparable?'Comparison complete. All bots used the same conditions.':'Some tests did not finish. Review the results.',!b.comparable);}}
  catch(e){$('#start-comparison').disabled=false;toast(e.message,true);}}
async function importMarketData(button,target){button.disabled=true;const label=button.textContent;button.textContent='Loading…';try{const d=await api('/api/datasets/btc-sample',{});await refreshDatasets();$(target).value=d.id;if(target==='#compare-dataset')clearFinishedComparison();if(target==='#dataset')await estimate();toast('Loaded 72 historical BTC/USD candles.');}catch(e){toast(e.message,true);}finally{button.disabled=false;button.textContent=label;}}
function checkout(item){
 $('#purchase-details').innerHTML=checkoutPanel(item);
 $('#purchase-custody').textContent=item.chain?'Reclaim unused storage credit from your wallet menu.':'Local example. No blockchain payment.';
 $('#purchase-terms').textContent=['python','rules','prompt'].includes(item.kind)?'Includes source and a non-exclusive personal research license. No redistribution, resale, or live fund management rights.':'This public MIT example retains its MIT license.';
 $('#purchase-error').textContent='';$('#confirm-purchase').textContent=item.chain?'Buy with wallet':'Get example license';$('#confirm-purchase').dataset.buy=item.id;$('#purchase-dialog').showModal();
}

async function refreshRuns() {
  try {
    state.runs = await api('/api/runs');
    $('#stat-runs').innerHTML = state.runs.length + '<span></span>';
    const licenses=await api('/api/licenses');state.licenses=licenses;
    $('#stat-provider').innerHTML=licenses.length+'<span></span>';
    $('.report-sidebar').hidden = !state.runs.length;
    $('.report-layout').classList.toggle('without-history', !state.runs.length);
    $('#run-list').innerHTML = state.runs.map(r => `<button class="run-item ${r.id === state.selected ? 'selected' : ''}" data-report="${r.id}"><b>${escape(r.name||'Atlas')} v${escape(r.version)}</b>${badge(r.status)}<small>${r.completed} / ${r.requested} decisions · ${r.mode==='fixture'?'Simulated '+money(r.ledger.settled_micros,3):r.mode==='live'?'AI '+money(r.ledger.settled_micros,3):'Free'}</small><small>${{python:'Python',rules:'Rules',fixture:'Free example',live:'AI prompt'}[r.mode]}</small></button>`).join('');
  } catch (e) { toast(e.message, true); }
}
async function launch(event) { event?.preventDefault(); $('#start-run').disabled = true; try { const result = await api('/api/runs', inputs(), 'POST', crypto.randomUUID()); state.current = result.id; showProgress(); await pollRun(); toast('Backtest started.'); } catch (e) { toast(e.message, true); $('#start-run').disabled = false; } }
function selectRunValue(id,value,label){const el=$('#'+id);const text=String(value??'');if(![...el.options].some(o=>o.value===text))el.add(new Option(label||text,text));el.value=text;}
async function syncRunForm(config){selectRunValue('version',config.version.id,config.version.name+' · v'+config.version.version);selectRunValue('dataset',config.dataset.id||'',config.dataset.source||'Synthetic example');selectRunValue('length',config.length,config.length+' hours');if(!config.version.kind)$('#mode').innerHTML='<option value="fixture">Free example</option><option value="live">NEAR AI Cloud</option>';selectRunValue('mode',config.mode,({python:'Python · free',rules:'Rules · free',fixture:'Free example',live:'NEAR AI Cloud'})[config.mode]);$('#seed').value=config.seed??42;$('#budget').value=(config.budget_micros/1000000).toFixed(6);$('#fee').value=config.fee_bps;$('#slippage').value=config.slippage_bps;$('#scenario').value=config.scenario||'normal';await estimate();}
function showProgress() { $('#progress-empty').hidden = true; $('#progress-content').hidden = false; $('#open-report').hidden = true; $('#cancel-run').disabled = false; }
async function pollRun() {
  if (!state.current) return;
  try { const run = await api('/api/runs/' + state.current); const s = run.ledger; if(state.formRun!==run.id){state.formRun=run.id;await syncRunForm(run.config);}
    $('#run-status').textContent = labels[run.status]; $('#run-status').className = 'badge ' + (run.status === 'completed' ? '' : 'amber');
    $('#progress-text').textContent = run.completed + ' / ' + run.config.requested_steps;
    $('#progress-bar').max = run.config.requested_steps; $('#progress-bar').value = run.completed;
    $('#progress-money').innerHTML = ['python','rules'].includes(run.mode) ? `<div><small>Execution cost</small><b>Free</b></div><div><small>Invalid decisions</small><b>${run.decisions.filter(d=>d.validation!=='valid').length}</b></div>` : `<div><small>${run.mode === 'fixture' ? 'Simulated cost' : 'Settled cost'}</small><b>${money(s.settled_micros)}</b></div><div><small>Budget remaining</small><b>${money(s.remaining_micros)}</b></div><div><small>Reserved / unresolved</small><b>${money(s.reserved_micros)}</b></div><div><small>Unresolved calls</small><b>${s.unresolved_calls}</b></div>`;
    $('#decision-feed').innerHTML = run.decisions.slice(-5).map(d => `<div class="feed-row"><span>${escape(d.observed_until.slice(11, 16))} UTC / ${d.index}</span><b>${escape(d.decision.action)}</b><span>${d.validation === 'valid' ? 'Valid' : 'Invalid → HOLD'}</span></div>`).join('') + (run.stop_reason ? `<p class="small-note">${escape(run.stop_reason)}</p>` : '');
    if (['queued','running'].includes(run.status)) { state.poll = setTimeout(pollRun, 450); }
    else { $('#start-run').disabled = false; $('#cancel-run').disabled = true; $('#open-report').hidden = false; await refreshRuns(); }
  } catch (e) { $('#start-run').disabled = false; toast(e.message, true); }
}
function chart(results) {
  const all = ['agent','buy_hold','cash'].map(k => results[k].curve);
  const values = all.flat().map(p => Number(p.equity_micros) / 1000000);
  const min = Math.min(...values) * 0.998, max = Math.max(...values) * 1.002, width = 640, height = 215, left = 48, top = 18, right = 15, bottom = 27;
  const px = (i, count) => left + i / Math.max(1, count - 1) * (width - left - right);
  const py = value => top + (max - value) / (max - min || 1) * (height - top - bottom);
  const grid = [0,1,2,3].map(i => { const v = min + (max - min) * i / 3, y = py(v); return `<line class="chart-grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"/><text class="chart-label" x="0" y="${y + 3}">${v.toFixed(0)}</text>`; }).join('');
  const paths = all.map((points, i) => `<polyline class="chart-line ${['','hold','cash'][i]}" points="${points.map((p, n) => `${px(n, points.length)},${py(Number(p.equity_micros) / 1000000)}`).join(' ')}"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Bot, buy-and-hold, and cash equity on the same completed interval">${grid}${paths}<text class="chart-label" x="${left}" y="${height - 3}">${escape(results.common_window.start.slice(5,16).replace('T',' '))}</text><text class="chart-label" text-anchor="end" x="${width - right}" y="${height - 3}">${escape(results.common_window.end.slice(5,16).replace('T',' '))} UTC</text></svg>`;
}
let reportRequest=0;
async function showReport(id,listingId){
 const request=++reportRequest;$('#report-content').setAttribute('aria-busy','true');
 try{
  const r=await api(listingId?'/api/listings/'+listingId+'/report':'/api/runs/'+id+'/report');if(request!==reportRequest)return;
  state.report=r;state.reportListing=listingId;state.selected=id;view('reports');
  const canSell=!listingId&&Boolean(r.manifest.version.owner)&&state.catalog.versions.find(v=>v.id===r.manifest.version.id)?.can_sell&&(!state.catalog.testnet_connected||r.manifest.version.owner.startsWith('wallet:testnet:'));
  $('#report-content').innerHTML=reportPanel(r,{chartHtml:chart(r.results),listingId,canSell,testnet:state.catalog.testnet_connected});
  const assessment=await api(listingId?'/api/listings/'+listingId+'/assessment':'/api/runs/'+id+'/assessment');
  if(request===reportRequest)$('#report-assessment').innerHTML=assessmentPanel(assessment);await refreshRuns();
 }catch(e){toast(e.message,true);}finally{if(request===reportRequest)$('#report-content').setAttribute('aria-busy','false');}
}

function downloadJSON(value, name) { const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)], {type:'application/json'})); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function reportAction(action) {
  const r = state.report; if (!r) return;
  try {
    if(action==='publish'){const value=$('#listing-price').value.trim();if(!/^0\.[0-9]{1,6}$/.test(value)||Number(value)>0.5||Number(value)<=0)throw new Error('Enter a price above 0 and up to 0.5 test NEAR.');const price=String(BigInt(value.split('.')[1].padEnd(24,'0')));const button=$('[data-action="publish"]');button.disabled=true;$('#publish-result').textContent='Publishing and verifying…';try{const listing=state.catalog.testnet_connected?await wallet.publish({run_id:r.run_id,version_hash:r.manifest.version.hash,price_yocto:price},text=>{$('#publish-result').textContent=text;}):await api('/api/runs/'+r.run_id+'/listing',{version_hash:r.manifest.version.hash,price_yocto:price});$('#publish-result').textContent=listing.chain?'Published on testnet · listing '+listing.id:'Local listing created';toast('Your bot is listed.');await refreshCatalog();await openProduct(listing.id);}finally{button.disabled=false;}return;}
    if (action === 'download') { downloadJSON(r, 'agentproof-report-' + r.run_id.slice(0,8) + '.json'); return; }
    if (action === 'verify') { const check = await api('/api/verify-report', r); $('#verification-result').innerHTML = `<div class="result-message">${check.matches ? 'MATCH · Report content matches its hash.' : 'MISMATCH · Report content has changed.'}</div>`; }
    if (action === 'tamper') { try { await api('/api/runs/' + r.run_id + '/listing', {version_hash:'0'.repeat(64)}); throw new Error('Expected rejection did not occur.'); } catch(e) { if (e.code !== 'VERSION_MISMATCH') throw e; $('#verification-result').innerHTML = '<div class="result-message">BLOCKED · A report for another version cannot be linked to this listing.</div>'; } }
    if (action === 'replay') { const check = await api('/api/runs/' + r.run_id + '/replay', {}); toast(check.matches ? 'Replay matches: identical fills and metrics. No new provider calls.' : 'Replay mismatch', !check.matches); }
    if (action === 'retest') { $('#version').value = r.manifest.version.id; $('#budget').value = (r.manifest.budget_micros / 1000000).toFixed(6); const next = await api(state.reportListing?'/api/listings/'+state.reportListing+'/retest':'/api/runs/' + r.run_id + '/retest', {}, 'POST', crypto.randomUUID()); state.current = next.id; view('lab'); showProgress(); $('#start-run').disabled = true; pollRun(); toast('New test started with the same version and data.'); }
  } catch(e) { toast(e.message, true); }
}
let listings = [];
async function refreshLicenses(){
 try{
  const [items,licenses]=await Promise.all([api('/api/listings'),api('/api/licenses')]);listings=items;state.sales=items;state.licenses=licenses;
  $('#stat-provider').innerHTML=licenses.length+'<span></span>';
  $('#license-list').innerHTML=licenses.length?licenses.map(l=>{const item=items.find(x=>x.id===l.listing_id),v=state.catalog?.versions.find(v=>v.hash===item?.version_hash);return licenseCard(l,item,v?.version);}).join(''):'<div class="empty-state"><h2>Your first bot belongs here.</h2><button class="button primary" data-view="market">Explore the market '+icon('arrow')+'</button></div>';
  if(state.catalog)agentCards();
 }catch(e){toast(e.message,true);}
}

const downloadBot = createDownloadFlow();
document.addEventListener('click', async event => {
  const el = event.target.closest('button,a'); if (!el) return;
  if (el.dataset.licenseDownload) { event.preventDefault(); const license=state.licenses.find(l=>l.id===el.dataset.licenseDownload); if(license)await downloadBot({id:license.id,versionHash:license.version_hash,name:state.sales.find(l=>l.id===license.listing_id)?.name}); return; }
  if (el.classList.contains('brand')) { event.preventDefault(); view('market'); }
  if (el.dataset.view) view(el.dataset.view);
  if(el.dataset.product)openProduct(el.dataset.product);
  if(el.dataset.benchmarkVersion){view('benchmarks',false);await openBenchmarks(el.dataset.benchmarkVersion);window.scrollTo({top:0});}
  if(el.dataset.benchmarkAttempt)selectBenchmark(el.dataset.benchmarkAttempt);
  if(el.dataset.benchmarkDownload){try{downloadJSON(await api('/api/benchmarks/'+el.dataset.benchmarkDownload+'/evidence'),'bot-benchmark-evidence.json');}catch(e){toast(e.message,true);}}
  if(el.dataset.benchmarkVerify){el.disabled=true;const target=$('#benchmark-chain-status');target.textContent='Checking final chain state…';try{const p=await api('/api/benchmarks/'+el.dataset.benchmarkVerify+'/verify-chain',{});target.textContent=p.matches?'Conditions, version, results, and decision count match · FINAL':'Records differ. Review required.';}catch{target.textContent='The chain is unavailable. Try again shortly.';}finally{el.disabled=false;}}
  if(el.dataset.compareToggle)toggleCompare(el.dataset.compareToggle);
  if(el.dataset.marketFilter){state.marketFilter=el.dataset.marketFilter;document.querySelectorAll('[data-market-filter]').forEach(b=>{b.classList.toggle('active',b===el);b.setAttribute('aria-pressed',String(b===el));});agentCards();}
  if(el.id==='download-comparison'&&state.comparison)downloadJSON(state.comparison,'agentproof-comparison.json');
  if(el.dataset.evidenceDownload&&state.product)downloadJSON(state.product,'agentproof-evidence.json');
  if(el.dataset.chainCheck){el.disabled=true;$('#chain-check-result').textContent='Checking final chain state…';try{const check=await api('/api/listings/'+el.dataset.chainCheck+'/verify-chain',{});state.product.chain_check=check;$('#chain-check-result').className='result-message';$('#chain-check-result').textContent=check.matches?'Version, results, terms, price, and execution match · FINAL':'Listing records differ. Review before purchasing.';}catch(e){$('#chain-check-result').textContent='Verification failed. '+e.message;}finally{el.disabled=false;}}

  if (el.dataset.start) { $('#version').value = el.dataset.start; view('lab'); estimate(); }
  if (el.dataset.budget) { $('#budget').value = el.dataset.budget; document.querySelectorAll('[data-budget]').forEach(b => b.classList.toggle('selected', b === el)); estimate(); }
  if (el.dataset.report) showReport(el.dataset.report);
  if(el.dataset.listingReport)showReport(el.dataset.runId,el.dataset.listingReport);
  if(el.dataset.licenseRetest){el.disabled=true;try{const r=await api('/api/listings/'+el.dataset.licenseRetest+'/retest',{});state.current=r.id;view('lab');showProgress();$('#start-run').disabled=true;pollRun();}catch(e){toast(e.message,true);}finally{el.disabled=false;}}
  if (el.dataset.action) reportAction(el.dataset.action);
  if (el.dataset.buy || el.dataset.badBuy) {
    const bad = Boolean(el.dataset.badBuy), item = listings.find(x => x.id === (el.dataset.buy || el.dataset.badBuy)); if (!item) return;
    if(!bad&&!el.dataset.confirmed){checkout(item);return;}
    el.disabled = true;
    try { $('#purchase-dialog').close();const l=item.chain?await wallet.purchase({...item,version_hash:bad?'f'.repeat(64):item.version_hash},text=>toast(text)):await api('/api/licenses/demo-purchase',{listing_id:item.id,expected_version_hash:bad?'f'.repeat(64):item.version_hash,expected_terms_hash:item.terms_hash}); if (bad) toast('The expected rejection did not occur.',true); else { toast(l.network==='testnet'?'Purchase confirmed on testnet. License verified.':'Example license created. No blockchain payment.'); $('#purchase-dialog').close();view('licenses');await refreshLicenses(); } }
    catch(e) { if(el.dataset.confirmed){$('#purchase-error').textContent=e.message;$('#purchase-dialog').showModal();} toast(bad && e.code === 'VERSION_MISMATCH' ? 'BLOCKED: Purchase rejected: the version hash does not match.' : e.message, !(bad && e.code === 'VERSION_MISMATCH')); }
    finally { el.disabled = false; }
  }
});
$('#run-form').addEventListener('submit', launch);
$('#run-form').addEventListener('change', estimate);
for (const id of ['new-run','empty-start']) $('#' + id)?.addEventListener('click', () => { view('lab'); estimate(); });
$('#open-report').addEventListener('click', () => showReport(state.current));
$('#cancel-run').addEventListener('click', async () => { try { await api('/api/runs/' + state.current + '/cancel', {}); $('#cancel-run').disabled = true; toast('Stop requested. Reservations for sent calls remain accounted for.'); } catch(e) { toast(e.message,true); } });
const pythonExample=`def decide(observation):
    candles = observation["candles"]
    change = (int(candles[-1]["close"]) / int(candles[0]["close"]) - 1) * 10000
    held = int(observation["position"]["quantity"]) > 0
    action = "BUY" if change > 100 and not held else "SELL" if change < -100 and held else "HOLD"
    return {"action": action, "target_bps": 10000 if action == "BUY" or (action == "HOLD" and held) else 0, "reason": "Momentum rule"}
`;
const sourceDrafts={python:'',prompt:''},sourceNames={python:'',prompt:''};
let currentBotKind=$('#bot-kind').value;
function updateDraft(){
 $('#draft-name').textContent=$('#bot-name').value.trim()||'Your bot';
 $('#draft-version').textContent='v'+($('#bot-version').value.trim()||'1.0');
 $('#draft-kind').textContent={python:'Python',rules:'Rules',prompt:'AI prompt'}[$('#bot-kind').value];
}
function syncBotKind(){
 const kind=$('#bot-kind').value;if(currentBotKind!=='rules')sourceDrafts[currentBotKind]=$('#bot-source').value;currentBotKind=kind;
 $('#rule-fields').hidden=kind!=='rules';$('#model-field').hidden=kind!=='prompt';$('#source-field').hidden=kind==='rules';
 $('#bot-source').value=sourceDrafts[kind]||'';$('#bot-file').value='';
 $('#source-field summary').textContent=kind==='prompt'?'Write a prompt':'Paste your code';
 $('#insert-bot-example').textContent=kind==='prompt'?'Use example prompt':'Use example code';
 $('#source-file-label').textContent=sourceNames[kind]||'Drop your bot here';
 $('#source-file-detail').textContent=sourceNames[kind]?'File ready. You can edit the code below.':'Browse or drop · .py / .txt · up to 24 KB';
 $('#source-drop').classList.toggle('has-file',Boolean(sourceNames[kind]));
 document.querySelectorAll('[data-bot-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.botKind===kind)));updateDraft();
}
$('#bot-kind').addEventListener('change',syncBotKind);
document.querySelectorAll('[data-bot-kind]').forEach(b=>b.addEventListener('click',()=>{if($('#bot-kind').value!==b.dataset.botKind){$('#bot-kind').value=b.dataset.botKind;syncBotKind();}}));
$('#bot-name').addEventListener('input',updateDraft);$('#bot-version').addEventListener('input',updateDraft);
$('#insert-bot-example').addEventListener('click',()=>{$('#bot-source').value=currentBotKind==='python'?pythonExample:'Use only the supplied closed candles. Prefer HOLD when evidence is weak. Never use leverage or external tools.';$('#bot-source').focus();sourceDrafts[currentBotKind]=$('#bot-source').value;});
async function readBotFile(file){
 if(!file)return;
 if(file.size>24000||!/\.(py|txt)$/i.test(file.name))return toast('Choose a .py or .txt file up to 24 KB.',true);
 const kind=currentBotKind,content=await file.text();sourceDrafts[kind]=content;sourceNames[kind]=file.name;if(currentBotKind!==kind)return;
 $('#bot-source').value=content;$('#source-file-label').textContent=file.name;$('#source-file-detail').textContent=(file.size/1024).toFixed(1)+' KB · File ready';$('#source-drop').classList.add('has-file');
}
$('#bot-file').addEventListener('change',()=>readBotFile($('#bot-file').files[0]));
$('#source-drop').addEventListener('dragover',event=>{event.preventDefault();$('#source-drop').classList.add('dragging');});
$('#source-drop').addEventListener('dragleave',()=>$('#source-drop').classList.remove('dragging'));
$('#source-drop').addEventListener('drop',event=>{event.preventDefault();$('#source-drop').classList.remove('dragging');readBotFile(event.dataTransfer.files[0]);});
syncBotKind();

$('#bot-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{if($('#bot-kind').value!=='rules'&&!$('#bot-source').value.trim()){$('.source-editor').open=true;$('#bot-source').focus();throw new Error('Upload a bot file or paste your code.');}if(state.catalog.testnet_connected)await wallet.ensure();const bot=await api('/api/bots',{name:$('#bot-name').value,version:$('#bot-version').value,description:$('#bot-description').value,kind:$('#bot-kind').value,model:$('#bot-model').value,threshold_bps:Number($('#bot-threshold').value),lookback:Number($('#bot-lookback').value),source:$('#bot-source').value,prompt:$('#bot-source').value,owns_rights:$('#bot-rights').checked});await refreshCatalog();$('#version').value=bot.id;view('lab');await estimate();toast('Bot registered. Choose your test conditions.');}catch(e){toast(e.message,true);}finally{button.disabled=false;}});
$('#dataset-form').addEventListener('submit',async event=>{event.preventDefault();try{const file=$('#dataset-file').files[0];if(!file||file.size>200000)throw new Error('Choose a CSV file up to 200 KB.');const d=await api('/api/datasets',{csv:await file.text(),source:$('#dataset-source').value});await refreshDatasets();$('#dataset').value=d.id;toast(d.rows+' candles passed format, time, and OHLC checks.');}catch(e){toast(e.message,true);}});
async function refreshDatasets(){const datasets=await api('/api/datasets');state.datasets=datasets;for(const id of ['dataset','compare-dataset']){const el=$('#'+id),selected=el.value;el.innerHTML='<option value="">Synthetic example · not market-performance evidence</option>'+datasets.map(d=>'<option value="'+d.id+'">'+escape(d.source)+' · '+d.rows+' candles</option>').join('');if(datasets.some(d=>d.id===selected))el.value=selected;}}
async function refreshCatalog(){const selected=$('#version').value;const [catalog,sales,benchmarks]=await Promise.all([api('/api/catalog'),api('/api/listings'),api('/api/benchmarks')]);state.benchmarks=benchmarks;state.catalog=catalog;state.sales=sales;listings=sales;$('#version').innerHTML=state.catalog.versions.filter((v,i,all)=>v.id===selected||all.findIndex(x=>[x.owner,x.name,x.version,x.kind].join('|')===[v.owner,v.name,v.version,v.kind].join('|'))===i).map(v=>`<option value="${v.id}">${escape(v.name)} · v${escape(v.version)}</option>`).join('');if(state.catalog.versions.some(v=>v.id===selected))$('#version').value=selected;const liveOption=$('#mode option[value="live"]');if(liveOption)liveOption.disabled=!state.catalog.live.enabled;$('#network-status').textContent=state.catalog.testnet_connected?'NEAR testnet':'Local';$('#environment-detail').textContent=state.catalog.testnet_connected?'Your wallet · testnet · simulation':'Local · Simulation';$('.testnet-notice').textContent=state.catalog.testnet_connected?'NEAR testnet · Purchases use test tokens.':'Local demo · No blockchain payments.';$('.studio-wallet-hint span').textContent=state.catalog.testnet_connected?'Your wallet. Your creator identity.':'Local demo · Licenses belong to this browser session.';agentCards();}
async function init() { try { await wallet.refresh();await refreshCatalog();await refreshDatasets();await refreshRuns(); await estimate(); const name = location.hash.slice(1); if (['market','studio','lab','reports','licenses','compare','benchmarks'].includes(name)) view(name);if(name.startsWith('product/'))await openProduct(name.slice(8));if(name.startsWith('benchmarks/')){view('benchmarks',false);await openBenchmarks(state.benchmarks.find(b=>b.id===name.slice(11))?.version.id);await selectBenchmark(name.slice(11));}renderSelection();const comparisonId=sessionStorage.getItem('agentproof-comparison');if(comparisonId){try{state.comparison=await api('/api/comparisons/'+comparisonId);state.compareSelected=new Set(state.comparison.rows.map(r=>r.version_id));const d=state.datasets.find(d=>d.content_hash===state.comparison.profile.dataset);$('#compare-dataset').value=d?.id||'';$('#compare-fee').value=state.comparison.profile.fee_bps;$('#compare-slip').value=state.comparison.profile.slippage_bps;renderSelection();pollComparison();}catch{sessionStorage.removeItem('agentproof-comparison');}} if (name === 'reports' && state.runs.length) showReport(state.runs[0].id); } catch(e) { toast('Check the server connection. ' + e.message,true); } }
init();


$('#load-market-data').addEventListener('click',event=>importMarketData(event.currentTarget,'#dataset'));
$('#compare-load-data').addEventListener('click',event=>importMarketData(event.currentTarget,'#compare-dataset'));
$('#market-search').addEventListener('input',agentCards);
$('#open-comparison').addEventListener('click',()=>{view('compare');renderSelection();window.scrollTo({top:0});});
$('#clear-comparison').addEventListener('click',()=>{if(state.comparison&&!state.comparison.finished)return toast('Wait for the comparison to finish before changing bots.');clearFinishedComparison();state.compareSelected.clear();renderSelection();});
$('#compare-form').addEventListener('submit',startComparison);
$('#hero-start').addEventListener('click',()=>{if(state.comparison&&!state.comparison.finished){view('compare');return;}clearFinishedComparison();state.compareSelected=new Set(['atlas-v1','atlas-v2']);$('#compare-dataset').value='';renderSelection();view('compare');startComparison();});

$('#compare-form').addEventListener('change',clearFinishedComparison);

let benchmarkPollTimer;
async function openBenchmarks(versionId){
  try{const select=$('#benchmark-version'),chosen=versionId||select.value;const versions=state.catalog.versions.filter(v=>v.kind!=='prompt'&&(!v.kind||state.sales.some(l=>l.version_hash===v.hash)));
    select.innerHTML=versions.map(v=>'<option value="'+v.id+'">'+escape(v.name)+' · v'+escape(v.version)+'</option>').join('');
    if(versions.some(v=>v.id===chosen))select.value=chosen;else if(state.benchmarks.length&&versions.some(v=>v.id===state.benchmarks[0].version.id))select.value=state.benchmarks[0].version.id;
    state.benchmarks=await api('/api/benchmarks');const version=versions.find(v=>v.id===select.value),items=state.benchmarks.filter(b=>b.version.hash===version?.hash);
    $('#benchmark-count').textContent=items.length+'';$('#benchmark-history').innerHTML=benchmarkHistory(items,state.benchmark?.id);$('#start-benchmark').disabled=state.benchmarks.some(b=>!b.finished);
    if(items.length&&(!state.benchmark||state.benchmark.version.id!==version?.id))await selectBenchmark(items[0].id);
    else if(!items.length){$('#start-benchmark').textContent='Start benchmark';clearTimeout(benchmarkPollTimer);state.benchmark=null;$('#benchmark-result').innerHTML='<div class="panel benchmark-empty"><span class="empty-orbit">4</span><h2>Conditions first. Results second.</h2><p>Start the first benchmark for this version.</p></div>';history.replaceState(null,'','#benchmarks');}
  }catch(e){toast(e.message,true);}
}
async function selectBenchmark(id){
  clearTimeout(benchmarkPollTimer);try{const b=await api('/api/benchmarks/'+id);state.benchmark=b;state.benchmarks=state.benchmarks.map(x=>x.id===b.id?b:x);$('#benchmark-version').value=b.version.id;$('#benchmark-result').innerHTML=benchmarkPanel(b);
    const items=state.benchmarks.filter(x=>x.version.hash===b.version.hash);$('#benchmark-history').innerHTML=benchmarkHistory(items,b.id);$('#benchmark-count').textContent=items.length+'';
    $('#start-benchmark').disabled=!b.finished||state.benchmarks.some(x=>!x.finished&&x.id!==b.id);$('#start-benchmark').textContent=b.finished?'Run benchmark again':'Benchmark running…';if(state.view==='benchmarks')history.replaceState(null,'','#benchmarks/'+b.id);
    if(!b.finished)benchmarkPollTimer=setTimeout(()=>selectBenchmark(id),1000);
  }catch(e){toast(e.message,true);}
}
$('#benchmark-version').addEventListener('change',async()=>{state.benchmark=null;await openBenchmarks($('#benchmark-version').value);});
$('#benchmark-form').addEventListener('submit',async event=>{event.preventDefault();const button=$('#start-benchmark');button.disabled=true;try{const b=await api('/api/benchmarks',{version_id:$('#benchmark-version').value,publish_results:true});state.benchmarks.unshift(b);await selectBenchmark(b.id);toast('Benchmark started. Every result will be recorded.');}catch(e){button.disabled=false;toast(e.code==='BENCHMARK_BUSY'?'Wait for the current test to finish.':e.message,true);}});

window.addEventListener('hashchange',async()=>{if(!state.catalog)return;const name=location.hash.slice(1);if(name.startsWith('benchmarks/')){const id=name.slice(11);view('benchmarks',false);await openBenchmarks(state.benchmarks.find(b=>b.id===id)?.version.id);await selectBenchmark(id);}else if(name.startsWith('product/'))await openProduct(name.slice(8));else if(['market','studio','lab','reports','licenses','compare','benchmarks'].includes(name))view(name);});

for(const id of ['browse-bots','browse-all-bots'])$('#'+id).addEventListener('click',()=>$('#market-catalog').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));
