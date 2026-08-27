/* Execution 验证闭环明细（Phase 5A · 新写 ES 模块，零内联 handler，事件委托）。
   目的：管理者点开 SEO/SEM Execution 指标能看清分数怎么来的——本区间到期的问题、Impact、状态、验证结果。
   运行时依赖：window.API、esc()、toast()；区间用 timerange.withRange。写操作经 /api/execution-loops。 */
import { withRange, getRangeRevision } from './timerange.js';
import { loadMetrics } from './kpi.js';

// 写操作后：重拉 KPI 指标并重渲染（renderKPI 末尾会 mountExecution 刷新明细）——单一路径，避免重复拉取。
async function refreshAfterWrite() {
  await loadMetrics();
  if (window.renderKPI) window.renderKPI();
}

const ST_LABEL = { OPEN: '待执行', IN_PROGRESS: '执行中', IMPLEMENTED: '已实施待验证', VERIFYING: '验证中', VERIFIED: '已验证', FAILED: '逾期未验证', CANCELLED: '已取消' };
const ST_TONE = { VERIFIED: 'kpi-tone-green', VERIFYING: 'kpi-tone-blue', IMPLEMENTED: 'kpi-tone-blue', IN_PROGRESS: 'kpi-tone-amber', OPEN: 'kpi-tone-muted', FAILED: 'kpi-tone-primary', CANCELLED: 'kpi-tone-muted' };
const IMP_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const IMP_LABEL = { HIGH: '高', MEDIUM: '中', LOW: '低' };
const RESULT_LABEL = { POSITIVE: '正向', NEUTRAL: '无明显变化', NEGATIVE: '负向' };
const NEXT_STATUS = ['OPEN', 'IN_PROGRESS', 'IMPLEMENTED', 'VERIFYING', 'VERIFIED']; // 推进链；FAILED/CANCELLED 单独按钮

function num(v) { return v == null || !Number.isFinite(Number(v)) ? null : Number(v); }

function verifCell(r) {
  const bv = num(r.before_value), av = num(r.after_value);
  if (bv != null && av != null) return esc(r.related_metric || '') + ' ' + bv + '→' + av;
  if (r.verification_result_text) return esc(r.verification_result_text);
  if (r.verification_method) return esc(r.verification_method);
  return '—';
}

function rowHtml(r) {
  const st = ST_LABEL[r.status] || r.status;
  const tone = ST_TONE[r.status] || 'kpi-tone-muted';
  const res = r.verification_result ? '<span class="exec-res ' + (r.verification_result === 'NEGATIVE' ? 'kpi-tone-primary' : r.verification_result === 'POSITIVE' ? 'kpi-tone-green' : 'kpi-tone-muted') + '">' + RESULT_LABEL[r.verification_result] + '</span>' : '';
  const adv = NEXT_STATUS.indexOf(r.status);
  const advBtn = (adv >= 0 && adv < NEXT_STATUS.length - 1)
    ? '<button class="exec-btn" data-exec-advance="' + r.id + '" data-next="' + NEXT_STATUS[adv + 1] + '">推进→' + ST_LABEL[NEXT_STATUS[adv + 1]] + '</button>' : '';
  const excluded = Number(r.exclude_from_assessment) === 1 ? '<span class="kpi-ds-badge">已排除</span>' : '';
  return '<tr>'
    + '<td class="exec-prob">' + esc(r.problem || '') + excluded + (r.analysis ? '<div class="exec-sub">分析：' + esc(r.analysis) + '</div>' : '') + (r.action ? '<div class="exec-sub">动作：' + esc(r.action) + '</div>' : '') + '</td>'
    + '<td>' + esc(r.owner || '') + '</td>'
    + '<td><span class="exec-imp imp-' + (r.impact_level || 'MEDIUM') + '">' + (IMP_LABEL[r.impact_level] || '中') + '</span></td>'
    + '<td><span class="exec-st ' + tone + '">' + st + '</span></td>'
    + '<td class="exec-verif">' + verifCell(r) + ' ' + res + '</td>'
    + '<td class="exec-act">' + advBtn + '</td>'
    + '</tr>';
}

