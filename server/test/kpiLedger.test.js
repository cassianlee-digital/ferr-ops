// 运营总账：老板年终看的那张「花钱→询盘→优质→成交→效率」表。
// 算错会直接影响对运营部的评价，故重点守：渠道归集、优质/成交口径、零成交的 CAC 不能写 Infinity。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLedger, buildTargetProgress } from '../src/services/kpiLedger.js';

const rows = [
  // SEM：4 封（A 成交 / B 未成交 / B 成交 / C 成交）
  { channel: 'SEM付费', grade: 'A', deal_status: '已成交' },
  { channel: 'SEM', grade: 'B', deal_status: '未成交' },
  { channel: 'SEM', grade: 'B', deal_status: '已成交' },
  { channel: 'SEM付费', grade: 'C', deal_status: '已成交' },
  // SEO：2 封（A 成交 / C 未成交）
  { channel: 'SEO自然', grade: 'A', deal_status: '已成交' },
  { channel: 'SEO', grade: 'C', deal_status: '未成交' },
  // 直接：1 封，老数据没标是否成交
  { channel: '直接访问', grade: 'B', deal_status: null },
  // 其他：1 封，空渠道
  { channel: '', grade: 'C', deal_status: '未成交' },
];

const pick = (ledger, key) => ledger.channels.find((c) => c.key === key);

test('computeLedger：按渠道计数（询盘/等级/优质/成交）', () => {
  const l = computeLedger(rows, { spendByChannel: { SEM: 4000 } });
  const sem = pick(l, 'SEM');
  assert.equal(sem.inquiries, 4);
  assert.equal(sem.a, 1);
  assert.equal(sem.b, 2);
  assert.equal(sem.c, 1);
  assert.equal(sem.quality, 3);          // A + B
  assert.equal(sem.deals, 3);            // 含 C 级成交
  assert.equal(sem.qualityDeals, 2);     // 只有 A/B 的成交

  const seo = pick(l, 'SEO');
  assert.equal(seo.inquiries, 2);
  assert.equal(seo.quality, 1);
  assert.equal(seo.deals, 1);

  assert.equal(pick(l, 'direct').inquiries, 1);
  assert.equal(pick(l, 'other').inquiries, 1);

  assert.equal(l.totals.inquiries, 8);
  assert.equal(l.totals.quality, 5);
  assert.equal(l.totals.deals, 4);   // SEM 3 + SEO 1
  assert.equal(l.totals.qualityDeals, 3);
});

test('computeLedger：未标注是否成交的老数据不算未成交，单独暴露', () => {
  const l = computeLedger(rows, {});
  assert.equal(pick(l, 'direct').dealStatusMissing, 1);
  assert.equal(l.totals.dealStatusMissing, 1);
  assert.equal(l.meta.dealStatusMissing, 1);
  assert.equal(pick(l, 'direct').deals, 0);
});

test('computeLedger：优质率 / 成交率（优质口径 + 总口径）', () => {
  const l = computeLedger(rows, { spendByChannel: { SEM: 4000 } });
  const sem = pick(l, 'SEM');
  assert.equal(sem.qualityRate, 0.75);        // 3/4
  assert.equal(sem.dealRate, 0.6667);         // 2/3 优质成交
  assert.equal(sem.dealRateOverall, 0.75);    // 3/4 全部成交
  assert.equal(l.totals.qualityRate, 0.625);  // 5/8
  assert.equal(l.totals.dealRate, 0.6);       // 3/5
});

test('computeLedger：没有询盘时比率是 null，不是 0（0/0 不能当 0%）', () => {
  const l = computeLedger([], { spendByChannel: { SEM: 100 } });
  assert.equal(pick(l, 'SEO').qualityRate, null);
  assert.equal(pick(l, 'SEM').dealRate, null);
  assert.equal(l.totals.qualityRate, null);
  assert.equal(l.totals.dealRateOverall, null);
});

test('computeLedger：只有 SEM 有花费，其余渠道 NOT_APPLICABLE 且单位成本恒为 null', () => {
  const l = computeLedger(rows, { spendByChannel: { SEM: 4000 } });
  const sem = pick(l, 'SEM');
  assert.equal(sem.spend.status, 'VALID');
  assert.equal(sem.spend.value, 4000);

  for (const key of ['SEO', 'direct', 'other']) {
    const c = pick(l, key);
    assert.equal(c.spend.status, 'NOT_APPLICABLE', key);
    assert.equal(c.spend.value, null, key);
    assert.equal(c.costPerQuality.value, null, key);
    assert.equal(c.cac.value, null, key);
    assert.equal(c.cac.status, 'NOT_APPLICABLE', key);
  }
});

test('computeLedger：SEM 无花费记录 = MISSING_DATA，不当成花了 0 元', () => {
  const l = computeLedger(rows, { spendByChannel: { SEM: null } });
  const sem = pick(l, 'SEM');
  assert.equal(sem.spend.status, 'MISSING_DATA');
  assert.equal(sem.spend.value, null);
  assert.equal(sem.cac.status, 'MISSING_DATA');
  assert.equal(l.totals.spend.status, 'MISSING_DATA');
});

