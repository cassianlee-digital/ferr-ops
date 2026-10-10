// 表单线索 API：独立站询盘表单 → 后台。
//
// POST /api/inquiry-intake 是全站唯一「不靠登录态」的写入口，所以单独收紧：
//   - 只认请求头 X-Intake-Token，与服务器环境变量 INQUIRY_INTAKE_SECRET 做恒定时间比较；
//   - 没配密钥（或密钥太短）= 入口关闭，任何请求都是 401；
//   - 必须由站点**服务端**调用。把密钥写进网页 JS 等于公开，任何人都能往后台灌线索；
//   - 限流 + 64KB 请求体上限；响应只回 id，不回任何库内数据；
//   - 进来的只是「线索」，不进任何统计。要有人确认并评级后才转成询盘（POST /api/inquiries 带 lead_id）。
// 站点侧怎么接见 docs/INQUIRY_INTAKE.md。
import { timingSafeEqual } from 'node:crypto';
import * as repo from '../db/repositories/inquiryLeads.js';
import { requireAuth, editor } from '../auth/middleware.js';
import { config } from '../config.js';
import { normalizeLead } from '../services/inquirySource.js';

export const MIN_INTAKE_SECRET_LENGTH = 24;

export function intakeConfigured() {
  return String(config.inquiryIntake.secret || '').length >= MIN_INTAKE_SECRET_LENGTH;
}

function intakeAuthorized(request) {
  if (!intakeConfigured()) return false;
  const expected = Buffer.from(config.inquiryIntake.secret);
  const given = Buffer.from(String(request.headers['x-intake-token'] || ''));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function inquiryLeadsRoutes(app) {
  app.post('/api/inquiry-intake', {
    bodyLimit: 64 * 1024,
    config: { rateLimit: { max: 60, timeWindow: 60_000 } },
  }, async (request, reply) => {
    if (!intakeAuthorized(request)) return reply.code(401).send({ error: 'unauthorized' });
    const v = normalizeLead(request.body);
    if (!v.ok) return reply.code(400).send({ error: 'bad_lead', detail: v.detail });
    const { item, duplicate } = repo.create(v.value);
    reply.code(duplicate ? 200 : 201);
    return { ok: true, id: item.id, duplicate };
  });

  // 线索收件箱。configured 让界面能说清「为什么是空的」：没接入 ≠ 没人询价。
  app.get('/api/inquiry-leads', { preHandler: requireAuth }, async (request, reply) => {
    const state = request.query?.state || 'new';
    if (!repo.STATES.includes(state)) return reply.code(400).send({ error: 'bad_state' });
    return { configured: intakeConfigured(), counts: repo.counts(), items: repo.list(state) };
  });

  // 忽略：垃圾 / 重复 / 非询价。要写原因 —— 「为什么收到这么多垃圾询价」正是要靠这些原因加上它带的来源去分析的。
  app.post('/api/inquiry-leads/:id/ignore', editor, async (request, reply) => {
    const id = Number(request.params.id);
    const reason = String(request.body?.reason || '').trim().slice(0, 200);
    if (!reason) return reply.code(400).send({ error: 'reason_required', detail: '请写明忽略原因（垃圾 / 重复 / 非询价…）' });
    if (!repo.get(id)) return reply.code(404).send({ error: 'not_found' });
    if (!repo.markIgnored(id, reason, request.user?.id)) {
      return reply.code(409).send({ error: 'lead_not_available', detail: '这条线索已经被处理过了' });
    }
    return { item: repo.get(id) };
  });

  app.post('/api/inquiry-leads/:id/reopen', editor, async (request, reply) => {
    const id = Number(request.params.id);
    if (!repo.get(id)) return reply.code(404).send({ error: 'not_found' });
    if (!repo.reopen(id)) return reply.code(409).send({ error: 'lead_not_ignored', detail: '只有被忽略的线索可以恢复' });
    return { item: repo.get(id) };
  });
}
