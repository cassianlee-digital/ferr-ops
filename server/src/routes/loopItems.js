// 闭环条目 API（FR-10）：月度计划/测试登记/沉淀表/任务看板 + 归档地基（state/archived/deleted）。写入限李/陈。
import * as repo from '../db/repositories/loopItems.js';
import * as fixesRepo from '../db/repositories/fixes.js';
import { requireAuth, editor } from '../auth/middleware.js';

const KINDS = ['plan', 'test', 'deposit', 'task'];
const ARCHIVE_KINDS = ['sem', 'seo', 'company'];
const s = (v, n = 400) => (v == null ? null : String(v).slice(0, n));
// 优先级只接受 1-4（1 最高 / 4 普通）。越界或非数字一律回 null = 普通，不猜用户意思。
const prio = (v) => {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null;
};
// 预计完成时刻：'HH' 或 'HH:MM'，分钟只收 00/15/30/45。不合法回 null，别把脏值写进库——
// 前端的日程推算（annotateTaskTimes）直接拿它算分钟，脏值会让整列时间段错位。
const HOUR_RE = /^([01]\d|2[0-3])(:(00|15|30|45))?$/;
const hhmm = (v) => {
  const t = s(v, 5);
  return t && HOUR_RE.test(t) ? t : null;
};

function resolveView(q) {
  if (q?.archived === '1' || q?.view === 'archived') return 'archived';
  if (q?.deleted === '1' || q?.view === 'deleted') return 'deleted';
  if (q?.view === 'all') return 'all';
  return 'active'; // 默认排除 archived/deleted
}

export async function loopItemsRoutes(app) {
  app.get('/api/loop-items', { preHandler: requireAuth }, async (request) => {
    const kind = request.query?.kind;
    const onlyUrgent = request.query?.urgent === '1';
    const all = repo.list(KINDS.includes(kind) ? kind : undefined, { view: resolveView(request.query) });
    return { items: onlyUrgent ? all.filter((r) => r.urgent === 1) : all };
  });

  app.post('/api/loop-items', editor, async (request, reply) => {
    const b = request.body || {};
    if (!KINDS.includes(b.kind)) return reply.code(400).send({ error: 'bad_kind' });
    const item = repo.create({
      kind: b.kind,
      dept: s(b.dept, 10),
      content: s(b.content, 400) || '',
      owner: s(b.owner, 20),
      status: s(b.status, 20) || '',
      task_date: s(b.task_date, 20),
      start_date: s(b.start_date, 20),
      task_hour: hhmm(b.task_hour),
      task_priority: prio(b.task_priority),
      note: s(b.note, 400),
      urgent: b.urgent === 1 || b.urgent === '1' || b.urgent === true ? 1 : null,
      parent_id: Number.isFinite(Number(b.parent_id)) && Number(b.parent_id) > 0 ? Number(b.parent_id) : null,
      task_why: s(b.task_why, 400),
      task_done_when: s(b.task_done_when, 400),
      task_verify_date: s(b.task_verify_date, 20),
      task_verify_how: s(b.task_verify_how, 400),
    });
    reply.code(201);
    return { item };
  });

  // 回写：任务勾完 → 它出身的那条整改项自动变「已改」，撤销则回「进行中」。
  // 闭环的最后一步；靠人去整改清单里手动改状态，那条状态就永远是脏的。
  app.patch('/api/loop-items/:id', editor, async (request) => {
    const id = Number(request.params.id);
    const body = { ...(request.body || {}) };
    // 这两列有格式约束，PATCH 不能像其余字段那样原样落库（update 的白名单只管「能不能改」，不管「值对不对」）
    if ('task_priority' in body) body.task_priority = prio(body.task_priority);
    if ('task_hour' in body) body.task_hour = hhmm(body.task_hour);
    let item = repo.update(id, body);
    if (item && ('state' in body || 'status' in body)) {
      const done = item.state === 'done' || item.status === 'done';
      item = repo.stampDone(id, done); // 记完成时刻，日计划回放要用
    }
    if (item && item.fix_id && ('state' in body || 'status' in body)) {
      const done = item.state === 'done' || item.status === 'done';
      const fix = fixesRepo.get(item.fix_id);
      // 已归档/已放弃的整改项不被任务状态牵着走
      if (fix && fix.state !== 'archived' && fix.state !== 'deleted' && fix.status !== '放弃') {
        const next = done ? '已改' : '进行中';
        if (fix.status !== next) fixesRepo.update(fix.id, { status: next });
      }
    }
    return { item };
  });

  // 归档：服务端打时间戳、推导 archive_kind；幂等。前端调这个最稳。
  app.post('/api/loop-items/:id/archive', editor, async (request, reply) => {
    const id = Number(request.params.id);
    const ak = s(request.body?.archive_kind, 20);
    const kind = ARCHIVE_KINDS.includes(ak) ? ak : null;
    const item = repo.archive(id, kind);
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return { item };
  });

  // 恢复：archived → todo
  app.post('/api/loop-items/:id/restore', editor, async (request, reply) => {
    const item = repo.restore(Number(request.params.id));
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return { item };
  });

  // DELETE：默认软删；?hard=1 物理删（保留给归档页彻底清除）
  app.delete('/api/loop-items/:id', editor, async (request) => {
    const id = Number(request.params.id);
    if (request.query?.hard === '1') {
      repo.hardDelete(id);
      return { ok: true, hard: true };
    }
    const item = repo.softDelete(id);
    return { ok: true, item };
  });
}
