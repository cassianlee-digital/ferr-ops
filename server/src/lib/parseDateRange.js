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
