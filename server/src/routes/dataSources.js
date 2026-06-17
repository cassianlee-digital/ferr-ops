// 数据源状态(只读)。诚实反映各源真实状态：人工录入源给真实统计；
// 同步源(GSC/GA4/Ads)同步未实现 → 只回配置布尔，绝不显示「已接入」；
// AI 只回是否配置(configured_unverified)，永不返回任何 key/secret。
import { requireAuth } from '../auth/middleware.js';
import { config } from '../config.js';
import * as inqRepo from '../db/repositories/inquiries.js';
import * as seoRepo from '../db/repositories/seoWeeks.js';
import * as semRepo from '../db/repositories/semWeeks.js';
import * as integrations from '../db/repositories/integrations.js';

// 人工录入源：真实统计 count + 最新日期；出错则 status='error'
function manualSource(label, listFn, dateKey) {
  try {
    const rows = listFn() || [];
    const count = rows.length;
    // list() 排序不一，统一取所有行里最大的日期作为 lastAt
    let lastAt = null;
    for (const r of rows) {
      const d = r[dateKey];
      if (d && (lastAt == null || d > lastAt)) lastAt = d;
    }
    return {
      type: 'manual',
      status: count > 0 ? 'available' : 'no_records',
      label,
      lastAt: lastAt ?? null,
      count,
      error: null,
    };
  } catch (e) {
    return { type: 'manual', status: 'error', label, lastAt: null, count: 0, error: String(e.message || e) };
  }
}

// 同步源：同步未实现(sync_runs / *_daily 表尚未建)。只回配置布尔，不伪装已接入。
// 注意：「未实现同步」是当前阶段状态，不是错误 → error 恒为 null，用 note 说明。
function syncSource(configured) {
  return {
    type: 'sync',
    status: configured ? 'configured_not_synced' : 'not_configured',
    label: '自动同步',
    configured: !!configured,
    lastSyncAt: null, // TODO(Phase 2): 接入 sync_runs 后回填最近同步时间
    error: null,
    note: 'sync_not_implemented',
    phase: 2,
  };
}

export async function dataSourcesRoutes(app) {
  app.get('/api/data-sources/status', { preHandler: requireAuth }, async () => {
    // 同步源配置布尔（integrations.status() 只返回 configured/updated_at，不含明文密钥）
    let integ = {};
    try {
      integ = integrations.status() || {};
    } catch {
      integ = {};
    }
    const cfg = (p) => !!(integ[p] && integ[p].configured);

    // AI：仅检测是否配置 key，不调用、不验证、绝不回 key
    const aiConfigured = !!config.anthropic.apiKey;

    return {
      sources: {
        inquiries: manualSource('人工录入', inqRepo.list, 'date'),
        seo_weeks: manualSource('人工周报', seoRepo.list, 'week_date'),
        sem_weeks: manualSource('人工周报', semRepo.list, 'week_date'),
        gsc: syncSource(cfg('gsc')),
        ga4: syncSource(cfg('ga4')),
        ads: syncSource(cfg('ads')),
        ai: {
          type: 'provider',
          status: aiConfigured ? 'configured_unverified' : 'not_configured',
          provider: 'anthropic',
          configured: aiConfigured,
          model: aiConfigured ? config.anthropic.model : null, // 模型名非密钥
          error: null,
        },
      },
    };
  });
}
