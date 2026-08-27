/* 时间范围筛选（ES 模块 · esbuild 打包为 IIFE）。
   ★ 分页面独立（2026-08-26）：以前全站共用一个 window._timeRange，任何一页改时间，六个页面一起变。
   现改为按「作用域(scope)」各存各的：dashboard / kpi / inquiry / data / fix。
   —— scope 由 HTML 上的 [data-time][data-scope] 显式声明，不靠 DOM 结构推导（GA4 面板会被
      mountGa4IntoData() 搬进数据看板，靠 closest('.panel') 推导会推错，故写死 data-scope="data"）。
   —— GA4 与数据看板同属 data：它已被嵌进数据看板成为子页签，同一屏两个互不相干的时间条会误导人。
   —— 整改页 fix 的时间条目前不过滤任何数据（页面自带提示），单独给个 scope 只为不去干扰别页。

   运行时依赖的全局：toast()、openModal()/closeModal()。
   数据消费方一律监听 timerange 事件并按 e.detail.scope 认领，时间模块不反向调用任何 loader。
   必须挂 window（main.js 统一处理）：
     - formatLocalDate/ymd —— closed-loop.js 显式导入；
     - withRange/getCurrentRange/activeScope —— charts.js / app.js / kpi 系列调用；
     - submitCustomRange —— data-ui-action 分发调用；
     - 其余函数保持原有全局暴露面。 */

/* ---------- per-page inline time filter ---------- */
const RANGES = ['今天', '昨天', '近7天', '近30天', '近90天', '近一年', '自定义']; // C-2a 三框预设 + C组「可查看近一年」 + 6.23 文档 26「自定义」
const SCOPES = ['dashboard', 'kpi', 'inquiry', 'data', 'fix'];
const SCOPE_LABEL = { dashboard: '总览', kpi: 'KPI 考核', inquiry: '询盘评级', data: '数据看板', fix: '整改清单' };
const DEFAULT_SCOPE = 'dashboard'; // 无时间条的页面（计划/关键词/归档…）顶栏日期跟这个
const DEFAULT_LABEL = '近30天';
const GRAN_LABEL = { day: '按天', week: '按周', month: '按月' };
const LS_LABEL = s => 'ferr:timeRange:' + s;
const LS_CUSTOM = s => 'ferr:customRange:' + s;

function readJson(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
function validCustom(cr) {
  return !!(cr && /^\d{4}-\d{2}-\d{2}$/.test(cr.start_date) && /^\d{4}-\d{2}-\d{2}$/.test(cr.end_date) && cr.start_date <= cr.end_date);
}
/* 旧版全站单一 key 的一次性迁移：老用户上次选的范围原样铺到各 scope，不让人一升级就回默认 */
const legacyLabel = (() => { try { const t = localStorage.getItem('ferr:timeRange'); return RANGES.includes(t) ? t : null; } catch (e) { return null; } })();
const legacyCustom = (() => { const cr = readJson('ferr:customRange'); return validCustom(cr) ? cr : null; })();

const state = {}; // scope -> {label, custom, range, revision}
SCOPES.forEach(scope => {
  let label = null;
  try { const t = localStorage.getItem(LS_LABEL(scope)); if (RANGES.includes(t)) label = t; } catch (e) {}
  const stored = readJson(LS_CUSTOM(scope));
  const custom = validCustom(stored) ? stored : (label ? null : legacyCustom);
  state[scope] = { label: label || legacyLabel || DEFAULT_LABEL, custom: custom || null, range: null, revision: 0 };
});
function st(scope) { return state[SCOPES.includes(scope) ? scope : DEFAULT_SCOPE]; }
/* 当前可见页面的 scope：顶栏日期与 /api/overview 跟着它走。
   planning/action 组合页会同时 active 多个 panel，取文档序第一个带时间条的即可。 */
export function activeScope() {
  const bar = document.querySelector('.panel.active [data-time][data-scope]');
  const s = bar && bar.dataset.scope;
  return SCOPES.includes(s) ? s : DEFAULT_SCOPE;
}
/* ===== 1e-a: 统一时间范围 → start_date/end_date/period_label(本地日期，避免 UTC 偏移) ===== */
export function formatLocalDate(d) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; }
export function ymd(v) { v = String(v == null ? '' : v).trim(); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; } // 仅接受 YYYY-MM-DD，供 <input type=date> 回填
export function resolveRange(label, scope) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const back = n => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };
  const r = (s, e) => ({ start_date: formatLocalDate(s), end_date: formatLocalDate(e), period_label: label });
  switch (label) {
    case '今天': return r(today, today);
    case '昨天': { const y = back(1); return r(y, y); }
    case '近7天': return r(back(6), today);
    case '近30天': return r(back(29), today);
    case '近90天': return r(back(89), today);
    case '近一年': return r(back(364), today);
    case '上周': { const day = (today.getDay() + 6) % 7; const thisMon = back(day); const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7); const lastSun = new Date(lastMon); lastSun.setDate(lastMon.getDate() + 6); return r(lastMon, lastSun); }
    case '上半月': { const first = new Date(today.getFullYear(), today.getMonth(), 1); const mid = new Date(today.getFullYear(), today.getMonth(), 15); return r(first, mid); }
    case '近1月': return r(back(29), today);
    case '近3月': return r(back(89), today);
    case '近半年': return r(back(179), today);
    case '近1年': return r(back(364), today);
    case '自定义': {
      const cr = st(scope).custom;
      if (!cr) return null; // 该页还没选过 → 返回 null 让调用方弹框
      return { start_date: cr.start_date, end_date: cr.end_date, period_label: '自定义 ' + cr.start_date + '~' + cr.end_date };
    }
    default: return r(back(29), today);
  }
}
SCOPES.forEach(scope => {
  const s = st(scope);
  if (s.label === '自定义' && !s.custom) s.label = DEFAULT_LABEL; // 自定义没存过 → 落回默认，不留 null
  s.range = resolveRange(s.label, scope);
});
export function getCurrentRange(scope) { return st(scope || activeScope()).range; }
export function getRangeRevision(scope) { return st(scope || activeScope()).revision; }
export function getRangeLabel(scope) { return st(scope || activeScope()).label; }
/* withRange(path, scope | rangeObject)：传字符串按该页区间；传对象用该对象（环比等需要偏移区间）；
   不传按当前可见页面 —— 但业务代码请显式传 scope，别依赖兜底。 */
