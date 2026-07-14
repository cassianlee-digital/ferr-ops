// 时间范围解析 + 上一等长窗口。驱动询盘/看板/诊断的区间筛选与「流量衰退」环比对比。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDateRange, previousRange } from '../src/lib/parseDateRange.js';

test('parseDateRange：两者皆缺 → range=undefined（兼容全量）', () => {
  assert.deepEqual(parseDateRange({}), { range: undefined });
});

test('parseDateRange：只给一个 → 报错（必须成对）', () => {
  assert.ok(parseDateRange({ start_date: '2026-01-01' }).error);
  assert.ok(parseDateRange({ end_date: '2026-01-01' }).error);
});

test('parseDateRange：格式非法 / start>end → 报错', () => {
  assert.ok(parseDateRange({ start_date: '2026/1/1', end_date: '2026-01-02' }).error);
  assert.ok(parseDateRange({ start_date: '2026-01-05', end_date: '2026-01-01' }).error);
});

test('parseDateRange：合法区间通过', () => {
  assert.deepEqual(parseDateRange({ start_date: '2026-01-01', end_date: '2026-01-07' }), {
    range: { start_date: '2026-01-01', end_date: '2026-01-07' },
  });
});

test('previousRange：紧邻的等长前窗（7 天）', () => {
  assert.deepEqual(previousRange({ start_date: '2026-01-08', end_date: '2026-01-14' }), {
    start_date: '2026-01-01',
    end_date: '2026-01-07',
  });
});

test('previousRange：单日窗口 + 跨月/非闰年边界', () => {
  // 2026 非闰年，2 月 28 天
  assert.deepEqual(previousRange({ start_date: '2026-03-01', end_date: '2026-03-01' }), {
    start_date: '2026-02-28',
    end_date: '2026-02-28',
  });
});
