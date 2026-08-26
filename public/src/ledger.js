/* 运营总账（ES 模块 · esbuild 打包为 IIFE）。
   老板年终看运营部成绩要的一屏：花了多少钱 → 带来多少询盘 → 多少优质(A/B) → 多少成交 → 效率如何。
   数据来自 GET /api/kpi/ledger（只读，不进 KPI 绩效评分）。
   运行时依赖的全局（调用时解析）：API。
   零内联 handler：卡片内「重试」用模块内事件委托；随顶部时间筛选（timerange 事件）重拉。
   DOM 全部 createElement + textContent 构造，不用 innerHTML —— 渠道/口径文案不进 HTML 解析。 */
import { getRangeRevision, rangeText, withRange } from './timerange.js';

const CARD_ID = 'kpiLedger';

/* 状态 → 人话。没有数据源的格子只出现这几种文案，绝不填 0 充数。 */
const CELL_TEXT = {
  NOT_APPLICABLE: 'N/A',
  MISSING_DATA: '待录入',
  NO_SPEND: '无花费',
  SPEND_WITH_ZERO_QUALITY: '有花费·零优质',
  SPEND_WITH_ZERO_DEAL: '有花费·零成交',
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

const money = (v) => (v == null || !Number.isFinite(Number(v))
  ? null
  : '¥' + Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 }));

const pct = (v) => (v == null || !Number.isFinite(Number(v)) ? null : (Number(v) * 100).toFixed(1) + '%');

/* 金额/单位成本单元格：VALID 出数字，其余出状态文案 + title 说明原因 */
function metricCell(item, format, extraTitle) {
  if (!item) return cell('td', 'num dim', '—', extraTitle || '');
  if (item.status === 'VALID' && item.value != null) {
    return cell('td', 'num', format(item.value), extraTitle || item.note || '');
  }
  const key = item.reason || item.status;
  const text = CELL_TEXT[key] || '—';
  const warn = key === 'SPEND_WITH_ZERO_DEAL' || key === 'SPEND_WITH_ZERO_QUALITY';
  const title = item.note || (warn ? '该渠道区间内有花费但没有对应结果' : '无数据源，未参与计算');
  return cell('td', 'num ' + (warn ? 'ledger-warn' : 'dim'), text, extraTitle ? extraTitle + ' · ' + title : title);
}

function rateCell(value, title) {
  const text = pct(value);
  return cell('td', 'num ' + (text ? '' : 'dim'), text || '—', text ? (title || '') : '该口径分母为 0，无法计算');
}

function numCell(value) {
  return cell('td', 'num', Number(value || 0).toLocaleString('zh-CN'), '');
}

function channelRow(row, isTotal) {
  const tr = make('tr', isTotal ? 'ledger-total' : '');
  tr.appendChild(cell('td', 'ledger-ch', row.label, ''));
  tr.appendChild(metricCell(row.spend, money));
  tr.appendChild(numCell(row.inquiries));
  tr.appendChild(numCell(row.quality));
  tr.appendChild(numCell(row.deals));
  tr.appendChild(rateCell(row.qualityRate, '优质(A/B) ÷ 询盘'));
  tr.appendChild(rateCell(row.dealRate, '优质成交 ÷ 优质询盘'
    + (row.dealRateOverall != null ? '；总口径 ' + pct(row.dealRateOverall) : '')));
  tr.appendChild(metricCell(row.costPerQuality, money, isTotal ? '合计为混合口径（分子仅 SEM 花费）' : ''));
  tr.appendChild(metricCell(row.cac, money, isTotal ? '合计为混合口径（分子仅 SEM 花费），只能当下限看' : ''));
  return tr;
}

function buildTable(data) {
  const table = make('table', 'dt ledger-table');
  const thead = make('thead');
  const htr = make('tr');
  [
    ['渠道', 'ledger-ch', ''],
    ['花费', 'num', '仅 SEM 有真实媒体花费（sem_weeks.cost）'],
    ['询盘', 'num', '区间内该渠道询盘数'],
    ['优质 A/B', 'num', '等级 A 或 B，与「有效询盘」同口径'],
    ['成交', 'num', '询盘录入里标注「已成交」的数量 · 滞后结果'],
    ['优质率', 'num', '优质 ÷ 询盘'],
    ['成交率', 'num', '优质成交 ÷ 优质询盘（悬停看总口径）'],
    ['每优质成本', 'num', '花费 ÷ 优质询盘'],
    ['每成交成本 CAC', 'num', '花费 ÷ 成交'],
  ].forEach(([text, cls, title]) => htr.appendChild(cell('th', cls, text, title)));
  thead.appendChild(htr);
  table.appendChild(thead);

  const tbody = make('tbody');
  (data.channels || []).forEach((row) => tbody.appendChild(channelRow(row, false)));
  if (data.totals) tbody.appendChild(channelRow(data.totals, true));
  table.appendChild(tbody);
  return table;
}

