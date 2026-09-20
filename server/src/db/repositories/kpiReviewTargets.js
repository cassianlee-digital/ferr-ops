// 月度绩效考核目标（老板《2026 运营部绩效考核表》「目标设置」页口径）数据访问层。
import { db } from '../connection.js';

export const TARGET_FIELDS = ['a_target', 'b_target', 'ad_budget', 'cost_a_target', 'cost_ab_target', 'a_ratio_target'];
export const DEFAULT_KEY = 'default';

export function list() {
  return db.prepare('SELECT * FROM kpi_review_targets ORDER BY period_key DESC').all();
}

export function get(periodKey) {
  return db.prepare('SELECT * FROM kpi_review_targets WHERE period_key = ?').get(periodKey);
}

/* 取某月生效的目标：先看这个月有没有单独设，没有就用 'default' 行。
   返回值一定带 source，让界面能说清「这个目标是这个月单独设的还是通用兜底」——
   否则老板改了 9 月目标却发现 10 月没跟着变时，只会以为是 bug。 */
export function resolve(periodKey) {
  const own = periodKey ? get(periodKey) : null;
  if (own && TARGET_FIELDS.some((f) => own[f] != null)) return { ...own, source: 'period' };
  const fallback = get(DEFAULT_KEY);
  if (fallback) return { ...fallback, source: 'default' };
  return { period_key: DEFAULT_KEY, source: 'none', ...Object.fromEntries(TARGET_FIELDS.map((f) => [f, null])) };
}

// 只写传进来的字段；显式传 null 表示「清空这个目标」，未传的字段保持不动。
export function upsert(periodKey, patch = {}) {
  const cur = get(periodKey);
  if (!cur) db.prepare('INSERT INTO kpi_review_targets (period_key) VALUES (?)').run(periodKey);
  const sets = [];
  const params = { period_key: periodKey };
  for (const f of TARGET_FIELDS) {
    if (!(f in patch)) continue;
    const v = patch[f];
    sets.push(`${f} = @${f}`);
    params[f] = v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
  }
  if ('note' in patch) { sets.push('note = @note'); params.note = patch.note == null ? null : String(patch.note).slice(0, 500); }
  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE kpi_review_targets SET ${sets.join(', ')} WHERE period_key = @period_key`).run(params);
  return get(periodKey);
}

export function remove(periodKey) {
  if (periodKey === DEFAULT_KEY) return false; // 兜底行不给删，否则接口就没有形状了
  db.prepare('DELETE FROM kpi_review_targets WHERE period_key = ?').run(periodKey);
  return true;
}
