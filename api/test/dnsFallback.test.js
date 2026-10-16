import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFallback } from '../lib/dnsFallback.js';

const failing = (code) => (host, opts, cb) => cb(Object.assign(new Error(code), { code }));
const ok = (host, opts, cb) => cb(null, '10.0.0.1', 4);
const call = (fn, opts) => new Promise((resolve) => fn('db.example.com', opts, (err, address, family) => resolve({ err, address, family })));

test('uses the normal answer when the router resolves the name', async () => {
  const r = await call(withFallback(ok, async () => ['1.2.3.4']), {});
  assert.equal(r.address, '10.0.0.1');
});

test('falls back to public DNS on ENOTFOUND', async () => {
  const r = await call(withFallback(failing('ENOTFOUND'), async () => ['1.2.3.4']), {});
  assert.equal(r.err, null);
  assert.equal(r.address, '1.2.3.4');
  assert.equal(r.family, 4);
});

test('returns all addresses when asked (all: true)', async () => {
  const r = await call(withFallback(failing('EAI_AGAIN'), async () => ['1.2.3.4', '5.6.7.8']), { all: true });
  assert.deepEqual(r.address, [{ address: '1.2.3.4', family: 4 }, { address: '5.6.7.8', family: 4 }]);
});

test('keeps the original error when public DNS fails too, or for other errors', async () => {
  const both = await call(withFallback(failing('ENOTFOUND'), async () => { throw new Error('x'); }), {});
  assert.equal(both.err.code, 'ENOTFOUND');
  const other = await call(withFallback(failing('ECONNREFUSED'), async () => ['1.2.3.4']), {});
  assert.equal(other.err.code, 'ECONNREFUSED');
});
