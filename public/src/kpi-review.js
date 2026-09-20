/* 月度绩效考核看板（老板《2026 运营部绩效考核表》口径）。
 * 数据来自 GET /api/kpi/review（后端 services/kpiReview.js 是唯一评分真相，前端一行不算分）。
 *
 * 它是 KPI 页的主角：老板要的是「这个月 A/B 询价够不够、花的钱值不值、该做的复盘整改做没做」，
 * 旧的 v2 分层考核（可见度/质量指数/CPVI…）按老板要求本期不计入，留在下方作为诊断明细。
 *
 * 三个范围：运营部（主）/ 李·SEO / 陈·SEM。
 * A、B 询价数量按**部门整体**算一次，三个范围拿到的是同一个数 —— 这是老板拍板的口径：
 * 后台询盘全是人工录入，channel 字段没有机器证据，按它拆等于用手填字段决定谁的钱。
 * 个人之间的差别只体现在成本（SEO 不适用）与各自的复盘/整改/测试完成率上。
 *
 * DOM 全部 createElement + textContent：考核结论要落到白纸黑字，不经 HTML 解析这一层。
 * 零内联 handler：范围切换与重试走模块内事件委托。
 */
import { getRangeRevision, rangeText, withRange } from './timerange.js';

const CARD_ID = 'kpiReview';
const SCOPES = [
  { key: 'department', label: '运营部（部门）', hint: '老板考核表的主口径：A/B 询价是 SEM 与 SEO 共同产出' },
  { key: 'seo', label: '李 · SEO', hint: '共享 A/B 数量口径；广告成本不适用，权重已重新归一' },
  { key: 'sem', label: '陈 · SEM', hint: '共享 A/B 数量口径；广告成本按 SEM 实际花费计算' },
];
let activeScopeKey = 'department';
let latest = null;

/* 指标状态 → 人话。缺数据的格子只出现这几种文案，绝不填 0 充数。 */
const STATUS_TEXT = {
  NOT_APPLICABLE: '不适用',
  NO_TARGET: '目标待定',
  MISSING_DATA: '缺数据',
  NO_BASELINE: '本期无此项',
};
const SCOPE_STATUS_TEXT = {
  GRADED: null,
  CONFIG_INCOMPLETE: '考核目标未设全 · 先到「设置 → 月度绩效考核」把目标填完',
  INSUFFICIENT_COVERAGE: '可评分数据不足，未出正式分',
  NO_VALID_DATA: '本区间暂无可评分数据',
};

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = String(text);
  return el;
}
function cell(tag, className, text, title) {
  const el = make(tag, className, text);
  if (title) el.title = title;
  return el;
}
const pct = (v, digits) => (v == null || !Number.isFinite(Number(v)) ? null : (Number(v) * 100).toFixed(digits == null ? 1 : digits) + '%');
// 金额：Ads 同步回来的是账户币种（同步未存币种字段）→ 不臆造符号，与 SEM 看板 / 运营总账一致
const money = (v, currency) => (v == null || !Number.isFinite(Number(v))
  ? null
  : (currency === 'CNY' ? '¥' : '') + Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 }));

function metricValueText(m, which) {
  const v = m[which];
  if (v == null) return null;
  if (m.unit === '%') return pct(v);
  // 目标永远是人民币（设置页按元录入），所以固定带 ¥；
  // 实际值可能来自 Ads（账户币种，同步未存币种字段）→ 按 m.currency 决定要不要加符号，不臆造。
  if (m.unit === '¥') return money(v, which === 'target' ? 'CNY' : m.currency);
  return String(v);
}

