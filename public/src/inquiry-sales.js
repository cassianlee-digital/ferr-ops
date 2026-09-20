/* 询盘表的「业务反馈」列（2026-09-20 新增）。
 *
 * 老板要求：在「业务员」后面加一列，能把业务发过来的关键词（文字）和截图（图片）都存进来。
 *
 * 与旁边那列「跟踪反馈」的分工必须一直清楚：
 *   跟踪反馈 = 运营自己记的跟进进度（我们做了什么）
 *   业务反馈 = 业务发回来的原始材料（客户/业务怎么说的、给了什么图）
 * 混成一列，复盘时就分不清哪句话是谁说的 —— 证据链一断，这张表就退化成流水账。
 *
 * 单独成模块而不是塞进 inquiries.js：那个文件已经 450 行，且它的导出面被
 * frontendXss.test.js 逐个焊死；这里只对外给一个 salesCellHtml()，由 inqRowHtml 调用。
 * 反向刷新走自定义事件（salesnoteschanged），避免 inquiries ↔ inquiry-sales 成环。
 */
import { esc, openModal, closeModal, toast } from './ui-kit.js';
import { inlineConfirm } from './keywords.js';
import { thumbsHtml, pickAndUpload, pickImages, uploadAll, deleteImage } from './attachments.js';

export const OWNER_TYPE = 'inquiry_sales_note';

function noteList(r) { return (r && Array.isArray(r.sales_notes)) ? r.sales_notes : []; }

// 服务端存 UTC 的 'YYYY-MM-DD HH:MM:SS'；转本地显示，转不动就如实回退原文（与跟踪反馈同口径）
function noteDate(iso, withTime) {
  if (!iso) return '日期不详';
  const d = new Date(String(iso).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  const md = p(d.getMonth() + 1) + '-' + p(d.getDate());
  return withTime ? (d.getFullYear() + '-' + md + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())) : md;
}

/* 表格里的格子：每条业务反馈一行（日期 + 正文 + 缩略图），下面永远跟着「添加」按钮。
   与跟踪反馈刻意保持同样的版式——同一张表里两列长得不一样，人会以为它们语义也不同。
   正文同样不截断：业务甩过来的关键词往往就是那一句，截断了等于每条都要点开看。 */
export function salesCellHtml(r) {
  const list = noteList(r);
  if (!list.length) {
    return '<button type="button" class="track-add track-add-first" data-sales-open><i class="ti ti-plus"></i>业务反馈</button>';
  }
  const title = list.map((n) => noteDate(n.created_at, true) + '　' + (n.text || '(仅图片)')).join('\n\n');
  return '<div class="track-cell-wrap">'
    + `<button type="button" class="track-list sales-list" data-sales-open title="${esc(title)}">`
    + list.map((n) => '<span class="track-line sales-line">'
        + `<span class="track-line-date sales-line-date">${esc(noteDate(n.created_at, false))}</span>`
        + '<span class="track-line-text">'
          + (n.text ? esc(n.text) : '<span class="sales-only-img">仅图片</span>')
          + thumbsHtml(n.images)
        + '</span>'
      + '</span>').join('')
    + '</button>'
    + `<button type="button" class="track-add" data-sales-open><i class="ti ti-plus"></i>添加<span class="track-count">${list.length}</span></button>`
    + '</div>';
}

/* ===== 弹框：完整时间线 + 写一条 + 传图 ===== */
let editing = null;      // 当前操作的询盘行（来自 window._inqCache）
let pendingFiles = [];   // 「先选图、点添加时才上传」的暂存区

function repaintCell() {
  if (!editing) return;
  const tr = document.querySelector('.inq-tb tr[data-id="' + editing.id + '"]');
  const cell = tr && tr.querySelector('.inq-sales-feedback');
  if (cell) cell.innerHTML = salesCellHtml(editing);
  // 让询盘列表重画筛选行/计数（「有/无业务反馈」这一列的候选与统计要跟上）
  document.dispatchEvent(new CustomEvent('salesnoteschanged', { detail: { id: editing.id } }));
}

function renderPending() {
  const box = document.getElementById('sales-pending');
  if (!box) return;
  if (!pendingFiles.length) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="sales-pending-head">待上传 ' + pendingFiles.length + ' 张：</div>'
    + pendingFiles.map((f, i) => `<span class="sales-pending-item">${esc(f.name)}`
      + `<button type="button" class="sales-pending-del" data-sales-unpick="${i}" title="不传这张"><i class="ti ti-x"></i></button></span>`).join('');
}

function renderLog() {
  const box = document.getElementById('sales-log');
  if (!box) return;
  const list = noteList(editing);
  if (!list.length) { box.innerHTML = '<div class="track-log-empty">还没有业务反馈，在下面写第一条或直接传图。</div>'; return; }
  box.innerHTML = '<div class="track-log-head">业务反馈 · ' + list.length + ' 条（新的在上）</div>'
    + list.map((n) => `<div class="track-item" data-note="${esc(n.id)}">`
      + '<div class="track-item-meta">'
        + `<span class="track-item-date${n.created_at ? '' : ' track-item-nodate'}"><i class="ti ti-clock"></i>${esc(noteDate(n.created_at, true))}</span>`
        + (n.created_by_name ? `<span class="track-item-who">${esc(n.created_by_name)}</span>` : '')
        + `<button type="button" class="sales-item-add-img" data-sales-addimg="${esc(n.id)}" title="给这条补图"><i class="ti ti-photo-plus"></i></button>`
        + `<button type="button" class="track-item-del" data-sales-del="${esc(n.id)}" title="删除这条记录"><i class="ti ti-trash"></i></button>`
      + '</div>'
      + (n.text ? `<div class="track-item-text">${esc(n.text)}</div>` : '<div class="track-item-text dim">（仅图片）</div>')
      + thumbsHtml(n.images, { deletable: true })
      + '</div>').join('');
}

