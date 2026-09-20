/* 设置 → 月度绩效考核：权重 / 达成率上限 / 出分地板 / 预算容忍带 / 绩效系数分档 / 月度目标。
 *
 * 与 KPI 页那张考核表读的是同一份配置（GET·PUT /api/kpi/review-config），改完立刻生效。
 * 老板明确说过「别把审核标准写死，后期可能加新考核指标」—— 权重和分档都在这里改，不用动代码。
 *
 * 月度目标对应老板考核表的「目标设置」页：某个月单独设了就用那个月的，没设就用 'default' 兜底行。
 * 一个数都不预填：目标是老板定的，编一个进去等于凭空给团队立了个假 KPI。
 *
 * 零内联 handler、全 createElement —— 与 ledger.js / kpi-review.js 同一套写法。
 */
import { toast } from './ui-kit.js';
import { loadKpiReview } from './kpi-review.js';

const HOST_ID = 'kpiReviewAdmin';

// 与后端 REVIEW_CONFIG_KEYS 一一对应。label 是给人看的，不参与任何计算。
const WEIGHT_FIELDS = [
  ['review_weight_a', 'A 级询价数量', '老板表的第一考核项'],
  ['review_weight_b', 'B 级询价数量', ''],
  ['review_weight_cost_a', 'A 级询价成本', '广告投入 ÷ A 级数量，越低越好'],
  ['review_weight_cost_ab', 'A+B 有效询价成本', '广告投入 ÷ (A+B)，越低越好'],
  ['review_weight_a_ratio', 'A 级询价占比', '质量指标：A ÷ (A+B)'],
  ['review_weight_weekly', '周复盘 / 数据分析完成率', '数据来源 weekly_reports'],
  ['review_weight_fix', '问题整改闭环率', '数据来源 fixes（整改台账）'],
  ['review_weight_test', '实验测试完成率', '数据来源 loop_items(kind=test)'],
];
const SCALAR_FIELDS = [
  ['review_metric_cap', '单指标达成率上限', '老板表：最高按 120% 计分 → 填 1.2', 0.01],
  ['review_min_coverage', '出分地板（覆盖率）', '有数据的权重低于这个比例就不出正式分，只给参考分', 0.01],
  ['review_budget_tolerance', '广告预算容忍带', '±多少算正常，只做提示不扣分 → 0.1 表示 ±10%', 0.01],
];
const TARGET_FIELDS = [
  ['a_target', 'A 级目标', ''],
  ['b_target', 'B 级目标', ''],
  ['ad_budget', '广告预算', '只做对照，不计分'],
  ['cost_a_target', 'A 级成本目标', ''],
  ['cost_ab_target', 'A+B 成本目标', ''],
  ['a_ratio_target', 'A 级占比目标', '填 0~1 的小数，例如 0.3 表示 30%'],
];
const PERIOD_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

let loaded = null;
let mounted = false;

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = String(text);
  return el;
}
function numInput(name, value, step) {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'kra-input';
  input.step = step == null ? '1' : String(step);
  input.min = '0';
  input.setAttribute('data-kra-field', name);
  input.value = value == null || value === '' ? '' : String(value);
  return input;
}
function canEdit() {
  const role = window.ME && window.ME.role;
  return role === 'manager' || role === 'boss';
}

function buildWeights(cfg) {
  const box = make('div', 'kra-block');
  box.appendChild(make('div', 'kra-title', '① 权重（老板表合计 100 分）'));
  const table = make('table', 'dt kra-table');
  const thead = make('thead');
  const hr = make('tr');
  hr.appendChild(make('th', '', '考核项目'));
  hr.appendChild(make('th', 'ctr', '权重'));
  hr.appendChild(make('th', '', '说明'));
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = make('tbody');
  for (const [key, label, note] of WEIGHT_FIELDS) {
    const tr = make('tr');
    tr.appendChild(make('td', '', label));
    const td = make('td', 'ctr');
    td.appendChild(numInput(key, cfg.raw[key]));
    tr.appendChild(td);
    tr.appendChild(make('td', 'dim', note));
    tbody.appendChild(tr);
  }
  const sumRow = make('tr', 'kra-sum-row');
  sumRow.appendChild(make('td', '', '合计'));
  sumRow.appendChild(make('td', 'ctr num kra-weight-sum', ''));
  sumRow.appendChild(make('td', 'dim', '不强制等于 100：权重只在有数据的指标之间按比例归一，合计变了总分口径也跟着变'));
  tbody.appendChild(sumRow);
  table.appendChild(tbody);
  box.appendChild(table);
  return box;
}

