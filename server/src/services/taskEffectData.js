// 任务前后对比的数据组装：按任务的关联键去同步表里取两个窗口的数，交给 taskEffect.js 的规则算。
// 周度审核（第三阶段）会直接复用 buildTaskEffect，所以它不依赖 request，只吃任务行和关联键。
import * as repo from '../db/repositories/taskEffect.js';
import { resolveProject } from '../sync/googleClient.js';
import { METRICS, businessDate, compare, effectWindow, itemStatus } from './taskEffect.js';

// 取默认 Google 项目的站点 / 账户做过滤；没配项目就不过滤（单站点部署时等价）
function projectScope() {
  try { return resolveProject({}); } catch (e) { return {}; }
}

// 完整网址 → 路径（GA4 的落地页维度只有路径，没有域名）
function pathOf(url) {
  try { return new URL(url).pathname || '/'; } catch (e) { return null; }
}

function measure(source, window, fetch) {
  if (!window.before) return { source, status: window.status };
  const before = fetch(window.before);
  const after = fetch(window.after);
  return { source, status: itemStatus(window, before.n, after.n), ...compare(source, before, after) };
}

const CAVEAT = '它只说明「之后变了」，不能证明「因此变了」；请对照下方的全站 / 全账户同期变化一起看。';

/* 通用组装：以 originDate 为原点，对 links 里的每个对象做前后对比。
   任务（原点 = 完成日）和外链（原点 = 上线日）共用；没有原点就没有对比，由 missing 说明原因，不拿别的日期冒充。 */
function buildEffect({ subject, originDate, links, days, note, missing }) {
  const base = { task: subject, days, metrics: METRICS, note };
  const doneDate = originDate;
  if (!doneDate) return { ...base, status: missing.status, message: missing.message, items: [], baseline: {}, windows: {} };

  const scope = projectScope();
  const latest = repo.latestDates(scope);
  const windows = {
    gsc: { ...effectWindow(doneDate, days, latest.gsc), latest_date: latest.gsc },
    ads: { ...effectWindow(doneDate, days, latest.ads), latest_date: latest.ads },
    ga4: { ...effectWindow(doneDate, days, latest.ga4), latest_date: latest.ga4 },
  };

  const items = [];
  for (const l of links || []) {
    const head = { type: l.type, ref: l.ref, label: l.label || null };
    if (l.type === 'page') {
      items.push({ ...head, ...measure('gsc', windows.gsc, (r) => repo.gscPage(l.ref, r, scope)) });
      /* 同一个页面在 GA4 里的表现：有多少会话从它进站、其中发生了多少关键事件。
         搜索点击涨了不等于带来了询盘，这一行才接近「这次改页面有没有带来转化」。
         只在 GA4 真有这个页面的数据时才列（没同步 / 没人从这页进站时多列一行空的只是噪音）。 */
      const pagePath = pathOf(l.ref);
      if (pagePath) {
        const ga4 = measure('ga4', windows.ga4, (r) => repo.ga4LandingPage(pagePath, r, scope));
        if (ga4.status === 'OK' || ga4.status === 'PARTIAL') items.push({ ...head, ...ga4 });
      }
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
  if (items.some((i) => i.source === 'ga4')) baseline.ga4 = measure('ga4', windows.ga4, (r) => repo.ga4Site(r, scope));

  return { ...base, status: 'OK', done_date: doneDate, windows, items, baseline };
}

export function buildTaskEffect(task, links, days) {
  return buildEffect({
    subject: { id: task.id, content: task.content, done_at: task.done_at || null },
    // 完成时刻按北京时间归日。老任务（done_at 上线前完成的）没有它 —— 不拿创建日或截止日冒充。
    originDate: businessDate(task.done_at),
    links,
    days,
    // 写给人看的口径说明，界面原样显示：这句话比任何一个数字都重要
    note: '对比的是任务完成日前后各等长的一段时间（完成当天不计）。' + CAVEAT,
    missing: { status: 'NOT_DONE', message: '这条任务没有完成时刻（未完成，或是完成门槛上线前勾的老任务），没有对比的原点。' },
  });
}

/* 外链的效果：它指向的那个页面，在外链上线日前后的自然搜索表现。
   外链起效慢，这个对比比任务的更容易被别的因素盖过去 —— 参照行在这里尤其要看。 */
export function buildBacklinkEffect(backlink, days) {
  const hasTarget = !!backlink.target_url;
  return buildEffect({
    subject: { id: backlink.id, content: '外链 ' + (backlink.source_domain || backlink.source_url) + (hasTarget ? ' → ' + backlink.target_url : '') },
    originDate: hasTarget ? backlink.acquired_date : null,
    links: hasTarget ? [{ type: 'page', ref: backlink.target_url }] : [],
    days,
    note: '对比的是外链指向的页面在外链上线日前后各等长一段时间的自然搜索表现（上线当天不计）。外链起效通常要几周，短窗口里看不出变化是正常的。' + CAVEAT,
    missing: {
      status: 'NO_ORIGIN',
      message: hasTarget ? '这条外链没有填上线日期，没有对比的原点。' : '这条外链没有填「指向我们的哪个页面」，不知道该看哪个页面的数据。',
    },
  });
}
