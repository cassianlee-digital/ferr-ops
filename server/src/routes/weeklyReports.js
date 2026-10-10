// 复盘周报 API。写入限可编辑角色。
import * as repo from '../db/repositories/weeklyReports.js';
import { requireAuth, editor } from '../auth/middleware.js';

const FIELDS = ['summary', 'problems', 'analysis', 'next_plan'];
const DEPTS = ['SEO', 'SEM'];
// 周 / 月标识只有这几种写法：2026-10-05（周一日期）、2026-10-month（月报）、2026-W41（老数据）。
// 以前什么字符串都收 —— 它会原样出现在所有人的周报页上（2026-10-10 前端审计查到的唯一一条「登录用户可写、全员可见」的未转义路径）。
const KEY_RE = /^[0-9A-Za-z-]{4,20}$/;
const validKey = (k) => typeof k === 'string' && KEY_RE.test(k);

export async function weeklyReportsRoutes(app) {
  app.get('/api/weekly-reports', { preHandler: requireAuth }, async (request) => {
    const cur = request.query?.current;
    if (cur != null && cur !== '') {
      // 这是个会建行的 GET：标识不合规就不建，也不报错（列表照常返回）
      if (validKey(cur)) repo.ensureWeek(cur); // 当前周自动出现
    }
    return { items: repo.list() };
  });

  app.put('/api/weekly-reports', editor, async (request, reply) => {
    const { week_key, dept, field, items } = request.body || {};
    if (!week_key || !DEPTS.includes(dept) || !FIELDS.includes(field)) {
      return reply.code(400).send({ error: 'bad_request' });
    }
    if (!validKey(week_key)) return reply.code(400).send({ error: 'bad_week_key', detail: '周 / 月标识格式不对' });
    const arr = Array.isArray(items) ? items.map((s) => String(s).slice(0, 500)) : [];
    return { item: repo.upsertSection(week_key, dept, field, arr) };
  });
}
