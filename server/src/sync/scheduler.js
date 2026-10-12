// 谷歌数据定时自动同步（进程内调度）。
// - 每天 UTC config.sync.dailyHourUtc 点把所有启用的站点同步一遍（GSC / GA4 每站一次，Ads 每个账户一次，见 syncSites.js）。
// - 启动后若有站点最近一次成功同步已“过期”，补跑一次（避免容器停机错过当天）。
// - 直接调用同步函数（进程内，免鉴权）；未授权的 provider 静默跳过，单项失败不影响其余。
import { config } from '../config.js';
import { describeResults, staleTargets, syncAllSites } from './syncSites.js';
import { buildDailyLearningMemory } from '../services/hermesBrain.js';

let running = false;
let learningRunning = false;

async function runAll(log, reason) {
  if (running) {
    log.warn('[sync] 上一轮自动同步未结束，跳过本轮');
    return;
  }
  running = true;
  let results = [];
  try {
    // 所有启用的站点都同步（规矩见 syncSites.js：GSC / GA4 每站一次，Ads 每个账户一次）
    results = await syncAllSites({ log });
  } finally {
    running = false;
  }
  log.info(`[sync] 自动同步完成（${reason}）：${describeResults(results)}`);
}

async function runHermesDailyLearning(log, reason) {
  if (!config.hermes.dailyLearningAuto) return;
  if (learningRunning) {
    log.warn('[hermes] 上一轮每日学习未结束，跳过本轮');
    return;
  }
  learningRunning = true;
  try {
    const r = buildDailyLearningMemory({
      role: 'boss',
      persona: { label: '老板' },
    });
    log.info(`[hermes] 每日运营学习已沉淀（${reason}）：${r.item?.title || '无标题'}`);
  } catch (e) {
    log.error({ err: e.message || String(e) }, '[hermes] 每日运营学习沉淀失败');
  } finally {
    learningRunning = false;
  }
}

function msUntilNextDailyHour(hourUtc) {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(hourUtc, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

// 任一已授权 provider 最近一次成功同步缺失或超过 staleHours，则需要补跑。
function needCatchUp(log) {
  // 按站点各看各的：一个站刚同步过，不能替另一个站「显得新鲜」
  const stale = staleTargets();
  if (!stale.length) return false;
  log.info(`[sync] ${stale.map((t) => t.label + '·' + t.provider).join('、')} 最近无新鲜的成功同步 → 需要补跑`);
  return true;
}

export function startSyncScheduler(log) {
  if (!config.sync.enabled) log.info('[sync] 自动同步已禁用（SYNC_AUTO=false）');
  if (!config.hermes.dailyLearningAuto) log.info('[hermes] 每日运营学习已禁用（HERMES_DAILY_LEARNING_AUTO=false）');
  if (!config.sync.enabled && !config.hermes.dailyLearningAuto) return;

  const hour = config.sync.dailyHourUtc;

  const schedule = () => {
    const delay = msUntilNextDailyHour(hour);
    setTimeout(async () => {
      if (config.sync.enabled) await runAll(log, '每日定时');
      await runHermesDailyLearning(log, '每日定时');
      schedule(); // 排下一天
    }, delay).unref?.();
    log.info(`[sync] 已排程：每日 UTC ${hour}:00 自动同步 / Hermes 学习（约 ${Math.round(delay / 3600_000)}h 后首次）`);
  };
  schedule();

  // 周期性自愈：每 checkIntervalHours 小时只读时间戳检查一次，数据过期（> staleHours）才真同步。
  // 这样无论几点看、进程重启多少次，数据都能在约半天内自动保持最新，无需手动「立即同步」。
  if (config.sync.enabled && config.sync.checkIntervalHours > 0) {
    const intervalMs = config.sync.checkIntervalHours * 3600_000;
    setInterval(async () => {
      try {
        if (needCatchUp(log)) await runAll(log, '新鲜度自愈');
      } catch (e) {
        log.error({ err: e.message || String(e) }, '[sync] 新鲜度自愈检查失败');
      }
    }, intervalMs).unref?.();
    log.info(`[sync] 已启用新鲜度自愈：每 ${config.sync.checkIntervalHours}h 检查，超过 ${config.sync.staleHours}h 未更新则自动同步`);
  }

  if (config.sync.catchUpOnStart || config.hermes.dailyLearningAuto) {
    setTimeout(async () => {
      try {
        if (config.sync.enabled) {
          if (needCatchUp(log)) await runAll(log, '启动补跑');
          else log.info('[sync] 近期已有成功同步，跳过启动补跑');
        }
        await runHermesDailyLearning(log, '启动补跑');
      } catch (e) {
        log.error({ err: e.message || String(e) }, '[sync] 启动补跑检查失败');
      }
    }, config.sync.startDelayMs).unref?.();
  }
}
