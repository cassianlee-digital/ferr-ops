// SOP 引擎 API（Step A）：定义增删改查 + 完成记录读写。
// 权限：定义的写入仅 manager+boss；完成记录任意登录运营都可写（共担文化）。
import * as repo from '../db/repositories/sop.js';
import { requireAuth, editor, onlyManagerBoss } from '../auth/middleware.js';

const FREQS = ['daily', 'weekly', 'monthly'];
const DEPTS = ['SEM', 'SEO', '公司'];
const s = (v, n = 200) => (v == null ? null : String(v).slice(0, n));
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// [from..to] 的每一天（含两端）；to 早于 from 返回空数组
function daysBetween(from, to) {
  const out = [];
  const d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function sopRoutes(app) {
  // 列出 SOP 定义（默认只返启用的；管理员可加 ?all=1 看所有）
  app.get('/api/sop', { preHandler: requireAuth }, async (request) => {
    const all = request.query?.all === '1';
    return { items: repo.listDefs({ activeOnly: !all }) };
  });

  // 新增 SOP 定义（仅经理/老板）
  app.post('/api/sop', onlyManagerBoss, async (request, reply) => {
    const b = request.body || {};
    if (!DEPTS.includes(b.dept)) return reply.code(400).send({ error: 'bad_dept' });
    if (!FREQS.includes(b.freq)) return reply.code(400).send({ error: 'bad_freq' });
    if (!b.title) return reply.code(400).send({ error: 'title_required' });
    const item = repo.createDef({
      dept: s(b.dept, 10),
      freq: s(b.freq, 10),
      title: s(b.title, 200),
      content: s(b.content, 1000),
      time_hint: s(b.time_hint, 40),
    });
    reply.code(201);
    return { item };
  });

  // 更新 SOP 定义（仅经理/老板）
  app.patch('/api/sop/:id', onlyManagerBoss, async (request, reply) => {
    const id = Number(request.params.id);
    const b = request.body || {};
    if (b.freq && !FREQS.includes(b.freq)) return reply.code(400).send({ error: 'bad_freq' });
    if (b.dept && !DEPTS.includes(b.dept)) return reply.code(400).send({ error: 'bad_dept' });
    const item = repo.updateDef(id, b);
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return { item };
  });

  // 软删 SOP 定义（仅经理/老板）：active=0，历史 completions 保留
  app.delete('/api/sop/:id', onlyManagerBoss, async (request, reply) => {
    const item = repo.softDeleteDef(Number(request.params.id));
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return { ok: true, item };
  });

  // 区间执行率：?from=&to=&today=（today 由前端按本地日期传，未来的日子不该算漏）。
  // 分母只算 daily / weekly——月度 SOP 放进一周的口径里算没意义，返回 expected=null 由前端注明。
  // 起点取 max(from, SOP 创建日)：本周才建的 SOP，之前的日子不是它漏的。
  app.get('/api/sop/stats', { preHandler: requireAuth }, async (request, reply) => {
    const from = s(request.query?.from, 20);
    const to = s(request.query?.to, 20);
    if (!DAY_RE.test(from || '') || !DAY_RE.test(to || '')) return reply.code(400).send({ error: 'from_and_to_required' });
    const today = DAY_RE.test(s(request.query?.today, 20) || '') ? s(request.query.today, 20) : null;
    const end = today && today < to ? today : to; // 本周只算到今天
    const defs = repo.listDefs({ activeOnly: true });
    const rows = repo.completionsBetween(from, to);
    const doneDays = new Map(); // sop_id -> Set(打卡日期)
    for (const r of rows) {
      if (!doneDays.has(r.sop_id)) doneDays.set(r.sop_id, new Set());
      doneDays.get(r.sop_id).add(String(r.completed_at || '').slice(0, 10));
    }
    const items = defs.map((d) => {
      const created = String(d.created_at || '').slice(0, 10);
      const start = created > from ? created : from;
      const days = daysBetween(start, end);
      const hit = doneDays.get(d.id) || new Set();
      if (d.freq === 'monthly') return { ...d, expected: null, done: hit.size, missed_days: [] };
      if (d.freq === 'weekly') {
        return { ...d, expected: days.length ? 1 : 0, done: hit.size ? 1 : 0, missed_days: [] };
      }
      return { ...d, expected: days.length, done: days.filter((x) => hit.has(x)).length, missed_days: days.filter((x) => !hit.has(x)) };
    });
    return { from, to, counted_to: end, items };
  });

  // 当前周期完成态：传 ?daily=YYYY-MM-DD&weekly=YYYY-Www&monthly=YYYY-MM
  // 前端按本地时间算 period_key 再传过来，避免服务器/客户端时区出错
  app.get('/api/sop/completions', { preHandler: requireAuth }, async (request) => {
    const periodKeys = {
      daily: s(request.query?.daily, 20),
      weekly: s(request.query?.weekly, 20),
      monthly: s(request.query?.monthly, 20),
    };
    return { items: repo.listCompletions(periodKeys) };
  });

  // 标记完成（任意登录运营）；幂等
  app.post('/api/sop/completions', editor, async (request, reply) => {
    const b = request.body || {};
    const sopId = Number(b.sop_id);
    const periodKey = s(b.period_key, 20);
    if (!sopId || !periodKey) return reply.code(400).send({ error: 'sop_id_and_period_key_required' });
    const item = repo.markComplete(sopId, periodKey, request.user?.username);
    reply.code(201);
    return { item };
  });

  // 撤销完成
  app.delete('/api/sop/completions/:sopId', editor, async (request, reply) => {
    const sopId = Number(request.params.sopId);
    const periodKey = s(request.query?.period_key, 20);
    if (!sopId || !periodKey) return reply.code(400).send({ error: 'sop_id_and_period_key_required' });
    repo.unmarkComplete(sopId, periodKey);
    return { ok: true };
  });
}
