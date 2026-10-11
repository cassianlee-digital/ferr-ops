// 外链的定时批量核查。
//
// 单条的「自动核查」按钮早就有了，但外链一多没人会一条条点 —— 核查就又回到「想起来才查」。
// 这里每天在没人用后台的时段自动查一批：只查超过 staleDays 天没查过的，一次最多 batch 条，
// 一条一条来、每条之间停一下（对方是别人的站，不能一口气打过去）。
//
// 结果怎么落库、三种结论各是什么意思，全在 linkCheck.js 和 backlinksRepo.saveAutoCheck 里，这里不重复：
// 尤其是「没找到 / 没取到都不等于失效」—— 批量核查同样**不改人工填的状态**，
// 只是把「上次还在、这次没找到」的那几条标出来（auto_lost_at），让人去看。
import { config } from '../config.js';
import * as backlinksRepo from '../db/repositories/backlinks.js';
import { checkBacklink, fetchPage } from './linkCheck.js';
import { businessDate } from './taskEffect.js';

let running = false;
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms).unref?.(); });

/* 查一批。fetcher / pauseMs 可注入（测试不走真实网络、不真等）。返回这一批的计数。 */
export async function runBacklinkChecks({
  fetcher = fetchPage, staleDays = config.backlinks.staleDays, batch = config.backlinks.batch, pauseMs = config.backlinks.pauseMs,
} = {}) {
  if (running) return { skipped: true };
  running = true;
  const out = { checked: 0, found: 0, not_found: 0, unreachable: 0, lost: 0 };
  try {
    const rows = backlinksRepo.dueForAutoCheck(staleDays, batch);
    for (let i = 0; i < rows.length; i++) {
      // checkBacklink 自己不抛错（取不到页面本身就是一种结果）；这里兜的是意料之外的异常，一条坏了不能拖垮整批
      let result;
      try { result = await checkBacklink(rows[i], fetcher); }
      catch (e) { result = { auto_status: 'unreachable', auto_detail: '核查时出错：' + ((e && e.message) || '未知错误'), auto_rel: null, auto_anchor: null }; }
      const saved = backlinksRepo.saveAutoCheck(rows[i].id, result, businessDate(new Date().toISOString()));
      out.checked++; out[result.auto_status]++;
      if (saved && saved.auto_lost_at && !rows[i].auto_lost_at) out.lost++;
      if (pauseMs > 0 && i < rows.length - 1) await sleep(pauseMs);
    }
  } finally {
    running = false;
  }
  return out;
}

function msUntilNextHour(hourUtc) {
  const now = new Date(); const next = new Date(now);
  next.setUTCHours(hourUtc, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

// 进程内每天跑一次。与谷歌同步的调度器分开：两件事互不相干，谁出问题都不该连累另一个。
export function startBacklinkCheckScheduler(log) {
  if (!config.backlinks.autoCheck) { log.info('[backlinks] 外链定时核查已禁用（BACKLINK_AUTO_CHECK=false）'); return; }
  const schedule = () => {
    const delay = msUntilNextHour(config.backlinks.hourUtc);
    setTimeout(async () => {
      try {
        const r = await runBacklinkChecks();
        if (r.skipped) log.warn('[backlinks] 上一轮核查还没结束，跳过本轮');
        else log.info(`[backlinks] 定时核查完成：查了 ${r.checked} 条，链接在 ${r.found}，没找到 ${r.not_found}，页面没取到 ${r.unreachable}；其中 ${r.lost} 条是上次还在、这次没找到`);
      } catch (e) {
        log.error({ err: (e && e.message) || String(e) }, '[backlinks] 定时核查失败');
      }
      schedule();
    }, delay).unref?.();
  };
  schedule();
  log.info(`[backlinks] 已排程：每日 UTC ${config.backlinks.hourUtc}:00 核查超过 ${config.backlinks.staleDays} 天没查过的外链（每次最多 ${config.backlinks.batch} 条）`);
}
