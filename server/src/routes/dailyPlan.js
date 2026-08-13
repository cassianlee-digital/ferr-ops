// 日计划回放：某一天（不一定是今天）三列上到底有什么、谁有交代。
// 存在理由：日计划只认"今天"，"上周三他俩干了啥"这题以前只能去归档页翻，而归档页是按归档时间分桶的，不是那天的视角。
// 周/月的 period_key 由前端按本地时间算好传进来（与 /api/sop/completions 同口径，不在服务端重算 ISO 周）。
import * as loopRepo from '../db/repositories/loopItems.js';
import * as sopRepo from '../db/repositories/sop.js';
import * as checkinRepo from '../db/repositories/taskCheckins.js';
import { requireAuth } from '../auth/middleware.js';

const s = (v, n = 20) => (v == null ? null : String(v).slice(0, n));
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function dailyPlanRoutes(app) {
  app.get('/api/daily-plan', { preHandler: requireAuth }, async (request, reply) => {
    const day = s(request.query?.day);
    if (!day || !DAY_RE.test(day)) return reply.code(400).send({ error: 'day_required' });

    const tasks = loopRepo.listForDay(day);
    const subtasks = loopRepo.listSubtasksForParents(tasks.filter((t) => t.dept === '公司').map((t) => t.id));

    // 那天的打卡（哪条任务当天被推进过）
    const checkins = checkinRepo.listForDay(day);

    // SOP：定义取全量（含已停用的，否则那天做过的 SOP 会在回放里凭空消失），
    // 完成态按传进来的三个 period_key 查。没传周/月就只回日 SOP 的完成态。
    const periodKeys = {
      daily: day,
      weekly: s(request.query?.weekly),
      monthly: s(request.query?.monthly),
    };
    const sops = sopRepo.listDefs({ activeOnly: false });
    const completions = sopRepo.listCompletions(periodKeys);
    const doneByFreq = { daily: new Set(), weekly: new Set(), monthly: new Set() };
    const keyToFreq = new Map(
      Object.entries(periodKeys).filter(([, v]) => v).map(([f, v]) => [v, f])
    );
    for (const c of completions) {
      const freq = keyToFreq.get(c.period_key);
      if (freq) doneByFreq[freq].add(c.sop_id);
    }

    return {
      day,
      tasks,
      subtasks,
      checkins,
      sops: sops.map((d) => ({ ...d, done: doneByFreq[d.freq]?.has(d.id) || false })),
    };
  });
}
