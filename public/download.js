const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');

// Keep preparation separate from saving: the Save click supplies the fresh user
// activation required by the native file picker, even after slow wallet checks.
export function createDownloadFlow() {
  const dialog = document.createElement('dialog');
  dialog.className = 'download-dialog';
  dialog.setAttribute('aria-labelledby', 'download-title');
  dialog.innerHTML = `<div class="dialog-heading"><div><span class="eyebrow">YOUR BOT PACKAGE</span><h2 id="download-title">Preparing your file</h2></div><button type="button" class="dialog-close" aria-label="Close download">×</button></div>
    <div class="download-file"><span class="download-file-icon" aria-hidden="true">↓</span><div><strong id="download-name"></strong><span id="download-size"></span></div></div>
    <p id="download-status" role="status" aria-live="polite"></p>
    <details class="download-proof"><summary>File integrity</summary><p>SHA-256 checks the delivered bytes. It does not certify bot safety or returns.</p><code id="download-hash"></code><p>The ZIP includes source, report, license, and an offline verifier. Extract it, then run <code>node verify.mjs</code>.</p></details>
    <button type="button" class="button primary full" id="download-save" disabled>Download file</button>
    <button type="button" class="text-button full" id="download-location" disabled>Choose location & verify</button>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  let prepared, sequence = 0, saving = false, returnFocus;
  const status = text => { $('#download-status').textContent = text; };
  const close = () => { if (!saving) dialog.close(); };
  $('.dialog-close').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  dialog.addEventListener('close', () => { prepared = null; ++sequence; returnFocus?.focus(); });
  const requestBrowserDownload = () => {
    if (!prepared) return;
    const url = URL.createObjectURL(new Blob([prepared.bytes], {type: 'application/zip'}));
    const link = document.createElement('a');
    link.href = url; link.download = prepared.name;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    $('#download-title').textContent = 'Download requested';
    status('Your browser is handling the save. Check its download notification to confirm completion.');
    $('#download-save').textContent = 'Download again';
    dialog.dataset.state = 'requested';
  };
  $('#download-save').addEventListener('click', requestBrowserDownload);
  $('#download-location').hidden = typeof window.showSaveFilePicker !== 'function';
  $('#download-location').addEventListener('click', async () => {
    if (!prepared || saving) return;
    saving = true;
    const button = $('#download-location');
    button.disabled = true;
    $('.dialog-close').disabled = true;
    try {
      if (typeof window.showSaveFilePicker === 'function') {
        status('Choose where to save your file…');
        const handle = await window.showSaveFilePicker({suggestedName: prepared.name, types: [{description: 'Prooflot package', accept: {'application/zip': ['.zip']}}]});
        status('Writing your file…');
        const writable = await handle.createWritable();
        try { await writable.write(prepared.bytes); await writable.close(); }
        catch (error) { await writable.abort().catch(() => {}); throw error; }
        const saved = await handle.getFile();
        if (await digest(await saved.arrayBuffer()) !== prepared.hash) throw new Error('The saved file did not match. Please save it again.');
        $('#download-title').textContent = 'Saved to your device';
        status(`${saved.name} · Saved and verified on your device.`);
        button.textContent = 'Save another copy';
        dialog.dataset.state = 'saved';
      } else {
        requestBrowserDownload();
      }
    } catch (error) {
      status(error.name === 'AbortError' ? 'Save canceled. Your file is still ready.' : `Could not save: ${error.message}`);
      dialog.dataset.state = error.name === 'AbortError' ? 'ready' : 'error';
    } finally { saving = false; button.disabled = false; $('.dialog-close').disabled = false; }
  });
  return async function download({id, versionHash, name}) {
    if (dialog.open) return;
    returnFocus = document.activeElement;
    const request = ++sequence;
    prepared = null;
    dialog.dataset.state = 'preparing';
    $('#download-title').textContent = 'Preparing your file';
    $('#download-name').textContent = name || 'Bot package';
    $('#download-size').textContent = 'Source · report · license';
    $('#download-hash').textContent = '';
    $('#download-save').textContent = 'Download file';
    $('#download-save').disabled = true;
    $('#download-location').disabled = true;
    $('.download-proof').open = false;
    status('Checking your license and file integrity…');
    dialog.showModal();
    try {
      const response = await fetch('/api/licenses/' + encodeURIComponent(id) + '/download', {credentials: 'same-origin', headers: {'X-AgentProof': '1'}});
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Reconnect the wallet that owns this license.' : 'The package is unavailable. Please try again.');
      if (response.headers.get('content-type') !== 'application/zip') throw new Error('Unexpected file format.');
      if (response.headers.get('X-Bot-Version') !== versionHash) throw new Error('The file does not match your purchased version.');
      const expected = response.headers.get('X-Content-SHA256');
      if (!/^[a-f0-9]{64}$/.test(expected || '')) throw new Error('Missing file integrity checksum.');
      const bytes = await response.arrayBuffer(), actual = await digest(bytes);
      if (expected !== actual) throw new Error('File integrity check failed. No file was saved.');
      if (request !== sequence || !dialog.open) return;
      prepared = {bytes, hash: actual, name: 'prooflot-' + versionHash.slice(0, 12) + '.zip'};
      $('#download-name').textContent = prepared.name;
      $('#download-size').textContent = (bytes.byteLength / 1024).toFixed(1) + ' KB · ZIP';
      $('#download-hash').textContent = actual;
      $('#download-title').textContent = 'Your bot is ready';
      status('Purchased version matched. File integrity checked.');
      $('#download-save').disabled = false;
      $('#download-location').disabled = false;
      dialog.dataset.state = 'ready';
      $('#download-save').focus();
    } catch (error) {
      if (request !== sequence || !dialog.open) return;
      $('#download-title').textContent = 'Download needs attention';
      status(error.message); dialog.dataset.state = 'error';
    }
  };
}
