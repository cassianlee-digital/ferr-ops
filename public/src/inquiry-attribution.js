/* 询盘的确认权与改动留痕（前端这一半；2026-10-10，设计移植自旧分支 a298574）。
 *
 * 等级决定月度考核里 A / B 询价的数量，渠道决定「这条询盘算谁带来的」，而录入人自己就能填、能改。
 * 所以立三条流程规矩（判定全在后端 routes/inquiries.js）：
 *   录入 = 建议值；经理 / 老板确认后才是定稿，确认后李陈改不动；每次改动都留痕。
 * 前端只负责「看得见 + 点得到」：每行标出 待确认 / 已确认 / 历史未审 和被改过几次，
 * 表格上方亮出确认进度。越权一律由后端拒绝，这里隐藏按钮只是省得白点。
 *
 * 与 inquiries.js 的关系同 inquiry-sales.js / inquiry-source.js：只给它几个渲染函数，
 * 反向通知走事件（attributionchanged），两边不互相 import，不动它被测试焊死的导出面。
 * 模块求值期不碰 DOM（事件委托带 typeof 守卫）。
 */
import { esc, toast, openModal, closeModal } from './ui-kit.js';
import { withRange } from './timerange.js';
import { openChangeLog as showChangeLog } from './change-log.js';

const $ = (id) => document.getElementById(id);
const isAuthority = () => { const r = window.ME && window.ME.role; return r === 'manager' || r === 'boss'; };
const failText = (e) => (e && e.message) || '请求失败'; // api.js 已把后端的 detail 放进 message
const changed = () => document.dispatchEvent(new CustomEvent('attributionchanged'));

export const isConfirmed = (r) => !!r && r.attribution_status === 'confirmed';
// 老行（这套规矩上线前录的）状态为空：既不算已确认也不算刚提交，如实标「历史未审」
const statusOf = (r) => (isConfirmed(r) ? 'confirmed' : r && r.attribution_status === 'proposed' ? 'proposed' : 'legacy');
const STATUS_LABEL = { confirmed: '已确认', proposed: '待确认', legacy: '历史未审' };

/* 渠道格里的确认标记 + 改动次数。改动次数是可点的：谁在月底前批量改了等级，点开就看得到。 */
export function attrMarkHtml(r) {
  const st = statusOf(r);
  const n = Number(r.attr_change_count) || 0;
  const changes = n > 0
    ? `<button type="button" class="attr-changes" data-attr-log title="渠道 / 等级 / 日期 / 归档状态被改过 ${n} 次，点击看是谁改的、为什么">改 ${n}</button>`
    : '';
  return `<span class="attr-mark attr-${st}">${STATUS_LABEL[st]}</span>${changes}`;
}

// 已确认的行：渠道 / 等级不给下拉（点了后端也会拒绝），换成带锁的静态徽章。经理 / 老板点锁进修改弹框，那条路强制填原因。
export function attrLockHtml(cls, text) {
  const auth = isAuthority();
  const hint = auth ? '已确认；点击修改（需填原因）' : '已确认，如需更正请找经理或老板';
  return `<span class="badge ${esc(cls)} attr-locked"${auth ? ' data-attr-edit' : ''} title="${esc(hint)}">${esc(text)}<i class="ti ti-lock attr-lock-ico"></i></span>`;
}

// 待确认的行给经理 / 老板一个确认按钮；已确认的给一个撤销入口（确认错了要能退）。李陈都看不到。
export function attrConfirmBtnHtml(r) {
  if (!isAuthority()) return '';
  return isConfirmed(r)
    ? '<button type="button" class="btn-mini attr-unconfirm" data-attr-unconfirm title="撤销确认（需填原因）"><i class="ti ti-arrow-back-up"></i></button>'
    : '<button type="button" class="btn-mini attr-confirm" data-attr-confirm title="确认这条询盘的渠道与等级"><i class="ti ti-check"></i></button>';
}

/* ===== 表格上方：确认进度 =====
   未确认占比是这套规矩的核心监督数字，必须自己亮出来，而不是安静地混在统计里。 */
function renderBar(cov) {
  const box = $('inqAttrBar'); if (!box) return;
  box.textContent = '';
  if (!cov || !cov.total) return;
  const pending = cov.proposed + cov.legacy;
  const bar = document.createElement('span');
  bar.className = 'attr-bar ' + (cov.unconfirmedRate >= 50 ? 'attr-bar-warn' : cov.unconfirmedRate > 0 ? 'attr-bar-mid' : 'attr-bar-ok');
  bar.textContent = '渠道与等级已确认 ' + cov.confirmed + '/' + cov.total
    + (cov.confirmedRate != null ? '（' + cov.confirmedRate + '%）' : '')
    + (pending ? ' · 待确认 ' + cov.proposed + ' · 历史未审 ' + cov.legacy : '');
  bar.title = '等级由录入人自己填；经理或老板确认过的才算定稿';
  box.appendChild(bar);
  if (isAuthority() && pending > 0) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn-mini attr-bar-btn'; btn.dataset.attrConfirmAll = '1';
    btn.textContent = '全部确认（' + pending + '）';
    btn.title = '确认当前时间范围内所有未确认的询盘（不受表头筛选影响）；想逐条看再确认，就用每行的 ✓';
    box.appendChild(btn);
  }
}

