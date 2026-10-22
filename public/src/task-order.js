// 日计划任务的纯排序规则；不依赖 DOM，供卡片排布、时刻解析和回归测试共用。
export function hourToMin(h) {
  const t = String(h || '').trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = m[2] ? Number(m[2]) : 0;
  if (!(hh >= 0 && hh <= 23) || !(mm >= 0 && mm <= 59)) return null;
  return hh * 60 + mm;
}

const priorityOf = (task) => {
  const value = Number(task && task.task_priority);
  return Number.isInteger(value) && value >= 1 && value <= 4 ? value : 4;
};

/* 当天卡片的蓝色序号表示执行先后，所以有时刻的任务必须按预计完成时刻排。
   同一时刻才用优先级打破平局；未排时刻的任务统一放在已排时刻任务之后。 */
export function compareTodayTasks(a, b) {
  const aMin = hourToMin(a && a.task_hour);
  const bMin = hourToMin(b && b.task_hour);
  if (aMin == null && bMin != null) return 1;
  if (aMin != null && bMin == null) return -1;
  if (aMin != null && bMin != null && aMin !== bMin) return aMin - bMin;
  return priorityOf(a) - priorityOf(b);
}
