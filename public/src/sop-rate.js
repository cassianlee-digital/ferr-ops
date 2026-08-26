/* SOP 执行率（ES 模块 · esbuild 打包为 IIFE）。
   sop_completions 天天在写却没人看，SOP 就成了没有复盘的打卡。这里把它变成周报里的一行事实：
   这一周每个人的固定动作做到了几成、漏的是哪几天哪一条。
   落点：周报页每个周卡片顶部（weekly-review.js 只吐一个空壳 <div class="sop-rate" data-from data-to>）。
   懒加载：只有展开的那一周才请求——周报页会一次列出十几周。
   运行时依赖的全局（调用时解析）：API、esc()。
   mountSopRate 由 weekly-review.js 显式导入，不进入 window 全局面。 */
import { esc } from './ui-kit.js';
import { formatLocalDate } from './timerange.js';

const DEPTS = [['SEO', '李', 'b-blue'], ['SEM', '陈', 'b-purple'], ['公司', '公司', 'b-red']];
const FREQ_LABEL = { daily: '每日', weekly: '每周', monthly: '每月' };

function pct(done, expected) { return expected > 0 ? Math.round((done / expected) * 100) : null; }
function rateClass(p) { return p === null ? 'sr-na' : (p >= 90 ? 'sr-good' : (p >= 60 ? 'sr-mid' : 'sr-bad')); }

function deptBlockHtml(dept, label, badge, items) {
  const counted = items.filter((i) => i.expected !== null);
  const done = counted.reduce((a, i) => a + i.done, 0);
  const expected = counted.reduce((a, i) => a + i.expected, 0);
  const p = pct(done, expected);
  // 漏得最多的排前面——要看的就是"哪条老是不做"
  const missed = counted.filter((i) => i.expected > i.done)
    .sort((a, b) => (b.expected - b.done) - (a.expected - a.done));
  const missHtml = missed.length
    ? missed.map((i) => `<div class="sr-miss"><span class="sr-mt">${esc(i.title)}</span>`
      + `<span class="sr-mf">${FREQ_LABEL[i.freq] || ''}</span>`
      + `<span class="sr-mn">缺 ${i.expected - i.done}${i.missed_days.length ? ' · ' + i.missed_days.map((d) => d.slice(5)).join(' ') : ''}</span></div>`).join('')
    : '<div class="sr-miss sr-ok"><i class="ti ti-check"></i> 这一周一条没漏</div>';
  return `<div class="sr-dept">
    <div class="sr-head"><span class="badge ${badge}">${esc(label)}</span>
      <span class="sr-num ${rateClass(p)}">${expected ? `${done}/${expected}` : '—'}${p === null ? '' : ` · ${p}%`}</span></div>
    <div class="sr-misses">${missHtml}</div>
  </div>`;
}

export async function mountSopRate(el) {
  if (!el || el.dataset.loaded === '1') return;
  const from = el.dataset.from;
  const to = el.dataset.to;
  if (!from || !to) return;
  el.dataset.loaded = '1';
  el.innerHTML = '<div class="sr-loading">正在算这一周的 SOP 执行率…</div>';
  try {
    const q = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&today=${encodeURIComponent(formatLocalDate(new Date()))}`;
    const data = await API.get('/api/sop/stats' + q);
    const items = data.items || [];
    if (!items.length) { el.innerHTML = '<div class="sr-loading">还没有配置 SOP</div>'; return; }
    const hasMonthly = items.some((i) => i.expected === null);
    el.innerHTML = `<div class="sr-title"><i class="ti ti-checklist"></i> SOP 执行率
        <span class="sr-note">统计到 ${esc(data.counted_to || to)} · 按打卡发生时间算 · 已停用的不计${hasMonthly ? ' · 月度 SOP 按月另算' : ''}</span></div>
      <div class="sr-cols">${DEPTS.map(([d, label, badge]) => deptBlockHtml(d, label, badge, items.filter((i) => i.dept === d))).join('')}</div>`;
  } catch (e) {
    // 失败要说原因，不能留一块空白让人以为"没漏"
    el.dataset.loaded = '';
    el.innerHTML = '<div class="sr-loading">执行率读取失败：' + esc((e && e.message) || '请求失败') + '</div>';
  }
}

/* 懒加载：周卡片是折叠的，展开哪一周才去算哪一周。
   weekly-review 的周卡片容器先切换折叠状态，这里读取切换后的状态并加载。 */
document.addEventListener('click', (e) => {
  const bar = e.target.closest('#review-acc .acc-bar');
  if (!bar) return;
  const week = bar.parentElement;
  // 周卡片容器位于 document 内层，同一轮冒泡到这里时折叠状态已经切换。
  if (!week || week.classList.contains('collapsed')) return;
  const el = week.querySelector('.sop-rate');
  if (el) mountSopRate(el);
});
