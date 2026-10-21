// 日计划与 SOP 共用的本地 ISO 周工具，负责跨月、跨年时的周次切换。

const WEEK_RE = /^(\d{4})-W(\d{2})$/;

export function isoWeekKey(value = new Date()) {
  const day = new Date(value);
  if (Number.isNaN(day.getTime())) return null;
  day.setHours(0, 0, 0, 0);
  const thursday = new Date(day);
  thursday.setDate(thursday.getDate() + 4 - (thursday.getDay() || 7));
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const week = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7);
  return `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function shiftIsoWeekKey(key, offset) {
  const match = WEEK_RE.exec(String(key || ''));
  if (!match || !Number.isInteger(offset)) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  const jan4 = new Date(year, 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + ((week - 1 + offset) * 7));
  return isoWeekKey(monday);
}
