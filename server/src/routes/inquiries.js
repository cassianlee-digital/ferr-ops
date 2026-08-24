// 询盘 API（FR-1）。写入限销售；所有登录用户可读。
import * as repo from '../db/repositories/inquiries.js';
import { requireAuth, editor } from '../auth/middleware.js';
import { recomputeActuals } from '../services/kpi.js';
import { parseDateRange } from '../lib/parseDateRange.js';

const GRADES = ['A', 'B', 'C'];
// 是否成交：只认这两个值，前端传别的一律落回「未成交」（避免脏值污染统计）
const DEALS = ['未成交', '已成交'];
// 公司：询价通过哪个主体来的。只认这两家，没选就留 NULL（表格显示「未标注」，不替业务瞎归属）
const COMPANIES = ['贝孚特', '费尔瑞'];

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
    // 录入改版：客户编码 / 业务员 / 是否成交（取代客户姓名）；文档 10：录入时不写 tracking_feedback，后期点开编辑
    customer_code: s(body.customer_code),
    company: COMPANIES.includes(body.company) ? body.company : null,
    salesperson: s(body.salesperson),
    deal_status: DEALS.includes(body.deal_status) ? body.deal_status : '未成交',
    // original_grade 强制 = grade，前端传也无视（语义保护）
    original_grade: GRADES.includes(body.grade) ? body.grade : 'C',
  };
}

export async function inquiriesRoutes(app) {
  app.get('/api/inquiries', { preHandler: requireAuth }, async (request, reply) => {
    // P3：?archived=1 → 归档页「询盘」桶（不带统计）
    if (request.query?.archived === '1') {
      return { items: repo.listArchived() };
    }
    const { range, error } = parseDateRange(request.query || {});
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

  app.patch('/api/inquiries/:id', editor, async (request, reply) => {
    const id = Number(request.params.id);
    const body = request.body || {};
    // 是否成交只有两个合法值：脏值直接 400，别悄悄写进库
    if (body.deal_status != null && !DEALS.includes(body.deal_status)) {
      return reply.code(400).send({ error: 'invalid_deal_status' });
    }
    if (body.company != null && !COMPANIES.includes(body.company)) {
      return reply.code(400).send({ error: 'invalid_company' });
    }
    // 6.23 文档 9：若本次 PATCH 改 grade 且历史数据 original_grade=NULL，
    // 先把「修改前的旧 grade」锁为 original_grade（必须在 update 之前调用，否则锁到的就是新 grade）
    if (body.grade != null) repo.lockOriginalGradeIfNull(id);
    const item = repo.update(id, body);
    recomputeActuals();
    return { item, stats: repo.stats() };
  });

  // P3：DELETE 默认软删→归档（进归档页「询盘」桶）；?hard=1 才物理删除（boss 在归档页彻底清）
  app.delete('/api/inquiries/:id', editor, async (request) => {
    const id = Number(request.params.id);
    if (request.query?.hard === '1') {
      repo.remove(id);
      recomputeActuals();
      return { ok: true, hard: true, stats: repo.stats() };
    }
    const item = repo.archive(id);
    recomputeActuals(); // 归档后从统计/KPI 剔除
    return { ok: true, item, stats: repo.stats() };
  });

  // P3：从归档恢复询盘
  app.post('/api/inquiries/:id/restore', editor, async (request, reply) => {
    const item = repo.restore(Number(request.params.id));
    if (!item) return reply.code(404).send({ error: 'not_found' });
    recomputeActuals();
    return { item };
  });
}
