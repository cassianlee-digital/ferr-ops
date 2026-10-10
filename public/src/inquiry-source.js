/* 询盘来源（2026-10-10）：来源格里的对账徽章、来源详情弹框、表单线索收件箱。
 *
 * 经理要的是「每条询价明确知道从哪个途径来的」。来源有两种可信度，界面上必须一眼分得开：
 *   表单来源 = 独立站表单提交时带回的（系列 / 关键词 / 落地页 / 来路），机器证据，谁都改不了；
 *   人填的   = 只是主张。系统拿它去和已同步的 Ads / GSC 点击数据对账，把对不上的挑出来给人复核。
 * 对账结论、文案、判定规则全在后端（services/inquirySource.js），这里只照着画。
 *
 * 与 inquiries.js 的关系同 inquiry-sales.js：对外只给 sourceCellHtml() 等几个函数由它调用，
 * 反向通知走自定义事件（inqsourcechanged / leadconvert），两边不互相 import，不成环，
 * 也不动 inquiries.js 被测试焊死的导出面。
 */
import { esc, openModal, closeModal, toast } from './ui-kit.js';
import { withRange } from './timerange.js';

const $ = (id) => document.getElementById(id);
const isHttp = (u) => /^https?:\/\//i.test(String(u || ''));
const TONE_BADGE = { good: 'b-green', warn: 'b-amber', bad: 'b-red', muted: 'b-gray' };
// 后端的对账结果还没回来之前，表单来源这一种可以先画（它不需要对账）
const FORM_VERDICT = { label: '表单来源', tone: 'good', hint: '独立站表单提交时带回的来源，机器证据' };

let checks = new Map();   // 询盘 id → { verdict, ads, gsc }
let verdicts = {};        // 结论目录（label / tone / hint），来自后端
let lookbackDays = 30;
let checkSeq = 0;

const changed = () => document.dispatchEvent(new CustomEvent('inqsourcechanged'));
const rowById = (id) => (window._inqCache || []).find((r) => String(r.id) === String(id));
const failText = (e) => (e && e.status === 403 ? '无权操作' : (e && e.message) || '请求失败');

function verdictOf(r) {
  if (r.src_evidence === 'form') return FORM_VERDICT;
  const c = checks.get(r.id);
  return (c && verdicts[c.verdict]) || null;
}
function pathOf(u) {
  try { const x = new URL(u); return (x.pathname + x.search) || '/'; } catch (e) { return u || ''; }
}

/* 表格里的来源格：来源词 + 系列 / 落地页（有才显示）+ 对账徽章。整格可点，打开来源详情。 */
export function sourceCellHtml(r) {
  const v = verdictOf(r);
  const badge = v && v.label ? `<span class="badge ${TONE_BADGE[v.tone] || 'b-gray'} inq-src-verdict">${esc(v.label)}</span>` : '';
  const subs = [];
  if (r.src_campaign || r.src_campaign_id) subs.push(`<span class="inq-src-sub">系列 ${esc(r.src_campaign || r.src_campaign_id)}</span>`);
  if (r.src_landing_page) subs.push(`<span class="inq-src-sub">落地页 ${esc(pathOf(r.src_landing_page))}</span>`);
  return `<button type="button" class="inq-src" data-inq-source="${esc(r.id)}" title="${esc((v && v.hint) || '点击查看 / 填写来源')}">`
    + `<span class="inq-src-term">${esc(r.source || '')}</span>${subs.join('')}${badge}</button>`;
}

/* 表格画完之后再拉对账结果（它要扫同步表，不该拖慢列表）。拉到了通知 inquiries.js 重画徽章。
   失败只提示、不清空：对账是附加信息，挂了不该让询盘表跟着出问题。 */
