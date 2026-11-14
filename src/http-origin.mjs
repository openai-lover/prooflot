import { timingSafeEqual } from 'node:crypto';
import { assert } from './common.mjs';

export function requestOrigin(req, publicOrigin = '', gatewaySecret = '') {
  if (!publicOrigin) {
    const host = req.headers.host || '';
    assert(/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host), 'LOCAL_HOST_REQUIRED', undefined, 403);
    return 'http://' + host;
  }
  const configured = new URL(publicOrigin);
  assert(configured.protocol === 'https:' && configured.origin === publicOrigin, 'INVALID_PUBLIC_ORIGIN');
  assert(gatewaySecret.length >= 32, 'GATEWAY_NOT_CONFIGURED', undefined, 503);
  const supplied = Buffer.from(String(req.headers['x-prooflot-gateway'] || ''));
  const expected = Buffer.from(gatewaySecret);
  assert(supplied.length === expected.length && timingSafeEqual(supplied, expected), 'GATEWAY_REQUIRED', undefined, 403);
  return configured.origin;
}
