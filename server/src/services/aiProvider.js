function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function compactDetail(value, max = 220) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function createAiError(code, message, options = {}) {
  const error = new Error(message);
  error.code = code;
  if (options.status) error.status = options.status;
  if (options.detail) error.detail = compactDetail(options.detail);
  if (options.model) error.model = options.model;
  if (options.cause) error.cause = options.cause;
  return error;
}

export function getAiProviderConfig(env = process.env) {
  const provider = String(env.AI_PROVIDER || 'openrouter').trim().toLowerCase();
  const requestTimeoutMs = boundedNumber(env.AI_REQUEST_TIMEOUT_MS, 90_000, 1_000, 300_000);
  const healthTimeoutMs = boundedNumber(env.AI_HEALTH_TIMEOUT_MS, 5_000, 250, 30_000);

  if (provider === 'anthropic') {
    const apiKey = String(env.ANTHROPIC_API_KEY || '').trim();
    const model = String(env.ANTHROPIC_MODEL || 'claude-sonnet-4-6').trim();
    return {
      provider,
      supported: true,
      configured: Boolean(apiKey && model),
      apiKey,
      model,
      visionModel: model,
      maxTokens: boundedNumber(env.ANTHROPIC_MAX_TOKENS, 4_000, 1, 32_000),
      baseUrl: String(env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, ''),
      requestTimeoutMs,
      healthTimeoutMs,
    };
  }

  if (provider === 'openrouter') {
    const apiKey = String(env.OPENROUTER_API_KEY || '').trim();
    const model = String(env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash').trim();
    return {
      provider,
      supported: true,
      configured: Boolean(apiKey && model),
      apiKey,
      model,
      visionModel: String(env.OPENROUTER_VISION_MODEL || 'openai/gpt-4o-mini').trim(),
      maxTokens: boundedNumber(env.OPENROUTER_MAX_TOKENS || env.ANTHROPIC_MAX_TOKENS, 4_000, 1, 32_000),
      baseUrl: String(env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, ''),
      requestTimeoutMs,
      healthTimeoutMs,
    };
  }

  return {
    provider,
    supported: false,
    configured: false,
    apiKey: '',
    model: '',
    visionModel: '',
    maxTokens: 4_000,
    baseUrl: '',
    requestTimeoutMs,
    healthTimeoutMs,
  };
}

export function publicAiProviderConfig(env = process.env) {
  const cfg = getAiProviderConfig(env);
  return {
    provider: cfg.provider,
    supported: cfg.supported,
    configured: cfg.configured,
    model: cfg.configured ? cfg.model : null,
    visionModel: cfg.configured ? cfg.visionModel : null,
  };
}

export function requireAiProviderConfig(env = process.env) {
  const cfg = getAiProviderConfig(env);
  if (!cfg.supported) {
    throw createAiError('AI_PROVIDER_INVALID', `不支持的 AI Provider：${cfg.provider || '(empty)'}`);
  }
  if (!cfg.configured) {
    throw createAiError('AI_UNCONFIGURED', `${cfg.provider} 的 API key 或模型未配置`);
  }
  return cfg;
}

function networkError(error) {
  const code = String(error?.cause?.code || error?.code || '').toUpperCase();
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return createAiError('AI_DNS_FAILED', 'AI Provider 域名解析失败', { cause: error });
  }
  if (code === 'ECONNREFUSED') {
    return createAiError('AI_CONNECTION_REFUSED', 'AI Provider 拒绝连接', { cause: error });
  }
  if (code === 'ECONNRESET') {
    return createAiError('AI_CONNECTION_RESET', 'AI Provider 重置了连接', { cause: error });
  }
  return createAiError('AI_NETWORK_FAILED', '无法连接 AI Provider', { cause: error });
}

export async function fetchWithTimeout(url, init = {}, options = {}) {
  const timeoutMs = boundedNumber(options.timeoutMs, 90_000, 1, 300_000);
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal?.aborted) abortFromUpstream();
  else upstreamSignal?.addEventListener('abort', abortFromUpstream, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw createAiError('AI_TIMEOUT', `AI Provider 请求超过 ${timeoutMs}ms`, { cause: error });
    }
    throw networkError(error);
  } finally {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener('abort', abortFromUpstream);
  }
}

export function providerHttpError(status, detail, model) {
  if (status === 401 || status === 403) {
    return createAiError('AI_AUTH_FAILED', 'AI Provider 鉴权失败，请检查 API key', { status });
  }
  if (status === 404) {
    return createAiError('AI_MODEL_NOT_FOUND', `AI 模型不可用：${model}`, { status, model });
  }
  if (status === 429) {
    return createAiError('AI_RATE_LIMITED', 'AI Provider 当前限流或额度不足', { status });
  }
  return createAiError('AI_HTTP_ERROR', `AI Provider 返回 HTTP ${status}`, {
    status,
    detail: compactDetail(detail),
  });
}