/* 目标 vs 当前：目标取 kpi_targets，没有对应目标就写「目标待定」，不编一个 */
function buildTargets(targets) {
  const box = make('div', 'ledger-targets');
  box.appendChild(make('div', 'ledger-sec-title', '目标 vs 当前（目标为设置页月度目标，未按区间折算）'));
  (targets || []).forEach((t) => {
    const line = make('div', 'ledger-target');
    line.appendChild(make('div', 'ledger-target-name', t.label));

    const actualText = t.actual == null
      ? '—'
      : (t.unit === '¥' ? money(t.actual) : Number(t.actual).toLocaleString('zh-CN') + t.unit);
    const targetText = t.target == null
      ? '目标待定'
      : '目标 ' + (t.unit === '¥' ? money(t.target) : Number(t.target).toLocaleString('zh-CN') + t.unit);
    line.appendChild(make('div', 'ledger-target-val', actualText + ' / ' + targetText));

    const bar = make('div', 'progress-bar ledger-progress');
    const fill = make('div', 'progress-fill');
    const p = t.progress == null ? 0 : Math.max(0, Math.min(100, t.progress * 100));
    fill.style.width = p + '%';
    fill.classList.add(t.progress == null ? 'ledger-fill-muted'
      : (t.progress >= 1 ? 'ledger-fill-green' : (t.progress >= 0.6 ? 'ledger-fill-blue' : 'ledger-fill-amber')));
    bar.appendChild(fill);
    line.appendChild(bar);

    const tail = t.status === 'NO_TARGET' ? '待老板拍板'
      : (t.status === 'NO_ACTUAL' ? '暂无实际值' : Math.round(t.progress * 100) + '%');
    line.appendChild(cell('div', 'ledger-target-pct' + (t.status === 'VALID' ? '' : ' dim'), tail,
      t.inverse ? '反向指标：越低越好，达标即封顶 100%' : ''));
    box.appendChild(line);
  });
  return box;
}

function buildNotes(data) {
  const box = make('div', 'ledger-notes');
  const notes = data.notes || {};
  [notes.deal, notes.spend, notes.quality, notes.dealRate].forEach((text) => {
    if (text) box.appendChild(make('div', 'ledger-note', '· ' + text));
  });
  const missing = data.meta && data.meta.dealStatusMissing;
  if (missing) box.appendChild(make('div', 'ledger-note ledger-warn', '· 有 ' + missing + ' 封询盘未标注是否成交，未计入成交数（也未当作未成交）'));
  box.appendChild(make('div', 'ledger-note', '· 本表为业务总账，只读；不参与 KPI 绩效评分'));
  return box;
}

/* 卡片骨架（只建一次），插在 KPI 页时间条/提示之后、三个表盘之前 */
function ensureCard() {
  let card = document.getElementById(CARD_ID);
  if (card) return card;
  const panel = document.getElementById('panel-kpi');
  if (!panel) return null;

  card = make('div', 'card ledger-card');
  card.id = CARD_ID;
  const head = make('div', 'card-head');
  head.appendChild(make('span', 'card-title', '运营总账 · 业务结果漏斗'));
  head.appendChild(make('span', 'card-sub ledger-range', '—'));
  card.appendChild(head);
  card.appendChild(make('div', 'ledger-body', '正在加载运营总账…'));

  card.addEventListener('click', (e) => {
    if (e.target && e.target.closest('[data-ledger-retry]')) loadLedger(true);
  });

  const tip = panel.querySelector(':scope > .sheet-tip');
  const anchor = tip || panel.querySelector(':scope > .timebar-inline') || panel.querySelector(':scope > .page-head');
  if (anchor && anchor.parentNode === panel) anchor.insertAdjacentElement('afterend', card);
  else panel.appendChild(card);
  return card;
}

function setBody(card, node) {
  const body = card.querySelector('.ledger-body');
  if (!body) return;
  body.textContent = '';
  body.appendChild(node);
}

function render(card, data) {
  const label = card.querySelector('.ledger-range');
  if (label) label.textContent = '当前区间 ' + rangeText(data.range);

  const wrap = make('div');
  const scroller = make('div', 'ledger-scroll');
  scroller.appendChild(buildTable(data));
  wrap.appendChild(scroller);
  wrap.appendChild(buildTargets(data.targets));
  wrap.appendChild(buildNotes(data));
  setBody(card, wrap);
}

function renderError(card, message) {
  const box = make('div', 'ledger-error');
  box.appendChild(make('div', '', '运营总账加载失败：' + (message || '未知错误')));
  box.appendChild(make('div', 'ledger-note', '数据源：inquiries（询盘/等级/是否成交）+ sem_weeks.cost（SEM 花费）'));
  const btn = make('button', 'btn-ghost', '重试');
  btn.type = 'button';
  btn.setAttribute('data-ledger-retry', '1');
  box.appendChild(btn);
  setBody(card, box);
}

let requestSequence = 0;
let loadedRevision = null;

export async function loadLedger(force) {
  const card = ensureCard();
  if (!card) return false;
  const revision = getRangeRevision();
  if (!force && loadedRevision === revision) return true; // renderKPI 会被多次调用，同区间不重复拉
  const requestId = ++requestSequence;
  try {
    const data = await API.get(withRange('/api/kpi/ledger'));
    if (requestId !== requestSequence || revision !== getRangeRevision()) return false;
    render(card, data);
    loadedRevision = revision;
    return true;
  } catch (e) {
    if (requestId !== requestSequence) return false;
    if (e && e.message === 'unauthorized') return false; // 由 ensureAuth 统一跳登录
    renderError(card, e && e.message);
  }
  return false;
}

// KPI 页渲染时挂载（幂等）；时间范围变化时强制重拉
export function mountLedger() { return loadLedger(false); }

document.addEventListener('timerange', () => { loadLedger(true); });
