// 询盘 API（FR-1）。写入限销售；所有登录用户可读。
import * as repo from '../db/repositories/inquiries.js';
import * as salesNotesRepo from '../db/repositories/inquirySalesNotes.js';
import { requireAuth, editor, onlyManagerBoss } from '../auth/middleware.js';
import { recomputeActuals } from '../services/kpi.js';
import { isIsoDate, parseDateRange } from '../lib/parseDateRange.js';
import * as leadsRepo from '../db/repositories/inquiryLeads.js';
import * as taskLinksRepo from '../db/repositories/taskLinks.js';
import { leadSite, leadSource, manualSource } from '../services/inquirySource.js';
import * as googleRepo from '../db/repositories/googleSync.js';
import { buildSourceChecks } from '../services/inquirySourceData.js';
import { COMPANIES } from '../services/sites.js';

const GRADES = ['A', 'B', 'C'];
// 是否成交：只认这两个值，前端传别的一律落回「未成交」（避免脏值污染统计）
const DEALS = ['未成交', '已成交'];
// 公司：询价通过哪个主体来的。只认这两家，没选就留 NULL（表格显示「未标注」，不替业务瞎归属）
// 公司名单只有一份（站点所属的公司用的也是它）
// 渠道：只认这四个（与 services/attribution.js 的 classify 同口径）。以前 PATCH 不校验渠道，任何字符串都能写进去。
const CHANNELS = ['SEO自然', 'SEM付费', '直接', '其他'];
// 确认权在经理 / 老板：他们录入即确认，也只有他们能确认、能改已确认的渠道和等级
const isAuthority = (request) => request.user?.role === 'manager' || request.user?.role === 'boss';
const validDate = isIsoDate;
const BAD_DATE = { error: 'invalid_date', detail: '日期要写成 YYYY-MM-DD' };

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

  /* 来源对账：拿区间内每条询盘手填的来源词，去已同步的 Ads / GSC 点击数据里找证据。
     单独一个接口、由前端在表格画完之后再拉 —— 它要扫同步表，不该拖慢询盘列表本身。
     结论只是「挑疑点给人复核」，不改任何数据，不参与计分。 */
  app.get('/api/inquiries/source-check', { preHandler: requireAuth }, async (request, reply) => {
    const { range, error } = parseDateRange(request.query || {});
    if (error) return reply.code(400).send({ error });
    return buildSourceChecks(repo.list(range));
  });

  app.post('/api/inquiries', editor, async (request, reply) => {
    const body = request.body || {};
    // 日期决定这条询盘算进哪个月：乱写的日期会落在所有区间之外，悄悄从统计里消失
    if (body.date != null && body.date !== '' && !validDate(body.date)) return reply.code(400).send(BAD_DATE);
    const rec = clean(body);
    if (rec.channel != null && !CHANNELS.includes(rec.channel)) {
      return reply.code(400).send({ error: 'invalid_channel', detail: '渠道只能是：' + CHANNELS.join(' / ') });
    }
    // 李 / 陈录的是建议值；经理 / 老板录入即确认
    rec.attribution_status = isAuthority(request) ? 'confirmed' : 'proposed';
    // 从表单线索转来：来源字段一律取线索里的（服务端自己读，不信前端回传的），并把线索标为已转
    let lead = null;
    if (body.lead_id != null && body.lead_id !== '') {
      lead = leadsRepo.get(Number(body.lead_id));
      if (!lead || lead.state !== 'new') {
        return reply.code(409).send({ error: 'lead_not_available', detail: '这条线索不存在，或已经被处理过了' });
      }
    }
    const campaignNames = taskLinksRepo.campaignNames();
    const sites = googleRepo.listProjects();
    const manual = manualSource(lead ? {} : body, campaignNames, sites);
    if (!manual.ok) return reply.code(400).send({ error: 'bad_source', detail: manual.detail });
    // 知道是哪个站点来的、而「公司」没填：站点属于哪家公司是登记好的，直接带出（填了的不动）
    const knownSite = lead ? leadSite(lead, sites) : sites.find((s) => s.id === manual.value.site_id);
    if (!rec.company && knownSite && knownSite.company) rec.company = knownSite.company;

    let item = repo.create(rec, request.user.id);
    if (lead) {
      item = repo.setSource(item.id, leadSource(lead, campaignNames, sites));
      leadsRepo.markConverted(lead.id, item.id, request.user.id);
    } else if (Object.values(manual.value).some((v) => v != null)) {
      item = repo.setSource(item.id, { ...manual.value, src_evidence: 'manual' });
    }
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
    if (body.channel != null && !CHANNELS.includes(body.channel)) {
      return reply.code(400).send({ error: 'invalid_channel', detail: '渠道只能是：' + CHANNELS.join(' / ') });
    }
    // 等级不能清空（'grade' in body 而不是 != null）：传 null 曾经能把一条已确认的 A 级询盘变成无等级
    if ('grade' in body && !GRADES.includes(body.grade)) {
      return reply.code(400).send({ error: 'invalid_grade', detail: '等级只能是 A / B / C，不能清空' });
    }
    if ('date' in body && !validDate(body.date)) return reply.code(400).send(BAD_DATE);
    const cur = repo.get(id);
    if (!cur) return reply.code(404).send({ error: 'not_found' });

    /* 确认闸门：渠道 / 等级 / 日期一旦被经理或老板确认，录入人就不能再改 ——
       等级和渠道决定考核里 A / B 询价的数量，日期决定算进哪个月。
       经理 / 老板仍可改，但必须给理由。建议阶段谁都能改，但每次改动都进流水。
       「改」包括清空：只认 != null 的话，传 null 就绕过去了（2026-10-10 自查复现）。 */
    const changed = repo.LOCKED_FIELDS.filter((f) => f in body && (body[f] ?? null) !== (cur[f] ?? null));
    const reason = String(body.reason ?? '').trim();
    if (changed.length && cur.attribution_status === 'confirmed') {
      if (!isAuthority(request)) {
        return reply.code(403).send({ error: 'attribution_locked', detail: '渠道、等级和日期已经确认，如需更正请找经理或老板' });
      }
      if (!reason) {
        return reply.code(400).send({ error: 'reason_required', detail: '修改已确认的渠道 / 等级 / 日期必须填写原因' });
      }
    }

    // 来源字段：表单带回的是机器证据，谁都不能手改（改了它就不再是证据）；手填的可以改，改完标记为「人填」
    const touchesSource = ['source', 'src_campaign_id', 'src_landing_page', 'site_id'].some((k) => k in body);
    let manual = null;
    if (touchesSource) {
      if (cur.src_evidence === 'form') {
        return reply.code(409).send({ error: 'source_locked', detail: '这条询盘的来源是独立站表单带回的机器证据，不能手改' });
      }
      manual = manualSource(body, taskLinksRepo.campaignNames(), googleRepo.listProjects());
      if (!manual.ok) return reply.code(400).send({ error: 'bad_source', detail: manual.detail });
    }
    // 是否成交不锁（它本来就会随时间变），但改动要留痕：否则答不出「哪天成交的、谁标的」
    const logged = 'deal_status' in body && (body.deal_status ?? null) !== (cur.deal_status ?? null) ? [...changed, 'deal_status'] : changed;
    // 所有校验都过了才落库，流水与改动在同一个事务里（以前流水先写，后面的校验一拒，就留下一条没发生过的改动）
    const item = repo.updateWithLog(id, body, {
      changes: logged.map((f) => ({ field: f, oldValue: cur[f], newValue: body[f], reason, userId: request.user.id })),
      source: manual && Object.keys(manual.value).length ? { ...manual.value, src_evidence: 'manual' } : null,
    });
    recomputeActuals();
    return { item, stats: repo.stats() };
  });

  // P3：DELETE 默认软删→归档（进归档页「询盘」桶）；?hard=1 才物理删除（boss 在归档页彻底清）
  app.delete('/api/inquiries/:id', editor, async (request, reply) => {
    const id = Number(request.params.id);
    const cur = repo.get(id);
    if (!cur) return reply.code(404).send({ error: 'not_found' });
    if (request.query?.hard === '1') {
      // 彻底删除连改动流水一起抹掉。界面一直只给老板显示这个按钮，接口却谁都能调
      if (request.user?.role !== 'boss') {
        return reply.code(403).send({ error: 'hard_delete_forbidden', detail: '彻底删除只有老板可以做' });
      }
      repo.remove(id);
      recomputeActuals();
      return { ok: true, hard: true, stats: repo.stats() };
    }
    // 归档 = 从考核里拿掉。已确认的询盘录入人改不了等级，也就不该能直接让它消失
    if (cur.attribution_status === 'confirmed' && cur.state !== 'archived' && !isAuthority(request)) {
      return reply.code(403).send({ error: 'attribution_locked', detail: '这条询盘已经确认，要删除（归档）请找经理或老板' });
    }
    const item = repo.archive(id, request.user.id);
    recomputeActuals(); // 归档后从统计/KPI 剔除
    return { ok: true, item, stats: repo.stats() };
  });

  /* ===== 跟踪反馈：一条询盘多条带时间的记录（2026-08-27）=====
     以前是 PATCH tracking_feedback 覆盖式写一段话——跟进了三次也只剩最后一次，还不知道哪天写的。
     现在每次跟进都是一条新记录，服务端盖时间戳（前端传的时间一律不信）。 */
  app.get('/api/inquiries/:id/feedbacks', { preHandler: requireAuth }, async (request) => {
    return { items: repo.listFeedbacks(Number(request.params.id)) };
  });

  app.post('/api/inquiries/:id/feedbacks', editor, async (request, reply) => {
    const id = Number(request.params.id);
    if (!repo.get(id)) return reply.code(404).send({ error: 'not_found' });
    const text = String(request.body?.text ?? '').trim().slice(0, 2000);
    if (!text) return reply.code(400).send({ error: 'empty_text' });
    const item = repo.addFeedback(id, text, request.user.id);
    reply.code(201);
    return { item };
  });

  // 写错了要能删掉——改版前那一条是可以直接改的，不给删口子等于开倒车
  app.delete('/api/inquiries/:id/feedbacks/:feedbackId', editor, async (request, reply) => {
    const id = Number(request.params.id);
    const row = repo.getFeedback(Number(request.params.feedbackId));
    if (!row || row.inquiry_id !== id) return reply.code(404).send({ error: 'not_found' });
    repo.removeFeedback(row.id);
    return { ok: true };
  });

  /* ===== 业务反馈：业务员针对这条询盘发回来的材料（一段话 + 若干张图）=====
     与上面的「跟踪反馈」刻意分开：那是运营自己记的跟进进度，这是业务给的原始材料。
     图片不在这里传，走 POST /api/attachments（owner_type=inquiry_sales_note），
     先建记录拿到 id、再逐张挂图 —— 这样一次上传失败只丢那一张，不会把整条反馈搞没。 */
  app.get('/api/inquiries/:id/sales-notes', { preHandler: requireAuth }, async (request) => {
    return { items: salesNotesRepo.list(Number(request.params.id)) };
  });

  app.post('/api/inquiries/:id/sales-notes', editor, async (request, reply) => {
    const id = Number(request.params.id);
    if (!repo.get(id)) return reply.code(404).send({ error: 'not_found' });
    const text = String(request.body?.text ?? '').trim().slice(0, 4000);
    // 允许「只有图片没有文字」：业务经常直接甩一张截图过来
    const withImages = request.body?.withImages === true;
    if (!text && !withImages) return reply.code(400).send({ error: 'empty_note' });
    reply.code(201);
    return { item: salesNotesRepo.create(id, text || null, request.user.id) };
  });

  app.patch('/api/inquiries/:id/sales-notes/:noteId', editor, async (request, reply) => {
    const row = salesNotesRepo.get(Number(request.params.noteId));
    if (!row || row.inquiry_id !== Number(request.params.id)) return reply.code(404).send({ error: 'not_found' });
    const text = String(request.body?.text ?? '').trim().slice(0, 4000);
    if (!text && !row.images.length) return reply.code(400).send({ error: 'empty_note' });
    return { item: salesNotesRepo.update(row.id, text || null) };
  });

  app.delete('/api/inquiries/:id/sales-notes/:noteId', editor, async (request, reply) => {
    const row = salesNotesRepo.get(Number(request.params.noteId));
    if (!row || row.inquiry_id !== Number(request.params.id)) return reply.code(404).send({ error: 'not_found' });
    salesNotesRepo.remove(row.id); // 连带删掉它的图片，不留孤儿 BLOB
    return { ok: true };
  });

  // P3：从归档恢复询盘
  app.post('/api/inquiries/:id/restore', editor, async (request, reply) => {
    const item = repo.restore(Number(request.params.id), request.user.id);
    if (!item) return reply.code(404).send({ error: 'not_found' });
    recomputeActuals();
    return { item };
  });

  /* ===== 确认权与改动留痕（2026-10-10）=====
     录入 = 建议值，经理 / 老板确认后才是定稿；改动一律留痕。
     这里只立「谁能改、改了留痕、未确认看得见」三条规矩，**不改任何考核口径** ——
     月度考核照旧数全部询盘。先有可见性，再谈约束。 */

  // 某条询盘的渠道 / 等级 / 确认状态改动流水（谁、何时、从什么改成什么、为什么）
  app.get('/api/inquiries/:id/changes', { preHandler: requireAuth }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!repo.get(id)) return reply.code(404).send({ error: 'not_found' });
    return { items: repo.listFieldChanges(id) };
  });

  // 区间内的确认覆盖情况：未确认占比要能被页面直接读到
  app.get('/api/inquiries/attribution-coverage', { preHandler: requireAuth }, async (request, reply) => {
    const { range, error } = parseDateRange(request.query || {});
    if (error) return reply.code(400).send({ error });
    return repo.attributionCoverage(range);
  });

  // 确认（仅经理 / 老板）。可在确认的同时纠正渠道 / 等级。
  app.post('/api/inquiries/:id/confirm', onlyManagerBoss, async (request, reply) => {
    const id = Number(request.params.id);
    if (!repo.get(id)) return reply.code(404).send({ error: 'not_found' });
    const b = request.body || {};
    if (b.channel != null && !CHANNELS.includes(b.channel)) return reply.code(400).send({ error: 'invalid_channel' });
    if (b.grade != null && !GRADES.includes(b.grade)) return reply.code(400).send({ error: 'invalid_grade' });
    const item = repo.confirmAttribution(id, { channel: b.channel, grade: b.grade, reason: b.reason, userId: request.user.id });
    recomputeActuals();
    return { item, stats: repo.stats() };
  });

  // 批量确认：否则经理要一条条点，迟早变成瓶颈，然后没人确认
  app.post('/api/inquiries/confirm', onlyManagerBoss, async (request, reply) => {
    const ids = Array.isArray(request.body?.ids) ? [...new Set(request.body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : [];
    if (!ids.length) return reply.code(400).send({ error: 'ids_required', detail: '没有可确认的询盘' });
    if (ids.length > 500) return reply.code(400).send({ error: 'too_many', detail: '一次最多确认 500 条' });
    const items = [];
    for (const id of ids) {
      if (!repo.get(id)) continue; // 批量里混了不存在的 id 就跳过，不让整批失败
      items.push(repo.confirmAttribution(id, { reason: request.body?.reason, userId: request.user.id }));
    }
    recomputeActuals();
    return { confirmed: items.length, requested: ids.length };
  });

  // 撤销确认：必须给理由，退回建议态
  app.post('/api/inquiries/:id/unconfirm', onlyManagerBoss, async (request, reply) => {
    const id = Number(request.params.id);
    const cur = repo.get(id);
    if (!cur) return reply.code(404).send({ error: 'not_found' });
    const reason = String(request.body?.reason ?? '').trim();
    if (!reason) return reply.code(400).send({ error: 'reason_required', detail: '撤销确认必须填写原因' });
    if (cur.attribution_status !== 'confirmed') return reply.code(409).send({ error: 'not_confirmed', detail: '这条询盘本来就没有确认' });
    const item = repo.unconfirmAttribution(id, { reason, userId: request.user.id });
    recomputeActuals();
    return { item };
  });
}
