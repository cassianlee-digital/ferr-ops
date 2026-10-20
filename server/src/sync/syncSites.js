// 多站点同步的编排：每天把所有启用的站点都同步一遍；给某一个站点补历史。
//
// 以前定时同步只管「默认」那一个站，其它站就算登记了也永远没有数据。
// 规矩（services/sites.js 的 syncPlan）：GSC / GA4 每个站点各一次；Ads 是账户级的，同一个账户只同步一次。
// 一个（站点 × 数据源）失败不影响其它的，失败原因逐条记下来。
import { config } from '../config.js';
import * as repo from '../db/repositories/googleSync.js';
import { backfillChunks, syncPlan } from '../services/sites.js';
import { syncGsc } from './gsc.js';
import { syncGa4 } from './ga4.js';
import { syncAds } from './ads.js';
import { defaultRange } from './googleClient.js';

const SYNCERS = { gsc: syncGsc, ga4: syncGa4, ads: syncAds };

// SQLite 存的是 UTC（'YYYY-MM-DD HH:MM:SS'），补上 Z 再解析，免得被当成本地时区
function parseUtc(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

// 已授权的数据源里，今天该同步的（站点 × 数据源）
export function plannedTargets() {
  const tokens = repo.tokenStatus();
  return syncPlan(repo.listProjects()).filter((t) => tokens[t.provider]?.authorized);
}

// 其中最近一次成功同步缺失或太旧的。按站点各看各的：一个站刚同步过，不能替另一个站「显得新鲜」
export function staleTargets(now = Date.now()) {
  const staleMs = config.sync.staleHours * 3600_000;
  return plannedTargets().filter((t) => {
    const run = repo.latestProjectRuns(t.project_id)[t.provider];
    const at = run && run.status === 'success' ? parseUtc(run.finished_at || run.started_at) : null;
    return !at || now - at.getTime() > staleMs;
  });
}

/* 把计划里的每一项同步一遍。syncers 可注入（测试不走真实网络）。返回逐项结果。 */
export async function syncAllSites({ syncers = SYNCERS, log = null } = {}) {
  const tokens = repo.tokenStatus();
  const results = [];
  for (const target of syncPlan(repo.listProjects())) {
    if (!tokens[target.provider]?.authorized) {
      results.push({ ...target, status: 'skipped', detail: '未授权' });
      continue;
    }
    try {
      const r = await syncers[target.provider](target.project_id ? { project_id: target.project_id } : {});
      results.push({ ...target, status: 'ok', rows: r.rowsWritten || 0 });
    } catch (e) {
      results.push({ ...target, status: 'failed', detail: e.message || String(e) });
      log?.error({ provider: target.provider, site: target.label, err: e.message || String(e) }, '[sync] 自动同步失败');
    }
  }
  return results;
}

// 同步函数抛的是内部代号；给人看的要说清楚缺什么。谷歌自己返回的原因（配额、权限…）原样带出
export function syncErrorText(e) {
  const msg = (e && e.message) || String(e);
  if (msg === 'google_not_authorized') return '这个数据源还没有授权（在「Google 授权与同步」里点授权）';
  if (msg === 'google_config_missing') return '服务器上的谷歌接口还没配好' + (e.missing && e.missing.length ? '，缺少：' + e.missing.join('、') : '');
  return msg;
}

export function describeResults(results) {
  return results.map((r) => `${r.label}·${r.provider}:${r.status === 'ok' ? r.rows + '行' : r.status === 'skipped' ? '未授权跳过' : '失败(' + r.detail + ')'}`).join('，');
}

/* 给一个站点同步 GSC 和 GA4（广告是账户级的，不在这里）。days 给了就是补历史：分段取，从近到远。
   某一段失败就停在那一段并报出来 —— 前面取到的已经落库，不会白取。 */
export async function syncSite(site, { days = null, syncers = SYNCERS } = {}) {
  const out = [];
  for (const provider of ['gsc', 'ga4']) {
    if (provider === 'gsc' ? !site.gsc_site_url : !site.ga4_property_id) {
      out.push({ provider, status: 'not_configured' });
      continue;
    }
    // GSC 的数据有两天左右的延迟，取到昨天；GA4 当天就有，取到今天
    const end = defaultRange(1, { includeToday: provider === 'ga4' }).end_date;
    const chunks = days ? backfillChunks(days, end) : [null];
    let rows = 0; let done = 0; let truncated = false; let error = null;
    for (const chunk of chunks) {
      try {
        const r = await syncers[provider]({ project_id: site.id, ...(chunk || {}) });
        rows += r.rowsWritten || 0; done += 1; truncated = truncated || !!r.truncated;
      } catch (e) {
        error = syncErrorText(e);
        break;
      }
    }
    out.push({ provider, status: error ? 'failed' : 'ok', rows, chunks: chunks.length, chunks_done: done, truncated, error });
  }
  return out;
}