/* ===== 卡片骨架（幂等插入到 KPI 页最前面）===== */
function ensureCard() {
  const existing = document.getElementById(CARD_ID);
  if (existing) return existing;
  const panel = document.getElementById('panel-kpi');
  if (!panel) return null;
  const card = make('div', 'card kpi-review');
  card.id = CARD_ID;
  const head = make('div', 'card-head');
  head.appendChild(make('span', 'card-title', '月度绩效考核 · 老板考核表口径'));
  head.appendChild(make('span', 'card-sub kpi-review-range', '当前区间 —'));
  card.appendChild(head);
  card.appendChild(make('div', 'kpi-review-body'));
  // 摆在时间条与提示之后、三个表盘之前 —— 这是老板进来第一眼要看的东西
  const anchor = panel.querySelector('.sheet-tip');
  if (anchor && anchor.nextSibling) panel.insertBefore(card, anchor.nextSibling);
  else panel.appendChild(card);
  return card;
}
/* 运营总账卡（ledger.js）也往「.sheet-tip 之后」插，谁后挂载谁就排到前面 ——
   两个模块各插各的，先后取决于 renderKPI 里的调用顺序，靠不住。
   这里每次渲染都把考核表重新顶到总账之前：考核结论是主角，业务漏斗是它的支撑材料。
   DOM 移动是幂等的，位置已经对就什么都不做。 */
function hoistAboveLedger(card) {
  const ledger = document.getElementById('kpiLedger');
  if (!ledger || ledger.parentNode !== card.parentNode) return;
  if (card.compareDocumentPosition(ledger) & Node.DOCUMENT_POSITION_FOLLOWING) return; // 已在总账之前
  card.parentNode.insertBefore(card, ledger);
}
function setBody(card, node) {
  const body = card.querySelector('.kpi-review-body');
  if (!body) return;
  body.textContent = '';
  body.appendChild(node);
}

/* ===== 各区块 ===== */
function buildTabs() {
  const bar = make('div', 'kpi-review-tabs');
  for (const s of SCOPES) {
    const btn = make('button', 'kpi-review-tab' + (s.key === activeScopeKey ? ' on' : ''), s.label);
    btn.type = 'button';
    btn.title = s.hint;
    btn.setAttribute('data-kpi-review-scope', s.key);
    bar.appendChild(btn);
  }
  return bar;
}

/* 等级徽章配色。按绩效系数分级而不是按分数 —— 分档线是可配置的，系数才是「这一档意味着什么」。
   1.0 及以上=达成（绿）/ 0.9=良好（蓝）/ 0.8=达标（黄）/ 更低=未达标（红）。 */
function bandTone(coef) {
  if (!Number.isFinite(Number(coef))) return 'tone-muted';
  const c = Number(coef);
  if (c >= 1) return 'tone-ok';
  if (c >= 0.9) return 'tone-good';
  if (c >= 0.8) return 'tone-warn';
  return 'tone-bad';
}

function buildHero(s) {
  const hero = make('div', 'kpi-review-hero');

  const scoreBox = make('div', 'kpi-review-score');
  const official = s.score != null;
  const shown = official ? s.score : s.provisionalScore;
  const band = official ? s.band : s.provisionalBand;
  const big = make('div', 'kpi-review-score-num' + (official ? '' : ' provisional'), shown == null ? '—' : shown);
  scoreBox.appendChild(big);
  scoreBox.appendChild(make('div', 'kpi-review-score-max', official ? ('总分 / 上限 ' + s.maxScore) : '参考分（未出正式分）'));
  hero.appendChild(scoreBox);

  const meta = make('div', 'kpi-review-meta');
  const gradeRow = make('div', 'kpi-review-grade-row');
  if (band) {
    // 等级颜色跟着绩效系数走，不写死：「未达标」显示成绿色会把坏消息说成好消息
    const tone = official ? ' ' + bandTone(band.coef) : ' provisional';
    gradeRow.appendChild(cell('span', 'kpi-review-grade' + tone, band.label, band.note || ''));
    gradeRow.appendChild(cell('span', 'kpi-review-coef', '绩效系数 ' + band.coef,
      official ? '按总分落入的分档' : '仅供参考 —— 正式分未产生，系数不生效'));
  } else {
    gradeRow.appendChild(make('span', 'kpi-review-grade muted', '待评估'));
  }
  meta.appendChild(gradeRow);

  const warn = SCOPE_STATUS_TEXT[s.status];
  if (warn) meta.appendChild(make('div', 'kpi-review-warn', warn));
  meta.appendChild(make('div', 'kpi-review-cov',
    '可评分覆盖率 ' + (pct(s.coverage, 0) || '0%') + '（' + s.weights.valid + ' / ' + s.weights.eligible + ' 分权重有数据）'));
  hero.appendChild(meta);

  hero.appendChild(buildChips(s));
  return hero;
}

