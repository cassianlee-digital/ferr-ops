// 任务前后对比的数据组装：按任务的关联键去同步表里取两个窗口的数，交给 taskEffect.js 的规则算。
// 周度审核（第三阶段）会直接复用 buildTaskEffect，所以它不依赖 request，只吃任务行和关联键。
import * as repo from '../db/repositories/taskEffect.js';
import { resolveProject } from '../sync/googleClient.js';
import { METRICS, businessDate, compare, effectWindow, itemStatus } from './taskEffect.js';

// 取默认 Google 项目的站点 / 账户做过滤；没配项目就不过滤（单站点部署时等价）
function projectScope() {
  try { return resolveProject({}); } catch (e) { return {}; }
}

function measure(source, window, fetch) {
  if (!window.before) return { source, status: window.status };
  const before = fetch(window.before);
  const after = fetch(window.after);
  return { source, status: itemStatus(window, before.n, after.n), ...compare(source, before, after) };
}

export function buildTaskEffect(task, links, days) {
  const base = {
    task: { id: task.id, content: task.content, done_at: task.done_at || null },
    days,
    metrics: METRICS,
    // 写给人看的口径说明，界面原样显示：这句话比任何一个数字都重要
    note: '对比的是任务完成日前后各等长的一段时间（完成当天不计）。它只说明「之后变了」，不能证明「因此变了」；请对照下方的全站 / 全账户同期变化一起看。',
  };
  const doneDate = businessDate(task.done_at);
  // 没有完成时刻就没有对比的原点。老任务（done_at 上线前完成的）同样如此 —— 不拿创建日或截止日冒充。
  if (!doneDate) return { ...base, status: 'NOT_DONE', items: [], baseline: {}, windows: {} };

  const scope = projectScope();
  const latest = repo.latestDates(scope);
  const windows = {
    gsc: { ...effectWindow(doneDate, days, latest.gsc), latest_date: latest.gsc },
    ads: { ...effectWindow(doneDate, days, latest.ads), latest_date: latest.ads },
  };

  const items = [];
  for (const l of links || []) {
    const head = { type: l.type, ref: l.ref, label: l.label || null };
    if (l.type === 'page') {
      items.push({ ...head, ...measure('gsc', windows.gsc, (r) => repo.gscPage(l.ref, r, scope)) });
    } else if (l.type === 'keyword') {
      items.push({ ...head, ...measure('gsc', windows.gsc, (r) => repo.gscQuery(l.ref, r, scope)) });
      // 同一个词可能也在投广告：只有 Ads 里真有它的数据才多列一行，否则每个 SEO 词都会带一行空的「广告」
      const ads = measure('ads', windows.ads, (r) => repo.adsKeyword(l.ref, r, scope));
      if (ads.status === 'OK' || ads.status === 'PARTIAL') items.push({ ...head, ...ads });
    } else if (l.type === 'campaign') {
      items.push({ ...head, ...measure('ads', windows.ads, (r) => repo.adsCampaign(l.ref, r, scope)) });
    } else {
      // KPI 是部门级的数（A/B 询价数量、成本…），拆不到单条任务头上；只记「这条任务声明了想推动它」
      items.push({ ...head, source: null, status: 'DECLARED' });
    }
  }

  const baseline = {};
  if (items.some((i) => i.source === 'gsc')) baseline.gsc = measure('gsc', windows.gsc, (r) => repo.gscSite(r, scope));
  if (items.some((i) => i.source === 'ads')) baseline.ads = measure('ads', windows.ads, (r) => repo.adsAccount(r, scope));

  return { ...base, status: 'OK', done_date: doneDate, windows, items, baseline };
}
