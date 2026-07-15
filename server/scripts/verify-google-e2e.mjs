const baseUrl = String(process.env.E2E_BASE_URL || '').replace(/\/+$/, '');
const username = String(process.env.E2E_USERNAME || 'boss');
const password = String(process.env.E2E_PASSWORD || '');
const providers = String(process.env.E2E_PROVIDERS || 'gsc,ga4,ads')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (!baseUrl || !password) {
  throw new Error('Set E2E_BASE_URL and E2E_PASSWORD before running this check.');
}

let cookie = '';

function jsonBody(value) {
  return value == null ? undefined : JSON.stringify(value);
}

function readSetCookie(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie().map((item) => item.split(';', 1)[0]).join('; ');
  }
  const value = response.headers.get('set-cookie') || '';
  return value.split(',').map((item) => item.trim().split(';', 1)[0]).filter(Boolean).join('; ');
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body == null ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      ...(options.headers || {}),
    },
    body: jsonBody(options.body),
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const detail = body && typeof body === 'object' ? (body.error || body.message || '') : String(body || '');
    throw new Error(`${options.method || 'GET'} ${path} -> HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return body;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function providerRange(provider) {
  const today = new Date();
  const end = new Date(today);
  if (provider === 'gsc') end.setUTCDate(end.getUTCDate() - 1);
  const date = isoDate(end);
  return { start_date: date, end_date: date };
}

async function verifyProvider(provider) {
  const range = providerRange(provider);
  const action = await request('/api/hermes/actions', {
    method: 'POST',
    body: {
      action_type: `sync_${provider}`,
      title: `E2E verify ${provider}`,
      input: range,
      idempotency_key: `e2e-google-sync:${provider}:${Date.now()}`,
    },
  });
  const actionId = action?.action?.id;
  if (!actionId) throw new Error(`sync_${provider} did not return an action id`);

  await request(`/api/hermes/actions/${actionId}/approve`, { method: 'POST', body: {} });
  const executed = await request(`/api/hermes/actions/${actionId}/execute`, { method: 'POST', body: {} });
  const result = executed?.action?.result || {};
  const verified = await request(`/api/hermes/actions/${actionId}/verify`, {
    method: 'POST',
    body: { note: `Verified ${provider} sync result through the deployed Hermes action path.` },
  });

  return {
    provider,
    actionId,
    status: verified?.action?.status || null,
    runId: result.runId || null,
    rowsWritten: Number(result.rowsWritten || 0),
    range,
  };
}

const login = await fetch(`${baseUrl}/api/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username, password }),
});
if (!login.ok) throw new Error(`POST /api/login -> HTTP ${login.status}`);
cookie = readSetCookie(login);
if (!cookie) throw new Error('Login succeeded but no session cookie was returned.');

const status = await request('/api/google/status');
const unauthorized = providers.filter((provider) => !status?.providers?.[provider]?.authorized);
if (unauthorized.length) {
  throw new Error(`OAuth authorization required for: ${unauthorized.join(', ')}`);
}

const results = [];
for (const provider of providers) results.push(await verifyProvider(provider));

const freshness = {};
for (const result of results) {
  const query = new URLSearchParams(result.range).toString();
  freshness[result.provider] = await request(`/api/data-freshness?${query}`);
}
const failed = results.filter((result) => result.status !== 'verified');
if (failed.length) throw new Error(`Actions not verified: ${failed.map((result) => result.provider).join(', ')}`);

console.log(JSON.stringify({
  ok: true,
  providers: results,
  freshness: Object.fromEntries(providers.map((provider) => [provider, freshness[provider]?.[provider] || null])),
}, null, 2));
