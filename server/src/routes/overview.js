// 总览数据：公司评分 + 询盘汇总 + 与上月环比。
import { requireAuth } from '../auth/middleware.js';
import { computeScores } from '../services/kpi.js';
import * as inqRepo from '../db/repositories/inquiries.js';
import * as snap from '../db/repositories/snapshots.js';

const currentMonth = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

export async function overviewRoutes(app) {
  app.get('/api/overview', { preHandler: requireAuth }, async () => {
    const month = currentMonth();
    const sc = computeScores().scores;
    const s = inqRepo.stats();
    // 记录本月快照（幂等覆盖），供后续月份环比
    snap.upsert(month, { company_score: sc.company, a_ratio: s.aRatio, valid_rate: s.rate });
    const prev = snap.prevBefore(month);
    const d = (cur, p) => (prev && p != null ? round1(cur - p) : null);
    return {
      month,
      current: { company: sc.company, grade: sc.grade, aRatio: s.aRatio, validRate: s.rate, valid: s.valid, total: s.total },
      prevMonth: prev ? prev.month : null,
      delta: {
        company: d(sc.company, prev && prev.company_score),
        aRatio: d(s.aRatio, prev && prev.a_ratio),
        validRate: d(s.rate, prev && prev.valid_rate),
      },
    };
  });
}
