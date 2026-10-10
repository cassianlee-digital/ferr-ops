/* 投入台账（2026-10-10）：钱花在哪 —— 广告 / 外链 / 其它支出。
 *
 * 经理的原话：「每个月投入的钱都花在哪里，不知道，也没有分析」「花钱买的外链要能直接查到是哪一条、
 * 值不值；不花钱的外链做了哪些、质量怎么样」。所以这一页做三件事：
 *   1. 顶部一行「本月钱花在哪」：广告费（Ads 同步，没有就回退人工周报）+ 外链 + 其它支出；
 *   2. 外链台账：付费和免费记在同一张表，上方并排对比两边的数量、存活、DR；
 *   3. 其它支出台账：工具订阅、内容外包这些逐笔登记，能挂到具体任务上。
 *
 * 诚实口径（规则在后端 services/spend.js，这里只照着显示）：
 *   - 不同币种分开列，绝不相加；Ads 同步的金额是「账户币种」，库里没存是哪种币，就写「账户币种」不猜符号；
 *   - 广告费没有数据源时写「没有数据」，不写 0。
 *
 * 全部用 createElement / textContent 构建，没有 innerHTML，用户录入的网址和文字不经过 HTML 解析。
 * 模块求值期不碰 DOM；事件在第一次进入本页时才绑。
 */
import { closeModal, openModal, toast } from './ui-kit.js';
import { inlineConfirm } from './keywords.js';
import { formatLocalDate } from './timerange.js';

const $ = (id) => document.getElementById(id);
const isHttp = (u) => /^https?:\/\//i.test(String(u || ''));

function h(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = String(text);
  return el;
}
const money = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CURRENCY_LABEL = { ADS_ACCOUNT: 'Ads 账户币种' };
// {币种: 金额} → "USD 300.00 ｜ CNY 800.00"。空 = 没有金额（由调用方决定写什么）
function amountsText(amounts) {
  return Object.entries(amounts || {}).map(([cur, v]) => (CURRENCY_LABEL[cur] || cur) + ' ' + money(v)).join(' ｜ ');
}
function linkEl(url, text, cls) {
  // 后端只收 http(s)；这里再判一次，其它 scheme 只当文本显示
  if (!isHttp(url)) return h('span', cls, text || url || '');
  const a = h('a', cls, text || url);
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = url;
  return a;
}
function shortUrl(u) {
  try { const x = new URL(u); const s = x.host.replace(/^www\./i, '') + (x.pathname === '/' ? '' : x.pathname); return s.length > 48 ? s.slice(0, 47) + '…' : s; }
  catch (e) { return u || ''; }
}

/* ================= 状态 ================= */
let bound = false;
let month = '';            // YYYY-MM
let options = null;        // /api/spend/options
let loadSeq = 0;           // 连点切月时丢弃过期响应
let backlinkRows = [];
let expenseRows = [];
let editing = { backlink: null, expense: null }; // 非空 = 弹框处于编辑模式

function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start_date: `${ym}-01`, end_date: `${ym}-${String(last).padStart(2, '0')}` };
}
function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
const qs = (range) => '?start_date=' + range.start_date + '&end_date=' + range.end_date;
const failText = (e) => (e && e.status === 403 ? '无权操作' : (e && e.message) || '请求失败');

/* ================= 顶部：钱花在哪 ================= */
function adsSourceText(g) {
  if (g.source === 'google_ads') return 'Ads 同步数据 · 账户币种';
  if (g.source === 'sem_weeks') return '人工周报（Ads 本期无同步数据）· 人民币';
  return '没有数据：Ads 本期未同步，也没有人工周报';
}
function renderSummary(data) {
  const box = $('spend-summary'); if (!box) return;
  box.textContent = '';
  const row = h('div', 'spend-groups');
  for (const g of data.groups) {
    const card = h('div', 'spend-group' + (g.key === 'ads' ? ' is-ads' : ''));
    card.appendChild(h('div', 'spend-group-label', g.label));
    const text = amountsText(g.amounts);
    card.appendChild(h('div', 'spend-group-amount' + (text ? '' : ' is-empty'), text || (g.key === 'ads' ? '没有数据' : '本月没有')));
    const sub = g.key === 'ads' ? adsSourceText(g) : (g.count ? g.count + ' 笔' : '');
    if (sub) card.appendChild(h('div', 'spend-group-sub', sub));
    row.appendChild(card);
  }
  box.appendChild(row);
  const total = amountsText(data.totals);
  const line = h('div', 'spend-total');
  line.appendChild(h('b', '', '本月合计'));
  line.appendChild(h('span', '', total || '没有任何支出记录'));
  if (Object.keys(data.totals || {}).length > 1) line.appendChild(h('span', 'spend-total-note', '不同币种不相加'));
  box.appendChild(line);
}
function renderSummaryError(e) {
  const box = $('spend-summary'); if (!box) return;
  box.textContent = '';
  const line = h('div', 'spend-total is-error', '汇总加载失败：' + failText(e) + ' ');
  const btn = h('button', 'btn-mini', '重试'); btn.type = 'button';
  btn.addEventListener('click', loadSpend);
  line.appendChild(btn); box.appendChild(line);
}

