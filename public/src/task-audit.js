/* 可审计任务（前端）。经理 2026-10-10 的反馈：后台只记了「做了多少事」，答不出
 * 「结果是什么、证据在哪、动的是哪个页面/系列/关键词、花了多久」。这个模块管三块界面：
 *
 *   1. 任务弹框里的审计字段：产品/项目、预估工时、重要标记、关联对象编辑器；
 *   2. 完成弹框：勾完成 = 交结果。所有任务必须写完成结果，重要任务还要证据（链接或截图）；
 *   3. 卡片 / 归档页上的审计信息块（关联、结果、动作、证据、工时）。
 *
 * 规则只有一份，在后端 services/taskAudit.js：谁算重要、缺什么不能完成，都由服务端判，
 * 这里只把服务端回的原因原样显示出来 —— 前端再抄一遍规则，两边迟早对不上。
 *
 * 依赖方向：只 import 基础设施（ui-kit / attachments / catalog / keywords 的 inlineConfirm），
 * closed-loop / archive / app 来 import 它。模块求值期不碰 DOM，事件在第一次用到时才绑。
 */
import { esc, openModal, closeModal, toast } from './ui-kit.js';
import { deleteImage, pickAndUpload, thumbsHtml } from './attachments.js';
import { inlineConfirm } from './keywords.js';
import { PRODUCT_NAMES } from './catalog.js';

const $ = (id) => document.getElementById(id);
const LINK_LABEL = { page: '页面', campaign: '系列', keyword: '关键词', kpi: 'KPI' };
const KPI_GROUP_LABEL = { review: '考核指标', process: '过程指标（不计入考核）' };
const isHttp = (u) => /^https?:\/\//i.test(String(u || ''));

/* ================= 关联对象编辑器（任务弹框） ================= */
const OPTIONS_TTL_MS = 10 * 60 * 1000; // 候选来自同步数据，十分钟内不重复拉
let linkOptions = null;
let linkOptionsAt = 0;
let draftLinks = [];
let linkEditorBound = false;

async function loadLinkOptions() {
  if (linkOptions && Date.now() - linkOptionsAt < OPTIONS_TTL_MS) return linkOptions;
  try {
    linkOptions = await API.get('/api/loop-items/link-options');
    linkOptionsAt = Date.now();
  } catch (e) {
    // 候选拉不到不该挡住建任务：页面和关键词仍可手填，只是没有下拉提示
    if (e && e.message !== 'unauthorized') toast('关联候选加载失败：' + ((e && e.message) || '请求失败'));
    linkOptions = linkOptions || { campaigns: [], pages: [], keywords: [], kpis: [] };
  }
  return linkOptions;
}

function option(value, text) {
  const o = document.createElement('option');
  o.value = value; o.textContent = text;
  return o;
}

// 按类型换输入控件：页面/关键词 = 可手填的输入框 + 候选；系列/KPI = 只能从已知值里选
function renderLinkInput() {
  const box = $('task-link-value'); const typeEl = $('task-link-type');
  if (!box || !typeEl) return;
  const type = typeEl.value; const opts = linkOptions || {};
  box.textContent = '';
  if (type === 'page' || type === 'keyword') {
    const input = document.createElement('input');
    input.type = 'text'; input.id = 'task-link-input';
    input.placeholder = type === 'page' ? 'https://… 完整网址' : '关键词原文';
    input.setAttribute('list', 'task-link-list');
    const list = document.createElement('datalist'); list.id = 'task-link-list';
    ((type === 'page' ? opts.pages : opts.keywords) || []).forEach((v) => list.appendChild(option(v, v)));
    box.append(input, list);
    return;
  }
  const sel = document.createElement('select'); sel.id = 'task-link-input';
  if (type === 'campaign') {
    const list = opts.campaigns || [];
    // 没同步过系列就没法关联：手敲的名字对不上任何花费数据，宁可明说也不给一个假输入框
    sel.appendChild(option('', list.length ? '选择广告系列…' : '尚无已同步的广告系列'));
    sel.disabled = !list.length;
    list.forEach((c) => sel.appendChild(option(c.id, c.name || c.id)));
  } else {
    sel.appendChild(option('', '选择 KPI…'));
    for (const group of Object.keys(KPI_GROUP_LABEL)) {
      const items = (opts.kpis || []).filter((k) => k.group === group);
      if (!items.length) continue;
      const og = document.createElement('optgroup'); og.label = KPI_GROUP_LABEL[group];
      items.forEach((k) => og.appendChild(option(k.key, k.label)));
      sel.appendChild(og);
    }
  }
  box.appendChild(sel);
}

