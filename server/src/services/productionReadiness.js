import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { db as defaultDb } from '../db/connection.js';
import * as googleRepo from '../db/repositories/googleSync.js';
import { probeAiProvider, publicAiProviderConfig } from './aiProvider.js';
import { syncGsc } from '../sync/gsc.js';
import { syncGa4 } from '../sync/ga4.js';
import { syncAds } from '../sync/ads.js';

const PROVIDERS = ['gsc', 'ga4', 'ads'];
const SYNCERS = { gsc: syncGsc, ga4: syncGa4, ads: syncAds };
const PROVIDER_LABELS = { gsc: 'Google Search Console', ga4: 'GA4', ads: 'Google Ads' };
const DATA_TABLES = {
  gsc: ['gsc_daily', 'gsc_query_daily'],
  ga4: ['ga4_daily', 'ga4_event_daily'],
  ads: ['google_ads_campaign_daily', 'google_ads_search_term_daily'],
};
const WEAK_SECRETS = new Set([
  '',
  'dev-insecure-secret-change-me',
  'change-me-to-a-long-random-string',
  'change-me',
]);
const READINESS_META_KEY = 'production_readiness.latest_live';
const CHECK_STATUSES = new Set(['pass', 'warn', 'unverified', 'fail']);
const CHECK_SEVERITIES = new Set(['P0', 'P1']);
const SENSITIVE_EVIDENCE_KEY = /(secret|token|password|api.?key|credential|authorization|cookie)/i;