/* ================= 外链台账 ================= */
function sideText(label, s) {
  if (!s.count) return label + ' 0 条';
  const parts = [label + ' ' + s.count + ' 条', '有效 ' + s.live + ' / 失效 ' + s.dead + (s.pending ? ' / 待上线 ' + s.pending : ''), 'dofollow ' + s.dofollow];
  // DR 均值要带上「几条里有几条有读数」：3 条只录了 1 条时，这个均值不能当真
  parts.push(s.avg_dr == null ? 'DR 均未录入' : '平均 DR ' + s.avg_dr + '（' + s.count + ' 条里 ' + s.dr_known + ' 条有读数）');
  if (s.never_checked) parts.push(s.never_checked + ' 条从未核查');
  return parts.join(' · ');
}
function renderLinkStats(stats) {
  const box = $('spend-link-stats'); if (!box) return;
  box.textContent = '';
  if (!stats || !stats.total) return;
  box.appendChild(h('div', 'spend-stat', '共 ' + stats.total + ' 条 · 来自 ' + stats.domains + ' 个站'));
  const paid = h('div', 'spend-stat is-paid', sideText('付费', stats.paid));
  const cost = amountsText(stats.paid.cost);
  if (cost) paid.appendChild(h('b', '', '  花费 ' + cost));
  box.appendChild(paid);
  box.appendChild(h('div', 'spend-stat', sideText('免费', stats.free)));
}
const STATUS_BADGE = { 有效: 'b-green', 失效: 'b-red', 待上线: 'b-amber' };
const AUTO_LABEL = { found: '自动核查：链接在', not_found: '自动核查：没找到', unreachable: '自动核查：页面没取到' };
function rowActions(kind, id) {
  const td = h('td', 'ctr spend-ops');
  const edit = h('button', 'btn-mini', '编辑'); edit.type = 'button'; edit.dataset.spendEdit = kind; edit.dataset.id = id;
  const del = h('button', 'btn-mini', '删除'); del.type = 'button'; del.dataset.spendDel = kind; del.dataset.id = id;
  td.append(edit, document.createTextNode(' '), del);
  return td;
}
function emptyRow(tb, cols, text) {
  const tr = h('tr'); const td = h('td', 'dim spend-empty', text); td.colSpan = cols;
  tr.appendChild(td); tb.appendChild(tr);
}
function errorRow(tb, cols, label, e) {
  tb.textContent = '';
  const tr = h('tr'); const td = h('td', 'dim spend-empty', label + '加载失败：' + failText(e) + ' '); td.colSpan = cols;
  const btn = h('button', 'btn-mini', '重试'); btn.type = 'button'; btn.addEventListener('click', loadSpend);
  td.appendChild(btn); tr.appendChild(td); tb.appendChild(tr);
}
function renderBacklinks() {
  const tb = $('tb-backlinks'); if (!tb) return;
  tb.textContent = '';
  if (!backlinkRows.length) { emptyRow(tb, 11, $('spend-links-all').checked ? '还没有登记过外链' : '本月没有登记外链'); return; }
  for (const b of backlinkRows) {
    const tr = h('tr');
    tr.appendChild(h('td', 'num', b.acquired_date || '未填'));
    const src = h('td', 'spend-url');
    src.appendChild(linkEl(b.source_url, shortUrl(b.source_url)));
    if (b.vendor) src.appendChild(h('div', 'dim', '卖家：' + b.vendor));
    if (b.quality_note) src.appendChild(h('div', 'dim', b.quality_note));
    tr.appendChild(src);
    const tgt = h('td', 'spend-url');
    if (b.target_url) tgt.appendChild(linkEl(b.target_url, shortUrl(b.target_url)));
    if (b.anchor) tgt.appendChild(h('div', 'dim', '锚文本：' + b.anchor));
    // 这条外链值不值：看它指向的页面在上线前后的自然搜索表现（弹框与任务的「数据变化」是同一个，在 task-audit.js）
    if (b.target_url && b.acquired_date) {
      const fx = h('button', 'btn-mini spend-effect', '数据变化'); fx.type = 'button'; fx.dataset.backlinkEffect = b.id;
      tgt.appendChild(fx);
    }
    tr.appendChild(tgt);
    tr.appendChild(h('td', 'ctr', b.method || ''));
    tr.appendChild(h('td', 'ctr', b.rel || ''));
    tr.appendChild(h('td', 'num', b.dr == null ? '' : b.dr));
    tr.appendChild(h('td', 'num', b.traffic == null ? '' : Number(b.traffic).toLocaleString('en-US')));
    tr.appendChild(h('td', 'num' + (Number(b.cost) > 0 ? ' spend-paid' : ' dim'), Number(b.cost) > 0 ? b.currency + ' ' + money(b.cost) : '免费'));
    const st = h('td', 'ctr');
    if (b.status) st.appendChild(h('span', 'badge ' + (STATUS_BADGE[b.status] || 'b-gray'), b.status));
    st.appendChild(h('div', 'dim', b.checked_date ? '核查 ' + b.checked_date.slice(5) : '未核查'));
    // 自动核查：服务器去那个页面上找一次链接。结果单独显示，不改上面人工填的状态
    if (b.auto_status) {
      const auto = h('div', 'spend-auto is-' + b.auto_status, AUTO_LABEL[b.auto_status] || b.auto_status);
      auto.title = (b.auto_detail || '') + (b.auto_anchor ? '\n页面上的锚文本：' + b.auto_anchor : '');
      st.appendChild(auto);
    }
    if (b.target_url) {
      const chk = h('button', 'btn-mini spend-check', '自动核查'); chk.type = 'button'; chk.dataset.spendCheck = b.id;
      chk.title = '让服务器去这个页面上找一次指向我们的链接';
      st.appendChild(chk);
    }
    tr.appendChild(st);
    tr.appendChild(h('td', 'spend-task', b.task_content || ''));
    tr.appendChild(rowActions('backlink', b.id));
    tb.appendChild(tr);
  }
}

