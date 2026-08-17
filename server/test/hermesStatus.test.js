import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getHermesConfiguredStatus,
  getHermesStatus,
  resetHermesStatusForTests,
} from '../src/services/hermesStatus.js';
import {
  createAiError,
  getAiProviderRuntimeStatus,
  recordAiProviderFailure,
  recordAiProviderSuccess,
  resetAiProviderRuntimeStatus,
} from '../src/services/aiProvider.js';

const baseEnv = {
  AI_PROVIDER: 'openrouter',
  OPENROUTER_API_KEY: 'test-key',
  OPENROUTER_MODEL: 'vendor/model',
  OPENROUTER_VISION_MODEL: 'vendor/vision',
  OPENROUTER_BASE_URL: 'https://provider.test/api/v1',
  AI_HEALTH_TIMEOUT_MS: '1000',
  HERMES_HEALTH_CACHE_MS: '60000',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function healthyFetch(counter) {
  return async (url) => {
    counter.calls += 1;
    if (String(url).endsWith('/auth/key')) return jsonResponse({ data: { limit: 1 } });
    return jsonResponse({ data: [{ id: 'vendor/model' }, { id: 'vendor/vision' }] });
  };
}

test.beforeEach(() => {
  resetHermesStatusForTests();
  resetAiProviderRuntimeStatus();
});

test('configured status never claims a live connection before verification', () => {
  const status = getHermesConfiguredStatus(baseEnv);
  assert.equal(status.configured, true);
  assert.equal(status.connected, false);
  assert.equal(status.status, 'configured_unverified');
});

test('status verifies provider auth and configured model', async () => {
  const counter = { calls: 0 };
  const status = await getHermesStatus({ env: baseEnv, fetchImpl: healthyFetch(counter) });
  assert.equal(status.connected, true);
  assert.equal(status.status, 'connected_unverified');
  assert.equal(status.generationVerified, false);
  assert.equal(status.generationReady, false);
  assert.equal(status.provider, 'openrouter');
  assert.equal(status.model, 'vendor/model');
  assert.equal(status.consecutiveFailures, 0);
  assert.equal(status.lastSuccessfulAt, null);
  assert.equal(counter.calls, 2);

  recordAiProviderSuccess(new Date('2026-08-17T01:00:00.000Z'));
  const verified = await getHermesStatus({ force: true, env: baseEnv, fetchImpl: healthyFetch(counter) });
  assert.equal(verified.status, 'available');
  assert.equal(verified.generationReady, true);
});

test('concurrent and cached status checks do not multiply provider probes', async () => {
  const counter = { calls: 0 };
  const fetchImpl = healthyFetch(counter);
  const [first, second] = await Promise.all([
    getHermesStatus({ env: baseEnv, fetchImpl }),
    getHermesStatus({ env: baseEnv, fetchImpl }),
  ]);
  const cached = await getHermesStatus({ env: baseEnv, fetchImpl });
  assert.equal(first.connected, true);
  assert.equal(second.connected, true);
  assert.equal(cached.cached, true);
  assert.equal(counter.calls, 2);
});

test('health probe failure is observable without mutating generation failure history', async () => {
  const failed = await getHermesStatus({
    env: baseEnv,
    fetchImpl: async (url) => String(url).endsWith('/auth/key')
      ? jsonResponse({ error: 'bad key' }, 401)
      : jsonResponse({ data: [{ id: 'vendor/model' }] }),
  });
  assert.equal(failed.connected, false);
  assert.equal(failed.error, 'ai_auth_failed');
  assert.equal(failed.consecutiveFailures, 0);
  assert.equal(failed.lastFailureAt, null);

  const connected = await getHermesStatus({
    force: true,
    env: baseEnv,
    fetchImpl: healthyFetch({ calls: 0 }),
  });
  assert.equal(connected.connected, true);
  assert.equal(connected.status, 'connected_unverified');
  assert.equal(getAiProviderRuntimeStatus().lastError, '');
});

test('a successful health probe cannot erase a real generation failure', async () => {
  recordAiProviderFailure(createAiError('AI_EMPTY_RESPONSE', 'empty'), new Date('2026-08-17T01:00:00.000Z'));
  const status = await getHermesStatus({ env: baseEnv, fetchImpl: healthyFetch({ calls: 0 }) });
  assert.equal(status.connected, true);
  assert.equal(status.status, 'degraded');
  assert.equal(status.generationReady, false);
  assert.equal(status.error, 'ai_empty_response');
  assert.equal(status.consecutiveFailures, 1);
  assert.equal(getAiProviderRuntimeStatus().lastError, 'ai_empty_response');
});

test('a recovered generation stays observable until a clean generation succeeds', async () => {
  recordAiProviderSuccess(new Date('2026-08-17T01:00:00.000Z'), { recoveredReason: 'empty_response' });
  let status = await getHermesStatus({ env: baseEnv, fetchImpl: healthyFetch({ calls: 0 }) });
  assert.equal(status.status, 'recovered');
  assert.equal(status.generationReady, true);
  assert.equal(status.lastSuccessRecovered, true);
  assert.equal(status.lastRecoveryReason, 'empty_response');

  recordAiProviderSuccess(new Date('2026-08-17T01:01:00.000Z'));
  status = await getHermesStatus({ force: true, env: baseEnv, fetchImpl: healthyFetch({ calls: 0 }) });
  assert.equal(status.status, 'available');
  assert.equal(status.lastSuccessRecovered, false);
  assert.equal(status.totalRecoveries, 1);
});

test('missing configured model is reported without exposing provider response bodies', async () => {
  const status = await getHermesStatus({
    env: baseEnv,
    fetchImpl: async (url) => String(url).endsWith('/auth/key')
      ? jsonResponse({ data: {} })
      : jsonResponse({ data: [{ id: 'another/model' }] }),
  });
  assert.equal(status.connected, false);
  assert.equal(status.error, 'ai_model_not_found');
  assert.match(status.detail, /vendor\/model/);
});

test('health probe aborts all stalled provider requests at the timeout boundary', async () => {
  const status = await getHermesStatus({
    env: baseEnv,
    timeoutMs: 20,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
  });
  assert.equal(status.connected, false);
  assert.equal(status.error, 'ai_timeout');
  assert.equal(status.consecutiveFailures, 0);
});