export async function loadSourceChecks() {
  const seq = ++checkSeq;
  refreshLeadBadge();
  try {
    const data = await API.get(withRange('/api/inquiries/source-check', 'inquiry'));
    if (seq !== checkSeq) return;
    checks = new Map((data.items || []).map((i) => [i.id, i]));
    verdicts = data.verdicts || {};
    lookbackDays = data.lookback_days || 30;
    changed();
  } catch (e) {
    if (seq === checkSeq && e && e.message !== 'unauthorized') toast('来源对账加载失败：' + failText(e));
  }
}

/* ================= 来源详情弹框 ================= */
let editing = null;       // 当前询盘行
let campaigns = null;     // 已同步的广告系列（下拉候选）

function evidenceLine(name, ev) {
  if (!ev) return name + '：尚未对账';
  if (ev.hit) return name + '：近 ' + lookbackDays + ' 天有点击，最近一次 ' + String(ev.last_date || '').slice(5);
  if (!ev.covered) return name + '：这段时间没有同步数据，无法判断';
  return name + '：近 ' + lookbackDays + ' 天没有这个词的点击';
}
function addLine(box, text, cls) { const d = document.createElement('div'); d.className = cls || ''; d.textContent = text; box.appendChild(d); }
function addLink(box, label, url) {
  const d = document.createElement('div'); d.appendChild(document.createTextNode(label));
  if (isHttp(url)) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = url; d.appendChild(a); }
  else d.appendChild(document.createTextNode(url || ''));
  box.appendChild(d);
}

async function fillCampaigns(row) {
  const sel = $('inq-src-campaign');
  if (!campaigns) {
    try { campaigns = (await API.get('/api/loop-items/link-options')).campaigns || []; }
    catch (e) { campaigns = null; toast('广告系列候选加载失败：' + failText(e)); }
  }
  sel.textContent = '';
  const list = campaigns || [];
  const first = document.createElement('option'); first.value = '';
  first.textContent = list.length ? '未关联系列' : '尚无已同步的广告系列';
  sel.appendChild(first);
  for (const c of list) { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name || c.id; sel.appendChild(o); }
  // 表单带回的系列可能不在近期同步数据里：补一项，否则下拉会显示成「未关联」
  if (row.src_campaign_id && !list.some((c) => c.id === row.src_campaign_id)) {
    const o = document.createElement('option'); o.value = row.src_campaign_id; o.textContent = row.src_campaign || row.src_campaign_id; sel.appendChild(o);
  }
  sel.value = row.src_campaign_id || '';
}

async function openSource(id) {
  const r = rowById(id); if (!r) return;
  editing = r;
  const locked = r.src_evidence === 'form';
  $('inq-src-title').textContent = [r.date, r.country, r.channel].filter(Boolean).join(' · ');
  const ev = $('inq-src-evidence');
  ev.classList.toggle('is-form', locked);
  ev.textContent = locked
    ? '来源是独立站表单提交时带回的机器证据，不能手改。'
    : '来源是人填的，只是主张；下面是系统拿来源词去 Ads / GSC 点击数据里对账的结果。';
  $('inq-src-term').value = r.source || '';
  $('inq-src-page').value = r.src_landing_page || '';
  for (const fid of ['inq-src-term', 'inq-src-campaign', 'inq-src-page']) $(fid).disabled = locked;
  $('inq-src-save').classList.toggle('is-hidden', locked);
  $('inq-src-error').textContent = '';

  const box = $('inq-src-check'); box.textContent = '';
  if (locked) {
    if (r.src_referrer) addLink(box, '来路：', r.src_referrer);
    if (r.src_gclid) addLine(box, '广告点击标识（gclid）：' + r.src_gclid);
    let utm = {}; try { utm = JSON.parse(r.src_utm || '{}'); } catch (e) { utm = {}; }
    const parts = Object.entries(utm).map(([k, v]) => k + '=' + v);
    if (parts.length) addLine(box, 'UTM：' + parts.join('　'));
    if (!box.children.length) addLine(box, '表单没有带回来路 / gclid / UTM。', 'dim');
  } else {
    const c = checks.get(r.id); const v = c && verdicts[c.verdict];
    if (v && v.label) addLine(box, v.label + '：' + v.hint, 'inq-src-result tone-' + v.tone);
    addLine(box, evidenceLine('广告（Ads）', c && c.ads));
    addLine(box, evidenceLine('自然搜索（GSC）', c && c.gsc));
    addLine(box, '对账只是把疑点挑出来给人复核，不会改渠道，也不参与计分。', 'dim');
  }
  openModal('inqSourceMask');
  await fillCampaigns(r);
}

