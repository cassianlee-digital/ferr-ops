// SOP 引擎 API（Step A）：定义增删改查 + 完成记录读写。
// 权限：定义的写入仅 manager+boss；完成记录任意登录运营都可写（共担文化）。
import * as repo from '../db/repositories/sop.js';
import { findDuplicate } from '../services/sopDuplicate.js';
import { requireAuth, editor, onlyManagerBoss } from '../auth/middleware.js';

// 查重回看多远。60 天 ≈ 两个月的发帖量，够覆盖「上个月发过、这个月又记一遍」，
// 又不会让这条每天都走的路径去扫整张表。
const DUP_WINDOW_DAYS = 60;
const daysAgo = (dayKey, n) => {
  const d = new Date(dayKey + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
import { sopStats } from '../services/sopStats.js';

const FREQS = ['daily', 'weekly', 'monthly'];
const DEPTS = ['SEM', 'SEO', '公司'];
// 赛道：老板那两张表其实是四个角色。dept 是「这条挂在日计划哪一列」（三列布局不动），
// track 是「列里属于哪块业务」——社媒归陈、GEO 归李，但配额各算各的，
// 否则「本周领英发了几篇」会和「搜索词报告查了没」混进同一个完成率，考核就失真了。
const TRACKS = ['SEM', '社媒', 'SEO', 'GEO', '公司'];
const s = (v, n = 200) => (v == null ? null : String(v).slice(0, n));
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
// 周期 key：daily=YYYY-MM-DD / weekly=YYYY-Www / monthly=YYYY-MM。
// 服务端不重算 ISO 周（全项目约定：ISO 周只在前端算一份），但格式要卡住，
// 否则一个拼错的 key 会开出一个谁也查不到的影子周期，配额永远是 0/5。
const PERIOD_RE = /^(\d{4}-\d{2}-\d{2}|\d{4}-W\d{2}|\d{4}-\d{2})$/;
// 定义表里 v2 新增的那些列，POST/PATCH 共用一份清单
function defFields(b) {
  return {
    content: s(b.content, 1000),
    time_hint: s(b.time_hint, 40),
    track: TRACKS.includes(b.track) ? b.track : null,
    code: s(b.code, 20),
    target_qty: num(b.target_qty),
    unit: s(b.unit, 20),
    effort_h: num(b.effort_h),
    metric: s(b.metric, 60),
    why: s(b.why, 1000),
    how: s(b.how, 2000),
    done_when: s(b.done_when, 1000),
    subject_label: s(b.subject_label, 40),
    sort_order: num(b.sort_order),
    source: s(b.source, 40),
  };
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
      ...defFields(b),
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
    if (b.track && !TRACKS.includes(b.track)) return reply.code(400).send({ error: 'bad_track' });
    // 只把请求里真的出现的字段送去更新：defFields 会把没传的列算成 null，
    // 原样落库等于「改个标题顺手清空了怎么做和完成标准」。
    const clean = defFields(b);
    const patch = {};
    for (const k of Object.keys(clean)) if (k in b) patch[k] = clean[k];
    if ('dept' in b) patch.dept = s(b.dept, 10);
    if ('freq' in b) patch.freq = s(b.freq, 10);
    if ('title' in b) patch.title = s(b.title, 200);
    if ('active' in b) patch.active = b.active ? 1 : 0;
    const item = repo.updateDef(id, patch);
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
    return sopStats(from, to, today); // 统计本身在 services/sopStats.js，周度审核也用同一份
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

  /* ===== 执行流水（v2）=====
     打卡从「一个周期一个勾」变成「一次执行一行」：记下这次做的是哪个对象 + 证据链接。
     这是「今天的 SOP 和昨天的区别」和「一周 5 篇发了几篇」唯一能回答的地方。 */

  // 本周期的流水：?daily=&weekly=&monthly=（period_key 由前端按本地时间算，与 completions 同口径）
  app.get('/api/sop/logs', { preHandler: requireAuth }, async (request) => ({
    items: repo.listLogs({
      daily: s(request.query?.daily, 20),
      weekly: s(request.query?.weekly, 20),
      monthly: s(request.query?.monthly, 20),
    }),
  }));

  // 本周期配额进度：每条 SOP 的 done_qty（SUM(qty)）与最近执行日
  app.get('/api/sop/progress', { preHandler: requireAuth }, async (request) => ({
    items: repo.progress({
      daily: s(request.query?.daily, 20),
      weekly: s(request.query?.weekly, 20),
      monthly: s(request.query?.monthly, 20),
    }),
  }));

  // 某条 SOP 的历史流水（展开「这条都做过什么」）
  app.get('/api/sop/:id/logs', { preHandler: requireAuth }, async (request) => ({
    items: repo.logsForSop(Number(request.params.id), Number(request.query?.limit) || 30),
  }));

  // 记一条执行（任意登录运营）。同时 upsert completion，让周报执行率那套老口径继续成立。
  app.post('/api/sop/logs', editor, async (request, reply) => {
    const b = request.body || {};
    const sopId = Number(b.sop_id);
    const periodKey = s(b.period_key, 20);
    const dayKey = s(b.day_key, 20);
    if (!sopId || !PERIOD_RE.test(periodKey || '')) return reply.code(400).send({ error: 'sop_id_and_period_key_required' });
    if (!DAY_RE.test(dayKey || '')) return reply.code(400).send({ error: 'day_key_required' });
    const def = repo.getDef(sopId);
    if (!def) return reply.code(404).send({ error: 'sop_not_found' });
    // qty 只收正数且设上限：手滑输个 999 会把本周配额一次性"填平"，这种数比空着更有害
    const qty = Math.min(999, Math.max(0.5, num(b.qty) ?? 1));
    // 产出可数的条目（subject_label 非空）必须说清这次做的是哪个对象，否则流水退化成
    // 一排一模一样的勾，「昨天发的哪个产品」又答不出来了 —— 这是整块改造的出发点，不留后门。
    // 判据用 subject_label 不用 target_qty：「周一看数」周目标也是 1 次，但它没有"对象"可填。
    const subject = s(b.subject, 200);
    if (def.subject_label && !subject) return reply.code(400).send({ error: 'subject_required' });
    const evidenceUrl = s(b.evidence_url, 500);
    // 软提醒：同一条证据链接是不是已经被记过（优先报「被别的 SOP 记过」）。
    // 要在插入之前查，否则会匹配到自己刚写进去的这一行。
    const duplicate = evidenceUrl
      ? findDuplicate(repo.logsWithEvidenceSince(daysAgo(dayKey, DUP_WINDOW_DAYS)), evidenceUrl, sopId)
      : null;
    const item = repo.addLog({
      sop_id: sopId, period_key: periodKey, day_key: dayKey, qty,
      subject, detail: s(b.detail, 1000), evidence_url: evidenceUrl,
      logged_by: request.user?.username,
    });
    repo.markComplete(sopId, periodKey, request.user?.username);
    reply.code(201);
    return {
      item,
      done_qty: repo.progress({ k: periodKey }).find((r) => r.sop_id === sopId)?.done_qty ?? qty,
      duplicate, // null = 没撞上；有值时前端出黄条提醒，**不拦**
    };
  });

  // 撤销一条流水。本周期还剩别的流水就只删这一条——做过就是做过，勾不跟着消失。
  app.delete('/api/sop/logs/:id', editor, async (request, reply) => {
    const row = repo.deleteLog(Number(request.params.id));
    if (!row) return reply.code(404).send({ error: 'not_found' });
    if (repo.countLogs(row.sop_id, row.period_key) === 0) repo.unmarkComplete(row.sop_id, row.period_key);
    return { ok: true, item: row };
  });
}
