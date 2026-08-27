// 考核周期工具（Phase 5C）。period_type: 'month' | 'quarter'。纯函数，便于单测。
// month key: 'YYYY-MM'（如 2026-08）；quarter key: 'YYYY-Qn'（如 2026-Q3）。

const pad2 = (n) => String(n).padStart(2, '0');
const lastDay = (year, month1) => new Date(year, month1, 0).getDate(); // month1: 1-based

export function isValidPeriodKey(type, key) {
  if (type === 'month') return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
  if (type === 'quarter') return /^\d{4}-Q[1-4]$/.test(key);
  return false;
}

// period_key → { start_date, end_date }（YYYY-MM-DD，含首尾）
export function periodRange(type, key) {
  if (!isValidPeriodKey(type, key)) throw new Error('invalid period key: ' + type + ' ' + key);
  if (type === 'month') {
    const [y, m] = key.split('-').map(Number);
    return { start_date: `${y}-${pad2(m)}-01`, end_date: `${y}-${pad2(m)}-${pad2(lastDay(y, m))}` };
  }
  const [y, q] = [Number(key.slice(0, 4)), Number(key.slice(6))];
  const startM = (q - 1) * 3 + 1, endM = q * 3;
  return { start_date: `${y}-${pad2(startM)}-01`, end_date: `${y}-${pad2(endM)}-${pad2(lastDay(y, endM))}` };
}

// 某日期所属的周期 key。date 为 Date 或 'YYYY-MM-DD'。
export function currentPeriodKey(type, date = new Date()) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
  const y = d.getFullYear(), m = d.getMonth() + 1;
  if (type === 'month') return `${y}-${pad2(m)}`;
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

// 该 owner 的默认考核周期类型（SEO 季度 / SEM 月度 / 公司 季度）
export function periodTypeForOwner(owner) {
  if (owner === 'sem') return 'month';
  return 'quarter'; // seo / company
}
