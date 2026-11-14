import { createHash, randomUUID } from 'node:crypto';

export class AppError extends Error {
  constructor(code, message = code, status = 400) { super(message); this.code = code; this.status = status; }
}
export function assert(value, code, message, status) { if (!value) throw new AppError(code, message, status); }
export function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') { assert(Number.isSafeInteger(value), 'NON_CANONICAL_NUMBER'); return String(value); }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  assert(typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype, 'NON_CANONICAL_VALUE');
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
export const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
export const uid = () => randomUUID();
export const now = () => new Date().toISOString();
export function integer(value, min, max, code = 'INVALID_INTEGER') {
  assert(Number.isSafeInteger(value) && value >= min && value <= max, code); return value;
}
export function amount(value, code = 'INVALID_AMOUNT') {
  assert(typeof value === 'string' && /^(0|[1-9]\d{0,35})$/.test(value), code); return BigInt(value);
}
export const ceilDiv = (a, b) => (a + b - 1n) / b;
export function hashString(value) { assert(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'INVALID_HASH'); return value; }
export const clone = value => JSON.parse(JSON.stringify(value));