function compact(value, max = 300) {
  return String(value || '')
    .replace(/(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\bsk-[a-z0-9_-]{8,}\b/gi, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function publicEvidence(value, depth = 0) {
  if (depth > 4 || value == null) return value == null ? null : compact(value);
  if (typeof value === 'string') return compact(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => publicEvidence(item, depth + 1));
  if (typeof value !== 'object') return compact(value);

  const out = {};
  for (const [key, item] of Object.entries(value).slice(0, 50)) {
    if (SENSITIVE_EVIDENCE_KEY.test(key)) continue;
    out[key] = publicEvidence(item, depth + 1);
  }
  return out;
}

function normalizedIso(value) {
  const parsed = new Date(value || Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function configurationFingerprint(parts) {
  return createHash('sha256')
    .update(JSON.stringify(parts.map((part) => String(part || '').trim())))
    .digest('hex');
}

function aiConfigurationFingerprint(env, config) {
  const provider = config?.provider || '';
  const apiKey = provider === 'anthropic'
    ? env.ANTHROPIC_API_KEY
    : (provider === 'openrouter' ? env.OPENROUTER_API_KEY : '');
  const baseUrl = provider === 'anthropic' ? env.ANTHROPIC_BASE_URL : env.OPENROUTER_BASE_URL;
  return configurationFingerprint([provider, config?.model, apiKey, baseUrl]);
}

function googleConfigurationFingerprint(env, project, provider) {
  const source = provider === 'gsc'
    ? (project?.gsc_site_url || env.GSC_SITE_URL)
    : (provider === 'ga4'
      ? (project?.ga4_property_id || env.GA4_PROPERTY_ID)
      : (project?.ads_customer_id || env.GOOGLE_ADS_CUSTOMER_ID));
  return configurationFingerprint([
    provider,
    project?.id,
    project?.name,
    source,
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
    env.GOOGLE_OAUTH_REDIRECT_URI,
    provider === 'ads' ? env.GOOGLE_ADS_DEVELOPER_TOKEN : '',
    provider === 'ads' ? env.GOOGLE_ADS_LOGIN_CUSTOMER_ID : '',
  ]);
}

export function sanitizeProductionReadinessReport(report) {
  const checks = (Array.isArray(report?.checks) ? report.checks : [])
    .slice(0, 100)
    .map((check) => ({
      id: compact(check?.id, 100),
      severity: CHECK_SEVERITIES.has(check?.severity) ? check.severity : 'P1',
      status: CHECK_STATUSES.has(check?.status) ? check.status : 'unverified',
      title: compact(check?.title, 160),
      detail: compact(check?.detail, 500),
      evidence: publicEvidence(check?.evidence || {}),
    }))
    .filter((check) => check.id && check.title);
  const counts = checks.reduce((out, check) => {
    out[check.status] = (out[check.status] || 0) + 1;
    return out;
  }, {});
  const verdict = checks.length === 0
    ? 'not_verified'
    : (counts.fail ? 'fail' : (counts.unverified ? 'not_verified' : 'pass'));
  return {
    version: 1,
    checkedAt: normalizedIso(report?.checkedAt),
    mode: report?.mode === 'live' ? 'live' : 'static',
    verdict,
    ready: verdict === 'pass',
    acceptanceDate: /^\d{4}-\d{2}-\d{2}$/.test(String(report?.acceptanceDate || ''))
      ? String(report.acceptanceDate)
      : null,
    counts,
    checks,
  };
}

export function recordProductionReadinessReport(report, options = {}) {
  const db = options.db || defaultDb;
  const sanitized = sanitizeProductionReadinessReport(report);
  if (sanitized.mode !== 'live') throw new Error('production_readiness_live_report_required');
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run(READINESS_META_KEY, JSON.stringify(sanitized));
  return sanitized;
}

export function loadLatestProductionReadinessReport(options = {}) {
  const db = options.db || defaultDb;
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(READINESS_META_KEY);
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value);
    if (parsed?.mode !== 'live') return null;
    return sanitizeProductionReadinessReport(parsed);
  } catch {
    return null;
  }
}

function result(id, severity, status, title, detail, evidence = {}) {
  return { id, severity, status, title, detail: compact(detail), evidence };
}

function validSecret(value) {
  const secret = String(value || '').trim();
  return secret.length >= 32 && !WEAK_SECRETS.has(secret);
}

function defaultProject(db) {
  return db.prepare(
    `SELECT id, name, gsc_site_url, ga4_property_id, ads_customer_id
       FROM google_projects
      WHERE active = 1
      ORDER BY is_default DESC, id ASC
      LIMIT 1`
  ).get() || null;
}

function googleMissing(env, project, provider) {
  const missing = [];
  if (!String(env.GOOGLE_OAUTH_CLIENT_ID || '').trim()) missing.push('GOOGLE_OAUTH_CLIENT_ID');
  if (!String(env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim()) missing.push('GOOGLE_OAUTH_CLIENT_SECRET');
  if (!String(env.GOOGLE_OAUTH_REDIRECT_URI || '').trim()) missing.push('GOOGLE_OAUTH_REDIRECT_URI');
  if (provider === 'gsc' && !String(project?.gsc_site_url || env.GSC_SITE_URL || '').trim()) {
    missing.push('GSC site URL');
  }
  if (provider === 'ga4' && !String(project?.ga4_property_id || env.GA4_PROPERTY_ID || '').trim()) {
    missing.push('GA4 property ID');
  }
  if (provider === 'ads') {
    if (!String(env.GOOGLE_ADS_DEVELOPER_TOKEN || '').trim()) missing.push('GOOGLE_ADS_DEVELOPER_TOKEN');
    if (!String(project?.ads_customer_id || env.GOOGLE_ADS_CUSTOMER_ID || '').trim()) {
      missing.push('Google Ads customer ID');
    }
  }
  return missing;
}

function latestRun(db, provider) {
  return db.prepare(
    `SELECT status, rows_written rowsWritten, started_at startedAt,
            finished_at finishedAt, error
       FROM google_sync_runs
      WHERE provider = ?
      ORDER BY started_at DESC, id DESC
      LIMIT 1`
  ).get(provider) || null;
}

function dataEvidence(db, provider) {
  const tables = DATA_TABLES[provider];
  const rows = tables.map((table) => {
    const item = db.prepare(`SELECT COUNT(*) rowCount, MAX(date) lastDate FROM ${table}`).get();
    return { table, rowCount: item.rowCount || 0, lastDate: item.lastDate || null };
  });
  const missingTables = rows.filter((row) => row.rowCount === 0).map((row) => row.table);
  return {
    rows,
    totalRows: rows.reduce((sum, row) => sum + row.rowCount, 0),
    complete: missingTables.length === 0,
    missingTables,
  };
}

function acceptanceDate(value, now = new Date()) {
  if (value) {
    const date = String(value);
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
      || Number.isNaN(parsed.getTime())
      || parsed.toISOString().slice(0, 10) !== date) {
      throw new Error('acceptance_date_invalid');
    }
    return date;
  }
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - 3);
  return date.toISOString().slice(0, 10);
}

export async function verifyBackupRestore(db, options = {}) {
  const dir = mkdtempSync(join(options.baseDir || tmpdir(), 'ferr-production-readiness-'));
  const backupFile = join(dir, 'ferr-restore-smoke.sqlite');
  let restored;
  try {
    await db.backup(backupFile);
    restored = new (options.DatabaseCtor || Database)(backupFile, { readonly: true, fileMustExist: true });
    const integrity = restored.pragma('integrity_check', { simple: true });
    const required = ['users', 'google_sync_runs', 'hermes_conversations'];
    const tables = new Set(restored.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
    const missingTables = required.filter((table) => !tables.has(table));
    return {
      ok: integrity === 'ok' && missingTables.length === 0,
      integrity,
      missingTables,
    };
  } finally {
    restored?.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function checkProductionReadiness(options = {}) {
  const env = options.env || process.env;
  const db = options.db || defaultDb;
  const live = options.live === true;
  const checks = [];
  const project = defaultProject(db);
  const tokenStatusFn = options.tokenStatusFn || googleRepo.tokenStatus;
  const syncers = options.syncers || SYNCERS;
  const aiProbe = options.aiProbe || probeAiProvider;
  const backupVerifier = options.backupVerifier || verifyBackupRestore;
  const date = acceptanceDate(options.date, options.now || new Date());
  const productionMode = env.NODE_ENV === 'production';
  const canRunLive = live && productionMode;

  checks.push(result(
    'runtime.production', 'P1', productionMode ? 'pass' : 'fail',
    '生产运行模式', productionMode ? 'NODE_ENV=production' : 'NODE_ENV 不是 production；已禁止实时探测与同步',
    { mode: env.NODE_ENV || '(unset)' }
  ));

  const jwtSecret = String(env.JWT_SECRET || '').trim();
  checks.push(result(
    'security.jwt_secret', 'P0', validSecret(jwtSecret) ? 'pass' : 'fail',
    'JWT 密钥', validSecret(jwtSecret) ? '已配置有效随机密钥' : '缺少至少 32 字符的非默认 JWT_SECRET'
  ));

  const settingsSecret = String(env.SETTINGS_SECRET || '').trim();
  const settingsReady = validSecret(settingsSecret) && settingsSecret !== jwtSecret;
  checks.push(result(
    'security.settings_secret', 'P0', settingsReady ? 'pass' : 'fail',
    '凭据加密密钥', settingsReady
      ? 'SETTINGS_SECRET 已配置且与 JWT_SECRET 独立'
      : 'SETTINGS_SECRET 必须是至少 32 字符且不同于 JWT_SECRET 的随机值'
  ));

  const aiConfig = publicAiProviderConfig(env);
  const aiConfigFingerprint = aiConfigurationFingerprint(env, aiConfig);
  checks.push(result(
    'hermes.provider_config', 'P0', aiConfig.supported && aiConfig.configured ? 'pass' : 'fail',
    'Hermes Provider 配置', aiConfig.supported && aiConfig.configured
      ? `${aiConfig.provider} / ${aiConfig.model}`
      : 'AI Provider、API key 或模型未正确配置',
    { provider: aiConfig.provider, model: aiConfig.model, configurationFingerprint: aiConfigFingerprint }
  ));

  if (canRunLive && aiConfig.supported && aiConfig.configured) {
    const probe = await aiProbe({ env });
    checks.push(result(
      'hermes.live_probe', 'P0', probe.connected ? 'pass' : 'fail',
      'Hermes 密钥与模型实时验证', probe.connected
        ? `${probe.provider} 已鉴权，模型 ${probe.model} 可用`
        : (probe.detail || probe.error || 'Hermes Provider 实时验证失败'),
      {
        provider: probe.provider,
        model: probe.model,
        error: probe.error || null,
        elapsedMs: probe.elapsedMs,
        configurationFingerprint: aiConfigFingerprint,
      }
    ));
  } else {
    checks.push(result(
      'hermes.live_probe', 'P0', 'unverified',
      'Hermes 密钥与模型实时验证', !live
        ? '未使用 --live，不能证明生产密钥和模型真实可用'
      : (!productionMode ? '非 production 环境，已拒绝实时探测' : 'Provider 静态配置未通过，未执行实时探测'),
      { configurationFingerprint: aiConfigFingerprint }
    ));
  }

  let tokens;
  try {
    tokens = tokenStatusFn();
  } catch (error) {
    tokens = {};
    checks.push(result(
      'google.credentials', 'P0', 'fail',
      'Google OAuth 凭据读取', error?.reason || error?.message || 'Google OAuth 凭据读取失败'
    ));
  }

  for (const provider of PROVIDERS) {
    const label = PROVIDER_LABELS[provider];
    const missing = googleMissing(env, project, provider);
    const configFingerprint = googleConfigurationFingerprint(env, project, provider);
    checks.push(result(
      `google.${provider}.config`, 'P0', missing.length ? 'fail' : 'pass',
      `${label} 配置`, missing.length ? `缺少：${missing.join(', ')}` : 'OAuth 与数据源标识已配置',
      { project: project?.name || 'Env default', missing, configurationFingerprint: configFingerprint }
    ));

    const token = tokens?.[provider];
    checks.push(result(
      `google.${provider}.oauth`, 'P0', token?.authorized ? 'pass' : 'fail',
      `${label} OAuth`, token?.authorized
        ? `授权凭据可解密，最近更新 ${token.updatedAt || '未知'}`
        : (token?.credentialError || '尚未授权或缺少可用 refresh token'),
      { authorized: Boolean(token?.authorized), updatedAt: token?.updatedAt || null }
    ));

    if (canRunLive && !missing.length && token?.authorized) {
      try {
        const sync = await syncers[provider]({ start_date: date, end_date: date });
        checks.push(result(
          `google.${provider}.live_sync`, 'P0', 'pass',
          `${label} 真实同步`, `${date} 同步成功，写入 ${Number(sync?.rowsWritten || 0)} 行`,
          {
            date,
            runId: sync?.runId || null,
            rowsWritten: Number(sync?.rowsWritten || 0),
            configurationFingerprint: configFingerprint,
          }
        ));
      } catch (error) {
        checks.push(result(
          `google.${provider}.live_sync`, 'P0', 'fail',
          `${label} 真实同步`, error?.message || error || '同步失败',
          { date, configurationFingerprint: configFingerprint }
        ));
      }
    } else {
      checks.push(result(
        `google.${provider}.live_sync`, 'P0', 'unverified',
        `${label} 真实同步`, !live
          ? '未使用 --live，不能证明 OAuth、权限和真实数据同步可用'
          : (!productionMode ? '非 production 环境，已拒绝真实同步' : '配置或 OAuth 未通过，未执行真实同步'),
        { date, configurationFingerprint: configFingerprint }
      ));
    }

    const run = latestRun(db, provider);
    checks.push(result(
      `google.${provider}.latest_run`, 'P1', run?.status === 'success' ? 'pass' : (run ? 'fail' : 'unverified'),
      `${label} 最近同步记录`, run
        ? `${run.status}；写入 ${Number(run.rowsWritten || 0)} 行；完成时间 ${run.finishedAt || '未完成'}${run.error ? `；${run.error}` : ''}`
        : '没有同步记录',
      run ? { status: run.status, rowsWritten: Number(run.rowsWritten || 0), finishedAt: run.finishedAt || null } : {}
    ));

    const evidence = dataEvidence(db, provider);
    checks.push(result(
      `google.${provider}.data_evidence`, 'P1', evidence.complete ? 'pass' : 'unverified',
      `${label} 真实数据证据`, evidence.complete
        ? `全部必需事实表均有数据，共 ${evidence.totalRows} 行`
        : `缺少真实明细：${evidence.missingTables.join(', ')}`,
      evidence
    ));
  }

  checks.push(result(
    'operations.auto_sync', 'P1', env.SYNC_AUTO === 'false' ? 'warn' : 'pass',
    '自动同步', env.SYNC_AUTO === 'false' ? 'SYNC_AUTO=false，生产数据不会自动刷新' : '自动同步未被关闭'
  ));

  const integrity = db.pragma('quick_check', { simple: true });
  checks.push(result(
    'database.quick_check', 'P0', integrity === 'ok' ? 'pass' : 'fail',
    '当前数据库完整性', integrity === 'ok' ? 'SQLite quick_check=ok' : `SQLite quick_check=${integrity}`
  ));

  if (canRunLive) {
    try {
      const backup = await backupVerifier(db, options.backupOptions);
      checks.push(result(
        'database.backup_restore', 'P0', backup.ok ? 'pass' : 'fail',
        '备份恢复冒烟验证', backup.ok
          ? '在线备份可打开，integrity_check=ok，核心表存在'
          : `备份恢复验证失败；缺少表：${(backup.missingTables || []).join(', ') || '无'}`,
        { integrity: backup.integrity, missingTables: backup.missingTables || [] }
      ));
    } catch (error) {
      checks.push(result(
        'database.backup_restore', 'P0', 'fail',
        '备份恢复冒烟验证', error?.message || error || '备份恢复验证失败'
      ));
    }
  } else {
    checks.push(result(
      'database.backup_restore', 'P0', 'unverified',
      '备份恢复冒烟验证', !live
        ? '未使用 --live，尚未创建临时备份并验证恢复可读性'
        : '非 production 环境，已拒绝执行生产验收动作'
    ));
  }

  const counts = checks.reduce((out, check) => {
    out[check.status] = (out[check.status] || 0) + 1;
    return out;
  }, {});
  const verdict = counts.fail ? 'fail' : (counts.unverified ? 'not_verified' : 'pass');
  return {
    version: 1,
    checkedAt: new Date(options.now || Date.now()).toISOString(),
    mode: canRunLive ? 'live' : 'static',
    verdict,
    ready: verdict === 'pass',
    acceptanceDate: date,
    counts,
    checks,
  };
}
