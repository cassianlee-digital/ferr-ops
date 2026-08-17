import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../public/api.js', import.meta.url), 'utf8');

function loadApi(fetchImpl) {
  const context = {
    AbortController,
    clearTimeout,
    console,
    fetch: fetchImpl,
    location: { href: '', pathname: '/' },
    setTimeout,
    window: {},
  };
  vm.runInNewContext(source, context, { filename: 'public/api.js' });
  return context.window.API;
}

test('frontend API keeps existing call signatures and parses JSON', async () => {
  const api = loadApi(async (_path, options) => ({
    status: 200,
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({ method: options.method, body: JSON.parse(options.body) }),
  }));
  const result = await api.post('/test', { ok: true });
  assert.equal(result.method, 'POST');
  assert.deepEqual(result.body, { ok: true });
});

test('frontend API aborts a stalled request and returns a stable timeout error', async () => {
  const api = loadApi(async (_path, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  }));
  await assert.rejects(
    api.get('/slow', { timeoutMs: 20 }),
    (error) => error.code === 'REQUEST_TIMEOUT' && error.status === 408,
  );
});
