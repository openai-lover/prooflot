import { Sandbox } from '@vercel/sandbox';

let opening;
export async function readyBackend() {
  if (opening) return opening;
  opening = open();
  try { return await opening; } finally { opening = null; }
}

async function start(sandbox) {
  const command = await sandbox.runCommand({
    cmd: 'bash', args: ['scripts/cloud-start.sh'], cwd: '/vercel/prooflot', timeoutMs: 60000
  });
  if (command.exitCode !== 0) throw new Error('BACKEND_START_FAILED');
}

async function open() {
  const name = process.env.PROOFLOT_SANDBOX_NAME;
  if (!name || !process.env.PROOFLOT_GATEWAY_SECRET) throw new Error('BACKEND_NOT_CONFIGURED');
  // Provisioning is explicit. Visitor requests can only resume this existing
  // backend, never create new sandboxes or silently replace lost data.
  const sandbox = await Sandbox.get({ name, resume: true, onResume: start });
  const address = sandbox.domain(4317);
  const result = await fetch(address + '/api/health', {
    headers: { 'x-prooflot-gateway': process.env.PROOFLOT_GATEWAY_SECRET },
    signal: AbortSignal.timeout(15000)
  });
  if (!result.ok) throw new Error('BACKEND_NOT_READY');
  return address;
}