function openSales(tr) {
  const id = tr && tr.dataset.id;
  if (!id) return;
  const it = (window._inqCache || []).find((x) => String(x.id) === String(id));
  if (!it) return;
  editing = it;
  pendingFiles = [];
  const who = document.getElementById('sales-cust');
  if (who) who.textContent = it.customer_code || it.customer_name || it.country || ('#' + it.id);
  const text = document.getElementById('sales-text');
  if (text) text.value = '';
  renderLog();
  renderPending();
  openModal('salesMask');
  setTimeout(() => { const t = document.getElementById('sales-text'); if (t) t.focus(); }, 50);
}

export async function submitSalesNote() {
  if (!editing) return;
  const box = document.getElementById('sales-text');
  const text = (box && box.value.trim()) || '';
  if (!text && !pendingFiles.length) { toast('写点内容，或者先选几张图'); if (box) box.focus(); return; }
  const btn = document.querySelector('[data-ui-action="submit-sales-note"]');
  if (btn) btn.disabled = true;
  try {
    // 先建记录拿 id，再逐张挂图：一张图传失败只丢那一张，不会把整条反馈搞没
    const { item } = await API.post('/api/inquiries/' + editing.id + '/sales-notes',
      { text, withImages: pendingFiles.length > 0 });
    item.images = item.images || [];
    if (pendingFiles.length) {
      const { done, failed } = await uploadAll(OWNER_TYPE, item.id, pendingFiles);
      item.images = done;
      if (failed.length) toast(failed.length + ' 张图上传失败：' + failed[0].reason);
    }
    editing.sales_notes = [item].concat(noteList(editing)); // 新的在前，与服务端排序一致
    pendingFiles = [];
    if (box) box.value = '';
    renderLog();
    renderPending();
    repaintCell();
    if (box) box.focus();  // 弹框不关：业务反馈常常一次要补好几条
    toast('已添加 1 条业务反馈（' + noteDate(item.created_at, false) + '）');
  } catch (e) {
    toast(e && e.status === 403 ? '无权操作' : '添加失败：' + ((e && e.message) || ''));
  } finally {
    if (btn) btn.disabled = false;
  }
}

// 选图（暂存，点「添加」时才真上传）
export async function pickSalesImages() {
  const files = await pickImages({ multiple: true });
  if (!files.length) return;
  pendingFiles = pendingFiles.concat(files);
  renderPending();
}

/* ===== 事件委托 ===== */
// 表格里点格子 → 开弹框
document.addEventListener('click', (e) => {
  const t = e.target.closest('.inq-tb [data-sales-open]');
  if (!t) return;
  const tr = t.closest('tr');
  if (tr) openSales(tr);
});

document.addEventListener('click', async (e) => {
  // 取消一张待上传的图
  const unpick = e.target.closest('[data-sales-unpick]');
  if (unpick) {
    pendingFiles.splice(Number(unpick.dataset.salesUnpick), 1);
    renderPending();
    return;
  }
  if (!editing) return;

  // 给已有的一条反馈补图
  const addImg = e.target.closest('#sales-log [data-sales-addimg]');
  if (addImg) {
    const noteId = addImg.dataset.salesAddimg;
    const note = noteList(editing).find((n) => String(n.id) === String(noteId));
    if (!note) return;
    const added = await pickAndUpload(OWNER_TYPE, noteId);
    if (added.length) { note.images = (note.images || []).concat(added); renderLog(); repaintCell(); }
    return;
  }

  // 删一张图
  const delImg = e.target.closest('#sales-log [data-att-del]');
  if (delImg) {
    if (!inlineConfirm(delImg, '确认')) return;
    const imgId = delImg.dataset.attDel;
    try {
      await deleteImage(imgId);
      for (const n of noteList(editing)) n.images = (n.images || []).filter((im) => String(im.id) !== String(imgId));
      renderLog();
      repaintCell();
      toast('已删除这张图');
    } catch (err) {
      toast(err && err.status === 403 ? '无权操作' : '删除失败：' + ((err && err.message) || ''));
    }
    return;
  }

  // 删一条反馈（连带它的图）
  const delNote = e.target.closest('#sales-log [data-sales-del]');
  if (delNote) {
    if (!inlineConfirm(delNote, '确认删除')) return;
    const noteId = delNote.dataset.salesDel;
    try {
      await API.del('/api/inquiries/' + editing.id + '/sales-notes/' + noteId);
      editing.sales_notes = noteList(editing).filter((n) => String(n.id) !== String(noteId));
      renderLog();
      repaintCell();
      toast('已删除该条业务反馈');
    } catch (err) {
      toast(err && err.status === 403 ? '无权操作' : '删除失败：' + ((err && err.message) || ''));
    }
  }
});