/* ================= 其它支出 ================= */
function renderExpenses() {
  const tb = $('tb-expenses'); if (!tb) return;
  tb.textContent = '';
  if (!expenseRows.length) { emptyRow(tb, 9, '本月没有登记其它支出'); return; }
  for (const e of expenseRows) {
    const tr = h('tr');
    tr.appendChild(h('td', 'num', e.spend_date));
    const cat = h('td', 'ctr'); cat.appendChild(h('span', 'badge b-gray', e.category)); tr.appendChild(cat);
    const purpose = h('td', 'spend-url', e.purpose);
    if (e.note) purpose.appendChild(h('div', 'dim', e.note));
    tr.appendChild(purpose);
    tr.appendChild(h('td', '', e.vendor || ''));
    tr.appendChild(h('td', 'num spend-paid', e.currency + ' ' + money(e.amount)));
    tr.appendChild(h('td', 'ctr', e.owner || ''));
    tr.appendChild(h('td', 'spend-task', e.task_content || ''));
    const ev = h('td', 'spend-url');
    if (e.evidence) ev.appendChild(linkEl(e.evidence, '查看凭证'));
    else ev.appendChild(h('span', 'spend-noev', '无凭证'));
    tr.appendChild(ev);
    tr.appendChild(rowActions('expense', e.id));
    tb.appendChild(tr);
  }
}