function linkText(l) {
  if (l.type === 'page') { try { const u = new URL(l.ref); return (u.pathname + u.search) || '/'; } catch (e) { return l.ref; } }
  return l.label || l.ref;
}

function renderLinkChips() {
  const box = $('task-link-chips'); if (!box) return;
  box.textContent = '';
  draftLinks.forEach((l, i) => {
    const chip = document.createElement('span'); chip.className = 'tlink-chip'; chip.title = l.ref;
    const kind = document.createElement('b'); kind.textContent = LINK_LABEL[l.type] || l.type;
    const del = document.createElement('button'); del.type = 'button'; del.className = 'tlink-del';
    del.dataset.linkIdx = String(i); del.title = '移除'; del.textContent = '×';
    chip.append(kind, document.createTextNode(linkText(l)), del);
    box.appendChild(chip);
  });
}

// 读输入框里还没点「添加」的那一条。返回 null = 空；返回 string = 不合法的原因
function pendingLink() {
  const typeEl = $('task-link-type'); const input = $('task-link-input');
  if (!typeEl || !input) return null;
  const type = typeEl.value; let ref = String(input.value || '').trim();
  if (!ref) return null;
  let label = null;
  if (type === 'page' && !isHttp(ref)) return '页面要填完整网址（http/https 开头）';
  if (type === 'keyword') ref = ref.toLowerCase().replace(/\s+/g, ' ');
  if (type === 'campaign' || type === 'kpi') label = input.options[input.selectedIndex].textContent;
  return { type, ref, label };
}

export function addTaskLink() {
  const l = pendingLink();
  if (l === null) { toast('先选择或填写要关联的对象'); return false; }
  if (typeof l === 'string') { toast(l); return false; }
  if (!draftLinks.some((x) => x.type === l.type && x.ref === l.ref)) draftLinks.push(l);
  const input = $('task-link-input'); if (input) input.value = '';
  renderLinkChips();
  return true;
}

function bindLinkEditor() {
  if (linkEditorBound) return;
  const typeEl = $('task-link-type'); const chips = $('task-link-chips');
  if (!typeEl || !chips) return;
  linkEditorBound = true;
  typeEl.addEventListener('change', renderLinkInput);
  chips.addEventListener('click', (e) => {
    const del = e.target.closest('[data-link-idx]'); if (!del) return;
    draftLinks.splice(Number(del.dataset.linkIdx), 1);
    renderLinkChips();
  });
  // 在值输入框里按回车 = 添加，别让它去提交整个弹框
  $('task-link-value').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTaskLink(); }
  });
}

/* 打开任务弹框时调用：item 为空 = 新建（全部清空），否则回填。 */
export function fillTaskAuditFields(item) {
  const it = item || {};
  bindLinkEditor();
  const plist = $('task-project-list');
  if (plist && !plist.children.length) PRODUCT_NAMES.forEach((n) => plist.appendChild(option(n, n)));
  const p = $('task-project'); if (p) p.value = it.project || '';
  const eh = $('task-est-hours'); if (eh) eh.value = it.est_hours == null ? '' : it.est_hours;
  const imp = $('task-important');
  if (imp) {
    imp.checked = Number(it.important) === 1;
    // 「重要」只有经理/老板能摘（后端强制）；对其他人直接禁用，别让他点了再被打回
    const role = (window.ME || {}).role;
    imp.disabled = imp.checked && role !== 'manager' && role !== 'boss';
  }
  draftLinks = (it.links || []).map((l) => ({ type: l.type, ref: l.ref, label: l.label || null }));
  const typeEl = $('task-link-type'); if (typeEl) typeEl.value = 'page';
  renderLinkChips(); renderLinkInput();
  // 候选是异步的：先用手头的画出来，拉到了再补下拉（弹框可能已经被换了类型，所以整个重画）
  loadLinkOptions().then(() => {
    const cur = $('task-link-input');
    if (!cur || !cur.value) renderLinkInput();
  });
}