export function publicAiError(error) {
  const codeMap = {
    AI_PROVIDER_INVALID: 'ai_provider_invalid',
    AI_UNCONFIGURED: 'ai_unconfigured',
    AI_TIMEOUT: 'ai_timeout',
    AI_AUTH_FAILED: 'ai_auth_failed',
    AI_MODEL_NOT_FOUND: 'ai_model_not_found',
    AI_RATE_LIMITED: 'ai_rate_limited',
    AI_EMPTY_RESPONSE: 'ai_empty_response',
    AI_INVALID_RESPONSE: 'ai_invalid_response',
    AI_DNS_FAILED: 'ai_dns_failed',
    AI_CONNECTION_REFUSED: 'ai_connection_refused',
    AI_CONNECTION_RESET: 'ai_connection_reset',
    AI_NETWORK_FAILED: 'ai_network_failed',
    AI_HTTP_ERROR: 'ai_provider_error',
  };
  const code = codeMap[error?.code] || 'ai_failed';
  return {
    error: code,
    detail: compactDetail(error?.message || error?.detail || 'AI Provider 调用失败', 400),
  };
}

export function aiErrorHttpStatus(error) {
  if (error?.code === 'AI_TIMEOUT') return 504;
  if (['AI_PROVIDER_INVALID', 'AI_UNCONFIGURED', 'AI_AUTH_FAILED', 'AI_MODEL_NOT_FOUND', 'AI_RATE_LIMITED'].includes(error?.code)) return 503;
  return 502;
}

const runtime = {
  version: 0,
  lastSuccessfulAt: null,
  lastFailureAt: null,
  lastError: '',
  consecutiveFailures: 0,
};

export function recordAiProviderSuccess(at = new Date()) {
  runtime.version += 1;
  runtime.lastSuccessfulAt = at.toISOString();
  runtime.lastError = '';
  runtime.consecutiveFailures = 0;
}

export function recordAiProviderFailure(error, at = new Date()) {
  runtime.version += 1;
  runtime.lastFailureAt = at.toISOString();
  runtime.lastError = publicAiError(error).error;
  runtime.consecutiveFailures += 1;
}

export function getAiProviderRuntimeStatus() {
  return { ...runtime };
}

export function resetAiProviderRuntimeStatus() {
  runtime.version = 0;
  runtime.lastSuccessfulAt = null;
  runtime.lastFailureAt = null;
  runtime.lastError = '';
  runtime.consecutiveFailures = 0;
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch (error) {
    throw createAiError('AI_INVALID_RESPONSE', 'AI Provider 返回了无法解析的响应', { cause: error });
  }
}

export async function probeAiProvider(options = {}) {
  let cfg;
  const startedAt = Date.now();
  try {
    cfg = requireAiProviderConfig(options.env || process.env);
    const timeoutMs = options.timeoutMs || cfg.healthTimeoutMs;
    const fetchImpl = options.fetchImpl;

    if (cfg.provider === 'openrouter') {
      const headers = { authorization: `Bearer ${cfg.apiKey}`, accept: 'application/json' };
      const results = await Promise.allSettled([
        fetchWithTimeout(`${cfg.baseUrl}/auth/key`, { headers }, { timeoutMs, fetchImpl }),
        fetchWithTimeout(`${cfg.baseUrl}/models`, { headers }, { timeoutMs, fetchImpl }),
      ]);
      const rejected = results.find((result) => result.status === 'rejected');
      if (rejected) {
        await Promise.all(results
          .filter((result) => result.status === 'fulfilled')
          .map((result) => result.value.body?.cancel().catch(() => null)));
        throw rejected.reason;
      }
      const [authResponse, modelsResponse] = results.map((result) => result.value);
      if (!authResponse.ok) {
        const detail = await authResponse.text().catch(() => '');
        await modelsResponse.body?.cancel().catch(() => null);
        throw providerHttpError(authResponse.status, detail, cfg.model);
      }
      if (!modelsResponse.ok) {
        await authResponse.arrayBuffer().catch(() => null);
        const detail = await modelsResponse.text().catch(() => '');
        throw providerHttpError(modelsResponse.status, detail, cfg.model);
      }
      await authResponse.arrayBuffer().catch(() => null);
      const models = await responseJson(modelsResponse);
      const exists = Array.isArray(models?.data) && models.data.some((item) => item?.id === cfg.model);
      if (!exists) throw createAiError('AI_MODEL_NOT_FOUND', `AI 模型不可用：${cfg.model}`, { model: cfg.model });
    } else {
      const response = await fetchWithTimeout(`${cfg.baseUrl}/v1/models`, {
        headers: {
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          accept: 'application/json',
        },
      }, { timeoutMs, fetchImpl });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw providerHttpError(response.status, detail, cfg.model);
      }
      const models = await responseJson(response);
      const exists = Array.isArray(models?.data) && models.data.some((item) => item?.id === cfg.model);
      if (!exists) throw createAiError('AI_MODEL_NOT_FOUND', `AI 模型不可用：${cfg.model}`, { model: cfg.model });
    }

    recordAiProviderSuccess();
    return {
      ...publicAiProviderConfig(options.env || process.env),
      connected: true,
      error: '',
      detail: '',
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    recordAiProviderFailure(error);
    const config = publicAiProviderConfig(options.env || process.env);
    const publicError = publicAiError(error);
    return {
      ...config,
      connected: false,
      ...publicError,
      elapsedMs: Date.now() - startedAt,
    };
  }
}

export { createAiError };
