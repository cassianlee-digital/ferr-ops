// 周度审核的规则（纯函数，不碰数据库）：一条任务在这个区间里算什么状态、有哪些该被问到的疑点。
//
// 经理 2026-10-10：「我们不是要知道上周写了几篇文章，是要知道你上周都做了什么、哪些产生了可验证的数据变化、
// 证据在哪；这个工作需要多长时间、是不是需要这么长、多长时间完成的、质量怎么样。」
// 这里把这些问题变成一组确定性的检查，每条疑点都能指回任务上的某个字段 ——
// AI 审核是在这些事实之上写评语，不是替代它们：AI 不可用时，这一页照样能用。
//
// 疑点只陈述事实（「没填预估工时」「实际用时是预估的 2.3 倍」），不下结论（「偷懒」「磨洋工」）。
// 用时超了可能是任务本来就估少了 —— 该问的是「为什么」，不是直接扣帽子。
import { businessDate } from './taskEffect.js';
import { isDone, parseEvidence } from './taskAudit.js';

export const PEOPLE = ['李', '陈'];
const DEPT_OWNER = { SEO: '李', SEM: '陈' };
const OWNER_DEPT = { 李: 'SEO', 陈: 'SEM' };
export const deptOfPerson = (person) => OWNER_DEPT[person] || null;

// 这条任务算谁的：写了负责人就是他；没写就按部门（SEO→李、SEM→陈）；公司任务没写负责人 = 不归个人
export function personOf(item) {
  if (item.owner && PEOPLE.includes(item.owner)) return item.owner;
  return DEPT_OWNER[item.dept] || null;
}

export const OVERRUN_RATIO = 1.5;   // 实际用时超过预估的 1.5 倍才提出来问
export const UNDERRUN_RATIO = 0.5;  // 不到预估的一半也值得问：估得太松，还是没做完

export const FLAGS = {
  NO_RESULT: { label: '结果未记录', tone: 'bad' },
  NO_EVIDENCE: { label: '重要任务没有证据', tone: 'bad' },
  NO_LINKS: { label: '没关联页面/系列/关键词，无法验证数据变化', tone: 'warn' },
  NO_ESTIMATE: { label: '没填预估工时', tone: 'warn' },
  NO_ACTUAL: { label: '没填实际用时', tone: 'warn' },
  OVERRUN: { label: '实际用时明显超出预估', tone: 'warn' },
  UNDERRUN: { label: '实际用时不到预估的一半', tone: 'warn' },
  LATE: { label: '晚于截止日完成', tone: 'warn' },
  EFFECT_PENDING: { label: '前后对比的数据还没满，先别下结论', tone: 'muted' },
  EFFECT_NO_DATA: { label: '关联对象前后都没有数据', tone: 'warn' },
  OVERDUE: { label: '已过截止日仍未完成', tone: 'bad' },
  STALLED: { label: '跨天任务在区间内没有任何推进记录', tone: 'bad' },
  ABANDONED: { label: '未完成即归档', tone: 'warn' },
};

const inRange = (d, range) => !!d && d >= range.start_date && d <= range.end_date;

/* 任务在这个区间里的状态。返回 null = 与这个区间无关，不进审核。
     completed   区间内完成（按北京时间的完成日）
     abandoned   区间内归档且从未完成
     overdue     截止日已过（不晚于区间结束）仍未完成 —— 包括上周拖下来的
     in_progress 区间内在做（区间与任务的起止有重叠），还没到截止
   today 用来判逾期：区间还没结束时，截止日在今天之后的不算逾期。 */
export function taskState(item, range, today) {
  if (item.state === 'deleted') return null;
  const doneDate = isDone(item) || item.done_at ? businessDate(item.done_at) : null;
  if (doneDate) return inRange(doneDate, range) ? 'completed' : null;
  if (item.state === 'archived') return inRange(businessDate(item.archived_at), range) ? 'abandoned' : null;
  if (isDone(item)) return null; // 标了完成却没有完成时刻的老任务：不知道是哪天做完的，不硬塞进某一周
  const due = item.task_date || '';
  const start = item.start_date || due;
  const asOf = today && today < range.end_date ? today : range.end_date;
  if (due && due < asOf && due <= range.end_date) return 'overdue';
  if (!due && !start) return 'in_progress'; // 没填任何日期的活跃任务：一直挂在盘子里
  // 没填截止日 = 没有终点，只要已经开始就一直算在做
  if ((start || due) <= range.end_date && (due || '9999-12-31') >= range.start_date) return 'in_progress';
  return null;
}