export async function submitInquirySource(btn) {
  const r = editing; if (!r) return;
  const body = { source: $('inq-src-term').value.trim() || '待补', src_campaign_id: $('inq-src-campaign').value, src_landing_page: $('inq-src-page').value.trim() };
  if (btn) btn.disabled = true;
  try {
    const { item } = await API.patch('/api/inquiries/' + r.id, body);
    Object.assign(r, item); // 同步缓存行：表格重画读的是它（不回写的话翻页就退回旧值）
    closeModal('inqSourceMask'); editing = null;
    toast('来源已更新 · 已入库');
    changed();
    loadSourceChecks(); // 词变了，对账结论要重算
  } catch (e) {
    $('inq-src-error').textContent = '未入库：' + failText(e);
  } finally { if (btn) btn.disabled = false; }
}

/* ================= 表单线索收件箱 ================= */
let leadState = 'new';
let leadRows = [];
let leadsBound = false;

function localDate(utc) {
  const d = new Date(String(utc || '').replace(' ', 'T') + 'Z');
  if (isNaN(d)) return String(utc || '').slice(0, 10);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// 页头按钮上的待处理数。没接入时也要说出来：空的收件箱 ≠ 没人询价。
export async function refreshLeadBadge() {
  const el = $('inq-leads-count'); if (!el) return;
  try {
    const data = await API.get('/api/inquiry-leads?state=new');
    el.textContent = data.configured ? String(data.counts.new || 0) : '未接入';
    el.classList.toggle('has-new', data.configured && data.counts.new > 0);
  } catch (e) { el.textContent = '—'; }
}

function leadCard(l) {
  const card = document.createElement('div'); card.className = 'lead-card'; card.dataset.id = l.id;
  const head = document.createElement('div'); head.className = 'lead-head';
  const who = [l.contact_name, l.contact_company, l.country].filter(Boolean).join(' · ') || '未留姓名';
  addLine(head, localDate(l.received_at) + '　' + who, 'lead-who');
  if (l.contact_email) addLine(head, l.contact_email, 'dim');
  card.appendChild(head);
  if (l.message) addLine(card, l.message, 'lead-msg');

  const src = document.createElement('div'); src.className = 'lead-src';
  addLine(src, '建议渠道：' + (l.suggested_channel || '—'), 'lead-src-channel');
  const term = l.keyword || l.utm_term; if (term) addLine(src, '关键词：' + term);
  const camp = l.campaign_id || l.utm_campaign; if (camp) addLine(src, '系列：' + camp);
  if (l.landing_page || l.page_url) addLink(src, '落地页：', l.landing_page || l.page_url);
  if (l.referrer) addLink(src, '来路：', l.referrer);
  if (src.children.length === 1) addLine(src, '表单没有带回任何来源参数', 'dim');
  card.appendChild(src);

  const ops = document.createElement('div'); ops.className = 'lead-ops';
  if (l.state === 'new') {
    const conv = document.createElement('button'); conv.type = 'button'; conv.className = 'btn-primary btn-mini'; conv.dataset.leadConvert = l.id; conv.textContent = '转为询盘';
    const reason = document.createElement('input'); reason.type = 'text'; reason.className = 'lead-reason'; reason.maxLength = 200; reason.placeholder = '忽略原因（垃圾 / 重复 / 非询价…）';
    const ign = document.createElement('button'); ign.type = 'button'; ign.className = 'btn-mini'; ign.dataset.leadIgnore = l.id; ign.textContent = '忽略';
    ops.append(conv, reason, ign);
  } else {
    addLine(ops, '忽略原因：' + (l.ignore_reason || '—'), 'dim');
    const re = document.createElement('button'); re.type = 'button'; re.className = 'btn-mini'; re.dataset.leadReopen = l.id; re.textContent = '恢复为待处理';
    ops.appendChild(re);
  }
  card.appendChild(ops);
  return card;
}

async function loadLeads() {
  const box = $('leads-list'); const status = $('leads-status');
  document.querySelectorAll('#leadsMask [data-lead-state]').forEach((b) => b.classList.toggle('active', b.dataset.leadState === leadState));
  box.textContent = ''; addLine(box, '加载中…', 'dim');
  try {
    const data = await API.get('/api/inquiry-leads?state=' + leadState);
    leadRows = data.items || [];
    status.classList.toggle('is-off', !data.configured);
    status.textContent = data.configured
      ? '待处理 ' + (data.counts.new || 0) + ' · 已转询盘 ' + (data.counts.converted || 0) + ' · 已忽略 ' + (data.counts.ignored || 0)
      : '尚未接入：服务器没有配置 INQUIRY_INTAKE_SECRET，独立站表单还不会把线索发到这里（接法见 docs/INQUIRY_INTAKE.md）。';
    box.textContent = '';
    if (!leadRows.length) { addLine(box, leadState === 'new' ? '没有待处理的线索' : '没有被忽略的线索', 'dim lead-empty'); return; }
    leadRows.forEach((l) => box.appendChild(leadCard(l)));
  } catch (e) {
    box.textContent = ''; addLine(box, '线索加载失败：' + failText(e), 'task-done-error');
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'btn-mini'; retry.textContent = '重试';
    retry.addEventListener('click', loadLeads); box.appendChild(retry);
  }
}

export function openLeads() {
  if (!leadsBound) {
    leadsBound = true;
    $('leadsMask').addEventListener('click', async (e) => {
      const tab = e.target.closest('[data-lead-state]');
      if (tab) { leadState = tab.dataset.leadState; loadLeads(); return; }
      const conv = e.target.closest('[data-lead-convert]');
      if (conv) {
        const lead = leadRows.find((l) => String(l.id) === conv.dataset.leadConvert);
        if (!lead) return;
        closeModal('leadsMask');
        // 交给 inquiries.js 打开录入弹框并预填；来源字段由后端按 lead_id 自己取，这里不传
        document.dispatchEvent(new CustomEvent('leadconvert', { detail: { lead, date: localDate(lead.received_at) } }));
        return;
      }
      const ign = e.target.closest('[data-lead-ignore]');
      if (ign) {
        const reason = ign.closest('.lead-ops').querySelector('.lead-reason').value.trim();
        if (!reason) { toast('请先写忽略原因'); return; }
        try { await API.post('/api/inquiry-leads/' + ign.dataset.leadIgnore + '/ignore', { reason }); toast('已忽略 · 原因已记录'); loadLeads(); refreshLeadBadge(); }
        catch (err) { toast('未入库：' + failText(err)); }
        return;
      }
      const re = e.target.closest('[data-lead-reopen]');
      if (re) {
        try { await API.post('/api/inquiry-leads/' + re.dataset.leadReopen + '/reopen'); toast('已恢复为待处理'); loadLeads(); refreshLeadBadge(); }
        catch (err) { toast('未入库：' + failText(err)); }
      }
    });
  }
  leadState = 'new';
  openModal('leadsMask');
  loadLeads();
}

// 来源格的点击入口。typeof 守卫：保持本模块「无 DOM 也能被 import」。
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-inq-source]');
    if (btn) openSource(btn.dataset.inqSource);
  });
}
