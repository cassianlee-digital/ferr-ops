// 复盘周报 API。写入限可编辑角色。
import * as repo from '../db/repositories/weeklyReports.js';
import { requireAuth, editor } from '../auth/middleware.js';

const FIELDS = ['summary', 'problems', 'analysis', 'next_plan'];
const DEPTS = ['SEO', 'SEM'];

export async function weeklyReportsRoutes(app) {
  app.get('/api/weekly-reports', { preHandler: requireAuth }, async (request) => {
    const cur = request.query?.current;
    if (cur) repo.ensureWeek(String(cur)); // 当前周自动出现
    return { items: repo.list() };
  });

  app.put('/api/weekly-reports', editor, async (request, reply) => {
    const { week_key, dept, field, items } = request.body || {};
    if (!week_key || !DEPTS.includes(dept) || !FIELDS.includes(field)) {
      return reply.code(400).send({ error: 'bad_request' });
    }
    const arr = Array.isArray(items) ? items.map((s) => String(s).slice(0, 500)) : [];
    return { item: repo.upsertSection(String(week_key), dept, field, arr) };
  });
}