function panelHtml(channel, items) {
  const sorted = items.slice().sort((a, b) => {
    const ir = (IMP_RANK[a.impact_level] ?? 1) - (IMP_RANK[b.impact_level] ?? 1);
    if (ir) return ir;
    return String(a.verification_due_at || '').localeCompare(String(b.verification_due_at || ''));
  });
  const elig = sorted.filter((r) => Number(r.exclude_from_assessment) !== 1);
  const ver = elig.filter((r) => r.status === 'VERIFIED');
  const bkt = (lvl) => { const e = elig.filter((r) => (r.impact_level || 'MEDIUM') === lvl); const v = e.filter((r) => r.status === 'VERIFIED'); return v.length + '/' + e.length; };
  const summary = '本区间到期 ' + elig.length + ' · 已验证 ' + ver.length
    + ' · <span class="exec-bkt">高 ' + bkt('HIGH') + '</span> <span class="exec-bkt">中 ' + bkt('MEDIUM') + '</span> <span class="exec-bkt">低 ' + bkt('LOW') + '</span>';
  const table = sorted.length
    ? '<div class="exec-tablewrap"><table class="exec-table"><thead><tr><th>问题 / 分析 / 动作</th><th>负责</th><th>影响</th><th>状态</th><th>验证</th><th></th></tr></thead><tbody>' + sorted.map(rowHtml).join('') + '</tbody></table></div>'
    : '<div class="kpi-empty">本区间无到期验证的闭环</div>';
  const form = '<form class="exec-form" data-exec-form="' + channel + '">'
    + '<input name="problem" placeholder="发现的问题（必填）" required>'
    + '<input name="analysis" placeholder="分析：为什么发生">'
    + '<input name="action" placeholder="动作：采取了什么">'
    + '<input name="verification_method" placeholder="验证方法：怎么判断有效">'
    + '<select name="impact_level"><option value="HIGH">高影响</option><option value="MEDIUM" selected>中影响</option><option value="LOW">低影响</option></select>'
    + '<label class="exec-due">验证到期 <input type="date" name="verification_due_at"></label>'
    + '<button type="submit" class="exec-btn exec-btn-primary">新增闭环</button>'
    + '</form>';
  return '<details class="exec-panel" open><summary>执行验证闭环 · ' + summary + '</summary>' + table + form + '</details>';
}

const CH_ANCHOR = { seo: 'seoRows', sem: 'semRows' };
function ensureContainer(channel) {
  const anchor = document.getElementById(CH_ANCHOR[channel]);
  if (!anchor) return null;
  let box = document.getElementById('exec-' + channel);
  if (!box) {
    box = document.createElement('div');
    box.id = 'exec-' + channel;
    box.className = 'exec-mount';
    anchor.parentElement.appendChild(box);
  }
  return box;
}

async function renderChannel(channel) {
  const box = ensureContainer(channel);
  if (!box) return;
  try {
    const { items } = await API.get(withRange('/api/execution-loops?channel=' + channel + '&due=1'));
    box.innerHTML = panelHtml(channel, items || []);
  } catch (e) {
    if (e && e.message !== 'unauthorized') box.innerHTML = '<div class="kpi-empty">执行闭环加载失败：' + esc(e.message || '未知错误') + '</div>';
  }
}

let seq = 0;
export async function mountExecution() {
  const rev = getRangeRevision(), id = ++seq;
  await Promise.all([renderChannel('seo'), renderChannel('sem')]);
  if (id !== seq || rev !== getRangeRevision()) { /* 已被更新的区间取代，忽略 */ }
}

// 事件委托：一个监听器处理新增与状态推进（无内联 handler）
document.addEventListener('submit', async (e) => {
  const form = e.target.closest && e.target.closest('[data-exec-form]');
  if (!form) return;
  e.preventDefault();
  const channel = form.getAttribute('data-exec-form');
  const body = { channel };
  for (const el of form.elements) { if (el.name && el.value) body[el.name] = el.value; }
  if (!body.problem) { toast('问题必填'); return; }
  try {
    await API.post('/api/execution-loops', body);
    toast('已新增执行闭环');
    await refreshAfterWrite();
  } catch (err) { toast(err.status === 403 ? '无权在此渠道新增' : '新增失败：' + (err.message || '')); }
});
document.addEventListener('click', async (e) => {
  const btn = e.target.closest && e.target.closest('[data-exec-advance]');
  if (!btn) return;
  const id = btn.getAttribute('data-exec-advance'), next = btn.getAttribute('data-next');
  const channel = btn.closest('[id^="exec-"]').id.replace('exec-', '');
  try {
    await API.patch('/api/execution-loops/' + id, { status: next });
    toast('已推进至「' + (ST_LABEL[next] || next) + '」');
    await refreshAfterWrite();
  } catch (err) { toast(err.status === 403 ? '无权编辑本记录' : '更新失败：' + (err.message || '')); }
});

document.addEventListener('timerange', mountExecution);
