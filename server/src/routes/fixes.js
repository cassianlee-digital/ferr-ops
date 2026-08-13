// 整改清单 API（FR-6/10）+ 归档地基（state/archived/deleted）。写入限李/陈（闭环看板为运营共用）。
import * as repo from '../db/repositories/fixes.js';
import * as loopRepo from '../db/repositories/loopItems.js';
import { requireAuth, editor } from '../auth/middleware.js';

const ARCHIVE_KINDS = ['sem', 'seo', 'company'];
const s = (v, n = 300) => (v == null ? null : String(v).slice(0, n));

function resolveView(q) {
  if (q?.archived === '1' || q?.view === 'archived') return 'archived';
  if (q?.deleted === '1' || q?.view === 'deleted') return 'deleted';
  if (q?.view === 'all') return 'all';
  return 'active';
}

export async function fixesRoutes(app) {
  // 列表带上「排没排进日计划、那条任务做完没」——整改清单要能一眼看出哪条还没人接
  app.get('/api/fixes', { preHandler: requireAuth }, async (request) => {
    const items = repo.list({ view: resolveView(request.query) });
    const plans = new Map(loopRepo.planStatusByFix().map((r) => [r.fix_id, r]));
    return {
      items: items.map((f) => {
        const p = plans.get(f.id);
        return { ...f, planned_task_id: p ? p.task_id : null, planned_done: p ? !!p.done : false };
      }),
    };
  });

  // 排进日计划：整改项 → 负责人的任务卡。幂等（已排过就把那条还给你，不重复建）。
  // 这是「诊断→整改→今天谁做」这根线上唯一缺的一环；没有它，整改清单和日计划是两套各写各的列表。
  app.post('/api/fixes/:id/plan', editor, async (request, reply) => {
    const fix = repo.get(Number(request.params.id));
    if (!fix) return reply.code(404).send({ error: 'not_found' });
    if (fix.state === 'archived' || fix.state === 'deleted') {
      return reply.code(409).send({ error: 'fix_not_active' });
    }
    const existing = loopRepo.findActiveByFixId(fix.id);
    if (existing) return { item: existing, existed: true };

    // 开始日由前端按本地日期传（服务器时区不该决定"今天"，与打卡同口径）
    const startDate = s(request.body?.start_date, 20) || new Date().toISOString().slice(0, 10);
    const item = loopRepo.create({
      kind: 'task',
      dept: fix.dept,
      content: fix.title,
      owner: fix.owner,
      status: '待办',
      task_date: fix.due_date || startDate, // 整改的截止日就是任务的截止日
      start_date: startDate,
      fix_id: fix.id,
    });
    // 排进日计划 = 已经开工，把整改状态从「计划下周」推到「进行中」；已改/放弃的不动
    if (fix.status !== '已改' && fix.status !== '放弃') repo.update(fix.id, { status: '进行中' });
    reply.code(201);
    return { item, existed: false, fix: repo.get(fix.id) };
  });

  app.post('/api/fixes', editor, async (request, reply) => {
    const b = request.body || {};
    if (!b.title) return reply.code(400).send({ error: 'title_required' });
    const item = repo.create({
      title: s(b.title, 200),
      dept: s(b.dept, 10),
      detail: s(b.detail, 500),
      evidence: s(b.evidence, 500),
      owner: s(b.owner, 20),
      due_date: s(b.due_date, 20),
      status: s(b.status, 20) || '计划下周',
      source: s(b.source, 40) || '手动',
    });
    reply.code(201);
    return { item };
  });

  app.patch('/api/fixes/:id', editor, async (request) => ({
    item: repo.update(Number(request.params.id), request.body || {}),
  }));

  app.post('/api/fixes/:id/archive', editor, async (request, reply) => {
    const id = Number(request.params.id);
    const ak = s(request.body?.archive_kind, 20);
    const kind = ARCHIVE_KINDS.includes(ak) ? ak : null;
    const item = repo.archive(id, kind);
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return { item };
  });

  app.post('/api/fixes/:id/restore', editor, async (request, reply) => {
    const item = repo.restore(Number(request.params.id));
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return { item };
  });

  // 新增：DELETE 默认软删；?hard=1 物理删
  app.delete('/api/fixes/:id', editor, async (request) => {
    const id = Number(request.params.id);
    if (request.query?.hard === '1') {
      repo.hardDelete(id);
      return { ok: true, hard: true };
    }
    const item = repo.softDelete(id);
    return { ok: true, item };
  });
}
