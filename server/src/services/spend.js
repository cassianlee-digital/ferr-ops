// 投入台账的规则（纯函数，不碰数据库）：外链与其它支出的字段校验，以及「钱花在哪」的汇总。
//
// 经理 2026-10-10：「每个月投入的钱都花在哪里，不知道，也没有分析。」
// 钱有三个去处：广告费（Ads 同步）、外链（backlinks）、其它支出（expenses）。
// 汇总的两条硬规矩：
//   1. 不同币种绝不相加 —— 账户币种的广告费和人民币的工具费加在一起是个没有意义的数；
//   2. 没有数据源就说没有，不写 0 —— 「没同步广告数据」和「花了 0 元」是两回事。

export const BACKLINK_METHODS = ['购买', '客座投稿', '交换', '目录提交', '自然获得', '其他'];
export const BACKLINK_RELS = ['dofollow', 'nofollow', 'sponsored', 'ugc'];
export const BACKLINK_STATUSES = ['待上线', '有效', '失效'];
export const EXPENSE_CATEGORIES = ['工具订阅', '内容外包', '建站技术', '设计素材', '其他'];
export const CURRENCIES = ['CNY', 'USD', 'EUR', 'HKD'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (detail) => ({ ok: false, detail });

function httpUrl(raw) {
  try {
    const u = new URL(String(raw));
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch (e) {
    return null;
  }
}

// 域名：去掉 www.，按它汇总「同一个站买了几条」
export function domainOf(url) {
  const u = httpUrl(url);
  return u ? u.hostname.replace(/^www\./i, '').toLowerCase() : null;
}

/* 逐字段读取器。只处理 body 里出现的字段（PATCH 是部分更新），把结果写进 out。
   每个读取器返回 null = 通过，或一句给人看的错误原因。 */
function reader(body, out) {
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const blank = (v) => v == null || v === '';
  return {
    has,
    text(k, label, max, { required = false } = {}) {
      if (!has(k)) return null;
      const v = body[k];
      if (blank(v) || (typeof v === 'string' && !v.trim())) {
        if (required) return `${label}不能为空`;
        out[k] = null; return null;
      }
      if (typeof v !== 'string') return `${label}需要是文本`;
      out[k] = v.trim().slice(0, max); return null;
    },
    url(k, label, { required = false } = {}) {
      if (!has(k)) return null;
      const v = body[k];
      if (blank(v)) { if (required) return `${label}不能为空`; out[k] = null; return null; }
      if (typeof v !== 'string' || v.length > 500 || !httpUrl(v.trim())) return `${label}要填完整网址（http/https 开头）`;
      out[k] = v.trim(); return null;
    },
    pick(k, label, list, { required = false } = {}) {
      if (!has(k)) return null;
      const v = body[k];
      if (blank(v)) { if (required) return `${label}不能为空`; out[k] = null; return null; }
      if (!list.includes(v)) return `${label}只能是：${list.join(' / ')}`;
      out[k] = v; return null;
    },
    date(k, label, { required = false } = {}) {
      if (!has(k)) return null;
      const v = body[k];
      if (blank(v)) { if (required) return `${label}不能为空`; out[k] = null; return null; }
      if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z'))) return `${label}需要是 YYYY-MM-DD`;
      out[k] = v; return null;
    },
    number(k, label, { min = 0, max = 1e9, required = false } = {}) {
      if (!has(k)) return null;
      const v = body[k];
      if (blank(v)) { if (required) return `${label}不能为空`; out[k] = null; return null; }
      const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
      if (!Number.isFinite(n) || n < min || n > max) return `${label}需要是 ${min}~${max} 之间的数字`;
      out[k] = n; return null;
    },
    id(k, label) {
      if (!has(k)) return null;
      const v = body[k];
      if (blank(v)) { out[k] = null; return null; }
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) return `${label}不合法`;
      out[k] = n; return null;
    },
  };
}

const firstError = (checks) => checks.find((c) => c) || null;

/* 外链。partial=true 用于 PATCH：只校验传进来的字段。current = 库里的现值（PATCH 时判「有金额必须有币种」要看合并后的样子）。 */
export function validateBacklink(body, { partial = false, current = null } = {}) {
  if (!body || typeof body !== 'object') return fail('请求内容不合法');
  const out = {};
  const r = reader(body, out);
  if (!partial && !r.has('source_url')) return fail('外链所在页面不能为空');
  const err = firstError([
    r.url('source_url', '外链所在页面', { required: true }),
    r.url('target_url', '指向页面'),
    r.text('anchor', '锚文本', 200),
    r.pick('method', '获得方式', BACKLINK_METHODS),
    r.pick('rel', '链接属性', BACKLINK_RELS),
    r.number('cost', '费用'),
    r.pick('currency', '币种', CURRENCIES),
    r.text('vendor', '卖家 / 中介', 100),
    r.number('dr', 'DR', { max: 100 }),
    r.number('traffic', '月流量'),
    r.text('quality_note', '质量判断', 500),
    r.pick('status', '状态', BACKLINK_STATUSES),
    r.date('acquired_date', '日期'),
    r.date('checked_date', '核查日期'),
    r.text('owner', '负责人', 20),
    r.id('task_id', '关联任务'),
    r.text('note', '备注', 500),
  ]);
  if (err) return fail(err);
  if ('source_url' in out) out.source_domain = domainOf(out.source_url);
  const merged = { ...(current || {}), ...out };
  // 花了钱就必须说清币种和哪天花的 —— 否则这笔钱进不了任何一个月的汇总，等于没记
  if (Number(merged.cost) > 0) {
    if (!merged.currency) return fail('填了费用就必须选币种');
    if (!merged.acquired_date) return fail('填了费用就必须填日期（还没上线就填付款日；花费按它归到月份）');
  }
  return { ok: true, value: out };
}

export function validateExpense(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object') return fail('请求内容不合法');
  const out = {};
  const r = reader(body, out);
  if (!partial) {
    for (const [k, label] of [['spend_date', '日期'], ['category', '类别'], ['amount', '金额'], ['currency', '币种'], ['purpose', '用途']]) {
      if (!r.has(k)) return fail(`${label}不能为空`);
    }
  }
  const err = firstError([
    r.date('spend_date', '日期', { required: true }),
    r.pick('category', '类别', EXPENSE_CATEGORIES, { required: true }),
    r.number('amount', '金额', { required: true }),
    r.pick('currency', '币种', CURRENCIES, { required: true }),
    r.text('vendor', '付给谁', 100),
    r.text('purpose', '用途', 300, { required: true }),
    r.pick('dept', '部门', ['SEO', 'SEM', '公司']),
    r.text('owner', '负责人', 20),
    r.id('task_id', '关联任务'),
    r.url('evidence', '订单 / 发票链接'),
    r.text('note', '备注', 500),
  ]);
  if (err) return fail(err);
  return { ok: true, value: out };
}

const round2 = (n) => Math.round(n * 100) / 100;

function addTo(map, currency, amount) {
  map[currency] = round2((map[currency] || 0) + amount);
}

/* 「钱花在哪」。输入已经按区间取好的行：
     ads       = { value, source }（services/kpiLedger.resolveSemSpend 的返回；source: google_ads | sem_weeks | null）
     backlinks = 区间内的外链行
     expenses  = 区间内的支出行
   输出按去向分组；每组的金额是 {币种: 金额}。总计同样按币种分开，绝不跨币种相加。 */
export function summarizeSpend({ ads = null, backlinks = [], expenses = [] } = {}) {
  const totals = {};
  const groups = [];

  // 广告费：Ads 同步的金额是「账户币种」，库里没存是哪种币，如实标注而不是猜一个符号
  const adsGroup = { key: 'ads', label: '广告投放', amounts: {}, source: ads?.source || null, count: null };
  if (ads && ads.value != null && ads.source) {
    const cur = ads.source === 'sem_weeks' ? 'CNY' : 'ADS_ACCOUNT';
    addTo(adsGroup.amounts, cur, Number(ads.value) || 0);
    addTo(totals, cur, Number(ads.value) || 0);
  }
  groups.push(adsGroup);

  const paid = backlinks.filter((b) => Number(b.cost) > 0);
  const linkGroup = { key: 'backlinks', label: '外链', amounts: {}, source: 'backlinks', count: paid.length };
  for (const b of paid) { addTo(linkGroup.amounts, b.currency, Number(b.cost)); addTo(totals, b.currency, Number(b.cost)); }
  groups.push(linkGroup);

  const byCategory = new Map();
  for (const e of expenses) {
    if (!byCategory.has(e.category)) byCategory.set(e.category, { key: 'expense:' + e.category, label: e.category, amounts: {}, source: 'expenses', count: 0 });
    const g = byCategory.get(e.category);
    g.count += 1;
    addTo(g.amounts, e.currency, Number(e.amount) || 0);
    addTo(totals, e.currency, Number(e.amount) || 0);
  }
  groups.push(...byCategory.values());

  return { groups, totals, backlinks: backlinkStats(backlinks) };
}

const avg = (xs) => (xs.length ? round2(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

/* 外链质量对比：付费的和免费的并排看 —— 这才答得上「花钱买的是不是真比不花钱的好」。
   没录 DR 的不参与均值，同时把「有几条录了」报出来：3 条里只有 1 条有读数时，均值不能当真。 */
export function backlinkStats(rows) {
  const side = (list) => {
    const drs = list.map((b) => b.dr).filter((v) => v != null).map(Number);
    return {
      count: list.length,
      live: list.filter((b) => b.status === '有效').length,
      dead: list.filter((b) => b.status === '失效').length,
      pending: list.filter((b) => b.status === '待上线').length,
      dofollow: list.filter((b) => b.rel === 'dofollow').length,
      avg_dr: avg(drs),
      dr_known: drs.length,
      never_checked: list.filter((b) => !b.checked_date).length,
      // 上次自动核查还在、这次没找到的：最该有人去看一眼的那几条
      auto_lost: list.filter((b) => b.auto_lost_at).length,
    };
  };
  const paid = rows.filter((b) => Number(b.cost) > 0);
  const free = rows.filter((b) => !(Number(b.cost) > 0));
  const cost = {};
  for (const b of paid) addTo(cost, b.currency, Number(b.cost));
  const domains = new Set(rows.map((b) => b.source_domain).filter(Boolean));
  return { total: rows.length, domains: domains.size, paid: { ...side(paid), cost }, free: side(free) };
}
