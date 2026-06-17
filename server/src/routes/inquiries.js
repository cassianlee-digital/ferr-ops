// 询盘 API（FR-1）。写入限销售；所有登录用户可读。
import * as repo from '../db/repositories/inquiries.js';
import { requireAuth, editor } from '../auth/middleware.js';
import { recomputeActuals } from '../services/kpi.js';

const GRADES = ['A', 'B', 'C'];

function clean(body) {
  const s = (v) => (v == null ? null : String(v).slice(0, 500));
  return {
    date: s(body.date) || new Date().toISOString().slice(0, 10),
    country: s(body.country),
    region: s(body.region),
    channel: s(body.channel),
    source: s(body.source),
    product: s(body.product),
    grade: GRADES.includes(body.grade) ? body.grade : 'C',
    note: s(body.note),
  };
}

// 解析并校验可选时间范围。返回 { range } | { error }。两者皆缺 → range=undefined(全量，兼容旧调用)。
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function parseRange(query) {
  const s = query?.start_date;
  const e = query?.end_date;
  const hasS = s != null && s !== '';
  const hasE = e != null && e !== '';
  if (!hasS && !hasE) return { range: undefined };
  if (!hasS || !hasE) return { error: 'start_date and end_date must be provided together' };
  if (!DATE_RE.test(s) || !DATE_RE.test(e)) return { error: 'start_date and end_date must be in YYYY-MM-DD format' };
  if (s > e) return { error: 'start_date must be before or equal to end_date' };
  return { range: { start_date: s, end_date: e } };
}

export async function inquiriesRoutes(app) {
  app.get('/api/inquiries', { preHandler: requireAuth }, async (request, reply) => {
    const { range, error } = parseRange(request.query || {});
    if (error) return reply.code(400).send({ error });
    return { items: repo.list(range), stats: repo.stats(range) };
  });

  app.post('/api/inquiries', editor, async (request, reply) => {
    const rec = clean(request.body || {});
    const item = repo.create(rec, request.user.id);
    recomputeActuals(); // 询盘总量/A级数 回写 KPI 实际值
    reply.code(201);
    return { item, stats: repo.stats() };
  });

  app.patch('/api/inquiries/:id', editor, async (request) => {
    const item = repo.update(Number(request.params.id), request.body || {});
    recomputeActuals();
    return { item, stats: repo.stats() };
  });

  app.delete('/api/inquiries/:id', editor, async (request) => {
    repo.remove(Number(request.params.id));
    recomputeActuals();
    return { ok: true, stats: repo.stats() };
  });
}