function buildScalars(cfg) {
  const box = make('div', 'kra-block');
  box.appendChild(make('div', 'kra-title', '② 评分参数'));
  const grid = make('div', 'kra-grid');
  for (const [key, label, note, step] of SCALAR_FIELDS) {
    const fld = make('div', 'kra-fld');
    fld.appendChild(make('label', '', label));
    fld.appendChild(numInput(key, cfg.raw[key], step));
    fld.appendChild(make('div', 'kra-hint', note));
    grid.appendChild(fld);
  }
  box.appendChild(grid);
  return box;
}

function buildBands(cfg) {
  const box = make('div', 'kra-block');
  box.appendChild(make('div', 'kra-title', '③ 绩效系数分档'));
  box.appendChild(make('div', 'kra-hint', '按「总分下限」从高到低匹配。最低一档的下限建议填 0，否则低分会掉出所有分档、拿不到系数。'));
  const table = make('table', 'dt kra-table');
  const thead = make('thead');
  const hr = make('tr');
  for (const h of ['总分下限', '等级名称', '绩效系数', '说明', '']) hr.appendChild(make('th', h === '说明' ? '' : 'ctr', h));
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = make('tbody', 'kra-bands');
  for (const b of cfg.config.bands) tbody.appendChild(bandRow(b));
  table.appendChild(tbody);
  box.appendChild(table);
  const add = make('button', 'btn-ghost kra-add', '+ 加一档');
  add.type = 'button';
  add.setAttribute('data-kra-add-band', '1');
  box.appendChild(add);
  return box;
}
function bandRow(b) {
  const tr = make('tr', 'kra-band-row');
  const mk = (cls, value, type, step) => {
    const td = make('td', 'ctr');
    const input = document.createElement('input');
    input.type = type || 'text';
    input.className = 'kra-input ' + cls;
    if (step) input.step = step;
    input.value = value == null ? '' : String(value);
    td.appendChild(input);
    return td;
  };
  tr.appendChild(mk('kra-band-min', b.min, 'number', '0.1'));
  tr.appendChild(mk('kra-band-label', b.label));
  tr.appendChild(mk('kra-band-coef', b.coef, 'number', '0.01'));
  tr.appendChild(mk('kra-band-note', b.note || ''));
  const del = make('td', 'ctr');
  const btn = make('button', 'btn-mini kra-band-del', '');
  btn.type = 'button';
  btn.title = '删掉这一档';
  btn.setAttribute('data-kra-del-band', '1');
  btn.appendChild(make('i', 'ti ti-trash'));
  del.appendChild(btn);
  tr.appendChild(del);
  return tr;
}

function buildTargets(cfg) {
  const box = make('div', 'kra-block');
  box.appendChild(make('div', 'kra-title', '④ 月度目标'));
  box.appendChild(make('div', 'kra-hint',
    '「通用兜底」这一行用于所有没单独设目标的月份。留空 = 目标待定，该指标不计分并在 KPI 页标「目标待定」，不会按 0 分算。'));
  const table = make('table', 'dt kra-table');
  const thead = make('thead');
  const hr = make('tr');
  hr.appendChild(make('th', '', '月份'));
  for (const [, label, note] of TARGET_FIELDS) {
    const th = make('th', 'ctr', label);
    if (note) th.title = note;
    hr.appendChild(th);
  }
  hr.appendChild(make('th', 'ctr', ''));
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = make('tbody', 'kra-targets');
  const rows = cfg.targets.slice().sort((a, b) => {
    if (a.period_key === 'default') return -1;
    if (b.period_key === 'default') return 1;
    return b.period_key.localeCompare(a.period_key);
  });
  for (const row of rows) tbody.appendChild(targetRow(row));
  table.appendChild(tbody);
  box.appendChild(table);

  const addRow = make('div', 'kra-add-period');
  const input = document.createElement('input');
  input.type = 'month';
  input.className = 'kra-input kra-new-period';
  addRow.appendChild(input);
  const add = make('button', 'btn-ghost kra-add', '+ 为这个月单独设目标');
  add.type = 'button';
  add.setAttribute('data-kra-add-period', '1');
  addRow.appendChild(add);
  box.appendChild(addRow);
  return box;
}
function targetRow(row) {
  const isDefault = row.period_key === 'default';
  const tr = make('tr', 'kra-target-row' + (isDefault ? ' kra-target-default' : ''));
  tr.setAttribute('data-kra-period', row.period_key);
  tr.appendChild(make('td', '', isDefault ? '通用兜底' : row.period_key));
  for (const [key] of TARGET_FIELDS) {
    const td = make('td', 'ctr');
    const input = numInput(key, row[key], key === 'a_ratio_target' ? '0.01' : '1');
    input.classList.add('kra-target-input');
    td.appendChild(input);
    tr.appendChild(td);
  }
  const ops = make('td', 'ctr');
  if (!isDefault) {
    const btn = make('button', 'btn-mini', '');
    btn.type = 'button';
    btn.title = '删掉这个月的单独目标（之后回落到通用兜底）';
    btn.setAttribute('data-kra-del-period', row.period_key);
    btn.appendChild(make('i', 'ti ti-trash'));
    ops.appendChild(btn);
  } else {
    ops.appendChild(make('span', 'dim', '—'));
  }
  tr.appendChild(ops);
  return tr;
}