/* ================= 加载 ================= */
export async function loadSpend() {
  bind();
  if (!month) month = formatLocalDate(new Date()).slice(0, 7);
  const input = $('spend-month'); if (input) input.value = month;
  const range = monthRange(month);
  const seq = ++loadSeq;
  const allLinks = $('spend-links-all') && $('spend-links-all').checked;
  // 三块各自成败：汇总挂了不该连台账也看不了
  const [sum, links, exps] = await Promise.allSettled([
    API.get('/api/spend/summary' + qs(range)),
    API.get('/api/backlinks' + (allLinks ? '' : qs(range))),
    API.get('/api/expenses' + qs(range)),
  ]);
  if (seq !== loadSeq) return;
  if (sum.status === 'fulfilled') renderSummary(sum.value); else renderSummaryError(sum.reason);
  if (links.status === 'fulfilled') { backlinkRows = links.value.items || []; renderLinkStats(links.value.stats); renderBacklinks(); }
  else { backlinkRows = []; renderLinkStats(null); errorRow($('tb-backlinks'), 11, '外链台账', links.reason); }
  if (exps.status === 'fulfilled') { expenseRows = exps.value.items || []; renderExpenses(); }
  else { expenseRows = []; errorRow($('tb-expenses'), 9, '支出台账', exps.reason); }
}

/* ================= 表单 ================= */
// [输入框 id, 字段名]。数字与日期留空 = 没填，交给后端按 null 处理
const BACKLINK_FIELDS = [
  ['bl-source', 'source_url'], ['bl-target', 'target_url'], ['bl-anchor', 'anchor'], ['bl-method', 'method'], ['bl-rel', 'rel'],
  ['bl-cost', 'cost'], ['bl-currency', 'currency'], ['bl-vendor', 'vendor'], ['bl-dr', 'dr'], ['bl-traffic', 'traffic'],
  ['bl-status', 'status'], ['bl-date', 'acquired_date'], ['bl-checked', 'checked_date'], ['bl-quality', 'quality_note'],
  ['bl-task', 'task_id'], ['bl-owner', 'owner'], ['bl-note', 'note'],
];
const EXPENSE_FIELDS = [
  ['ex-date', 'spend_date'], ['ex-category', 'category'], ['ex-amount', 'amount'], ['ex-currency', 'currency'],
  ['ex-purpose', 'purpose'], ['ex-vendor', 'vendor'], ['ex-owner', 'owner'], ['ex-task', 'task_id'], ['ex-evidence', 'evidence'], ['ex-note', 'note'],
];
const FORMS = {
  backlink: { fields: BACKLINK_FIELDS, mask: 'backlinkMask', verb: 'bl-verb', api: '/api/backlinks', rows: () => backlinkRows, name: '外链' },
  expense: { fields: EXPENSE_FIELDS, mask: 'expenseMask', verb: 'ex-verb', api: '/api/expenses', rows: () => expenseRows, name: '支出' },
};

function fillSelect(id, values, placeholder, labelOf) {
  const sel = $(id); if (!sel) return;
  const keep = sel.value;
  sel.textContent = '';
  if (placeholder != null) { const o = h('option', '', placeholder); o.value = ''; sel.appendChild(o); }
  for (const v of values) { const o = h('option', '', labelOf ? labelOf(v) : v); o.value = labelOf ? v.id : v; sel.appendChild(o); }
  sel.value = keep;
}
async function ensureOptions() {
  // 每次打开都重拉：任务列表在变，十几行的小接口没必要缓存到失效
  options = await API.get('/api/spend/options');
  fillSelect('bl-method', options.backlink_methods, '未选');
  fillSelect('bl-rel', options.backlink_rels, '未选');
  fillSelect('bl-status', options.backlink_statuses, '未选');
  fillSelect('bl-currency', options.currencies, '未选');
  fillSelect('ex-category', options.expense_categories, '请选择');
  fillSelect('ex-currency', options.currencies, '请选择');
  const taskLabel = (t) => '#' + t.id + ' ' + (t.owner || t.dept || '') + ' · ' + String(t.content || '').slice(0, 40);
  fillSelect('bl-task', options.tasks, '不关联', taskLabel);
  fillSelect('ex-task', options.tasks, '不关联', taskLabel);
}
// 编辑一条关联了「已归档任务」的记录时，那条任务不在候选里；补一个选项，否则保存会把关联悄悄清掉
function ensureTaskOption(selectId, row) {
  const sel = $(selectId);
  if (!sel || !row || row.task_id == null) return;
  if ([...sel.options].some((o) => o.value === String(row.task_id))) return;
  const o = h('option', '', '#' + row.task_id + ' ' + String(row.task_content || '（已归档的任务）').slice(0, 40));
  o.value = String(row.task_id); sel.appendChild(o);
}