/* 提交任务弹框时调用。返回要并进请求体的字段；返回 null = 有不合法的输入（已 toast）。 */
export function readTaskAuditFields() {
  const out = {};
  out.project = (($('task-project') || {}).value || '').trim();
  const eh = (($('task-est-hours') || {}).value || '').trim();
  if (eh !== '' && !(Number(eh) >= 0)) { toast('预估工时需要是不小于 0 的数字'); return null; }
  out.est_hours = eh === '' ? null : Number(eh);
  const imp = $('task-important');
  out.important = imp && imp.checked ? 1 : null;
  // 输入框里填了却没点「添加」的那一条也算数，否则用户以为关联上了、其实没存
  const pending = pendingLink();
  if (typeof pending === 'string') { toast(pending); return null; }
  if (pending && !draftLinks.some((x) => x.type === pending.type && x.ref === pending.ref)) draftLinks.push(pending);
  out.links = draftLinks.map((l) => ({ type: l.type, ref: l.ref }));
  return out;
}

/* ================= 卡片 / 归档页上的审计信息 ================= */
export const wasCompleted = (it) => !!it && (it.state === 'done' || it.status === 'done' || !!it.done_at);

// meta 行里的小徽章：重要 + 产品/项目
export function auditBadgesHtml(it) {
  const imp = it.is_important
    ? `<span class="badge b-red taudit-imp" title="重要任务（${esc(it.important_reason_text || '')}）· 完成时需要证据">重要</span>`
    : '';
  const proj = it.project ? `<span class="badge b-gray taudit-proj" title="产品 / 项目">${esc(it.project)}</span>` : '';
  return imp + proj;
}

function shortUrl(u) {
  try { const x = new URL(u); const s = x.host + (x.pathname === '/' ? '' : x.pathname); return s.length > 46 ? s.slice(0, 45) + '…' : s; }
  catch (e) { return u; }
}
function evidenceHtml(it) {
  const links = String(it.evidence || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    // 后端只收 http(s)；这里再判一次，万一库里混进别的 scheme 也只当文本显示，绝不渲染成可点链接
    .map((u) => (isHttp(u)
      ? `<a class="taudit-ev" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(u)}">${esc(shortUrl(u))}</a>`
      : `<span class="taudit-ev">${esc(u)}</span>`));
  return links.join('') + thumbsHtml(it.evidence_images);
}
function hoursText(it) {
  const parts = [];
  if (it.est_hours != null) parts.push('预估 ' + it.est_hours + 'h');
  if (it.actual_hours != null) parts.push('实际 ' + it.actual_hours + 'h');
  return parts.join(' · ');
}
const line = (label, html, cls = '') => `<span class="taudit-line ${cls}"><span class="taudit-label">${label}</span><span class="taudit-val">${html}</span></span>`;

/* 审计信息块。editable = 卡片上给「补结果 / 改结果」入口；archived = 归档页，结果那一行必出
   （没记就明说没记：归档的意义就是事后能查，空着不说等于默认它有）。 */
export function auditBlockHtml(it, { editable = false, archived = false } = {}) {
  const lines = [];
  const links = it.links || [];
  const done = wasCompleted(it);
  if (links.length) {
    // 「数据变化」：完成之后才有前后可比；只关联了 KPI 的任务没有可量化的对象，不给入口
    const effect = done && it.id && links.some((l) => l.type !== 'kpi')
      ? ` <button type="button" class="btn-mini taudit-effect" data-task-effect="${esc(it.id)}"><i class="ti ti-chart-line"></i> 数据变化</button>` : '';
    lines.push(line('关联', links.map((l) => `<span class="taudit-link" title="${esc(l.ref)}"><b>${LINK_LABEL[l.type] || esc(l.type)}</b>${esc(linkText(l))}</span>`).join('') + effect));
  }
  if (done || archived || it.result) {
    const edit = editable && done && it.id
      ? ` <button type="button" class="btn-mini taudit-edit" data-loop-action="task-result">${it.result ? '改' : '补结果'}</button>` : '';
    const text = it.result ? esc(it.result) : `<span class="taudit-missing">${done ? '结果未记录' : '无完成记录'}</span>`;
    lines.push(line('结果', text + edit, 'taudit-result'));
  }
  if (it.task_actions) lines.push(line('动作', esc(it.task_actions)));
  const ev = evidenceHtml(it);
  if (ev) lines.push(line('证据', ev));
  else if (done && it.is_important) lines.push(line('证据', '<span class="taudit-missing">无证据</span>'));
  const hours = hoursText(it);
  if (hours) lines.push(line('工时', esc(hours)));
  return lines.length ? `<div class="taudit">${lines.join('')}</div>` : '';
}

/* ================= 完成弹框 ================= */
let doneCtx = null; // { item, edit, onDone, onImages }
let doneBound = false;

function doneError(msg) { const el = $('task-done-error'); if (el) el.textContent = msg || ''; }

function renderDoneThumbs() {
  const box = $('task-done-thumbs'); if (!box || !doneCtx) return;
  box.innerHTML = thumbsHtml(doneCtx.item.evidence_images, { deletable: true }); // thumbsHtml 内部全部 esc 过
}

function bindDone() {
  if (doneBound) return;
  const box = $('task-done-thumbs'); if (!box) return;
  doneBound = true;
  box.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-att-del]'); if (!del || !doneCtx) return;
    if (!inlineConfirm(del, '删除')) return;
    const ctx = doneCtx;
    try {
      await deleteImage(del.dataset.attDel);
      ctx.item.evidence_images = (ctx.item.evidence_images || []).filter((im) => String(im.id) !== String(del.dataset.attDel));
      renderDoneThumbs();
      if (ctx.onImages) ctx.onImages();
    } catch (err) { toast('删除失败：' + ((err && err.message) || '请求失败')); }
  });
}

