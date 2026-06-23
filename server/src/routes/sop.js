// SOP 引擎 API（Step A）：定义增删改查 + 完成记录读写。
// 权限：定义的写入仅 manager+boss；完成记录任意登录运营都可写（共担文化）。
import * as repo from '../db/repositories/sop.js';
import { requireAuth, editor, onlyManagerBoss } from '../auth/middleware.js';

const FREQS = ['daily', 'weekly', 'monthly'];
const DEPTS = ['SEM', 'SEO', '公司'];
const s = (v, n = 200) => (v == null ? null : String(v).slice(0, n));

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
