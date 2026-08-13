// 跨天任务每日推进打卡 API。权限同 SOP 完成记录：任意登录运营都能打（共担文化），读需登录。
import * as repo from '../db/repositories/taskCheckins.js';
import * as loopRepo from '../db/repositories/loopItems.js';
import { requireAuth, editor } from '../auth/middleware.js';

const s = (v, n = 200) => (v == null ? null : String(v).slice(0, n));
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function taskCheckinsRoutes(app) {
  // 汇总：?day=YYYY-MM-DD（前端按本地日期传，避免服务器时区把"今天"算错，与 SOP 同口径）
  app.get('/api/task-checkins/summary', { preHandler: requireAuth }, async (request) => {
    const day = s(request.query?.day, 20) || '';
    return { items: repo.summary(day) };
  });

  // 某条任务的全部打卡（复盘/追溯用）
  app.get('/api/task-checkins/:loopItemId', { preHandler: requireAuth }, async (request, reply) => {
    const id = Number(request.params.loopItemId);
    if (!id) return reply.code(400).send({ error: 'bad_id' });
    return { items: repo.listForItem(id) };
  });

  // 打卡（幂等：同一天重复打只补备注）
  app.post('/api/task-checkins', editor, async (request, reply) => {
    const b = request.body || {};
    const id = Number(b.loop_item_id);
    const day = s(b.day_key, 20);
    if (!id || !day || !DAY_RE.test(day)) return reply.code(400).send({ error: 'loop_item_id_and_day_key_required' });
    if (!loopRepo.get(id)) return reply.code(404).send({ error: 'not_found' }); // 不给不存在的任务留孤儿打卡
    const item = repo.mark(id, day, s(b.note, 400), request.user?.username);
    reply.code(201);
    return { item };
  });

  // 撤销当天打卡
  app.delete('/api/task-checkins/:loopItemId', editor, async (request, reply) => {
    const id = Number(request.params.loopItemId);
    const day = s(request.query?.day_key, 20);
    if (!id || !day) return reply.code(400).send({ error: 'loop_item_id_and_day_key_required' });
    repo.unmark(id, day);
    return { ok: true };
  });
}
