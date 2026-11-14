// Meteor's web popup must identify the hosting app, not its about:srcdoc sandbox.
// Keep the SDK's sandbox and permission checks; change only public page metadata.
export function walletCompatibility(id, code) {
  if (id !== 'meteor-wallet') return {code, patches:[]};
  const before='pageUri:encodeURIComponent(window.location.href)';
  const after='pageUri:encodeURIComponent(window.selector.location)';
  if (code.split(before).length !== 2 || code.includes(after)) {
    throw new Error('Meteor adapter changed: review the page URI compatibility patch before updating');
  }
  return {code:code.replace(before,after),patches:[{
    id:'meteor-sandbox-page-uri',
    reason:'Use the host app URL supplied by NEAR Connect instead of about:srcdoc in Meteor Web login/signature popups.',
    replacements:1
  }]};
}