// 老板表第一节那一排核心数字。只读，不参与打分。
function buildChips(s) {
  const wrap = make('div', 'kpi-review-chips');
  const costA = s.metrics.find((m) => m.key === 'cost_a');
  const costAb = s.metrics.find((m) => m.key === 'cost_ab');
  const costText = (m) => (m && m.status === 'VALID' && m.actual != null ? money(m.actual, m.currency) : (m ? (STATUS_TEXT[m.status] || '—') : '—'));
  const items = [
    ['A+B 有效询价', s.leads.effective, null],
    ['A 级询价', s.leads.a, null],
    ['B 级询价', s.leads.b, null],
    ['A 级占比', pct(s.leads.aRatio) || '—', null],
    ['广告投入', s.adSpend.status === 'VALID' ? money(s.adSpend.value, s.adSpend.currency) : '缺数据', s.adSpend.note],
    ['A 级获客成本', costText(costA), costA && costA.note],
    ['A+B 获客成本', costText(costAb), costAb && costAb.note],
  ];
  for (const [label, value, title] of items) {
    const chip = make('div', 'kpi-review-chip');
    chip.appendChild(make('div', 'kpi-review-chip-label', label));
    chip.appendChild(cell('div', 'kpi-review-chip-value', value == null ? '—' : value, title || ''));
    wrap.appendChild(chip);
  }
  return wrap;
}

// 完成率达成度 → 配色。与 KPI 页既有 kpi-tone-* 同一套语义。
function toneFor(ratio) {
  if (ratio == null) return 'kpi-tone-muted';
  if (ratio >= 1) return 'kpi-tone-green';
  if (ratio >= 0.8) return 'kpi-tone-blue';
  if (ratio >= 0.5) return 'kpi-tone-amber';
  return 'kpi-tone-primary';
}

function buildTable(s) {
  const table = make('table', 'dt kpi-review-table');
  const thead = make('thead');
  const hr = make('tr');
  for (const h of ['考核项目', '权重', '目标值', '实际值', '完成率', '得分', '说明']) {
    hr.appendChild(make('th', h === '考核项目' || h === '说明' ? '' : 'ctr', h));
  }
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = make('tbody');
  for (const m of s.metrics) {
    const tr = make('tr', m.status === 'VALID' ? '' : 'kpi-review-row-off');
    tr.appendChild(cell('td', 'kpi-review-name', m.label, m.note || ''));
    tr.appendChild(make('td', 'ctr num', m.weight));
    tr.appendChild(make('td', 'ctr num', metricValueText(m, 'target') || '—'));

    tr.appendChild(cell('td', 'ctr num' + (m.status === 'VALID' ? '' : ' dim'), actualText(m),
      m.status === 'VALID' ? '' : (m.note || '')));

    const tone = m.status === 'VALID' ? toneFor(m.ratio) : 'kpi-tone-muted';
    tr.appendChild(cell('td', 'ctr num ' + tone, m.ratio == null ? '—' : pct(m.ratio, 0),
      m.raw_ratio != null && m.ratio != null && m.raw_ratio > m.ratio ? ('实际达成 ' + pct(m.raw_ratio, 0) + '，按上限 ' + pct(m.ratio, 0) + ' 计分') : ''));
    tr.appendChild(make('td', 'ctr num kpi-review-score-cell ' + tone, m.score == null ? '—' : m.score));
    tr.appendChild(cell('td', 'kpi-review-note dim', statusNote(m), m.note || ''));
    tbody.appendChild(tr);
  }

  // 广告投入：老板表里它只做预算对照，不计分 —— 用一行独立样式表达，别让人以为漏了权重
  tbody.appendChild(buildAdRow(s.adSpend));
  table.appendChild(tbody);
  return table;
}

