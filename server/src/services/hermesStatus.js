import { config } from '../config.js';

const RETRYABLE_HTTP = new Set([502, 503, 504]);
const RETRYABLE_ERRORS = new Set([
  'hermes_connection_refused',
  'hermes_connection_reset',
  'hermes_dns_failed',
  'hermes_network_failed',
  'hermes_timeout',
]);

function aiProvider() {
  return (process.env.AI_PROVIDER || 'openrouter').toLowerCase();
}

export function hermesGatewayStatus() {
  const provider = aiProvider();
  const configured = provider === 'anthropic'
    ? Boolean(config.anthropic.apiKey)
    : Boolean(process.env.OPENROUTER_API_KEY);
  const model = provider === 'anthropic'
    ? config.anthropic.model
    : (process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash');

  return {
    configured,
    connected: configured,
    provider,
    model: configured ? model : null,
    error: configured ? '' : 'ai_unconfigured',
  };
}

export function classifyHermesConnectionError(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return { error: 'hermes_timeout', detail: 'Hermes console health check timed out.' };
  }

  const code = String(error?.cause?.code || error?.code || '').toUpperCase();
  if (code === 'ECONNREFUSED') {
    return { error: 'hermes_connection_refused', detail: 'Hermes console refused the connection.' };
  }
  if (code === 'ECONNRESET') {
    return { error: 'hermes_connection_reset', detail: 'Hermes console reset the connection.' };
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return { error: 'hermes_dns_failed', detail: 'Hermes console hostname could not be resolved.' };
  }
  return { error: 'hermes_network_failed', detail: 'Hermes console could not be reached.' };
}

function validateConsoleUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function wait(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function probeOnce(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        'user-agent': 'ferr-ops-hermes-health/1.0',
      },
    });
    return {
      connected: response.ok,
      statusCode: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type') || '',
      error: response.ok ? '' : 'hermes_http_' + response.status,
      detail: response.ok ? '' : 'Hermes console returned HTTP ' + response.status + '.',
      retryable: RETRYABLE_HTTP.has(response.status),
    };
  } catch (error) {
    const classified = classifyHermesConnectionError(error);
    return { connected: false, ...classified, retryable: RETRYABLE_ERRORS.has(classified.error) };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeHermesConsole(rawUrl, options = {}) {
  if (!rawUrl) {
    return {
      configured: false,
      connected: false,
      error: 'hermes_url_missing',
      detail: 'HERMES_AGENT_URL is not configured on the server.',
      attempts: 0,
    };
  }

  const url = validateConsoleUrl(rawUrl);
  if (!url) {
    return {
      configured: true,
      connected: false,
      error: 'hermes_url_invalid',
      detail: 'HERMES_AGENT_URL must be an HTTP or HTTPS URL.',
      attempts: 0,
    };
  }

  const fetchImpl = options.fetchImpl || fetch;
  const attempts = Math.max(1, Math.min(Number(options.attempts ?? 2) || 2, 3));
  const timeoutMs = Math.max(250, Number(options.timeoutMs ?? 3500) || 3500);
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? 150) || 0);
  let result;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    result = await probeOnce(url, fetchImpl, timeoutMs);
    result.attempts = attempt;
    if (result.connected || !result.retryable || attempt === attempts) break;
    await wait(retryDelayMs * attempt);
  }

  const { retryable, ...publicResult } = result;
  return { configured: true, url, ...publicResult };
}
