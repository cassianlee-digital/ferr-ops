/* 周度审核页（行动中心 → 周度审核，2026-10-10）。
 *
 * 经理要一个能按日期和人员查询、一次性看全的页面：任务与完成情况、SEO/SEM/GEO 数据、询盘质量、
 * 测试、整改、花费、KPI。这一页只读后端的审核包（/api/audit/weekly）并照着画 ——
 * 状态怎么判、疑点怎么算、前后数据怎么比，全在后端，且与导出、AI 审核吃的是同一份数。
 *
 * 画法上的两条：
 *   - 任务按「已完成 / 逾期 / 进行中 / 未完成即归档」分组，每条把结果、证据、数据变化、工时、疑点并排摆出来，
 *     因为审核要问的正是这几样对不对得上；
 *   - 没同步 / 没查过 / 没填，一律明说，不显示成 0。
 * 全部 createElement / textContent，没有 innerHTML：页面上大量内容是人填的文字和网址。
 */
import { toast } from './ui-kit.js';
import { formatLocalDate } from './timerange.js';

const $ = (id) => document.getElementById(id);
const failText = (e) => (e && e.status === 403 ? '无权操作' : (e && e.message) || '请求失败');
const isHttp = (u) => /^https?:\/\//i.test(String(u || ''));
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
}
const num = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }));
const md = (d) => String(d || '').slice(5);
const TONE_BADGE = { bad: 'b-red', warn: 'b-amber', muted: 'b-gray', good: 'b-green' };
const STATE = [['completed', '已完成'], ['overdue', '逾期未完成'], ['in_progress', '进行中'], ['abandoned', '未完成即归档'], ['deleted', '区间内被删除']];
const LINK_LABEL = { page: '页面', campaign: '系列', keyword: '关键词', kpi: 'KPI' };
const EFFECT_STATUS = { PARTIAL: '数据未满', PENDING: '待数据', NOT_SYNCED: '未同步', NO_DATA: '无数据' };
const CURRENCY_LABEL = { ADS_ACCOUNT: 'Ads 账户币种' };
const amounts = (a) => Object.entries(a || {}).map(([c, v]) => (CURRENCY_LABEL[c] || c) + ' ' + num(v)).join(' ｜ ');

let bound = false;
let range = null;     // { start_date, end_date }
let person = 'all';
let pkg = null;
let seq = 0;

/* ---------- 区间 ---------- */
function addDays(ymd, n) { const d = new Date(ymd + 'T00:00:00'); d.setDate(d.getDate() + n); return formatLocalDate(d); }
function weekOf(ymd) {
  const d = new Date(ymd + 'T00:00:00');
  const start = addDays(ymd, -((d.getDay() + 6) % 7)); // 周一为一周的第一天
  return { start_date: start, end_date: addDays(start, 6) };
}
const query = () => 'start_date=' + range.start_date + '&end_date=' + range.end_date
  + '&person=' + encodeURIComponent(person) + '&today=' + formatLocalDate(new Date());

