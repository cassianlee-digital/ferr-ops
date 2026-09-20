// KPI 目标/评分 API（FR-4）。读：所有登录用户；改目标：仅老板(boss)。
// 实际值不在此直接编辑——由周报/询盘自动回写（见 services/kpi.js）。
import * as repo from '../db/repositories/kpi.js';
import * as snapRepo from '../db/repositories/kpiSnapshots.js';
import * as reviewTargetRepo from '../db/repositories/kpiReviewTargets.js';
import { requireAuth, onlyManagerBoss } from '../auth/middleware.js';
import { computeScores, computeAssessment, deriveRangeRows, settlePeriod, previewPeriod } from '../services/kpi.js';
import { buildLedger } from '../services/kpiLedger.js';
import { buildReview, buildReviewAll, getReviewConfig, SCOPES } from '../services/kpiReview.js';
import { parseDateRange } from '../lib/parseDateRange.js';
import { isValidPeriodKey } from '../lib/kpiPeriod.js';

const OWNERS = ['seo', 'sem', 'company'];

// 月度绩效考核（老板表口径）可从设置页改的 kpi_config 键。白名单写死：
// 这个接口是管理员可写的 KV 写入口，不限制键名等于给了任意配置覆盖能力。
const REVIEW_CONFIG_KEYS = [
  'review_weight_a', 'review_weight_b', 'review_weight_cost_a', 'review_weight_cost_ab',
  'review_weight_a_ratio', 'review_weight_weekly', 'review_weight_fix', 'review_weight_test',
  'review_metric_cap', 'review_min_coverage', 'review_budget_tolerance',
];
const PERIOD_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function reviewConfigPayload() {
  const raw = repo.getConfig();
  return {
    config: getReviewConfig(raw),
    raw: Object.fromEntries(REVIEW_CONFIG_KEYS.map((k) => [k, raw[k]])),
    targets: reviewTargetRepo.list(),
    fields: reviewTargetRepo.TARGET_FIELDS,
  };
}

// 统一响应：rows（含三级分层/数据状态）+ 旧 scores（向后兼容 overview/周报回执）+ 新 assessment（v2 分层评分）。
// range 存在时只 derive 一次 rows，供 computeScores 与 computeAssessment 复用。
function buildResponse(range) {
  if (range) {
    const rows = deriveRangeRows(range);
    return { ...computeScores(rows), assessment: computeAssessment(rows), range, targetBasis: 'configured_monthly_target_unprorated' };
  }
  return { ...computeScores(), assessment: computeAssessment() };
}

