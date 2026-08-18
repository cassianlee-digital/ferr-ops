import { db as defaultDb } from '../db/connection.js';
import {
  checkProductionReadiness,
  loadLatestProductionReadinessReport,
  sanitizeProductionReadinessReport,
} from './productionReadiness.js';

const STATUS_ORDER = { fail: 0, unverified: 1, warn: 2, pass: 3 };
const LIVE_CHECK_IDS = new Set([
  'hermes.live_probe',
  'google.gsc.live_sync',
  'google.ga4.live_sync',
  'google.ads.live_sync',
  'database.backup_restore',
]);

function liveCheckApplies(id, currentById, liveCheck) {
  if (!liveCheck) return false;
  if (id === 'database.backup_restore') return true;

  const dependencyIds = id === 'hermes.live_probe'
    ? ['hermes.provider_config']
    : [`${id.replace(/\.live_sync$/, '')}.config`, `${id.replace(/\.live_sync$/, '')}.oauth`];
  const dependencies = dependencyIds.map((dependencyId) => currentById.get(dependencyId));
  if (dependencies.some((dependency) => dependency?.status !== 'pass')) return false;

  const currentFingerprint = dependencies[0]?.evidence?.configurationFingerprint;
  const liveFingerprint = liveCheck.evidence?.configurationFingerprint;
  return Boolean(currentFingerprint && liveFingerprint && currentFingerprint === liveFingerprint);
}

function ownerFor(id) {
  if (id.startsWith('google.gsc.')) return 'SEO 负责人';
  if (id.startsWith('google.ads.')) return 'SEM 负责人';
  if (id.startsWith('google.ga4.')) return '运营主管';
  if (id.startsWith('hermes.')) return '运营主管 / 系统管理员';
  if (id.startsWith('security.') || id.startsWith('database.') || id.startsWith('runtime.')) {
    return '系统管理员';
  }
  return '运营主管';
}

function nextActionFor(check) {
  if (check.status === 'pass') return '保持现状，并在下次发布或例行验收时复查。';
  if (check.id === 'runtime.production') return '在生产部署环境设置 NODE_ENV=production 后重新验收。';
  if (check.id === 'security.jwt_secret') return '在服务器环境变量中配置独立的强 JWT_SECRET，重启后复查。';
  if (check.id === 'security.settings_secret') return '配置独立于 JWT_SECRET 的强 SETTINGS_SECRET，重启后复查。';
  if (check.id === 'hermes.provider_config') return '核对 AI Provider、模型和服务器端 API key 配置。';
  if (check.id === 'hermes.live_probe') return check.status === 'unverified'
    ? '在生产服务器执行 npm run verify:production -- --live，并保存验收结果。'
    : '检查 Provider 鉴权、模型可用性和服务器网络，再运行生产验收。';
  if (/^google\.(gsc|ga4|ads)\.config$/.test(check.id)) return '补齐服务器端 Google 配置和对应数据源标识。';
  if (/^google\.(gsc|ga4|ads)\.oauth$/.test(check.id)) return '在后台重新完成对应 Google 数据源授权。';
  if (/^google\.(gsc|ga4|ads)\.live_sync$/.test(check.id)) return check.status === 'unverified'
    ? '在生产服务器运行一次带 --live 的真实验收同步。'
    : '根据同步错误检查 OAuth 权限、账号范围和数据源标识后重试。';
  if (/^google\.(gsc|ga4|ads)\.latest_run$/.test(check.id)) return '触发一次真实同步，并核对最近同步记录和失败原因。';
  if (/^google\.(gsc|ga4|ads)\.data_evidence$/.test(check.id)) return '运行真实同步，确认所有必需事实表均写入明细数据。';
  if (check.id === 'operations.auto_sync') return '启用自动同步，或明确建立可追踪的人工同步排期。';
  if (check.id === 'database.quick_check') return '停止发布，先备份数据库并修复完整性问题。';
  if (check.id === 'database.backup_restore') return check.status === 'unverified'
    ? '在生产服务器运行带 --live 的备份恢复冒烟验收。'
    : '检查备份文件、存储空间和数据库完整性后重新验收。';
  return '查看当前证据，处理原因后重新验收。';
}

function summarize(items) {
  const summary = { total: items.length, open: 0, p0Open: 0, p1Open: 0, fail: 0, unverified: 0, warn: 0, pass: 0 };
  for (const item of items) {
    summary[item.status] += 1;
    if (item.status === 'pass') continue;
    summary.open += 1;
    if (item.severity === 'P0') summary.p0Open += 1;
    else summary.p1Open += 1;
  }
  return summary;
}

export async function buildRiskRegister(options = {}) {
  const db = options.db || defaultDb;
  const checkFn = options.checkFn || checkProductionReadiness;
  const loadLiveFn = options.loadLiveFn || loadLatestProductionReadinessReport;
  const current = sanitizeProductionReadinessReport(await checkFn({
    db,
    env: options.env || process.env,
    live: false,
    now: options.now,
  }));
  const live = loadLiveFn({ db });
  const liveChecks = new Map((live?.checks || []).map((check) => [check.id, check]));
  const currentById = new Map(current.checks.map((check) => [check.id, check]));

  const items = current.checks.map((currentCheck) => {
    const candidate = LIVE_CHECK_IDS.has(currentCheck.id) ? liveChecks.get(currentCheck.id) : null;
    const liveCheck = liveCheckApplies(currentCheck.id, currentById, candidate) ? candidate : null;
    const staleLive = Boolean(candidate && !liveCheck);
    const check = liveCheck || currentCheck;
    return {
      id: currentCheck.id,
      severity: currentCheck.severity,
      status: check.status,
      title: currentCheck.title,
      detail: staleLive
        ? '当前配置或授权状态与上次生产实测不一致；旧结果不再适用，必须重新执行生产验收。'
        : check.detail,
      evidence: check.evidence || {},
      owner: ownerFor(currentCheck.id),
      updatedAt: liveCheck ? live.checkedAt : current.checkedAt,
      source: liveCheck ? 'production_live' : 'current_static',
      nextAction: nextActionFor({ ...check, id: currentCheck.id }),
    };
  }).sort((a, b) => (
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    || a.severity.localeCompare(b.severity)
    || a.title.localeCompare(b.title, 'zh-CN')
  ));

  return {
    version: 1,
    generatedAt: current.checkedAt,
    latestLiveAcceptance: live ? {
      available: true,
      checkedAt: live.checkedAt,
      acceptanceDate: live.acceptanceDate,
      verdict: live.verdict,
    } : { available: false, checkedAt: null, acceptanceDate: null, verdict: 'not_verified' },
    summary: summarize(items),
    items,
  };
}