/* ---------- 小部件 ---------- */
function card(title, sub) {
  const c = el('div', 'card audit-card');
  const head = el('div', 'card-head');
  head.appendChild(el('span', 'card-title', title));
  if (sub) head.appendChild(el('span', 'card-sub', sub));
  c.appendChild(head);
  return c;
}
function table(headers, rows, cls) {
  const t = el('table', 'dt audit-table ' + (cls || ''));
  const thead = el('thead'); const hr = el('tr');
  headers.forEach((h) => hr.appendChild(el('th', h.cls || '', h.label || h)));
  thead.appendChild(hr); t.appendChild(thead);
  const tb = el('tbody');
  rows.forEach((cells) => {
    const tr = el('tr');
    cells.forEach((c, i) => {
      const td = el('td', (headers[i] && headers[i].cls) || '');
      if (c instanceof Node) td.appendChild(c); else td.textContent = c == null ? '' : String(c);
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  return t;
}
const empty = (text) => el('div', 'audit-empty', text);
function linkEl(url, text) {
  if (!isHttp(url)) return el('span', '', text || url || '');
  const a = el('a', 'audit-link', text || url); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = url;
  return a;
}
function shortUrl(u) { try { const x = new URL(u); const s = x.host.replace(/^www\./, '') + (x.pathname === '/' ? '' : x.pathname); return s.length > 40 ? s.slice(0, 39) + '…' : s; } catch (e) { return u || ''; } }
function deltaSpan(m) {
  const d = m.delta; const s = el('span', 'audit-delta');
  if (!d) { s.textContent = ''; return s; }
  s.textContent = (d.abs > 0 ? '+' : '') + num(d.abs) + (d.pct != null ? '（' + (d.pct > 0 ? '+' : '') + Math.round(d.pct * 100) + '%）' : '');
  if (d.abs !== 0 && m.better !== 'neutral') s.classList.add((m.better === 'higher' ? d.abs > 0 : d.abs < 0) ? 'is-good' : 'is-bad');
  return s;
}

/* ---------- 概要 ---------- */
function summaryBlock(name, s) {
  const b = el('div', 'audit-person');
  b.appendChild(el('div', 'audit-person-name', name));
  const big = el('div', 'audit-person-big');
  big.appendChild(el('b', '', s.completed)); big.appendChild(document.createTextNode(' 条完成'));
  b.appendChild(big);
  const line = (t, cls) => b.appendChild(el('div', 'audit-person-line ' + (cls || ''), t));
  line('进行中 ' + s.in_progress + ' · 逾期 ' + s.overdue + ' · 未完成即归档 ' + s.abandoned + (s.deleted ? ' · 被删除 ' + s.deleted : ''), s.overdue ? 'is-bad' : '');
  if (s.completed) {
    line('有结果 ' + s.with_result + '/' + s.completed + ' · 有证据 ' + s.with_evidence + '/' + s.completed);
    line('有可量化关联 ' + s.with_links + '/' + s.completed + ' · 有完整前后数据 ' + s.with_effect_data + '/' + s.completed);
    line(s.hours_known
      ? '工时：预估 ' + num(s.est_hours) + 'h → 实际 ' + num(s.actual_hours) + 'h（' + s.hours_known + '/' + s.completed + ' 条两项都填了）'
      : '工时：没有一条同时填了预估和实际，无法比较', s.hours_known ? '' : 'is-warn');
  }
  if (s.flagged) line(s.flagged + ' 条有严重疑点', 'is-bad');
  return b;
}
function renderSummary(root) {
  const c = card('概要', pkg.meta.range.start_date + ' ~ ' + pkg.meta.range.end_date);
  const grid = el('div', 'audit-people');
  if (pkg.meta.person === 'all') grid.appendChild(summaryBlock('全部（含公司任务）', pkg.summary.all));
  pkg.summary.people.forEach((p) => grid.appendChild(summaryBlock(p.person + ' · ' + p.dept, p)));
  c.appendChild(grid);
  const notes = el('details', 'audit-notes');
  notes.appendChild(el('summary', '', '读这些数之前要知道的口径'));
  pkg.meta.notes.forEach((n) => notes.appendChild(el('div', '', '· ' + n)));
  c.appendChild(notes);
  root.appendChild(c);
}

/* ---------- 任务 ---------- */
const DONE_TEXT = { 0: '未完成', 1: '已完成' };
const changeValue = (c, v) => (v == null ? '（空）' : c.field === 'done' ? DONE_TEXT[v] || v : c.field === 'important' ? '已标重要' : (String(v).length > 40 ? String(v).slice(0, 39) + '…' : v));
const changeText = (c) => c.label + ' ' + changeValue(c, c.old) + ' → ' + changeValue(c, c.new) + '（' + (c.by || '未记录') + ' ' + md(c.date) + '）';
function taskCell(t) {
  const box = el('div', 'audit-task');
  box.appendChild(el('div', 'audit-task-title', '#' + t.id + ' ' + (t.content || '')));
  const meta = el('div', 'audit-task-meta');
  if (t.is_important) { const b = el('span', 'badge b-red', '重要'); b.title = t.important_reason_text || ''; meta.appendChild(b); }
  if (t.project) meta.appendChild(el('span', 'badge b-gray', t.project));
  meta.appendChild(el('span', '', (t.person || t.dept || '未指派') + (t.owner && t.owner !== t.person ? '（' + t.owner + '）' : '')));
  const span = t.start_date && t.task_date && t.start_date !== t.task_date ? md(t.start_date) + ' ~ ' + md(t.task_date) : md(t.task_date || t.start_date);
  if (span) meta.appendChild(el('span', '', '计划 ' + span));
  if (t.done_date) meta.appendChild(el('span', '', '完成 ' + md(t.done_date)));
  if (t.deleted_date) meta.appendChild(el('span', '', '删除 ' + md(t.deleted_date) + ' · ' + (t.deleted_by || '删除人未记录')));
  box.appendChild(meta);
  // 这段时间里它被改过什么（截止日往后挪、完成后改结果…）：原样列出，判断留给看的人
  if (t.changes.length) box.appendChild(el('div', 'audit-task-changes', '改动：' + t.changes.map(changeText).join('；')));
  if (t.links.length) box.appendChild(el('div', 'audit-task-links', t.links.map((l) => (LINK_LABEL[l.type] || l.type) + ' ' + (l.type === 'page' ? shortUrl(l.ref) : (l.label || l.ref))).join(' · ')));
  return box;
}
function resultCell(t) {
  const box = el('div', 'audit-result');
  if (t.audit_state !== 'completed' && !(t.audit_state === 'deleted' && t.done_date)) { box.appendChild(el('span', 'dim', t.done_when ? '完成标准：' + t.done_when : '—')); return box; }
  box.appendChild(t.result ? el('div', 'audit-result-text', t.result) : el('div', 'audit-missing', '结果未记录'));
  if (t.task_actions) box.appendChild(el('div', 'audit-actions', t.task_actions));
  const ev = el('div', 'audit-evidence');
  t.evidence.forEach((u) => ev.appendChild(linkEl(u, shortUrl(u))));
  if (t.evidence_images.length) ev.appendChild(el('span', '', t.evidence_images.length + ' 张截图'));
  if (!t.evidence.length && !t.evidence_images.length) ev.appendChild(el('span', t.is_important ? 'audit-missing' : 'dim', '无证据'));
  box.appendChild(ev);
  return box;
}
function effectCell(t) {
  const box = el('div', 'audit-effect');
  if (t.audit_state !== 'completed') return box;
  if (!t.effect.length) { box.appendChild(el('span', 'dim', '没有可量化的关联对象')); return box; }
  for (const e of t.effect) {
    const head = el('div', 'audit-effect-head', (LINK_LABEL[e.type] || e.type) + ' ' + (e.type === 'page' ? shortUrl(e.ref) : (e.label || e.ref)) + (e.source === 'ads' ? ' · 广告' : e.source === 'ga4' ? ' · 落地页（GA4）' : ''));
    if (e.status !== 'OK') head.appendChild(el('span', 'badge b-gray', (EFFECT_STATUS[e.status] || e.status) + (e.days ? ' ' + e.days + ' 天' : '')));
    box.appendChild(head);
    e.metrics.filter((m) => m.delta).forEach((m) => {
      const line = el('div', 'audit-effect-line', m.label + ' ' + num(m.before) + ' → ' + num(m.after) + ' ');
      line.appendChild(deltaSpan(m)); box.appendChild(line);
    });
  }
  const btn = el('button', 'btn-mini', '完整对比'); btn.type = 'button'; btn.dataset.taskEffect = t.id; // 弹框与委托在 task-audit.js
  box.appendChild(btn);
  return box;
}
function hoursCell(t) {
  const box = el('div', 'audit-hours');
  box.appendChild(el('div', '', '预估 ' + (t.est_hours == null ? '未填' : num(t.est_hours) + 'h')));
  if (t.audit_state === 'completed') box.appendChild(el('div', '', '实际 ' + (t.actual_hours == null ? '未填' : num(t.actual_hours) + 'h')));
  if (t.checkin_days) box.appendChild(el('div', 'dim', '本期推进 ' + t.checkin_days + ' 天'));
  return box;
}
function flagsCell(t) {
  const box = el('div', 'audit-flags');
  if (!t.flags.length) { box.appendChild(el('span', 'dim', '无')); return box; }
  t.flags.forEach((f) => { const meta = pkg.meta.flags[f] || { label: f, tone: 'muted' }; box.appendChild(el('span', 'badge ' + (TONE_BADGE[meta.tone] || 'b-gray'), meta.label)); });
  return box;
}
function renderTasks(root) {
  const c = card('任务', pkg.tasks.length + ' 条与这段时间有关');
  if (!pkg.tasks.length) { c.appendChild(empty('这段时间没有任何任务记录。')); root.appendChild(c); return; }
  for (const [key, label] of STATE) {
    const rows = pkg.tasks.filter((t) => t.audit_state === key);
    if (!rows.length) continue;
    c.appendChild(el('div', 'audit-group audit-group-' + key, label + ' ' + rows.length));
    c.appendChild(table(['任务', '结果与证据', '数据变化（完成前后各 ' + pkg.meta.effect_days + ' 天）', '工时', '疑点'],
      rows.map((t) => [taskCell(t), resultCell(t), effectCell(t), hoursCell(t), flagsCell(t)]), 'audit-tasks'));
  }
  root.appendChild(c);
}

/* ---------- 数据：SEO / SEM / GEO ---------- */
function trendTable(t, labels) {
  if (t.status !== 'OK') return empty('这段时间没有同步数据（不是 0）。');
  return table(['指标', { label: '本期', cls: 'num' }, { label: '上期', cls: 'num' }, { label: '变化', cls: 'num' }],
    Object.keys(t.current).map((k) => [labels[k][0], num(t.current[k]), t.previous ? num(t.previous[k]) : '—', deltaSpan({ delta: t.delta[k], better: labels[k][1] })]));
}
function renderData(root) {
  if (!pkg.seo && !pkg.sem) return;
  const c = card('数据', '本期对比上一等长区间 · 全站 / 全账户口径');
  const grid = el('div', 'audit-cols');
  if (pkg.seo) { const b = el('div'); b.appendChild(el('div', 'audit-sub', '自然搜索（GSC）' + (pkg.seo.days_with_data ? ' · ' + pkg.seo.days_with_data + ' 天有数据' : ''))); b.appendChild(trendTable(pkg.seo, { clicks: ['点击', 'higher'], impressions: ['曝光', 'higher'], position: ['平均排名', 'lower'] })); grid.appendChild(b); }
  if (pkg.sem) { const b = el('div'); b.appendChild(el('div', 'audit-sub', '广告（Ads，账户币种）' + (pkg.sem.days_with_data ? ' · ' + pkg.sem.days_with_data + ' 天有数据' : ''))); b.appendChild(trendTable(pkg.sem, { cost: ['花费', 'neutral'], clicks: ['点击', 'higher'], conversions: ['转化', 'higher'], cpa: ['每转化成本', 'lower'] })); grid.appendChild(b); }
  c.appendChild(grid);
  const g = pkg.geo;
  if (g) {
    c.appendChild(el('div', 'audit-sub', 'GEO（AI 引擎）'));
    const line = el('div', 'audit-line');
    line.textContent = g.status === 'OK'
      ? 'AI 引擎带来的访问 ' + num(g.totals.sessions) + '（上期 ' + (g.totals.prev_sessions == null ? '无数据' : num(g.totals.prev_sessions)) + '）'
        + (g.engines.length ? '：' + g.engines.map((e) => e.label + ' ' + num(e.sessions)).join('、') : '') + ' · 带来询盘 ' + g.inquiries.total + ' 条'
      : '这段时间 GA4 没有同步数据，看不到 AI 引擎带来的访问。';
    c.appendChild(line);
    const cite = g.citations;
    c.appendChild(el('div', 'audit-line', cite
      ? '引用抽查（' + cite.round_date + '）：已查 ' + cite.totals.checked + '/' + cite.totals.expected + ' 格 · 提到我们 ' + cite.totals.mentioned + ' · 引用我们的页面 ' + cite.totals.cited
      : '引用抽查：这段时间结束之前还没有做过。'));
  }
  root.appendChild(c);
}

/* ---------- 询盘 / 线索 ---------- */
const mapText = (m) => Object.entries(m || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · ');
function renderInquiries(root) {
  const q = pkg.inquiries;
  const c = card('询盘质量', '部门口径，不按人拆');
  if (!q.total) { c.appendChild(empty('这段时间没有录入询盘。')); }
  else {
    c.appendChild(el('div', 'audit-line', '共 ' + q.total + ' 条：A ' + q.by_grade.A + ' · B ' + q.by_grade.B + ' · C ' + q.by_grade.C
      + '（C 级占 ' + Math.round(q.junk_ratio * 100) + '%）· 成交 ' + q.deals + ' · 有表单来源证据 ' + q.with_form_evidence + '/' + q.total));
    const cf = q.confirmation;
    if (cf && cf.total) {
      // 等级是录入人自己评的：上面的 A / B 数里有多少经过经理或老板确认，决定了它能信到什么程度
      c.appendChild(el('div', 'audit-line' + (cf.unconfirmedRate >= 50 ? ' audit-missing' : ''),
        '渠道与等级已确认 ' + cf.confirmed + '/' + cf.total + '（' + cf.confirmedRate + '%）· 待确认 ' + cf.proposed + ' · 历史未审 ' + cf.legacy));
    }
    c.appendChild(el('div', 'audit-line', '渠道：' + mapText(q.by_channel)));
    c.appendChild(el('div', 'audit-line', '来源对账：' + mapText(q.by_source_verdict)));
    const SHOW = 40;
    c.appendChild(table(['日期', '国家', '渠道', '产品', { label: '等级', cls: 'ctr' }, '确认', '来源词 / 系列 / 落地页', '对账', '成交'],
      q.items.slice(0, SHOW).map((i) => [md(i.date), i.country, i.channel, i.product, i.grade,
        i.confirmation_label + (i.attr_change_count ? ' · 改 ' + i.attr_change_count : ''),
        [i.source, i.src_campaign, i.src_landing_page && shortUrl(i.src_landing_page)].filter(Boolean).join(' · '),
        (i.src_evidence === 'form' ? '表单来源' : i.source_verdict_label) || '', i.deal_status || ''])));
    if (q.items.length > SHOW) c.appendChild(el('div', 'dim audit-more', '只显示前 ' + SHOW + ' 条，全部 ' + q.items.length + ' 条在导出文件里。'));
  }
  // 这两张表不受「本期有没有录入询盘」影响：成交的可能是几个月前的询盘，归档的也是
  if (q.deals_marked.length) {
    c.appendChild(el('div', 'audit-sub', '本期标为成交 ' + q.deals_marked.length + ' 条（询盘可能是更早来的）'));
    c.appendChild(table(['询盘日期', '国家', '渠道', '产品', { label: '等级', cls: 'ctr' }, '来源词 / 系列', '标记成交', '标记人'],
      q.deals_marked.map((d) => [d.inquiry_date, d.country, d.channel, d.product, d.grade, [d.source, d.src_campaign].filter(Boolean).join(' · '), md(d.marked_date), d.marked_by || '未记录'])));
  }
  if (q.archived_items.length) {
    c.appendChild(el('div', 'audit-sub', '本期被归档的询盘 ' + q.archived_items.length + ' 条（已不计入上面的任何数）'));
    c.appendChild(table(['询盘日期', '国家', '渠道', '产品', { label: '等级', cls: 'ctr' }, '归档前', '归档日', '归档人'],
      q.archived_items.map((i) => [i.date, i.country, i.channel, i.product, i.grade, i.confirmation_label, md(i.archived_date), i.archived_by || '未记录'])));
  }
  const l = pkg.leads;
  c.appendChild(el('div', 'audit-sub', '表单线索'));
  c.appendChild(el('div', 'audit-line', l.total ? '收到 ' + l.total + ' 条：已转询盘 ' + l.converted + ' · 已忽略 ' + l.ignored + ' · 待处理 ' + l.new : '这段时间没有收到表单线索（没接入独立站表单时这里一直是空的）。'));
  const ignored = l.items.filter((x) => x.state === 'ignored');
  if (ignored.length) c.appendChild(table(['日期', '忽略原因', '关键词', '系列', '落地页'], ignored.map((x) => [md(x.received_date), x.ignore_reason, x.keyword, x.campaign, x.landing_page && shortUrl(x.landing_page)])));
  root.appendChild(c);
}

/* ---------- 其余几块 ---------- */
function renderSop(root) {
  const c = card('SOP 执行', '算到 ' + pkg.sop.counted_to);
  const rows = pkg.sop.items.filter((s) => s.expected != null);
  if (!rows.length) c.appendChild(empty('没有配置日 / 周 SOP。'));
  else c.appendChild(table(['SOP', { label: '部门', cls: 'ctr' }, { label: '已做 / 应做', cls: 'num' }, '漏了哪几天'],
    rows.map((s) => [s.title, s.dept, s.done + ' / ' + s.expected, (s.missed_days || []).map(md).join('、')])));
  root.appendChild(c);
}
function renderFixesTests(root) {
  const c = card('整改与测试');
  c.appendChild(el('div', 'audit-sub', '整改（本期到期或本期登记）'));
  c.appendChild(pkg.fixes.length
    ? table(['问题', { label: '负责人', cls: 'ctr' }, { label: '截止', cls: 'num' }, { label: '结果', cls: 'ctr' }, '依据', { label: '日计划', cls: 'ctr' }],
      pkg.fixes.map((f) => [f.title, f.owner || f.dept, md(f.due_date), f.status, f.evidence, f.planned ? (f.planned_done ? '已做完' : '已排入') : '没人接']))
    : empty('这段时间没有到期或新登记的整改。'));
  c.appendChild(el('div', 'audit-sub', '测试（本期新登记，以及还没写结论的）'));
  c.appendChild(pkg.tests.length
    ? table(['测试', { label: '部门', cls: 'ctr' }, '假设', '变量', '起止', '结论'],
      pkg.tests.map((t) => [t.content, t.dept, t.hypothesis, t.variable, t.period, t.conclusion || '（还没有结论）']))
    : empty('没有在跑的测试，这段时间也没有新登记。'));
  root.appendChild(c);
}
function renderSpendKpi(root) {
  const c = card('花费', '部门口径');
  c.appendChild(table(['去向', '金额（不同币种不相加）', { label: '笔数', cls: 'num' }],
    [...pkg.spend.groups.map((g) => [g.label, amounts(g.amounts) || (g.key === 'ads' ? '没有数据' : '本期没有'), g.count == null ? '' : g.count]),
      ['合计', amounts(pkg.spend.totals) || '没有任何支出记录', '']]));
  const gone = pkg.spend.deleted_items || [];
  if (gone.length) {
    c.appendChild(el('div', 'audit-sub', '本期被删除的花费记录 ' + gone.length + ' 笔（已不计入上面的合计）'));
    c.appendChild(table(['台账', '花费日期', '内容', '金额', '负责人', '删除日', '删除人'],
      gone.map((d) => [d.kind === 'backlink' ? '外链' : '其它支出', d.date || '未填', d.what || '', (CURRENCY_LABEL[d.currency] || d.currency || '') + ' ' + num(d.amount), d.owner || '', d.deleted_date, d.deleted_by || '未记录'])));
  }
  root.appendChild(c);
  const k = pkg.kpi;
  const kc = card('KPI（月度考核口径 · 本月至今）', k.scope_label + ' · ' + k.range.start_date + ' ~ ' + k.range.end_date);
  kc.appendChild(el('div', 'audit-line', (k.gradable ? '得分 ' + num(k.score) + (k.band ? ' · ' + k.band : '') : '参考分 ' + num(k.provisional_score) + '（' + k.status_label + '，未出正式分）')));
  kc.appendChild(table(['指标', { label: '权重', cls: 'num' }, { label: '实际', cls: 'num' }, { label: '目标', cls: 'num' }, { label: '状态', cls: 'ctr' }, { label: '得分', cls: 'num' }],
    k.metrics.map((m) => [m.label, m.weight, num(m.actual), num(m.target), m.status_label, num(m.score)])));
  root.appendChild(kc);
}
function renderReports(root) {
  if (!pkg.weekly_reports.length) return;
  const c = card('他们自己写的周报');
  pkg.weekly_reports.forEach((w) => {
    c.appendChild(el('div', 'audit-sub', w.dept + ' · ' + w.week_key + ' 那一周'));
    [['本周工作总结', w.summary], ['遇到的问题', w.problems], ['分析', w.analysis], ['下周计划', w.next_plan]].forEach(([label, items]) => {
      c.appendChild(el('div', 'audit-line', label + '：' + ((items || []).length ? items.join('；') : '（没写）')));
    });
  });
  root.appendChild(c);
}

/* ---------- AI 审核意见 ---------- */
const ref = (o) => (o && o.task_id != null ? '任务 #' + o.task_id + '：' : '');
function aiList(box, title, items, fmt) {
  if (!Array.isArray(items) || !items.length) return;
  box.appendChild(el('div', 'audit-ai-h', title));
  const ul = el('ul', 'audit-ai-list');
  items.forEach((i) => ul.appendChild(el('li', '', typeof i === 'string' ? i : fmt(i))));
  box.appendChild(ul);
}
function renderAi(item) {
  const box = $('audit-ai'); box.textContent = '';
  if (!item) return;
  const c = card('AI 审核意见', '生成于 ' + String(item.updated_at || '').replace('T', ' ').slice(0, 16) + ' UTC' + (item.history ? ' · 之前还跑过 ' + item.history + ' 次' : ''));
  c.appendChild(el('div', 'audit-ai-note', 'AI 只读上面这份数据写意见，结论后面的任务编号可以回到任务表里核对。它是参考，不是裁决。'));
  const p = item.parsed;
  if (!p) {
    c.appendChild(el('div', 'audit-missing', 'AI 这次没有按约定的结构返回，下面是它的原文：'));
    c.appendChild(el('pre', 'audit-ai-raw', item.text));
    box.appendChild(c); return;
  }
  if (p.overview) c.appendChild(el('div', 'audit-ai-overview', p.overview));
  (p.people || []).forEach((who) => {
    const b = el('div', 'audit-ai-person');
    b.appendChild(el('div', 'audit-person-name', who.person || ''));
    aiList(b, '做了什么', who.did, (x) => ref(x) + (x.what || ''));
    aiList(b, '有数据支持的变化', who.verified_changes, (x) => ref(x) + (x.evidence || '') + (x.confidence ? '（把握：' + x.confidence + '）' : ''));
    aiList(b, '还不能算数的', who.unverified, (x) => ref(x) + (x.why || ''));
    if (who.time) { b.appendChild(el('div', 'audit-ai-h', '工时')); b.appendChild(el('div', 'audit-line', who.time)); }
    if (who.quality) { b.appendChild(el('div', 'audit-ai-h', '质量')); b.appendChild(el('div', 'audit-line', who.quality)); }
    aiList(b, '需要当面问的问题', who.questions, (x) => x);
    c.appendChild(b);
  });
  const sec = (title, o) => {
    if (!o) return;
    const b = el('div', 'audit-ai-person'); b.appendChild(el('div', 'audit-person-name', title));
    if (o.finding) b.appendChild(el('div', 'audit-line', o.finding));
    aiList(b, '垃圾询盘可能的来源', o.junk_causes, (x) => x);
    aiList(b, '建议动作', o.actions, (x) => x);
    c.appendChild(b);
  };
  sec('询盘', p.inquiries); sec('花费', p.spend);
  if (Array.isArray(p.next_week) && p.next_week.length) {
    c.appendChild(el('div', 'audit-ai-h', '下周建议'));
    c.appendChild(table(['动作', { label: '谁', cls: 'ctr' }, '用哪个数验证', '依据'], p.next_week.map((x) => [x.action, x.owner, x.metric, x.based_on])));
  }
  aiList(c, '因为缺数据而下不了结论的地方', p.data_gaps, (x) => x);
  box.appendChild(c);
}

/* ---------- 加载 ---------- */
function render() {
  const root = $('audit-body'); root.textContent = '';
  renderSummary(root); renderTasks(root); renderSop(root); renderData(root); renderInquiries(root);
  renderFixesTests(root); renderSpendKpi(root); renderReports(root);
}
export async function loadAudit() {
  bind();
  if (!range) range = weekOf(formatLocalDate(new Date()));
  $('audit-start').value = range.start_date; $('audit-end').value = range.end_date; $('audit-person').value = person;
  const my = ++seq;
  const root = $('audit-body'); root.textContent = ''; root.appendChild(empty('正在取这段时间的记录…'));
  $('audit-ai').textContent = '';
  try {
    const [data, ai] = await Promise.all([API.get('/api/audit/weekly?' + query()), API.get('/api/audit/weekly/ai?' + query()).catch(() => ({ item: null }))]);
    if (my !== seq) return;
    pkg = data; render(); renderAi(ai.item);
  } catch (e) {
    if (my !== seq || (e && e.message === 'unauthorized')) return;
    root.textContent = '';
    root.appendChild(el('div', 'audit-missing', '审核数据加载失败：' + failText(e) + ' '));
    const retry = el('button', 'btn-mini', '重试'); retry.type = 'button'; retry.addEventListener('click', loadAudit);
    root.appendChild(retry);
  }
}

export async function runAuditAi(btn) {
  if (!range) return;
  const body = { start_date: range.start_date, end_date: range.end_date, person, today: formatLocalDate(new Date()) };
  const labelEl = $('audit-ai-label'); const label = labelEl.textContent; // 只换文字那一截，按钮里的图标不动
  if (btn) btn.disabled = true;
  labelEl.textContent = 'AI 审核中，约需一分钟…';
  try {
    const { item } = await API.post('/api/audit/weekly/ai', body);
    renderAi(item);
    $('audit-ai').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('AI 审核意见已生成');
  } catch (e) {
    // 审核页不依赖 AI：它不可用时把原因说出来，上面的数据和疑点照常能看
    toast('AI 审核没有跑成：' + failText(e));
  } finally {
    if (btn) btn.disabled = false;
    labelEl.textContent = label;
  }
}

// 导出就是把同一份审核包换个格式下载；走浏览器自己的下载（带着登录 cookie 的 GET）
export function exportAudit(format) {
  if (!range) return;
  let url = '/api/audit/weekly/export?' + query() + '&format=' + format;
  if (format === 'csv') {
    const section = $('audit-csv-section').value;
    if (!section) { toast('先选要导出哪一张表'); return; }
    url += '&section=' + section;
  }
  const a = document.createElement('a'); a.href = url; a.download = ''; document.body.appendChild(a); a.click(); a.remove();
}

function bind() {
  if (bound) return;
  const panel = $('panel-audit'); if (!panel) return;
  bound = true;
  panel.addEventListener('click', (e) => {
    const step = e.target.closest('[data-audit-week]');
    if (step) { const n = Number(step.dataset.auditWeek); range = n ? weekOf(addDays(range.start_date, 7 * n)) : weekOf(formatLocalDate(new Date())); loadAudit(); }
  });
  const onDate = () => {
    const s = $('audit-start').value; const en = $('audit-end').value;
    if (!s || !en) return;
    if (s > en) { toast('开始日期不能晚于结束日期'); return; }
    range = { start_date: s, end_date: en }; loadAudit();
  };
  $('audit-start').addEventListener('change', onDate);
  $('audit-end').addEventListener('change', onDate);
  $('audit-person').addEventListener('change', (e) => { person = e.target.value; loadAudit(); });
}