/* 打开完成弹框。edit=false：勾完成（提交时一并把状态置为完成）；edit=true：改已完成任务的记录。
   取消 = 什么都不发生（onDone 不会被调用），所以调用方不需要处理「用户关掉了」这条分支。 */
export function openTaskDone(item, { edit = false, onDone = null, onImages = null } = {}) {
  if (!item || !item.id) return;
  bindDone();
  doneCtx = { item, edit, onDone, onImages };
  $('task-done-verb').textContent = edit ? '完成记录' : '完成任务';
  $('task-done-submit-label').textContent = edit ? '保存' : '确认完成';
  $('task-done-title').textContent = item.content || '';
  const rule = $('task-done-rule');
  rule.classList.toggle('is-important', !!item.is_important);
  rule.textContent = item.is_important
    ? '重要任务（' + (item.important_reason_text || '') + '）：除了完成结果，还需要至少一条证据链接或一张证据截图。'
    : '写清完成结果即可；有证据链接或截图更好——周度审核看的就是这些。';
  $('task-done-result').value = item.result || '';
  $('task-done-actions').value = item.task_actions || '';
  $('task-done-evidence').value = item.evidence || '';
  $('task-done-hours').value = item.actual_hours == null ? '' : item.actual_hours;
  $('task-done-est').textContent = item.est_hours == null ? '' : '预估 ' + item.est_hours + ' 小时';
  doneError('');
  renderDoneThumbs();
  openModal('taskDoneMask');
  setTimeout(() => $('task-done-result').focus(), 50);
}

export async function pickTaskEvidence() {
  const ctx = doneCtx; if (!ctx) return;
  const added = await pickAndUpload('task', ctx.item.id);
  if (!added.length) return;
  ctx.item.evidence_images = (ctx.item.evidence_images || []).concat(added);
  if (doneCtx === ctx) { renderDoneThumbs(); doneError(''); }
  if (ctx.onImages) ctx.onImages();
}