/* 实际值那一格。完成率 / 占比类指标要**百分比和分子分母一起给**：
   光看「37.5%」不知道是漏了几期，光看「3 / 8」又得心算 —— 这一列是给人下判断用的。
   算不出数值时（例如「有花费 · 零 A 级询价」）只出 display_value，那句话本身就是结论。 */
function actualText(m) {
  if (m.status !== 'VALID') return STATUS_TEXT[m.status] || '—';
  const num = metricValueText(m, 'actual');
  if (m.display_value && num) return num + '（' + m.display_value + '）';
  return m.display_value || num || '—';
}

function statusNote(m) {
  if (m.status === 'VALID') return m.note || '';
  return (STATUS_TEXT[m.status] || '') + (m.note ? ' · ' + m.note : '');
}

function buildAdRow(ad) {
  const tr = make('tr', 'kpi-review-row-info');
  tr.appendChild(cell('td', 'kpi-review-name', '广告投入（不计分）', ad.note));
  tr.appendChild(make('td', 'ctr dim', '—'));
  tr.appendChild(make('td', 'ctr num', ad.budget == null ? '预算待定' : money(ad.budget, 'CNY')));
  tr.appendChild(make('td', 'ctr num', ad.status === 'VALID' ? money(ad.value, ad.currency) : '缺数据'));
  const dev = ad.deviation;
  const devText = dev == null ? '—' : (dev > 0 ? '+' : '') + (dev * 100).toFixed(1) + '%';
  tr.appendChild(cell('td', 'ctr num ' + (ad.within_tolerance === false ? 'kpi-tone-amber' : 'kpi-tone-muted'), devText,
    '相对预算的偏差，容忍带 ±' + Math.round(ad.tolerance * 100) + '%'));
  tr.appendChild(make('td', 'ctr dim', '—'));
  tr.appendChild(make('td', 'kpi-review-note dim', ad.note));
  return tr;
}

function buildBands(s) {
  const box = make('div', 'kpi-review-bands');
  box.appendChild(make('div', 'kpi-review-sub', '绩效系数分档'));
  const row = make('div', 'kpi-review-band-row');
  const current = s.score != null ? s.band : null;
  for (const b of s.config.bands) {
    const active = current && current.label === b.label;
    const chip = make('div', 'kpi-review-band' + (active ? ' on ' + bandTone(b.coef) : ''));
    chip.title = b.note || '';
    chip.appendChild(make('span', 'kpi-review-band-range', '≥ ' + b.min));
    chip.appendChild(make('span', 'kpi-review-band-label', b.label));
    chip.appendChild(make('span', 'kpi-review-band-coef', '×' + b.coef));
    row.appendChild(chip);
  }
  box.appendChild(row);
  return box;
}

/* attribution / sources 挂在**每个 scope 自己身上**（buildReview 把它们展开进返回对象），
   不在 /api/kpi/review 的顶层 —— 顶层只有 {range, department, seo, sem}。 */
