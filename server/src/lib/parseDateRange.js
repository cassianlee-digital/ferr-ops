// Parse optional date range query params. Missing both keeps legacy full-range behavior.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateRange(query) {
  const start = query?.start_date;
  const end = query?.end_date;
  const hasStart = start != null && start !== '';
  const hasEnd = end != null && end !== '';

  if (!hasStart && !hasEnd) return { range: undefined };
  if (!hasStart || !hasEnd) return { error: 'start_date and end_date must be provided together' };
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    return { error: 'start_date and end_date must be in YYYY-MM-DD format' };
  }
  if (start > end) return { error: 'start_date must be before or equal to end_date' };

  return { range: { start_date: start, end_date: end } };
}

// 上一个等长窗口：紧邻 range 之前、长度相同的日期区间（用于环比 / 流量衰退对比）。
// 例：{2026-01-08 .. 2026-01-14}(7天) → {2026-01-01 .. 2026-01-07}。
export function previousRange(range) {
  const day = 86400000;
  const s = new Date(range.start_date + 'T00:00:00Z');
  const e = new Date(range.end_date + 'T00:00:00Z');
  const len = Math.round((e - s) / day) + 1;
  const prevEnd = new Date(s.getTime() - day);
  const prevStart = new Date(prevEnd.getTime() - (len - 1) * day);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { start_date: iso(prevStart), end_date: iso(prevEnd) };
}