export async function kpiRoutes(app) {
  // 运营总账（只读）：花费 → 询盘 → 优质 → 成交 → 效率。不参与评分，不写库。
  app.get('/api/kpi/ledger', { preHandler: requireAuth }, async (request, reply) => {
    const { range, error } = parseDateRange(request.query || {});
    if (error) return reply.code(400).send({ error });
    return buildLedger(range);
  });

  /* ===== 月度绩效考核（老板《2026 运营部绩效考核表》口径）=====
     部门是主角（A/B 询价数量按部门整体算），李/陈是同一套口径下的个人视角。
     不传 scope → 三个范围一次算齐，前端少一轮往返。 */
  app.get('/api/kpi/review', { preHandler: requireAuth }, async (request, reply) => {
    const { range, error } = parseDateRange(request.query || {});
    if (error) return reply.code(400).send({ error });
    const scope = request.query?.scope;
    if (scope) {
      if (!SCOPES.includes(scope)) return reply.code(400).send({ error: 'invalid_scope' });
      return buildReview(range, scope);
    }
    return buildReviewAll(range);
  });

  // 考核方案配置（权重 / 上限 / 分档）+ 月度目标。读：所有登录用户（被考核人有权看自己按什么标准打分）。
  app.get('/api/kpi/review-config', { preHandler: requireAuth }, async () => reviewConfigPayload());

  // 改考核方案：仅主管/老板。body: { config:{键:值}, bands:[…], targets:[{period_key, …}] }
  app.put('/api/kpi/review-config', onlyManagerBoss, async (request, reply) => {
    const body = request.body || {};
    const cfg = body.config || {};
    for (const key of REVIEW_CONFIG_KEYS) {
      if (!(key in cfg)) continue;
      const n = Number(cfg[key]);
      if (!Number.isFinite(n) || n < 0) return reply.code(400).send({ error: 'invalid_config_value', key });
      repo.setConfig(key, n);
    }
    if (body.bands != null) {
      if (!Array.isArray(body.bands) || !body.bands.length) return reply.code(400).send({ error: 'invalid_bands' });
      const bands = body.bands.map((b) => ({
        min: Number(b?.min), label: String(b?.label ?? '').slice(0, 40),
        coef: Number(b?.coef), note: b?.note == null ? null : String(b.note).slice(0, 200),
      }));
      // 分档线是决定发多少钱的东西：非数字/空标签直接 400，绝不静默落一个坏配置进库
      if (bands.some((b) => !Number.isFinite(b.min) || !Number.isFinite(b.coef) || !b.label)) {
        return reply.code(400).send({ error: 'invalid_bands' });
      }
      repo.setConfig('review_bands', JSON.stringify(bands.sort((x, y) => y.min - x.min)));
    }
    for (const row of Array.isArray(body.targets) ? body.targets : []) {
      const key = String(row?.period_key ?? '');
      if (key !== reviewTargetRepo.DEFAULT_KEY && !PERIOD_KEY_RE.test(key)) {
        return reply.code(400).send({ error: 'invalid_period_key', period_key: key });
      }
      reviewTargetRepo.upsert(key, row);
    }
    return reviewConfigPayload();
  });

  app.delete('/api/kpi/review-targets/:periodKey', onlyManagerBoss, async (request, reply) => {
    if (!reviewTargetRepo.remove(String(request.params.periodKey))) {
      return reply.code(400).send({ error: 'default_row_protected' });
    }
    return reviewConfigPayload();
  });

  app.get('/api/kpi-targets', { preHandler: requireAuth }, async (request, reply) => {
    const { range, error } = parseDateRange(request.query || {});
    if (error) return reply.code(400).send({ error });
    return buildResponse(range);
  });

  // 仅老板可改目标值。body: { updates: [{ id, target }] }
  app.put('/api/kpi-targets', onlyManagerBoss, async (request, reply) => {
    const { range, error } = parseDateRange(request.query || {});
    if (error) return reply.code(400).send({ error });
    const updates = Array.isArray(request.body?.updates) ? request.body.updates : [];
    for (const u of updates) {
      const id = Number(u.id);
      const target = Number(u.target);
      if (!id || isNaN(target)) continue;
      repo.updateTarget(id, target);
    }
    return buildResponse(range);
  });

  // 已结算历史（读快照，绝不重算——改目标不动历史）
  app.get('/api/kpi/periods', { preHandler: requireAuth }, async (request) => {
    return { items: snapRepo.list({ owner: request.query?.owner }) };
  });

  // 结算前实时预览某期分数
  app.get('/api/kpi/period-preview', { preHandler: requireAuth }, async (request, reply) => {
    const { period_type, period_key, owner } = request.query || {};
    if (!OWNERS.includes(owner)) return reply.code(400).send({ error: '无效 owner' });
    if (!isValidPeriodKey(period_type, period_key)) return reply.code(400).send({ error: '无效周期' });
    return previewPeriod({ period_type, period_key, owner });
  });

  // 结算本期（冻结），仅管理员/老板
  app.post('/api/kpi/settle', onlyManagerBoss, async (request, reply) => {
    const { period_type, period_key, owner, note } = request.body || {};
    if (!OWNERS.includes(owner)) return reply.code(400).send({ error: '无效 owner' });
    if (!isValidPeriodKey(period_type, period_key)) return reply.code(400).send({ error: '无效周期（month:YYYY-MM / quarter:YYYY-Qn）' });
    const item = settlePeriod({ period_type, period_key, owner, settled_by: request.user.id, note: note || null });
    return { item };
  });
}