function buildFooter(s) {
  const box = make('div', 'kpi-review-foot');
  const a = s.attribution;
  const unattrib = make('div', 'kpi-review-attr');
  unattrib.appendChild(make('span', 'kpi-review-attr-label', '未标明来源的询盘'));
  unattrib.appendChild(cell('span', 'kpi-review-attr-value', a.unattributed + ' 条（' + (pct(a.unattributedRate, 0) || '0%') + '）', a.note));
  unattrib.appendChild(make('span', 'kpi-review-attr-note',
    '「直接 / 其他」按老板口径计入部门总量，不影响得分；这个比例长期偏高说明录入来源要改进'));
  box.appendChild(unattrib);

  const src = make('div', 'kpi-review-sources');
  src.appendChild(make('div', 'kpi-review-sub', '数据来源'));
  const ul = make('ul', 'kpi-review-source-list');
  const labels = { leads: '询价数量', spend: '广告投入', weekly: '周复盘', fix: '整改闭环', test: '实验测试', targets: '考核目标' };
  for (const [k, v] of Object.entries(s.sources || {})) {
    ul.appendChild(make('li', '', (labels[k] || k) + '：' + v));
  }
  src.appendChild(ul);
  box.appendChild(src);

  const basis = make('div', 'kpi-review-basis');
  basis.textContent = s.scope === 'seo'
    ? 'A / B 询价数量取部门整体口径（不按渠道拆分到个人）；广告成本对 SEO 不适用，其 20 分权重已在其余指标间重新归一。'
    : (s.scope === 'sem'
      ? 'A / B 询价数量取部门整体口径（不按渠道拆分到个人）；广告成本按所选区间的 SEM 实际花费计算。'
      : '本表按部门整体考核：A / B 询价是 SEM 与 SEO 共同产出，含「直接 / 其他」渠道。');
  box.appendChild(basis);
  return box;
}

/* ===== 渲染 ===== */
function render(card, data) {
  latest = data;
  hoistAboveLedger(card);
  const label = card.querySelector('.kpi-review-range');
  if (label) {
    label.textContent = '当前区间 ' + rangeText(data.range)
      + (data.department.targets.source === 'default' ? ' · 目标取通用兜底值' : '');
  }
  const s = data[activeScopeKey] || data.department;
  const wrap = make('div');
  wrap.appendChild(buildTabs());
  wrap.appendChild(buildHero(s));
  const scroller = make('div', 'kpi-review-scroll');
  scroller.appendChild(buildTable(s));
  wrap.appendChild(scroller);
  wrap.appendChild(buildBands(s));
  wrap.appendChild(buildFooter(s));
  setBody(card, wrap);
}

function renderError(card, message) {
  const box = make('div', 'kpi-review-error');
  box.appendChild(make('div', '', '月度绩效考核加载失败：' + (message || '未知错误')));
  box.appendChild(make('div', 'kpi-review-basis', '数据源：inquiries（询价等级）+ Google Ads / sem_weeks（广告投入）+ weekly_reports / fixes / loop_items（过程指标）'));
  const btn = make('button', 'btn-ghost', '重试');
  btn.type = 'button';
  btn.setAttribute('data-kpi-review-retry', '1');
  box.appendChild(btn);
  setBody(card, box);
}

let requestSequence = 0;
let loadedRevision = null;

export async function loadKpiReview(force) {
  const card = ensureCard();
  if (!card) return false;
  const revision = getRangeRevision('kpi');
  if (!force && loadedRevision === revision && latest) return true; // renderKPI 会被多次调用，同区间不重复拉
  const requestId = ++requestSequence;
  try {
    const data = await API.get(withRange('/api/kpi/review', 'kpi'));
    if (requestId !== requestSequence || revision !== getRangeRevision('kpi')) return false;
    render(card, data);
    loadedRevision = revision;
    return true;
  } catch (e) {
    if (requestId !== requestSequence) return false;
    if (e && e.message === 'unauthorized') return false; // 由 ensureAuth 统一跳登录
    loadedRevision = null;
    renderError(card, e && e.message);
  }
  return false;
}

// KPI 页渲染时挂载（幂等）
export function mountKpiReview() { return loadKpiReview(false); }

/* 只认 KPI 页自己的时间范围：时间范围已分页面独立，别页改时间不该让这张考核表跟着变。 */
document.addEventListener('timerange', (e) => {
  if (e.detail && e.detail.scope === 'kpi') loadKpiReview(true);
});

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-kpi-review-scope]');
  if (tab) {
    const next = tab.dataset.kpiReviewScope;
    if (next === activeScopeKey || !latest) return;
    activeScopeKey = next;
    const card = document.getElementById(CARD_ID);
    if (card) render(card, latest); // 三个范围一次拉齐，切换不再往返服务端
    return;
  }
  if (e.target.closest('[data-kpi-review-retry]')) loadKpiReview(true);
});
