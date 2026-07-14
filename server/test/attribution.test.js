// 询盘归因：SEM「真实每有效询盘成本」——回答「广告花的钱值不值」，算错会误导预算决策。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, computeAttribution } from '../src/services/attribution.js';

test('classify：channel 文案归一到 SEO/SEM/direct/other', () => {
  assert.equal(classify('SEO自然'), 'SEO');
  assert.equal(classify('SEO'), 'SEO');
  assert.equal(classify('SEM付费'), 'SEM');
  assert.equal(classify('SEM'), 'SEM');
  assert.equal(classify('直接访问'), 'direct');
  assert.equal(classify('其它渠道'), 'other');
  assert.equal(classify(''), 'other');
  assert.equal(classify(null), 'other');
});

test('computeAttribution：按渠道聚合 total/effective(A|B)/a', () => {
  const rows = [
    { channel: 'SEM付费', grade: 'A' },
    { channel: 'SEM', grade: 'B' },
    { channel: 'SEM', grade: 'C' },
    { channel: 'SEO自然', grade: 'A' },
    { channel: '直接', grade: 'B' },
    { channel: '', grade: 'C' },
  ];
  const r = computeAttribution(rows, { costMicros: 3_000_000, conversions: 5 });
  assert.deepEqual(r.channels.SEM, { total: 3, effective: 2, a: 1 });
  assert.deepEqual(r.channels.SEO, { total: 1, effective: 1, a: 1 });
  assert.deepEqual(r.channels.direct, { total: 1, effective: 1, a: 0 });
  assert.deepEqual(r.channels.other, { total: 1, effective: 0, a: 0 });
  assert.equal(r.totals.total, 6);
  assert.equal(r.totals.effective, 4); // 2+1+1+0
});

test('computeAttribution：SEM 真实每有效询盘成本 = 花费/有效数（micros→币种）', () => {
  const rows = [
    { channel: 'SEM', grade: 'A' },
    { channel: 'SEM', grade: 'B' },
  ];
  const r = computeAttribution(rows, { costMicros: 3_000_000, conversions: 5 });
  assert.equal(r.sem.costMicros, 3_000_000);
  assert.equal(r.sem.adsConversions, 5);
  assert.equal(r.sem.inquiriesEffective, 2);
  assert.equal(r.sem.costPerEffective, 1.5); // 3 / 2
  assert.equal(r.sem.costPerA, 3);           // 3 / 1
});

test('computeAttribution：无有效/无 A 时成本为 null（不除零、不造 Infinity）', () => {
  const rows = [{ channel: 'SEM', grade: 'C' }];
  const r = computeAttribution(rows, { costMicros: 3_000_000, conversions: 5 });
  assert.equal(r.sem.costPerEffective, null);
  assert.equal(r.sem.costPerA, null);
});

test('computeAttribution：空输入 / 缺 adsTotals 不崩', () => {
  const r = computeAttribution([], {});
  assert.equal(r.totals.total, 0);
  assert.equal(r.sem.costMicros, 0);
  assert.equal(r.sem.costPerEffective, null);
});
