/* SOP 的「什么时候做」与「有多重要」——一组纯函数，不碰 DOM。
 *
 * 单独成模块是为了能被 node --test 真实 import（sop.js 在模块求值期就要碰 window，进不了测试）。
 * 这里的三件事都容易想当然写错，所以每条规则都有单测钉着（server/test/sopSchedule.test.js）：
 *   ① 排序：周列要按「周一 → 周五」、月列要按「第 1 周 → 第 4 周」，而不是按赛道先聚拢
 *      —— 按赛道聚拢的话，SEM 排到周五、社媒又从周一重新开始，一列看下来时间是来回跳的。
 *   ② 月度条目归到本月第几周：文档里写的是「每月第 1 周」「首月第 1–2 周」「每季度第 1 周」这些话。
 *   ③ 优先级：文档 A 列就是优先级（固定 / P1 / P2 / P3），SEO、GEO 那两张表则是
 *      「按优先级排序，时间不够时从最下面往上砍」，所以 S/G 的序号越小越优先。
 */

const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 日: 7, 天: 7 };

/** 周几 → 1..7（周一=1）。没写星期的回 99，排在写了星期的后面。 */
export function weekdayOrder(timeHint) {
  const m = /周([一二三四五六日天])/.exec(String(timeHint || ''));
  return m ? (CN_NUM[m[1]] || 99) : 99;
}

/** 「每月第 1 周」「首月第 1–2 周」「每季度第 1 周」→ 1..4；认不出来回 null。
 *  区间（第 1–2 周）取**起点**：文档的意思是「从第 1 周开始做」，不是「第 2 周才做」。 */
export function monthWeekOf(timeHint) {
  const t = String(timeHint || '');
  const m = /第\s*([0-9０-９一二三四五六七八九十]+)/.exec(t);
  if (!m) return null;
  const raw = m[1].replace(/[０-９]/g, (d) => String('０１２３４５６７８９'.indexOf(d)));
  const n = /^\d+$/.test(raw) ? Number(raw) : CN_NUM[raw];
  return n >= 1 && n <= 5 ? Math.min(4, n) : null;
}

/** 今天是本月第几周（1..4）。按几号除以 7 向上取整；第 5 周（29 号之后）并进第 4 周，
 *  因为文档里的「每月第 4 周」指的就是月末那一段。 */
export function weekOfMonth(date = new Date()) {
  return Math.min(4, Math.ceil(date.getDate() / 7));
}

/* 月度条目这一周要不要出现在「每周必做」里。
   日计划上已经没有月列了（2026-10-21 用户决定：月度到点自己冒出来就行，不占一整列），
   所以这个判断同时决定它**这一周可见不可见** —— 判错的代价是一条 SOP 整月没人看见。

   两条规则：
   ① 写了周次（「每月第 1 周」「首月第 1–2 周」…）→ 只在那一周出现。
      「首月第 N 周」一视同仁按「每月第 N 周」处理：库里没有「首月是哪个月」这个事实，
      用 created_at 推也不可靠（条目可能是补录的）。宁可每月提醒一次（看一眼就知道做过了），
      也不要因为算错首月而整年不提醒。
   ② 没写 / 认不出周次（手写的「月初」「空着」）→ **每周都出现**，不是藏起来。
      藏起来 = 一条 SOP 整月不出现在任何地方，没人会发现它丢了；
      每周露一次顶多是吵，而且它的完成记录按月计（period_key=YYYY-MM），
      这个月勾过之后余下几周都显示已完成，自己就安静了。 */
export function dueThisWeek(sop, date = new Date()) {
  if (!sop || sop.freq !== 'monthly') return false;
  const w = monthWeekOf(sop.time_hint);
  if (w == null) return true;
  return w === weekOfMonth(date);
}

/* ===== 优先级 1..4（1 最高），与任务卡那套旗子同口径 ===== */
const CODE_PRIORITY = {
  固定: 1,   // 周一看数 / 周五复盘：每周的锚点，时间再紧也不能砍
  P1: 1, P2: 2, P3: 3,
};
/** 显式 priority 优先；没有就按文档的优先级列 / 编号推。认不出来回 4（普通）。 */
export function sopPriority(sop) {
  const explicit = Number(sop && sop.priority);
  if (Number.isInteger(explicit) && explicit >= 1 && explicit <= 4) return explicit;
  const code = String((sop && sop.code) || '').trim();
  if (CODE_PRIORITY[code]) return CODE_PRIORITY[code];
  // SEO 的 S1–S9、GEO 的 G1–G3：文档写明「按优先级排序，时间不够时从最下面往上砍」。
  // 两张表长度不同，不能共用一把尺子：S 有九条，按三等分压到 1/2/3；G 只有三条，序号即档位。
  const s = /^S(\d+)$/.exec(code);
  if (s) { const n = Number(s[1]); return n <= 3 ? 1 : n <= 6 ? 2 : 3; }
  const g = /^G(\d+)$/.exec(code);
  if (g) return Math.min(3, Math.max(1, Number(g[1])));
  // 月度 / 一次性动作（M*、F*）：文档没给它们排优先级，不替老板编一个
  return 4;
}

/* 列内排序：先时间线，再优先级，最后文档行序。
   时间线放第一位是因为人是按「今天周几该做什么」看这一列的；
   按赛道聚拢好看，但会让时间来回跳（SEM 排到周五、社媒又从周一开始）。 */
export function compareSops(a, b) {
  const ka = sortKey(a), kb = sortKey(b);
  if (ka.time !== kb.time) return ka.time - kb.time;
  if (ka.prio !== kb.prio) return ka.prio - kb.prio;
  if (ka.order !== kb.order) return ka.order - kb.order;
  return (a.id || 0) - (b.id || 0);
}
/* ⚠ 周几（1..7）和「本月第几周」（1..4）绝不能共用一个数字空间：
   月度条目被并进周列时，「每月第 3 周」会当成「周三」排到周一和周五中间（实测踩过）。
   所以月度统一加 100 —— 月列里相对顺序不变（101/104…），并进周列时则一律排在周内节奏之后。 */
const MONTHLY_BASE = 100;
function sortKey(s) {
  const time = s.freq === 'monthly'
    ? MONTHLY_BASE + (monthWeekOf(s.time_hint) ?? 99)
    : weekdayOrder(s.time_hint);
  return { time, prio: sopPriority(s), order: s.sort_order ?? 9999 };
}
