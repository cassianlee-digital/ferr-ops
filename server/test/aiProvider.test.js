import test from 'node:test';
import assert from 'node:assert/strict';
import { callAnthropic } from '../src/services/anthropic.js';
import {
  getAiProviderConfig,
  publicAiError,
  requireAiProviderConfig,
  resetAiProviderRuntimeStatus,
} from '../src/services/aiProvider.js';

const env = {
  AI_PROVIDER: 'openrouter',
  OPENROUTER_API_KEY: 'test-key',
  OPENROUTER_MODEL: 'vendor/model',
  OPENROUTER_BASE_URL: 'https://provider.test/api/v1',
  OPENROUTER_MAX_TOKENS: '1000',
};

test.beforeEach(() => resetAiProviderRuntimeStatus());

test('provider configuration is centralized and rejects unknown providers', () => {
  const cfg = getAiProviderConfig(env);
  assert.equal(cfg.provider, 'openrouter');
  assert.equal(cfg.model, 'vendor/model');
  assert.equal(cfg.configured, true);
  assert.throws(
    () => requireAiProviderConfig({ AI_PROVIDER: 'unknown' }),
    (error) => error.code === 'AI_PROVIDER_INVALID',
  );
});

test('generation request is actually aborted at the configured boundary', async () => {
  const fetchImpl = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });

  await assert.rejects(
    callAnthropic('system', 'prompt', { env, fetchImpl, timeoutMs: 20 }),
    (error) => error.code === 'AI_TIMEOUT' && publicAiError(error).error === 'ai_timeout',
  );
});

test('generation rejects empty and malformed provider responses', async () => {
  await assert.rejects(
    callAnthropic('system', 'prompt', {
      env,
      fetchImpl: async () => new Response('{', { status: 200, headers: { 'content-type': 'application/json' } }),
    }),
    (error) => error.code === 'AI_INVALID_RESPONSE',
  );

  await assert.rejects(
    callAnthropic('system', 'prompt', {
      env,
      fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    }),
    (error) => error.code === 'AI_EMPTY_RESPONSE',
  );
});

test('generation maps auth and model failures to stable public errors', async () => {
  await assert.rejects(
    callAnthropic('system', 'prompt', {
      env,
      fetchImpl: async () => new Response('bad key', { status: 401 }),
    }),
    (error) => publicAiError(error).error === 'ai_auth_failed',
  );
  await assert.rejects(
    callAnthropic('system', 'prompt', {
      env,
      fetchImpl: async () => new Response('missing', { status: 404 }),
    }),
    (error) => publicAiError(error).error === 'ai_model_not_found',
  );
});
