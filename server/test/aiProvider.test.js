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
  let malformedAttempts = 0;
  await assert.rejects(callAnthropic('system', 'prompt', {
    env,
    fetchImpl: async () => {
      malformedAttempts += 1;
      return new Response('{', { status: 200, headers: { 'content-type': 'application/json' } });
    },
  }), (error) => {
    assert.equal(error.code, 'AI_INVALID_RESPONSE');
    assert.match(error.message, /content_type=application\/json/);
    assert.match(error.message, /body_length=1/);
    assert.doesNotMatch(error.message, /test-key/);
    return true;
  });
  assert.equal(malformedAttempts, 2, '非法成功响应只允许重试一次');

  let attempts = 0;
  await assert.rejects(callAnthropic('system', 'prompt', {
    env,
    fetchImpl: async () => {
      attempts += 1;
      return new Response(JSON.stringify({
        choices: [{
          finish_reason: 'length',
          message: { content: '', reasoning: 'private reasoning', refusal: null },
        }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  }), (error) => {
    assert.equal(error.code, 'AI_EMPTY_RESPONSE');
    assert.match(error.message, /finish_reason=length/);
    assert.match(error.message, /reasoning_length=17/);
    assert.doesNotMatch(error.message, /private reasoning/);
    assert.doesNotMatch(error.message, /test-key/);
    return true;
  });
  assert.equal(attempts, 2, '空成功响应只允许重试一次');
});

test('generation recovers from one malformed OpenRouter success response', async () => {
  let attempts = 0;
  const result = await callAnthropic('system', 'prompt', {
      env,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response('', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'recovered json' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal(result, 'recovered json');
  assert.equal(attempts, 2);
});

test('generation accepts OpenRouter string, block-array, and legacy text responses', async () => {
  const cases = [
    [{ choices: [{ message: { content: ' direct answer ' } }] }, 'direct answer'],
    [{ choices: [{ message: { content: [
      { type: 'text', text: 'first' },
      { type: 'image_url', image_url: { url: 'ignored' } },
      { type: 'output_text', text: 'second' },
    ] } }] }, 'first\nsecond'],
    [{ choices: [{ text: ' legacy answer ', message: { content: null } }] }, 'legacy answer'],
    [{ choices: [{ text: ' legacy fallback ', message: { content: '   ' } }] }, 'legacy fallback'],
  ];

  for (const [payload, expected] of cases) {
    let attempts = 0;
    const result = await callAnthropic('system', 'prompt', {
      env,
      fetchImpl: async () => {
        attempts += 1;
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    assert.equal(result, expected);
    assert.equal(attempts, 1);
  }
});

test('generation retries one transient empty OpenRouter completion and then succeeds', async () => {
  let attempts = 0;
  const result = await callAnthropic('system', 'prompt', {
    env,
    fetchImpl: async () => {
      attempts += 1;
      const content = attempts === 1 ? null : 'recovered';
      return new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content, refusal: null } }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal(result, 'recovered');
  assert.equal(attempts, 2);
});

test('generation does not retry an explicit provider refusal', async () => {
  let attempts = 0;
  await assert.rejects(callAnthropic('system', 'prompt', {
    env,
    fetchImpl: async () => {
      attempts += 1;
      return new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: '', refusal: 'blocked' } }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  }), (error) => error.code === 'AI_EMPTY_RESPONSE'
    && /拒绝生成可用内容/.test(error.message)
    && /refused=true/.test(error.message));
  assert.equal(attempts, 1);
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
