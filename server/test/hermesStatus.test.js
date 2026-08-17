import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyHermesConnectionError,
  hermesGatewayStatus,
  probeHermesConsole,
} from '../src/services/hermesStatus.js';

function response(status, contentType = 'text/html') {
  return new Response('', { status, headers: { 'content-type': contentType } });
}

test('gateway status follows the configured AI provider, not the optional console', () => {
  const originalProvider = process.env.AI_PROVIDER;
  const originalKey = process.env.OPENROUTER_API_KEY;
  try {
    process.env.AI_PROVIDER = 'openrouter';
    process.env.OPENROUTER_API_KEY = 'test-key';
    assert.equal(hermesGatewayStatus().connected, true);

    delete process.env.OPENROUTER_API_KEY;
    assert.equal(hermesGatewayStatus().error, 'ai_unconfigured');
  } finally {
    if (originalProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = originalProvider;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test('console probe retries a transient reset and reports recovery', async () => {
  let calls = 0;
  const result = await probeHermesConsole('http://agent.example/chat', {
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
      return response(200);
    },
  });

  assert.equal(result.connected, true);
  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
});

test('console probe classifies a persistent reset without exposing raw errors', async () => {
  const result = await probeHermesConsole('http://agent.example/chat', {
    retryDelayMs: 0,
    fetchImpl: async () => {
      throw new TypeError('socket details', { cause: { code: 'ECONNRESET' } });
    },
  });

  assert.equal(result.connected, false);
  assert.equal(result.error, 'hermes_connection_reset');
  assert.equal(result.attempts, 2);
  assert.equal(result.detail, 'Hermes console reset the connection.');
});

test('console probe does not retry terminal HTTP errors', async () => {
  let calls = 0;
  const result = await probeHermesConsole('https://agent.example/chat', {
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return response(401, 'application/json');
    },
  });

  assert.equal(result.error, 'hermes_http_401');
  assert.equal(result.attempts, 1);
  assert.equal(calls, 1);
});

test('console probe rejects non-http URLs before fetching', async () => {
  const result = await probeHermesConsole('file:///tmp/hermes');
  assert.equal(result.error, 'hermes_url_invalid');
  assert.equal(result.attempts, 0);
});

test('connection classifier distinguishes timeouts and refused ports', () => {
  assert.equal(classifyHermesConnectionError({ name: 'AbortError' }).error, 'hermes_timeout');
  assert.equal(
    classifyHermesConnectionError({ cause: { code: 'ECONNREFUSED' } }).error,
    'hermes_connection_refused',
  );
});
