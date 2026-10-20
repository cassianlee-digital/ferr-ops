// 投入台账 API：外链台账、其它支出台账、「钱花在哪」汇总。
// 校验与汇总规则在 services/spend.js（纯函数）；这里只接线：鉴权、查库、回原因。
import * as backlinksRepo from '../db/repositories/backlinks.js';
import * as expensesRepo from '../db/repositories/expenses.js';
import * as loopRepo from '../db/repositories/loopItems.js';
import { requireAuth, editor } from '../auth/middleware.js';
import { parseDateRange } from '../lib/parseDateRange.js';
import { resolveSemSpend } from '../services/kpiLedger.js';
import { DEFAULT_EFFECT_DAYS, EFFECT_DAYS } from '../services/taskEffect.js';
import { buildBacklinkEffect } from '../services/taskEffectData.js';
import { businessDate } from '../services/taskEffect.js';
import * as linkCheck from '../services/linkCheck.js';
import {
  BACKLINK_METHODS, BACKLINK_RELS, BACKLINK_STATUSES, CURRENCIES, EXPENSE_CATEGORIES,
  backlinkStats, summarizeSpend, validateBacklink, validateExpense,
} from '../services/spend.js';

const bad = (reply, error, detail) => reply.code(400).send({ error, detail });

// 关联任务必须真是一条任务：否则台账里的 task_id 会指向计划/沉淀，甚至不存在的行
function taskProblem(value) {
  if (value.task_id == null) return null;
  const row = loopRepo.get(value.task_id);
  return row && row.kind === 'task' && row.state !== 'deleted' ? null : '关联的任务不存在';
}

function rangeOf(request, reply) {
  const { range, error } = parseDateRange(request.query);
  if (error) { bad(reply, 'bad_date_range', error); return false; }
  return range || null;
}

/* 一组标准的 列表/新建/修改/软删 路由。两张台账的接线完全一样，只有校验函数和仓储不同。 */
function ledgerRoutes(app, base, repo, validate, extraList) {
  app.get(base, { preHandler: requireAuth }, async (request, reply) => {
    const range = rangeOf(request, reply);
    if (range === false) return reply;
    const items = repo.list(range || undefined);
    return { items, ...(extraList ? extraList(items) : {}) };
  });

  app.post(base, editor, async (request, reply) => {
    const v = validate(request.body);
    if (!v.ok) return bad(reply, 'bad_field', v.detail);
    const problem = taskProblem(v.value);
    if (problem) return bad(reply, 'bad_task', problem);
    reply.code(201);
    return { item: repo.create(v.value, request.user?.id) };
  });

  app.patch(`${base}/:id`, editor, async (request, reply) => {
    const id = Number(request.params.id);
    const current = repo.get(id);
    if (!current) return reply.code(404).send({ error: 'not_found' });
    const v = validate(request.body, { partial: true, current });
    if (!v.ok) return bad(reply, 'bad_field', v.detail);
    const problem = taskProblem(v.value);
    if (problem) return bad(reply, 'bad_task', problem);
    return { item: repo.update(id, v.value) };
  });

  app.delete(`${base}/:id`, editor, async (request, reply) => {
    if (!repo.softDelete(Number(request.params.id), request.user?.id)) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });
}

// 取页面的函数可替换：测试里换成假的，不走真实网络
let pageFetcher = linkCheck.fetchPage;
export function setPageFetcher(fn) { pageFetcher = fn || linkCheck.fetchPage; }

export async function spendRoutes(app) {
  ledgerRoutes(app, '/api/backlinks', backlinksRepo, validateBacklink, (items) => ({ stats: backlinkStats(items) }));
  ledgerRoutes(app, '/api/expenses', expensesRepo, validateExpense);

  // 外链指向的页面在外链上线前后的自然搜索表现。口径与任务的前后对比完全一样（同一个组装函数）。
  app.get('/api/backlinks/:id/effect', { preHandler: requireAuth }, async (request, reply) => {
    const row = backlinksRepo.get(Number(request.params.id));
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const days = request.query?.days == null ? DEFAULT_EFFECT_DAYS : Number(request.query.days);
    if (!EFFECT_DAYS.includes(days)) return bad(reply, 'bad_days', `对比窗口只支持 ${EFFECT_DAYS.join(' / ')} 天`);
    return buildBacklinkEffect(row, days);
  });

  /* 自动核查这条外链还在不在：服务器去外链所在页面取一次源码，找指向我们的链接。
     SSRF 防线在 services/linkCheck.js；这里再加一道限流，免得被当成批量探测的工具。
     结果只写进 auto_* 几列，**不改人工填的状态** —— 没取到 / 没找到都不等于失效。 */
  app.post('/api/backlinks/:id/check', { ...editor, config: { rateLimit: { max: 20, timeWindow: 60_000 } } }, async (request, reply) => {
    const row = backlinksRepo.get(Number(request.params.id));
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const result = await linkCheck.checkBacklink(row, pageFetcher);
    return { item: backlinksRepo.saveAutoCheck(row.id, result, businessDate(new Date().toISOString())) };
  });

  // 表单的可选值：只有后端这一份，前端下拉按它渲染，不各写一遍
  app.get('/api/spend/options', { preHandler: requireAuth }, async () => ({
    backlink_methods: BACKLINK_METHODS,
    backlink_rels: BACKLINK_RELS,
    backlink_statuses: BACKLINK_STATUSES,
    expense_categories: EXPENSE_CATEGORIES,
    currencies: CURRENCIES,
    // 可关联的任务：还活着的任务卡（含已完成未归档），新的在前
    tasks: loopRepo.list('task', { view: 'active' })
      .filter((t) => !t.parent_id)
      .sort((a, b) => b.id - a.id)
      .slice(0, 200)
      .map((t) => ({ id: t.id, content: t.content, dept: t.dept, owner: t.owner })),
  }));

  // 钱花在哪：广告费（Ads 同步，无则回退人工周报）+ 外链 + 其它支出。区间必填 —— 「全部时间的钱」没有可比性。
  app.get('/api/spend/summary', { preHandler: requireAuth }, async (request, reply) => {
    const range = rangeOf(request, reply);
    if (range === false) return reply;
    if (!range) return bad(reply, 'bad_date_range', 'start_date 和 end_date 必填');
    return {
      range,
      ...summarizeSpend({
        ads: resolveSemSpend(range),
        backlinks: backlinksRepo.list(range),
        expenses: expensesRepo.list(range),
      }),
    };
  });
}
