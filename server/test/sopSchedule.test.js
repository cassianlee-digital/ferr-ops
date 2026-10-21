// SOP 的排序 / 月度触发周 / 优先级推导。纯函数，直接 import 前端模块（它不碰 DOM，刻意的）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  weekdayOrder, monthWeekOf, weekOfMonth, dueThisWeek, sopPriority, compareSops,
} from '../../public/src/sop-schedule.js';

test('周几解析：周一=1 … 周日=7，没写星期的排最后', () => {
  assert.equal(weekdayOrder('周一'), 1);
  assert.equal(weekdayOrder('周五'), 5);
  assert.equal(weekdayOrder('周日'), 7);
  assert.equal(weekdayOrder('周天'), 7);
  assert.equal(weekdayOrder(null), 99);
  assert.equal(weekdayOrder('09:30'), 99);
});

test('月度「第几周」认得文档里的四种写法，区间取起点', () => {
  assert.equal(monthWeekOf('每月第 1 周'), 1);
  assert.equal(monthWeekOf('每月第 4 周'), 4);
  assert.equal(monthWeekOf('首月第 1 周 （最先做）'), 1);
  assert.equal(monthWeekOf('首月第 1–2 周'), 1, '区间取起点：文档的意思是从第 1 周开始做');
  assert.equal(monthWeekOf('首月第 2 周'), 2);
  assert.equal(monthWeekOf('每季度第 1 周'), 1);
  assert.equal(monthWeekOf('每月第一周'), 1, '中文数字也要认');
  assert.equal(monthWeekOf('月初'), null);
  assert.equal(monthWeekOf(null), null);
});

test('今天是本月第几周：按几号除以 7；月末第 5 周并进第 4 周', () => {
  const d = (s) => new Date(s + 'T09:00:00');
  assert.equal(weekOfMonth(d('2026-10-01')), 1);
  assert.equal(weekOfMonth(d('2026-10-07')), 1);
  assert.equal(weekOfMonth(d('2026-10-08')), 2);
  assert.equal(weekOfMonth(d('2026-10-21')), 3);
  assert.equal(weekOfMonth(d('2026-10-22')), 4);
  assert.equal(weekOfMonth(d('2026-10-31')), 4, '29–31 号不另开一周，「每月第 4 周」指的就是月末');
});

test('月度条目只在它该做的那一周算「本周要做」；非月度一律 false', () => {
  const m = (hint) => ({ freq: 'monthly', time_hint: hint });
  const d = (s) => new Date(s + 'T09:00:00');
  assert.equal(dueThisWeek(m('每月第 1 周'), d('2026-10-03')), true);
  assert.equal(dueThisWeek(m('每月第 1 周'), d('2026-10-21')), false);
  assert.equal(dueThisWeek(m('每月第 4 周'), d('2026-10-28')), true);
  assert.equal(dueThisWeek(m('月初'), d('2026-10-03')), false, '认不出周次就不并入，别瞎猜');
  assert.equal(dueThisWeek({ freq: 'weekly', time_hint: '每月第 1 周' }, d('2026-10-03')), false);
  assert.equal(dueThisWeek(null, d('2026-10-03')), false);
});

test('优先级：显式字段优先；没有就按文档的优先级列 / 编号推', () => {
  assert.equal(sopPriority({ priority: 2, code: 'P1' }), 2, '人改过就听人的');
  assert.equal(sopPriority({ code: '固定' }), 1, '周一看数 / 周五复盘是每周的锚点');
  assert.equal(sopPriority({ code: 'P1' }), 1);
  assert.equal(sopPriority({ code: 'P2' }), 2);
  assert.equal(sopPriority({ code: 'P3' }), 3);
  // SEO/GEO 那两张表写明「按优先级排序，时间不够时从最下面往上砍」
  assert.equal(sopPriority({ code: 'S1' }), 1);
  assert.equal(sopPriority({ code: 'S3' }), 1);
  assert.equal(sopPriority({ code: 'S4' }), 2);
  assert.equal(sopPriority({ code: 'S9' }), 3);
  // GEO 只有三条动作，序号就是档位；不能和九条的 S 共用一把尺子（那样 G1~G3 会全是 1）
  assert.equal(sopPriority({ code: 'G1' }), 1);
  assert.equal(sopPriority({ code: 'G2' }), 2);
  assert.equal(sopPriority({ code: 'G3' }), 3);
  // 月度 / 一次性动作文档没排优先级，不替老板编一个
  assert.equal(sopPriority({ code: 'M4' }), 4);
  assert.equal(sopPriority({ code: 'F5' }), 4);
  assert.equal(sopPriority({}), 4);
  assert.equal(sopPriority({ priority: 9, code: 'P2' }), 2, '越界的显式值不作数，回落到按 code 推');
});

test('排序先按时间线，再按优先级 —— 不按赛道聚拢', () => {
  const s = (over) => ({ freq: 'weekly', sort_order: 1, ...over });
  const rows = [
    s({ title: '社媒周一P2', time_hint: '周一', code: 'P2' }),
    s({ title: 'SEM周五', time_hint: '周五', code: '固定' }),
    s({ title: 'SEM周一固定', time_hint: '周一', code: '固定' }),
    s({ title: '无星期P2', time_hint: null, code: 'P2' }),
    s({ title: '无星期P1', time_hint: null, code: 'P1' }),
  ];
  assert.deepEqual(
    [...rows].sort(compareSops).map((r) => r.title),
    ['SEM周一固定', '社媒周一P2', 'SEM周五', '无星期P1', '无星期P2'],
    '周一的两条（跨赛道）要挨在一起排在周五之前；同一天内按优先级；没写星期的排最后',
  );
});

test('并进周列的月度条目排在周内节奏之后 —— 不能把「第 3 周」当成「周三」', () => {
  const rows = [
    { title: '月度第1周', freq: 'monthly', time_hint: '每月第 1 周', code: 'M1', sort_order: 1 },
    { title: '周五', freq: 'weekly', time_hint: '周五', code: '固定', sort_order: 1 },
    { title: '月度第3周', freq: 'monthly', time_hint: '每月第 3 周', code: 'M2', sort_order: 1 },
    { title: '周一', freq: 'weekly', time_hint: '周一', code: '固定', sort_order: 1 },
    { title: '周内无星期', freq: 'weekly', time_hint: null, code: 'P1', sort_order: 1 },
  ];
  assert.deepEqual(
    [...rows].sort(compareSops).map((r) => r.title),
    ['周一', '周五', '周内无星期', '月度第1周', '月度第3周'],
  );
});

test('月列按第几周排，第 1 周在第 4 周之前（跨赛道也是）', () => {
  const m = (title, hint, code) => ({ title, freq: 'monthly', time_hint: hint, code, sort_order: 1 });
  const rows = [
    m('社媒M4', '每月第 4 周', 'M4'),
    m('SEM-M1', '每月第 1 周', 'M1'),
    m('社媒M1', '首月第 1 周', 'M1'),
    m('SEM-M4', '每月第 4 周', 'M4'),
    m('没写周次', '月初', 'M9'),
  ];
  assert.deepEqual(
    [...rows].sort(compareSops).map((r) => r.title),
    ['SEM-M1', '社媒M1', '社媒M4', 'SEM-M4', '没写周次'],
  );
});