async function openForm(kind, row) {
  const form = FORMS[kind];
  try { await ensureOptions(); }
  catch (e) { toast('表单选项加载失败：' + failText(e)); return; }
  editing[kind] = row || null;
  $(form.verb).textContent = row ? '编辑' : '登记';
  ensureTaskOption(kind === 'backlink' ? 'bl-task' : 'ex-task', row);
  for (const [id, key] of form.fields) {
    const el = $(id); if (!el) continue;
    el.value = row && row[key] != null ? row[key] : '';
  }
  if (!row) {
    // 新登记的默认值：日期=今天，币种=人民币，负责人=自己
    const today = formatLocalDate(new Date());
    const me = (window.ME || {}).name || '';
    if (kind === 'backlink') { $('bl-date').value = today; $('bl-owner').value = me; }
    else { $('ex-date').value = today; $('ex-currency').value = 'CNY'; $('ex-owner').value = me; }
  }
  $(kind === 'backlink' ? 'bl-error' : 'ex-error').textContent = '';
  openModal(form.mask);
}
export const openBacklink = () => openForm('backlink', null);
export const openExpense = () => openForm('expense', null);

async function submitForm(kind, btn) {
  const form = FORMS[kind];
  const body = {};
  for (const [id, key] of form.fields) { const el = $(id); if (el) body[key] = el.value; }
  const errEl = $(kind === 'backlink' ? 'bl-error' : 'ex-error');
  const row = editing[kind];
  if (btn) btn.disabled = true;
  try {
    if (row) await API.patch(form.api + '/' + row.id, body);
    else await API.post(form.api, body);
    closeModal(form.mask);
    editing[kind] = null;
    toast((row ? '已更新' : '已登记') + form.name + ' · 已入库');
    loadSpend(); // 汇总和对比都跟着变，整页重拉最不容易对不上
  } catch (e) {
    // 哪个字段不对由后端说（e.message 就是那句话），留在弹框里让人直接改
    errEl.textContent = '未入库：' + failText(e);
  } finally {
    if (btn) btn.disabled = false;
  }
}
export const submitBacklink = (btn) => submitForm('backlink', btn);
export const submitExpense = (btn) => submitForm('expense', btn);

/* ================= 事件 ================= */
function bind() {
  if (bound) return;
  const panel = $('panel-spend'); if (!panel) return;
  bound = true;
  panel.addEventListener('click', async (e) => {
    const step = e.target.closest('[data-spend-month]');
    if (step) { month = shiftMonth(month, Number(step.dataset.spendMonth)); loadSpend(); return; }
    if (e.target.closest('#spend-month-now')) { month = formatLocalDate(new Date()).slice(0, 7); loadSpend(); return; }
    const chk = e.target.closest('[data-spend-check]');
    if (chk) {
      chk.disabled = true; chk.textContent = '核查中…';
      try {
        const { item } = await API.post('/api/backlinks/' + chk.dataset.spendCheck + '/check', {});
        // 把结论和原因直接说出来：没找到 / 没取到都不等于失效，这句话要让人看到
        toast((AUTO_LABEL[item.auto_status] || '已核查') + (item.auto_detail ? ' · ' + item.auto_detail : ''));
        loadSpend();
      } catch (err) { chk.disabled = false; chk.textContent = '自动核查'; toast('核查失败：' + failText(err)); }
      return;
    }
    const edit = e.target.closest('[data-spend-edit]');
    if (edit) {
      const kind = edit.dataset.spendEdit;
      const row = FORMS[kind].rows().find((r) => String(r.id) === edit.dataset.id);
      if (row) openForm(kind, row);
      return;
    }
    const del = e.target.closest('[data-spend-del]');
    if (del) {
      if (!inlineConfirm(del, '确认删除')) return;
      const form = FORMS[del.dataset.spendDel];
      try { await API.del(form.api + '/' + del.dataset.id); toast('已删除' + form.name + '记录'); loadSpend(); }
      catch (err) { toast('删除失败：' + failText(err)); }
    }
  });
  $('spend-month').addEventListener('change', (e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { month = e.target.value; loadSpend(); } });
  $('spend-links-all').addEventListener('change', loadSpend);
}