test('computeLedger：每优质成本 / CAC 正常口径', () => {
  const l = computeLedger(rows, { spendByChannel: { SEM: 4500 } });
  const sem = pick(l, 'SEM');
  assert.equal(sem.costPerQuality.value, 1500);  // 4500 / 3 优质
  assert.equal(sem.costPerQuality.status, 'VALID');
  assert.equal(sem.cac.value, 1500);             // 4500 / 3 成交
  assert.equal(sem.cac.status, 'VALID');
});

test('computeLedger：有花费零成交 → CAC 是 null + 原因，绝不是 Infinity', () => {
  const noDeal = [
    { channel: 'SEM', grade: 'A', deal_status: '未成交' },
    { channel: 'SEM', grade: 'C', deal_status: '未成交' },
  ];
  const l = computeLedger(noDeal, { spendByChannel: { SEM: 3000 } });
  const sem = pick(l, 'SEM');
  assert.equal(sem.deals, 0);
  assert.equal(sem.cac.value, null);
  assert.equal(sem.cac.status, 'SPEND_WITH_ZERO_RESULT');
  assert.equal(sem.cac.reason, 'SPEND_WITH_ZERO_DEAL');
  assert.equal(Number.isFinite(sem.cac.value), false);
  // 有优质询盘，所以每优质成本仍算得出来
  assert.equal(sem.costPerQuality.value, 3000);
  // 合计行同理
  assert.equal(l.totals.cac.value, null);
  assert.equal(l.totals.cac.reason, 'SPEND_WITH_ZERO_DEAL');
});

test('computeLedger：有花费零优质 → 每优质成本 null + 原因', () => {
  const l = computeLedger([{ channel: 'SEM', grade: 'C', deal_status: '未成交' }], { spendByChannel: { SEM: 800 } });
  const sem = pick(l, 'SEM');
  assert.equal(sem.costPerQuality.value, null);
  assert.equal(sem.costPerQuality.reason, 'SPEND_WITH_ZERO_QUALITY');
  assert.equal(sem.cac.reason, 'SPEND_WITH_ZERO_DEAL');
});

test('computeLedger：花费为 0（周报确实录了 0）不产生除零', () => {
  const l = computeLedger(rows, { spendByChannel: { SEM: 0 } });
  const sem = pick(l, 'SEM');
  assert.equal(sem.spend.status, 'VALID');
  assert.equal(sem.spend.value, 0);
  assert.equal(sem.cac.value, null);
  assert.equal(sem.cac.status, 'NO_SPEND');
});

test('computeLedger：合计花费只含 SEM，且明确标注混合口径', () => {
  const l = computeLedger(rows, { spendByChannel: { SEM: 4000 } });
  assert.equal(l.totals.spend.value, 4000);
  assert.equal(l.totals.costBasis, 'blended_sem_spend_only');
  assert.equal(l.totals.cac.value, 1000); // 4000 / 4 全渠道成交 —— 下限值，前端须标注
  assert.equal(l.meta.scoring, 'not_scored');
});

test('computeLedger：未知渠道文案归入 other，不丢行', () => {
  const l = computeLedger([{ channel: '展会', grade: 'A', deal_status: '已成交' }], {});
  assert.equal(pick(l, 'other').inquiries, 1);
  assert.equal(l.totals.inquiries, 1);
});

test('buildTargetProgress：有目标算进度，无目标诚实标 NO_TARGET', () => {
  const l = computeLedger(rows, { spendByChannel: { SEM: 4500 } });
  const kpiRows = [
    { grp: 'total', name: '询盘总量', target: 16, mode: 'r' },
    { grp: 'total', name: 'A级询盘数', target: 4, mode: 'r' },
    { grp: 'total', name: '有效询盘成本', target: 2000, mode: 'i' },
  ];
  const t = buildTargetProgress(l, kpiRows);
  const by = (k) => t.find((x) => x.key === k);

  assert.equal(by('inquiries').target, 16);
  assert.equal(by('inquiries').actual, 8);
  assert.equal(by('inquiries').progress, 0.5);
  assert.equal(by('inquiries').status, 'VALID');

  // 反向指标：实际 1500 优于目标 2000 → 进度封顶 1
  assert.equal(by('cost_per_quality').inverse, true);
  assert.equal(by('cost_per_quality').actual, 1500);
  assert.equal(by('cost_per_quality').progress, 1);

  // 成交数 / 优质数 目前没有对应 kpi_targets 行
  assert.equal(by('deals').target, null);
  assert.equal(by('deals').status, 'NO_TARGET');
  assert.equal(by('deals').actual, 4);
  assert.equal(by('quality').status, 'NO_TARGET');
  assert.equal(by('quality').actual, 5);
});

test('buildTargetProgress：目标存在但实际算不出（SEM 无花费）→ NO_ACTUAL，不填 0', () => {
  const l = computeLedger(rows, { spendByChannel: { SEM: null } });
  const t = buildTargetProgress(l, [{ grp: 'total', name: '有效询盘成本', target: 2000, mode: 'i' }]);
  const cpq = t.find((x) => x.key === 'cost_per_quality');
  assert.equal(cpq.actual, null);
  assert.equal(cpq.status, 'NO_ACTUAL');
  assert.equal(cpq.progress, null);
});