function syncWeightSum(host) {
  const cellEl = host.querySelector('.kra-weight-sum');
  if (!cellEl) return;
  let sum = 0;
  for (const [key] of WEIGHT_FIELDS) {
    const input = host.querySelector(`[data-kra-field="${key}"]`);
    const n = Number(input && input.value);
    if (Number.isFinite(n)) sum += n;
  }
  cellEl.textContent = String(Math.round(sum * 100) / 100);
  cellEl.classList.toggle('kra-sum-off', Math.abs(sum - 100) > 0.001);
}

function render(host, cfg) {
  loaded = cfg;
  host.textContent = '';
  const wrap = make('div', 'kra');
  if (!canEdit()) {
    wrap.appendChild(make('div', 'kra-readonly',
      '你可以查看考核方案，但只有主管 / 老板能修改。（后端同样强制此权限，不是前端藏起来而已。）'));
  }
  wrap.appendChild(buildWeights(cfg));
  wrap.appendChild(buildScalars(cfg));
  wrap.appendChild(buildBands(cfg));
  wrap.appendChild(buildTargets(cfg));

  const foot = make('div', 'kra-foot');
  const save = make('button', 'btn-primary', '保存考核方案');
  save.type = 'button';
  save.setAttribute('data-kra-save', '1');
  save.disabled = !canEdit();
  foot.appendChild(save);
  foot.appendChild(make('span', 'kra-hint', '保存后 KPI 页的「月度绩效考核」立即按新方案重算。历史已结算的考核期不受影响。'));
  wrap.appendChild(foot);

  host.appendChild(wrap);
  if (!canEdit()) host.querySelectorAll('input,button[data-kra-add-band],button[data-kra-add-period]').forEach((el) => { el.disabled = true; });
  syncWeightSum(host);
}

function renderError(host, message) {
  host.textContent = '';
  const box = make('div', 'kra-error');
  box.appendChild(make('div', '', '考核方案加载失败：' + (message || '未知错误')));
  const btn = make('button', 'btn-ghost', '重试');
  btn.type = 'button';
  btn.setAttribute('data-kra-retry', '1');
  box.appendChild(btn);
  host.appendChild(box);
}

export async function loadReviewConfig() {
  const host = document.getElementById(HOST_ID);
  if (!host) return false;
  try {
    render(host, await API.get('/api/kpi/review-config'));
    return true;
  } catch (e) {
    if (e && e.message === 'unauthorized') return false;
    renderError(host, e && e.message);
  }
  return false;
}

