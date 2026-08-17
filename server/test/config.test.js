import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveJwtSecret } from '../src/config.js';

test('production rejects missing, known-default, and short JWT secrets', () => {
  for (const value of ['', 'dev-insecure-secret-change-me', 'change-me-to-a-long-random-string', 'short']) {
    assert.throws(() => resolveJwtSecret('production', value), /至少 32 字符/);
  }
});

test('production accepts a long random JWT secret and development keeps a local fallback', () => {
  const secure = 'a'.repeat(64);
  assert.equal(resolveJwtSecret('production', secure), secure);
  assert.equal(resolveJwtSecret('development', ''), 'dev-insecure-secret-change-me');
});