export async function submitTaskDone(btn) {
  const ctx = doneCtx; if (!ctx) return;
  const hoursRaw = String($('task-done-hours').value || '').trim();
  if (hoursRaw !== '' && !(Number(hoursRaw) >= 0)) { doneError('实际用时需要是不小于 0 的数字'); return; }
  const body = {
    result: $('task-done-result').value,
    task_actions: $('task-done-actions').value,
    evidence: $('task-done-evidence').value,
    actual_hours: hoursRaw === '' ? null : Number(hoursRaw),
  };
  if (!ctx.edit) { body.state = 'done'; body.status = 'done'; }
  if (btn) btn.disabled = true;
  try {
    const { item } = await API.patch('/api/loop-items/' + ctx.item.id, body);
    Object.assign(ctx.item, item);
    closeModal('taskDoneMask');
    doneCtx = null;
    if (ctx.onDone) ctx.onDone(item);
  } catch (e) {
    // 缺结果 / 缺证据的原因由后端给（e.message 就是那句话），留在弹框里让人直接补，不关窗
    doneError(e && e.status === 403 ? '无权操作，未入库' : '未入库：' + ((e && e.message) || '请求失败'));
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ================= 完成前后的数据变化（弹框） =================
   口径全在后端（services/taskEffect.js）：窗口等长、完成当天不算、给全站参照。这里只负责照着画，
   并把「数据未满 / 待数据 / 未同步 / 无数据」这些状态原样说出来 —— 状态比数字重要，
   一个没满的窗口画成正常的涨跌，就是在误导人。 */
const EFFECT_STATUS_TEXT = {
  NO_DATA: '前后两段时间都没有数据（没有曝光或没有投放）',
  DECLARED: '部门级指标，不做单条任务的前后对比',
};
let effectTaskId = null;
let effectDays = 14;
let effectSeq = 0;
let effectBound = false;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
}
const md = (ymd) => String(ymd || '').slice(5);
const fmtNum = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }));

function windowText(name, w) {
  if (!w) return null;
  if (w.status === 'NOT_SYNCED') return name + '：没有同步数据，无法对比';
  if (w.status === 'PENDING') return name + '：完成后还没有同步到数据（最新数据到 ' + (w.latest_date || '—') + '），过几天再看';
  const range = '前 ' + md(w.before.start_date) + '~' + md(w.before.end_date) + ' 对比 后 ' + md(w.after.start_date) + '~' + md(w.after.end_date);
  if (w.status === 'PARTIAL') return name + '：' + range + '（数据未满：只有 ' + w.days + ' 天；要等 ' + md(w.full_date) + ' 的数据同步进来才满 ' + w.wanted_days + ' 天）';
  return name + '：' + range + '（各 ' + w.days + ' 天）';
}

// 变化量单元格：好的方向绿、坏的方向红；花费这类没有好坏的不上色
function deltaCell(d, better) {
  const td = el('td', 'num');
  if (!d) { td.textContent = '—'; return td; }
  const sign = d.abs > 0 ? '+' : '';
  let text = sign + fmtNum(d.abs);
  if (d.pct != null) text += '（' + (d.pct > 0 ? '+' : '') + Math.round(d.pct * 100) + '%）';
  td.textContent = text;
  if (d.abs !== 0 && better !== 'neutral') {
    const good = better === 'higher' ? d.abs > 0 : d.abs < 0;
    td.classList.add(good ? 'teffect-good' : 'teffect-bad');
  }
  return td;
}

function effectRows(tbody, title, sub, item, metrics, cls) {
  const head = el('tr', 'teffect-head ' + (cls || ''));
  const th = el('td', '', title); th.colSpan = 4;
  if (sub) th.appendChild(el('span', 'teffect-sub', sub));
  head.appendChild(th); tbody.appendChild(head);
  const list = metrics[item.source];
  if (!item.before || !list) {
    const tr = el('tr'); const td = el('td', 'dim', EFFECT_STATUS_TEXT[item.status] || '这个数据源暂时无法对比（见上方说明）'); td.colSpan = 4;
    tr.appendChild(td); tbody.appendChild(tr); return;
  }
  if (item.status === 'NO_DATA') {
    const tr = el('tr'); const td = el('td', 'dim', EFFECT_STATUS_TEXT.NO_DATA); td.colSpan = 4;
    tr.appendChild(td); tbody.appendChild(tr); return;
  }
  for (const m of list) {
    const tr = el('tr');
    tr.appendChild(el('td', '', m.label));
    tr.appendChild(el('td', 'num', fmtNum(item.before[m.key])));
    tr.appendChild(el('td', 'num', fmtNum(item.after[m.key])));
    tr.appendChild(deltaCell(item.delta[m.key], m.better));
    tbody.appendChild(tr);
  }
}