// 空字符串 = 「清空这个目标」，要如实传 null 上去；不能当成 0，那会变成「目标 0 封」。
function valueOrNull(input) {
  const raw = String(input.value).trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function save(host) {
  const config = {};
  for (const [key] of WEIGHT_FIELDS.concat(SCALAR_FIELDS.map((f) => [f[0]]))) {
    const input = host.querySelector(`[data-kra-field="${key}"]`);
    if (!input) continue;
    const n = Number(input.value);
    if (!Number.isFinite(n) || n < 0) { toast('「' + key + '」要填一个非负数字'); input.focus(); return; }
    config[key] = n;
  }
  const bands = [...host.querySelectorAll('.kra-band-row')].map((tr) => ({
    min: Number(tr.querySelector('.kra-band-min').value),
    label: tr.querySelector('.kra-band-label').value.trim(),
    coef: Number(tr.querySelector('.kra-band-coef').value),
    note: tr.querySelector('.kra-band-note').value.trim() || null,
  }));
  if (!bands.length) { toast('至少要留一档绩效系数'); return; }
  const bad = bands.find((b) => !Number.isFinite(b.min) || !Number.isFinite(b.coef) || !b.label);
  if (bad) { toast('分档里「总分下限 / 等级名称 / 绩效系数」都要填 —— 这决定发多少钱，不能留空'); return; }

  const targets = [...host.querySelectorAll('.kra-target-row')].map((tr) => {
    const out = { period_key: tr.dataset.kraPeriod };
    tr.querySelectorAll('.kra-target-input').forEach((input) => { out[input.dataset.kraField] = valueOrNull(input); });
    return out;
  });

  const btn = host.querySelector('[data-kra-save]');
  if (btn) btn.disabled = true;
  try {
    const cfg = await API.put('/api/kpi/review-config', { config, bands, targets });
    render(host, cfg);
    loadKpiReview(true); // KPI 页那张考核表按新方案重算（它订阅 timerange，改配置不触发，得显式叫一次）
    toast('考核方案已保存 · KPI 页已按新方案重算');
  } catch (e) {
    if (btn) btn.disabled = false;
    toast(e && e.status === 403 ? '无权修改考核方案（需主管 / 老板）' : '保存失败：' + ((e && e.message) || '请求失败'));
  }
}

/* ===== 事件委托 ===== */
document.addEventListener('input', (e) => {
  const host = document.getElementById(HOST_ID);
  if (!host || !host.contains(e.target)) return;
  if (e.target.matches('[data-kra-field]')) syncWeightSum(host);
});

document.addEventListener('click', async (e) => {
  const host = document.getElementById(HOST_ID);
  if (!host || !host.contains(e.target)) return;

  if (e.target.closest('[data-kra-retry]')) { loadReviewConfig(); return; }
  if (e.target.closest('[data-kra-save]')) { save(host); return; }

  const addBand = e.target.closest('[data-kra-add-band]');
  if (addBand) {
    const body = host.querySelector('.kra-bands');
    if (body) body.appendChild(bandRow({ min: 0, label: '', coef: 1, note: '' }));
    return;
  }
  const delBand = e.target.closest('[data-kra-del-band]');
  if (delBand) {
    const rows = host.querySelectorAll('.kra-band-row');
    if (rows.length <= 1) { toast('至少要留一档'); return; }
    delBand.closest('tr').remove();
    return;
  }
  const addPeriod = e.target.closest('[data-kra-add-period]');
  if (addPeriod) {
    const input = host.querySelector('.kra-new-period');
    const key = input && String(input.value).trim();
    if (!PERIOD_KEY_RE.test(key || '')) { toast('先选一个月份（YYYY-MM）'); return; }
    if (host.querySelector(`.kra-target-row[data-kra-period="${key}"]`)) { toast(key + ' 已经在表里了'); return; }
    const body = host.querySelector('.kra-targets');
    if (body) body.appendChild(targetRow({ period_key: key }));
    input.value = '';
    return;
  }
  const delPeriod = e.target.closest('[data-kra-del-period]');
  if (delPeriod) {
    const key = delPeriod.dataset.kraDelPeriod;
    try {
      render(host, await API.del('/api/kpi/review-targets/' + encodeURIComponent(key)));
      toast('已删除 ' + key + ' 的单独目标 · 该月回落到通用兜底');
    } catch (err) {
      toast(err && err.status === 403 ? '无权修改考核方案' : '删除失败：' + ((err && err.message) || ''));
    }
  }
});

/* 懒加载：进设置页的这个子标签才拉配置（它对绝大多数会话是用不到的一屏）。 */
export function mountReviewAdmin() {
  if (mounted) return;
  mounted = true;
  loadReviewConfig();
}
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.set-nav .subtab[data-sub="set-review"]');
  if (tab) mountReviewAdmin();
});
