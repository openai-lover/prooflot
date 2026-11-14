import { readyBackend } from '../lib/backend.mjs';
import { createHmac } from 'node:crypto';

export function createGateway({getBackend=readyBackend,request=fetch,env=process.env}={}) {
return async function handler(req, res) {
  const configured = env.PROOFLOT_PUBLIC_ORIGIN;
  const secret = env.PROOFLOT_GATEWAY_SECRET;
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!configured || !secret) return unavailable(res);
    const publicUrl = new URL(configured);
    const host = String(req.headers.host || '').toLowerCase();
    if (publicUrl.protocol !== 'https:' || host !== publicUrl.host) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({error:'PUBLIC_HOST_REQUIRED'}));
    }
    if (!['GET','HEAD','POST'].includes(req.method)) {
      res.writeHead(405, { Allow:'GET, HEAD, POST' }); return res.end();
    }
    if (req.headers.origin && req.headers.origin !== configured) {
      res.writeHead(403, { 'Content-Type':'application/json' });
      return res.end(JSON.stringify({error:'ORIGIN_REJECTED'}));
    }
    let body;
    if (req.method === 'POST') {
      if (req.headers['x-agentproof'] !== '1') {
        res.writeHead(403, { 'Content-Type':'application/json' });
        return res.end(JSON.stringify({error:'CSRF_HEADER_REQUIRED'}));
      }
      if (req.body !== undefined) body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      else {
        const chunks=[]; let bytes=0;
        for await (const chunk of req) { bytes+=chunk.length; if(bytes>240000) {res.writeHead(413);return res.end();} chunks.push(chunk); }
        body=Buffer.concat(chunks);
      }
      if (Buffer.byteLength(body) > 240000) {res.writeHead(413);return res.end();}
    }
    const backend = await getBackend();
    // Vercel overwrites X-Forwarded-For to prevent requester IP spoofing.
    // No raw IP or user-supplied backend identity is stored or forwarded.
    const client=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown');
    const headers = {'x-prooflot-gateway':secret,'x-prooflot-client':createHmac('sha256',secret).update(client).digest('hex')};
    for (const name of ['cookie','content-type','x-agentproof','idempotency-key','origin','accept']) {
      if (req.headers[name]) headers[name] = String(req.headers[name]);
    }
    const target = new URL(req.url, 'https://placeholder.invalid');
    const response = await request(backend + target.pathname + target.search, {
      method:req.method, headers, body, redirect:'manual', signal:AbortSignal.timeout(90000)
    });
    for (const [name,value] of response.headers) {
      if (!['connection','transfer-encoding','content-encoding','content-length','set-cookie'].includes(name)) res.setHeader(name,value);
    }
    const cookies=response.headers.getSetCookie(); if(cookies.length)res.setHeader('Set-Cookie',cookies);
    res.statusCode=response.status;
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    // Never replay a POST after an ambiguous network failure. Existing
    // idempotency keys and wallet reconciliation handle explicit retries.
    if (!res.headersSent) unavailable(res); else res.end();
  }
};
}
export default createGateway();
function unavailable(res) {
  res.writeHead(503, {'Content-Type':'application/json','Retry-After':'5'});
  res.end(JSON.stringify({error:'SERVICE_WARMING',message:'The service is starting. Please try again shortly.'}));
}