export function withRange(path, arg) {
  const range = (arg && typeof arg === 'object') ? arg : getCurrentRange(typeof arg === 'string' ? arg : undefined);
  if (!range || !range.start_date || !range.end_date) return path;
  const sep = path.includes('?') ? '&' : '?';
  return path + sep + 'start_date=' + encodeURIComponent(range.start_date) + '&end_date=' + encodeURIComponent(range.end_date);
}
export function rangeText(r) { return (r && r.start_date) ? (r.start_date + ' ~ ' + r.end_date) : '—'; }
export function syncRangeUi() {
  document.querySelectorAll('[data-time][data-scope]').forEach(bar => {
    const s = st(bar.dataset.scope);
    bar.querySelectorAll('.trange').forEach(x => x.classList.toggle('active', x.textContent.trim() === s.label));
    bar.querySelectorAll('[data-tauto]').forEach(el => { el.innerHTML = '<i class="ti ti-calendar"></i> ' + rangeText(s.range); });
  });
  const top = document.getElementById('topRange');
  if (top) {
    const s = st(activeScope());
    top.innerHTML = '<i class="ti ti-calendar"></i> ' + rangeText(s.range);
    top.title = '当前页面时间范围：' + rangeText(s.range) + '（各页面各自记忆，互不影响）';
  }
}
export function refreshRangeConsumers(scope) {
  const key = SCOPES.includes(scope) ? scope : DEFAULT_SCOPE;
  const s = st(key);
  s.revision++;
  document.dispatchEvent(new CustomEvent('timerange', { detail: { scope: key, range: s.range, revision: s.revision } }));
}
export function applyTimeRange(label, scope) {
  const key = SCOPES.includes(scope) ? scope : activeScope();
  const nr = resolveRange(label, key);
  if (!nr) {
    if (label === '自定义') openCustomRange(key);
    else toast('该预设尚未实现，未改变筛选');
    return false;
  }
  const s = st(key);
  s.label = label; s.range = nr;
  try { localStorage.setItem(LS_LABEL(key), label); } catch (e) {}
  syncRangeUi();
  refreshRangeConsumers(key);
  toast(SCOPE_LABEL[key] + ' 时间范围：' + nr.period_label);
  return true;
}
/* C-2a 三框：框1 预设(7/30/90) + 框2 自动日期(只读) + 框3 粒度(按所在面板 data-gran 白名单动态给) */
export function renderTimebar(bar) {
  const s = st(bar.dataset.scope);
  const grans = (bar.dataset.gran || '').split(',').map(x => x.trim()).filter(Boolean);
  const onlyWeekly = grans.indexOf('week') >= 0 && grans.indexOf('day') < 0; // SEO/SEM：无日数据→标注「按周记录」
  const granHtml = grans.length
    ? '<span class="tlabel tlabel-gap"><i class="ti ti-chart-dots"></i> 粒度</span>'
      + '<select class="tgran">' + grans.map(g => `<option value="${g}"${g === window._gran ? ' selected' : ''}>${GRAN_LABEL[g] || g}</option>`).join('') + '</select>'
      + (onlyWeekly ? '<span class="tgran-note">· 按周记录</span>' : '')
    : '';
  bar.innerHTML = '<span class="tlabel"><i class="ti ti-calendar-stats"></i> 时间</span>'
    + RANGES.map(r => `<button type="button" class="trange${r === s.label ? ' active' : ''}">${r}</button>`).join('')
    + `<button type="button" class="tauto tauto-btn" data-tauto title="选择具体日期范围"><i class="ti ti-calendar"></i> ${rangeText(s.range)}</button>`
    + granHtml
    + '<span class="tscope-note" title="每个页面各自记住自己的时间范围，互不影响">仅本页</span>';
}
try { const g = localStorage.getItem('ferr:gran'); window._gran = ['day', 'week', 'month'].indexOf(g) >= 0 ? g : 'week'; } catch (e) { window._gran = 'week'; }
document.querySelectorAll('[data-time][data-scope]').forEach(bar => {
  const scope = SCOPES.includes(bar.dataset.scope) ? bar.dataset.scope : DEFAULT_SCOPE;
  renderTimebar(bar);
  bar.addEventListener('click', e => {
    const dateBtn = e.target.closest('.tauto-btn');
    if (dateBtn) { openCustomRange(scope); return; }
    const btn = e.target.closest('.trange'); if (!btn) return;
    const rg = btn.textContent.trim();
    // 6.23 文档 26：点「自定义」打开日期弹框；保存后再应用。先把按钮态切回原 active（用户取消时不抖动）
    if (rg === '自定义' && !st(scope).custom) { openCustomRange(scope); return; }
    applyTimeRange(rg, scope);
  });
  bar.addEventListener('change', e => {
    const sel = e.target.closest('.tgran'); if (!sel) return;
    window._gran = sel.value;
    try { localStorage.setItem('ferr:gran', sel.value); } catch (err) {} // BUG-31 B-1
    document.querySelectorAll('[data-time] .tgran').forEach(x => { if ([...x.options].some(o => o.value === sel.value)) x.value = sel.value; }); // 多条粒度联动
    document.dispatchEvent(new CustomEvent('granularity', { detail: { gran: window._gran } }));
    // 6.23 文档 2：总览询盘趋势固定「当月按日」，不再响应全局粒度切换
    toast('粒度：' + (GRAN_LABEL[window._gran] || window._gran));
  });
});
syncRangeUi();