export async function loadAttrCoverage() {
  try {
    renderBar(await API.get(withRange('/api/inquiries/attribution-coverage', 'inquiry')));
  } catch (e) {
    const box = $('inqAttrBar');
    if (!box || (e && e.message === 'unauthorized')) return;
    box.textContent = '';
    const bar = document.createElement('span'); bar.className = 'attr-bar attr-bar-warn';
    bar.textContent = '确认进度加载失败：' + failText(e); // 失败要说原因，不能静默留白
    box.appendChild(bar);
  }
}

/* ===== 改动流水弹框 ===== */
const FIELD_LABEL = { channel: '渠道', grade: '等级', date: '日期', state: '归档', deal_status: '是否成交', attribution_status: '确认状态' };
const VALUE_LABEL = { confirmed: '已确认', proposed: '待确认', active: '在册', archived: '已归档' };
const valText = (v) => (v == null || v === '' ? '（空 / 历史未审）' : VALUE_LABEL[v] || v);
const openChangeLog = (id) => showChangeLog({
  path: '/api/inquiries/' + encodeURIComponent(id) + '/changes',
  title: '渠道与等级的改动流水',
  rule: '等级决定考核里 A / B 询价的数量，所以每次改动都留档；改已确认的值必须填原因。',
  empty: '这条询盘的渠道、等级、日期和确认状态从未被改过。',
  describe: (c) => (FIELD_LABEL[c.field] || c.field) + '：' + valText(c.old_value) + ' → ' + valText(c.new_value),
});

/* ===== 改已确认的渠道 / 等级，或撤销确认：都强制填原因 ===== */
let editing = null; // { row, mode: 'edit' | 'unconfirm' }
function openAttrEdit(row, mode) {
  editing = { row, mode };
  const unconfirm = mode === 'unconfirm';
  $('attrEditTitle').textContent = (unconfirm ? '撤销确认 · ' : '修改已确认的渠道 / 等级 · ') + (row.customer_code || row.country || '#' + row.id);
  $('attrEditChannel').value = row.channel || '';
  $('attrEditGrade').value = row.grade || '';
  $('attrEditFields').classList.toggle('is-hidden', unconfirm);
  $('attrEditReason').value = '';
  $('attrEditError').textContent = '';
  openModal('attrEditModal');
  setTimeout(() => $('attrEditReason').focus(), 50);
}

export async function submitAttrEdit(btn) {
  const e = editing; if (!e) return;
  const reason = $('attrEditReason').value.trim();
  if (!reason) { $('attrEditError').textContent = '必须写清楚原因：它会连同你的名字和时间一起记进流水'; return; }
  if (btn) btn.disabled = true;
  try {
    if (e.mode === 'unconfirm') await API.post('/api/inquiries/' + e.row.id + '/unconfirm', { reason });
    else await API.patch('/api/inquiries/' + e.row.id, { channel: $('attrEditChannel').value, grade: $('attrEditGrade').value, reason });
    closeModal('attrEditModal'); editing = null;
    toast(e.mode === 'unconfirm' ? '已撤销确认 · 已记入流水' : '已修改 · 已记入流水');
    changed();
  } catch (err) {
    $('attrEditError').textContent = '未入库：' + failText(err);
  } finally { if (btn) btn.disabled = false; }
}

/* ===== 事件委托（表格行上的四种入口 + 顶部「全部确认」） ===== */
if (typeof document !== 'undefined') {
  document.addEventListener('click', async (e) => {
    const inTable = (sel) => e.target.closest('#tb-inq ' + sel);
    const rowOf = (el) => { const tr = el.closest('tr'); return (window._inqCache || []).find((x) => String(x.id) === String(tr && tr.dataset.id)); };

    const logBtn = inTable('[data-attr-log]');
    if (logBtn) { const row = rowOf(logBtn); if (row) openChangeLog(row.id); return; }
    const editBtn = inTable('[data-attr-edit]');
    if (editBtn) { const row = rowOf(editBtn); if (row) openAttrEdit(row, 'edit'); return; }
    const undoBtn = inTable('[data-attr-unconfirm]');
    if (undoBtn) { const row = rowOf(undoBtn); if (row) openAttrEdit(row, 'unconfirm'); return; }
    const okBtn = inTable('[data-attr-confirm]');
    if (okBtn) {
      const row = rowOf(okBtn); if (!row) return;
      okBtn.disabled = true;
      try { await API.post('/api/inquiries/' + row.id + '/confirm', {}); toast('已确认'); changed(); }
      catch (err) { okBtn.disabled = false; toast('确认失败：' + failText(err)); }
      return;
    }
    const allBtn = e.target.closest('[data-attr-confirm-all]');
    if (allBtn) {
      const pending = (window._inqCache || []).filter((r) => !isConfirmed(r)).map((r) => r.id);
      if (!pending.length) { toast('当前时间范围内没有待确认的询盘'); return; }
      // 一次确认几十条是不可逆的大动作（确认后李陈就改不动了），要再点一次才执行
      if (allBtn.dataset.armed !== '1') {
        allBtn.dataset.armed = '1'; allBtn.textContent = '再点一次：确认 ' + pending.length + ' 条';
        setTimeout(() => { if (allBtn.isConnected) { allBtn.dataset.armed = ''; allBtn.textContent = '全部确认（' + pending.length + '）'; } }, 4000);
        return;
      }
      allBtn.disabled = true;
      try { const r = await API.post('/api/inquiries/confirm', { ids: pending }); toast('已确认 ' + r.confirmed + ' 条'); changed(); }
      catch (err) { allBtn.disabled = false; toast('批量确认失败：' + failText(err)); }
    }
  });
}
