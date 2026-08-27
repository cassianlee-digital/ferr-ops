/* 考核期结算与历史（Phase 5C · 新写 ES 模块，零内联 handler，事件委托）。
   区分「分析区间」(顶部时间筛选，实时) 与「考核周期」(SEO 季度 / SEM 月度，结算后冻结)。
   历史读快照、绝不实时重算——改目标不动历史（§29）。写操作 /api/kpi/settle 仅管理员。 */
import { loadMetrics } from './kpi.js';

const OWNERS = [
  { owner: 'company', label: '公司', type: 'quarter' },
  { owner: 'seo', label: '李 · SEO', type: 'quarter' },
  { owner: 'sem', label: '陈 · SEM', type: 'month' },
];
const OWNER_LABEL = { company: '公司', seo: '李·SEO', sem: '陈·SEM' };
const PERIOD_LABEL = { quarter: '季度', month: '月度' };

function curKey(type) {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth() + 1;
  return type === 'month' ? y + '-' + String(m).padStart(2, '0') : y + '-Q' + (Math.floor((m - 1) / 3) + 1);
}
const pct = (c) => Math.round((Number(c) || 0) * 100);

// scope 分数文案：正式分 / 参考分 / 待评估
function scopeText(s) {
  if (!s) return '待评估';
  if (s.score != null) return '<b class="kpi-tone-green">' + s.score + '</b> 分';
  if (s.provisionalScore != null) return '参考 <b>' + s.provisionalScore + '</b>（覆盖率 ' + pct(s.coverage) + '%，未足以正式评分）';
  return '待评估';
}
function snapText(r) {
  if (r.score != null) return '<b class="kpi-tone-green">' + r.score + '</b> 分';
  if (r.provisional_score != null) return '参考 ' + r.provisional_score + '（覆盖率 ' + pct(r.coverage) + '%）';
  return '待评估（' + (r.status || '') + '）';
}

function currentRowHtml(o) {
  const key = curKey(o.type);
  const s = o._preview;
  return '<div class="kpip-cur">'
    + '<span class="kpip-owner">' + o.label + '</span>'
    + '<span class="kpip-period">' + PERIOD_LABEL[o.type] + ' ' + key + '（进行中）</span>'
    + '<span class="kpip-score">' + (s ? scopeText(s) : '…') + '</span>'
    + '<button class="exec-btn exec-btn-primary" data-settle-owner="' + o.owner + '" data-settle-type="' + o.type + '" data-settle-key="' + key + '">结算本期并冻结</button>'
    + '</div>';
}

function historyHtml(items) {
  if (!items.length) return '<div class="kpi-empty">暂无已结算考核期</div>';
  return '<div class="exec-tablewrap"><table class="exec-table"><thead><tr><th>考核期</th><th>对象</th><th>成绩</th><th>覆盖率</th><th>状态</th><th>结算时间</th></tr></thead><tbody>'
    + items.map((r) => '<tr>'
      + '<td>' + esc(r.period_key) + '</td>'
      + '<td>' + (OWNER_LABEL[r.owner] || r.owner) + '</td>'
      + '<td>' + snapText(r) + '</td>'
      + '<td>' + pct(r.coverage) + '%</td>'
      + '<td>' + esc(r.status || '') + '</td>'
      + '<td>' + esc((r.settled_at || '').slice(0, 16)) + '</td>'
      + '</tr>').join('')
    + '</tbody></table></div>';
}

function ensureMount() {
  const panel = document.getElementById('panel-kpi');
  if (!panel) return null;
  let box = document.getElementById('kpi-periods-mount');
  if (!box) { box = document.createElement('div'); box.id = 'kpi-periods-mount'; box.className = 'card kpip-card'; panel.appendChild(box); }
  return box;
}

let seq = 0;
export async function mountPeriods() {
  const box = ensureMount();
  if (!box) return;
  const id = ++seq;
  try {
    // 各 owner 当期实时预览 + 历史快照
    await Promise.all(OWNERS.map(async (o) => {
      try { const r = await API.get('/api/kpi/period-preview?owner=' + o.owner + '&period_type=' + o.type + '&period_key=' + curKey(o.type)); o._preview = r.scope; }
      catch { o._preview = null; }
    }));
    const { items } = await API.get('/api/kpi/periods');
    if (id !== seq) return;
    box.innerHTML = '<div class="card-head"><span class="card-title">考核期结算与历史</span>'
      + '<span class="kpip-note">分析区间(顶部)仅看数据；正式绩效按考核周期结算冻结，此后改目标不动历史</span></div>'
      + '<div class="kpip-cur-list">' + OWNERS.map(currentRowHtml).join('') + '</div>'
      + '<div class="kpi-sec-label kpi-sec-diag">已结算（冻结）</div>' + historyHtml(items || []);
  } catch (e) {
    if (e && e.message !== 'unauthorized') box.innerHTML = '<div class="kpi-empty">考核期加载失败：' + esc(e.message || '') + '</div>';
  }
}

// 委托：结算按钮
document.addEventListener('click', async (e) => {
  const btn = e.target.closest && e.target.closest('[data-settle-owner]');
  if (!btn) return;
  const owner = btn.getAttribute('data-settle-owner'), period_type = btn.getAttribute('data-settle-type'), period_key = btn.getAttribute('data-settle-key');
  if (!confirm('确认结算并冻结「' + (OWNER_LABEL[owner] || owner) + ' · ' + period_key + '」？冻结后改目标不影响本期成绩。')) return;
  try {
    await API.post('/api/kpi/settle', { owner, period_type, period_key });
    toast('已结算并冻结 ' + period_key);
    await mountPeriods();
  } catch (err) { toast(err.status === 403 ? '仅管理员/老板可结算' : '结算失败：' + (err.message || '')); }
});