/* 6.23 文档 26：自定义时间区间弹框 - 打开/提交。改的是「打开它的那个页面」的区间。 */
let _customScope = DEFAULT_SCOPE;
export function openCustomRange(scope) {
  _customScope = SCOPES.includes(scope) ? scope : activeScope();
  const cr = st(_customScope).custom || {};
  const today = formatLocalDate(new Date());
  const back = n => { const d = new Date(); d.setDate(d.getDate() - n); return formatLocalDate(d); };
  document.getElementById('cr-start').value = cr.start_date || back(29);
  document.getElementById('cr-end').value = cr.end_date || today;
  const hint = document.getElementById('cr-scope-hint');
  if (hint) hint.textContent = '仅作用于「' + SCOPE_LABEL[_customScope] + '」页面，其它页面的时间范围不受影响。';
  openModal('customRangeMask'); setTimeout(() => document.getElementById('cr-start').focus(), 50);
}
export function submitCustomRange() {
  const s = document.getElementById('cr-start').value;
  const e = document.getElementById('cr-end').value;
  if (!s || !e) { toast('请选择开始和结束日期'); return; }
  if (s > e) { toast('开始日期不能晚于结束日期'); return; }
  // 区间最长 1 年（与「近一年」一致），防止误操作
  const days = Math.floor((new Date(e + 'T00:00') - new Date(s + 'T00:00')) / 86400000);
  if (days > 365) { toast('区间最长 1 年'); return; }
  const scope = _customScope, cur = st(scope);
  cur.custom = { start_date: s, end_date: e };
  try { localStorage.setItem(LS_CUSTOM(scope), JSON.stringify(cur.custom)); } catch (err) {}
  cur.label = '自定义';
  try { localStorage.setItem(LS_LABEL(scope), '自定义'); } catch (err) {}
  cur.range = resolveRange('自定义', scope);
  syncRangeUi();
  refreshRangeConsumers(scope);
  closeModal('customRangeMask'); toast(SCOPE_LABEL[scope] + ' 已应用：' + cur.range.period_label);
}
