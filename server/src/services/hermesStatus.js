import {
  getAiProviderRuntimeStatus,
  probeAiProvider,
  publicAiProviderConfig,
} from './aiProvider.js';

let cache = null;
let inFlight = null;
let lastLoggedState = '';
let monitorTimer = null;

function cacheMs(env = process.env) {
  const value = Number(env.HERMES_HEALTH_CACHE_MS ?? 60_000);
  return Number.isFinite(value) ? Math.max(1_000, Math.min(600_000, value)) : 60_000;
}

function monitorIntervalMs(env = process.env) {
  const value = Number(env.HERMES_HEALTH_CHECK_INTERVAL_MS ?? 300_000);
  return Number.isFinite(value) ? Math.max(0, Math.min(3_600_000, value)) : 300_000;
}

function logStateChange(logger, status) {
  if (!logger) return;
  const key = [status.status, status.error, status.provider, status.model].join('|');
  if (key === lastLoggedState) return;
  lastLoggedState = key;
  const payload = {
    connected: status.connected,
    configured: status.configured,
    provider: status.provider,
    model: status.model,
    error: status.error || undefined,
    consecutiveFailures: status.consecutiveFailures,
    lastSuccessRecovered: status.lastSuccessRecovered,
    elapsedMs: status.elapsedMs,
  };
  if (status.status === 'available') logger.info(payload, 'Hermes AI provider available');
  else logger.warn(payload, 'Hermes AI provider not fully ready');
}

function publicStatus(probe, checkedAt) {
  const runtime = getAiProviderRuntimeStatus();
  const generationVerified = Boolean(runtime.lastSuccessfulAt || runtime.lastFailureAt);
  const generationReady = Boolean(probe.connected && runtime.lastSuccessfulAt && !runtime.consecutiveFailures);
  const status = !probe.connected
    ? (probe.error === 'ai_provider_invalid' ? 'invalid_provider' : (probe.configured ? 'unavailable' : 'not_configured'))
    : runtime.consecutiveFailures
      ? 'degraded'
      : runtime.lastSuccessRecovered
        ? 'recovered'
        : generationReady ? 'available' : 'connected_unverified';
  return {
    mode: 'local_ai',
    status,
    configured: probe.configured,
    connected: probe.connected,
    generationVerified,
    generationReady,
    provider: probe.provider,
    model: probe.model,
    visionModel: probe.visionModel,
    checkedAt,
    lastSuccessfulAt: runtime.lastSuccessfulAt,
    lastFailureAt: runtime.lastFailureAt,
    consecutiveFailures: runtime.consecutiveFailures,
    lastSuccessRecovered: runtime.lastSuccessRecovered,
    lastRecoveryAt: runtime.lastRecoveryAt,
    lastRecoveryReason: runtime.lastRecoveryReason,
    totalRecoveries: runtime.totalRecoveries,
    elapsedMs: probe.elapsedMs,
    error: probe.error || (runtime.consecutiveFailures ? runtime.lastError : ''),
    detail: probe.detail || '',
  };
}

export async function getHermesStatus(options = {}) {
  const now = options.now || (() => Date.now());
  const runtime = getAiProviderRuntimeStatus();
  if (!options.force && cache && cache.expiresAt > now() && cache.runtimeVersion === runtime.version) {
    return { ...cache.value, cached: true };
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const checkedAt = new Date(now()).toISOString();
    const probe = await probeAiProvider({
      env: options.env || process.env,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    });
    const value = publicStatus(probe, checkedAt);
    const afterProbe = getAiProviderRuntimeStatus();
    cache = {
      value,
      runtimeVersion: afterProbe.version,
      expiresAt: now() + cacheMs(options.env || process.env),
    };
    logStateChange(options.logger, value);
    return { ...value, cached: false };
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export function getHermesConfiguredStatus(env = process.env) {
  const config = publicAiProviderConfig(env);
  const runtime = getAiProviderRuntimeStatus();
  return {
    ...config,
    status: config.configured ? 'configured_unverified' : (config.supported ? 'not_configured' : 'invalid_provider'),
    connected: false,
    generationVerified: Boolean(runtime.lastSuccessfulAt || runtime.lastFailureAt),
    generationReady: false,
    checkedAt: null,
    lastSuccessfulAt: runtime.lastSuccessfulAt,
    lastFailureAt: runtime.lastFailureAt,
    consecutiveFailures: runtime.consecutiveFailures,
    lastSuccessRecovered: runtime.lastSuccessRecovered,
    lastRecoveryAt: runtime.lastRecoveryAt,
    lastRecoveryReason: runtime.lastRecoveryReason,
    totalRecoveries: runtime.totalRecoveries,
    error: config.supported ? '' : 'ai_provider_invalid',
  };
}

export function startHermesHealthMonitor(logger, options = {}) {
  if (monitorTimer) return monitorTimer;
  const env = options.env || process.env;
  const intervalMs = monitorIntervalMs(env);
  if (!intervalMs) return null;

  const run = () => {
    getHermesStatus({ force: true, logger, env }).catch((error) => {
      logger?.error({ err: error?.message || String(error) }, 'Hermes health monitor failed');
    });
  };
  run();
  monitorTimer = setInterval(run, intervalMs);
  monitorTimer.unref?.();
  return monitorTimer;
}

export function resetHermesStatusForTests() {
  cache = null;
  inFlight = null;
  lastLoggedState = '';
  if (monitorTimer) clearInterval(monitorTimer);
  monitorTimer = null;
}
