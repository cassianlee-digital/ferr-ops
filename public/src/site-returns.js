/* 按站点：广告花费与询盘（数据看板 → SEM 看板，多站点第 3 步）。
 *
 * 广告是一个账户几个站共用。这张卡回答「每个站花了多少广告费、带来几条询盘」——
 * 前提是每个系列投的是哪个站要先指定（经理 / 老板在下面的「系列归属」里选，系列就那么几个，指定一次就行）。
 *
 * 口径全在后端（services/siteReturns.js），这里只照着画：没归属的系列单列、没标站点的询盘单列、
 * 没有花费口径写「—」不写 0、花了钱却没有有效询盘写「算不出」并说明。金额是 Ads 账户币种，不带符号。
 * 只登记了一个站点、又没有任何归属时，这张卡不出现。全部用 createElement / textContent 构建。
 */
import { toast } from './ui-kit.js';
import { withRange, getRangeRevision } from './timerange.js';
import { allSites } from './site-scope.js';

const $ = (id) => document.getElementById(id);
function h(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = String(text);
  return el;
}
const money = (micros) => (Number(micros) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const failText = (e) => (e && e.message) || '请求失败';
const canManage = () => ['manager', 'boss'].includes(window.ME && window.ME.role);
const COST_REASON = {
  no_campaigns: '没有归到这个站的系列',
  spent_no_effective: '花了钱，但没有标到这个站的 SEM 有效询盘',
  no_spend: '这段时间没有花费',
};

let seq = 0;
let bound = false;

function tr(cells, cls) {
  const row = h('tr', cls);
  for (const c of cells) {
    const td = h('td', c && c.cls ? c.cls : '');
    if (c && c.node) td.appendChild(c.node); else td.textContent = c && c.text != null ? c.text : (c == null ? '' : String(c));
    if (c && c.title) td.title = c.title;
    row.appendChild(td);
  }
  return row;
}

function render(data) {
  const card = $('siteReturnsCard'); const body = $('siteReturnsBody');
  const anyMapped = data.campaigns.some((c) => c.site_id != null);
  // 只有一个站点、也没有任何归属：这张卡没有东西可说
  card.classList.toggle('is-hidden', data.sites.length < 2 && !anyMapped);
  body.textContent = '';
  if (!data.synced) body.appendChild(h('div', 'sret-note', '这段时间没有同步到广告数据，下面的花费是「没有数据」，不是 0。'));

  const table = h('table', 'dt sret-table');
  const head = h('tr');
  for (const [t, cls] of [['站点', ''], ['归到它的系列', 'num'], ['广告花费（账户币种）', 'num'], ['询盘', 'num'], ['其中 A/B', 'num'], ['SEM 渠道的 A/B', 'num'], ['每条 SEM 有效询盘的花费', 'num']]) head.appendChild(h('th', cls, t));
  const thead = h('thead'); thead.appendChild(head); table.appendChild(thead);
  const tbody = h('tbody');
  for (const s of data.sites) {
    tbody.appendChild(tr([
      { text: s.name },
      { text: s.campaigns || '—', cls: 'num' },
      { text: s.costMicros == null ? '—' : money(s.costMicros), cls: 'num', title: s.costMicros == null ? '没有归到这个站的系列，所以没有花费口径（不是 0 元）' : '' },
      { text: s.inquiries, cls: 'num' },
      { text: s.effective, cls: 'num' },
      { text: s.sem_effective, cls: 'num' },
      s.cost_per_sem_effective != null
        ? { text: money(s.cost_per_sem_effective), cls: 'num' }
        : { text: '算不出', cls: 'num dim', title: COST_REASON[s.cost_reason] || '' },
    ]));
  }
  if (data.unassigned.campaigns) {
    tbody.appendChild(tr([
      { text: '未归属的系列', title: '这些系列还没有指定站点，花费不摊给任何一个站' },
      { text: data.unassigned.campaigns, cls: 'num' }, { text: money(data.unassigned.costMicros), cls: 'num' },
      { text: '', cls: 'num' }, { text: '', cls: 'num' }, { text: '', cls: 'num' }, { text: '', cls: 'num' },
    ], 'sret-rest'));
  }
  if (data.unlabeled.inquiries) {
    tbody.appendChild(tr([
      { text: '没标站点的询盘', title: '手工录入时没选站点的询盘（老询盘都没标）。不按公司去猜它们是哪个站的' },
      { text: '', cls: 'num' }, { text: '', cls: 'num' },
      { text: data.unlabeled.inquiries, cls: 'num' }, { text: data.unlabeled.effective, cls: 'num' }, { text: data.unlabeled.sem_effective, cls: 'num' }, { text: '', cls: 'num' },
    ], 'sret-rest'));
  }
  table.appendChild(tbody);
  body.appendChild(table);
  body.appendChild(h('div', 'sret-note', '花费按「系列归属」落到站点；询盘只数标了站点的（表单带回的自动标，手工录入的要自己选）。渠道和等级多数是人填的，这张表是参考，不进考核。'));

  /* 系列归属 */
  const box = h('div', 'sret-campaigns');
  box.appendChild(h('div', 'sret-sub', '系列归属（每个广告系列投的是哪个站）'));
  if (!data.campaigns.length) box.appendChild(h('div', 'dim', '这段时间没有同步到广告系列。'));
  const sites = allSites();
  for (const c of data.campaigns) {
    const row = h('div', 'sret-campaign');
    row.appendChild(h('span', 'sret-cname', c.name));
    row.appendChild(h('span', 'sret-ccost', money(c.costMicros)));
    if (canManage()) {
      const sel = h('select', 'sret-select');
      sel.dataset.campaign = c.id;
      const none = h('option', '', '未归属'); none.value = ''; sel.appendChild(none);
      for (const s of sites) { const o = h('option', '', s.name); o.value = String(s.id); sel.appendChild(o); }
      // 归到了已停用的站点：补一项，否则会显示成「未归属」
      if (c.site_id != null && !sites.some((s) => s.id === c.site_id)) { const o = h('option', '', c.site_name); o.value = String(c.site_id); sel.appendChild(o); }
      sel.value = c.site_id != null ? String(c.site_id) : '';
      row.appendChild(sel);
    } else {
      row.appendChild(h('span', c.site_name ? 'badge b-gray' : 'dim', c.site_name || '未归属'));
    }
    if (c.suggestion) row.appendChild(h('span', 'sret-hint', '表单线索显示它落在「' + c.suggestion.site_name + '」（' + c.suggestion.leads + ' 条）'));
    else if (c.conflicting_evidence) row.appendChild(h('span', 'sret-hint', '表单线索里它落在不止一个站，请人工判断'));
    box.appendChild(row);
  }
  if (data.campaigns.length && !canManage()) box.appendChild(h('div', 'sret-note', '指定归属需要经理或老板账号。'));
  body.appendChild(box);
}

export async function loadSiteReturns() {
  const card = $('siteReturnsCard');
  if (!card) return;
  if (!bound) {
    $('siteReturnsBody').addEventListener('change', async (e) => {
      const sel = e.target.closest('.sret-select');
      if (!sel) return;
      sel.disabled = true;
      try {
        await window.API.put('/api/sites/campaigns/' + encodeURIComponent(sel.dataset.campaign), { site_id: sel.value ? Number(sel.value) : null });
        toast('已保存归属');
      } catch (err) { toast('没有保存：' + failText(err)); }
      loadSiteReturns();
    });
    bound = true;
  }
  const mine = ++seq; const revision = getRangeRevision('data');
  let data;
  try { data = await window.API.get(withRange('/api/sites/returns', 'data')); }
  catch (e) {
    if (mine !== seq) return;
    card.classList.remove('is-hidden');
    $('siteReturnsBody').textContent = '按站点的花费与询盘读取失败：' + failText(e);
    return;
  }
  // 时间范围在等结果的时候又变了：这份是旧区间的，丢掉
  if (mine !== seq || revision !== getRangeRevision('data')) return;
  render(data);
}

document.addEventListener('timerange', (e) => { if (e.detail && e.detail.scope === 'data') loadSiteReturns(); });
// 站点增删改、询盘的站点或来源被改之后：这张表的数会变
document.addEventListener('siteschanged', () => { loadSiteReturns(); });