function renderEffect(data) {
  const box = $('task-effect-body'); box.textContent = '';
  $('task-effect-title').textContent = data.task.content || '';
  if (data.status === 'NOT_DONE') {
    box.appendChild(el('div', 'teffect-note', '这条任务没有完成时刻（未完成，或是完成门槛上线前勾的老任务），没有对比的原点。'));
    return;
  }
  box.appendChild(el('div', 'teffect-note', data.note));
  const used = new Set(data.items.map((i) => i.source).filter(Boolean));
  const wins = el('div', 'teffect-windows');
  if (used.has('gsc')) wins.appendChild(el('div', '', windowText('自然搜索（GSC）', data.windows.gsc)));
  if (used.has('ads')) wins.appendChild(el('div', '', windowText('广告（Ads）', data.windows.ads)));
  box.appendChild(wins);

  const table = el('table', 'dt teffect-table');
  const thead = el('thead'); const hr = el('tr');
  ['指标', '之前', '之后', '变化'].forEach((t, i) => hr.appendChild(el('th', i ? 'num' : '', t)));
  thead.appendChild(hr); table.appendChild(thead);
  const tbody = el('tbody');
  for (const item of data.items) {
    const kind = LINK_LABEL[item.type] || item.type;
    const where = item.source === 'ads' ? ' · 广告' : (item.source === 'gsc' ? ' · 自然搜索' : '');
    effectRows(tbody, kind + where, item.type === 'page' ? linkText(item) : (item.label || item.ref), item, data.metrics);
  }
  // 参照行：全站都涨的时候，单个页面跟着涨不算这条任务的功劳
  if (data.baseline.gsc) effectRows(tbody, '参照 · 全站自然搜索同期', '', data.baseline.gsc, data.metrics, 'is-baseline');
  if (data.baseline.ads) effectRows(tbody, '参照 · 全账户广告同期', '金额为 Ads 账户币种', data.baseline.ads, data.metrics, 'is-baseline');
  table.appendChild(tbody); box.appendChild(table);
}

async function loadEffect() {
  const box = $('task-effect-body');
  const seq = ++effectSeq;
  document.querySelectorAll('#taskEffectMask [data-effect-days]').forEach((b) => b.classList.toggle('active', Number(b.dataset.effectDays) === effectDays));
  box.textContent = ''; box.appendChild(el('div', 'dim', '加载中…'));
  try {
    const data = await API.get('/api/loop-items/' + effectTaskId + '/effect?days=' + effectDays);
    if (seq === effectSeq) renderEffect(data);
  } catch (e) {
    if (seq !== effectSeq) return;
    box.textContent = '';
    box.appendChild(el('div', 'task-done-error', '加载失败：' + ((e && e.message) || '请求失败') + ' '));
    const retry = el('button', 'btn-mini', '重试'); retry.type = 'button'; retry.addEventListener('click', loadEffect);
    box.appendChild(retry);
  }
}

export function openTaskEffect(id) {
  if (!id) return;
  if (!effectBound) {
    effectBound = true;
    $('taskEffectMask').addEventListener('click', (e) => {
      const b = e.target.closest('[data-effect-days]'); if (!b) return;
      effectDays = Number(b.dataset.effectDays); loadEffect();
    });
  }
  effectTaskId = id;
  $('task-effect-title').textContent = '';
  openModal('taskEffectMask');
  loadEffect();
}

// 入口按钮出现在任务卡和归档行两处，统一在这里委托。typeof 守卫：保持本模块「无 DOM 也能被 import」。
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-task-effect]');
    if (btn) openTaskEffect(btn.dataset.taskEffect);
  });
}
