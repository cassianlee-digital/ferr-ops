// SOP 执行率的统计。原来写在 routes/sop.js 的 /api/sop/stats 里；周度审核也要同一份数，故抽出来共用。
// 分母的三条诚实规则不变：未来的日子不算、SOP 创建之前的日子不算、月度 SOP 不进周口径。
import * as repo from '../db/repositories/sop.js';

// [from..to] 的每一天（含两端）；to 早于 from 返回空数组
export function daysBetween(from, to) {
  const out = [];
  const d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function sopStats(from, to, today = null) {
  const end = today && today < to ? today : to; // 本周只算到今天
  const defs = repo.listDefs({ activeOnly: true });
  const rows = repo.completionsBetween(from, to);
  const doneDays = new Map(); // sop_id -> Set(打卡日期)
  for (const r of rows) {
    if (!doneDays.has(r.sop_id)) doneDays.set(r.sop_id, new Set());
    doneDays.get(r.sop_id).add(String(r.completed_at || '').slice(0, 10));
  }
  const items = defs.map((d) => {
    const created = String(d.created_at || '').slice(0, 10);
    const start = created > from ? created : from;
    const days = daysBetween(start, end);
    const hit = doneDays.get(d.id) || new Set();
    if (d.freq === 'monthly') return { ...d, expected: null, done: hit.size, missed_days: [] };
    if (d.freq === 'weekly') {
      return { ...d, expected: days.length ? 1 : 0, done: hit.size ? 1 : 0, missed_days: [] };
    }
    return { ...d, expected: days.length, done: days.filter((x) => hit.has(x)).length, missed_days: days.filter((x) => !hit.has(x)) };
  });
  return { from, to, counted_to: end, items };
}