const measurable = (links) => (links || []).some((l) => l.type !== 'kpi');

/* 一条任务的疑点。ctx：
     state      taskState 的结果
     important  是否重要任务
     images     证据截图数
     links      关联键
     checkins   区间内的推进打卡天数
     effect     buildTaskEffect 的结果（仅已完成且有可量化关联的任务才算） */
export function taskFlags(item, ctx) {
  const flags = [];
  const { state } = ctx;
  if (state === 'abandoned') return ['ABANDONED'];
  if (state === 'overdue') flags.push('OVERDUE');
  if (state === 'overdue' || state === 'in_progress') {
    const multiDay = item.start_date && item.task_date && item.start_date < item.task_date;
    if (multiDay && !(ctx.checkins > 0)) flags.push('STALLED');
    if (item.est_hours == null) flags.push('NO_ESTIMATE');
    return flags;
  }
  // completed
  if (!String(item.result || '').trim()) flags.push('NO_RESULT');
  if (ctx.important && !parseEvidence(item.evidence).length && !(ctx.images > 0)) flags.push('NO_EVIDENCE');
  if (!measurable(ctx.links)) flags.push('NO_LINKS');
  if (item.est_hours == null) flags.push('NO_ESTIMATE');
  if (item.actual_hours == null) flags.push('NO_ACTUAL');
  if (item.est_hours > 0 && item.actual_hours != null) {
    const ratio = item.actual_hours / item.est_hours;
    if (ratio > OVERRUN_RATIO) flags.push('OVERRUN');
    else if (ratio < UNDERRUN_RATIO) flags.push('UNDERRUN');
  }
  const doneDate = businessDate(item.done_at);
  if (item.task_date && doneDate && doneDate > item.task_date) flags.push('LATE');
  if (ctx.effect && ctx.effect.status === 'OK') {
    const measured = ctx.effect.items.filter((i) => i.source);
    if (measured.length && measured.every((i) => i.status === 'PENDING' || i.status === 'PARTIAL' || i.status === 'NOT_SYNCED')) flags.push('EFFECT_PENDING');
    else if (measured.length && measured.every((i) => i.status === 'NO_DATA')) flags.push('EFFECT_NO_DATA');
  }
  return flags;
}

// 前后对比压成一行一个对象的摘要（审核页和导出都用它；完整明细仍在任务的「数据变化」里）
export function effectDigest(effect) {
  if (!effect || effect.status !== 'OK') return [];
  return effect.items.filter((i) => i.source).map((i) => {
    const m = effect.metrics[i.source];
    const out = { type: i.type, ref: i.ref, label: i.label, source: i.source, status: i.status, days: effect.windows[i.source]?.days ?? 0, metrics: [] };
    if (i.before) for (const k of m) out.metrics.push({ key: k.key, label: k.label, better: k.better, before: i.before[k.key], after: i.after[k.key], delta: i.delta[k.key] });
    return out;
  });
}

const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);

/* 一组任务的汇总（整体或某个人）。只数事实，不打分 —— 打分是月度绩效考核的事，这一页是给人看细节的。 */
export function summarizeTasks(tasks) {
  const by = (s) => tasks.filter((t) => t.audit_state === s);
  const completed = by('completed');
  const withEstimate = completed.filter((t) => t.est_hours != null && t.actual_hours != null);
  return {
    completed: completed.length,
    in_progress: by('in_progress').length,
    overdue: by('overdue').length,
    abandoned: by('abandoned').length,
    with_result: completed.filter((t) => String(t.result || '').trim()).length,
    with_evidence: completed.filter((t) => parseEvidence(t.evidence).length || (t.evidence_images || []).length).length,
    with_links: completed.filter((t) => measurable(t.links)).length,
    // 「有完整前后数据」的任务数：只有它们谈得上「产生了可验证的数据变化」
    with_effect_data: completed.filter((t) => (t.effect || []).some((e) => e.status === 'OK')).length,
    est_hours: withEstimate.length ? sum(withEstimate, 'est_hours') : null,
    actual_hours: withEstimate.length ? sum(withEstimate, 'actual_hours') : null,
    hours_known: withEstimate.length, // 预估和实际都填了的有几条：工时合计只覆盖这些
    flagged: tasks.filter((t) => (t.flags || []).some((f) => FLAGS[f].tone === 'bad')).length,
  };
}
