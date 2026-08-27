// Phase 5C 考核期冻结：结算快照后，改目标不改历史（§29）。独立临时库。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { periodRange, currentPeriodKey, isValidPeriodKey } from '../src/lib/kpiPeriod.js';

// ---- 纯周期数学（无 DB） ----
test('periodRange：month/quarter 边界正确', () => {
  assert.deepEqual(periodRange('month', '2026-08'), { start_date: '2026-08-01', end_date: '2026-08-31' });
  assert.deepEqual(periodRange('month', '2026-02'), { start_date: '2026-02-01', end_date: '2026-02-28' });
  assert.deepEqual(periodRange('quarter', '2026-Q3'), { start_date: '2026-07-01', end_date: '2026-09-30' });
  assert.deepEqual(periodRange('quarter', '2026-Q1'), { start_date: '2026-01-01', end_date: '2026-03-31' });
});
test('currentPeriodKey / isValidPeriodKey', () => {
  assert.equal(currentPeriodKey('month', '2026-08-25'), '2026-08');
  assert.equal(currentPeriodKey('quarter', '2026-08-25'), '2026-Q3');
  assert.equal(isValidPeriodKey('month', '2026-13'), false);
  assert.equal(isValidPeriodKey('quarter', '2026-Q5'), false);
  assert.equal(isValidPeriodKey('quarter', '2026-Q2'), true);
});

// ---- DB 级：结算冻结 ----
const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-settle-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite');
// seed 需要口令环境变量（bcrypt）——须在 import config 前设好
process.env.SEED_LI_PASSWORD = 'x'; process.env.SEED_CHEN_PASSWORD = 'x'; process.env.SEED_MANAGER_PASSWORD = 'x'; process.env.SEED_BOSS_PASSWORD = 'x';
const { seed } = await import('../src/db/seed.js');
const { db } = await import('../src/db/connection.js');
const { settlePeriod, previewPeriod } = await import('../src/services/kpi.js');
const snapRepo = await import('../src/db/repositories/kpiSnapshots.js');
seed(); // migrate + 基础16 + 14 绩效指标 + 用户（settled_by=1 = 李，满足 FK）
test.after(() => { db.close(); rmSync(tmpDir, { recursive: true, force: true }); });

function seedSemAug() {
  const ins = db.prepare('INSERT INTO inquiries (date,channel,grade,note) VALUES (?,?,?,?)');
  [['A'], ['A'], ['B'], ['C']].forEach(([g], i) => ins.run('2026-08-1' + i, 'SEM付费', g, 't'));
  db.prepare('INSERT INTO sem_weeks (week_date,cost,impressions,clicks,conversions,roas,quality_score,cpc,ctr,cost_per_conv) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run('2026-08-12', 6000, 10000, 500, 3, 2, 7, 12, 5, 2000);
}
seedSemAug();

test('结算 SEM 月度 → 冻结分数；此后改目标不改历史（§29）', () => {
  const snap = settlePeriod({ period_type: 'month', period_key: '2026-08', owner: 'sem', settled_by: 1 });
  assert.equal(snap.owner, 'sem');
  assert.equal(snap.range_start, '2026-08-01');
  assert.equal(snap.range_end, '2026-08-31');
  const frozenScore = snap.score, frozenProv = snap.provisional_score, frozenCov = snap.coverage, frozenStatus = snap.status;
  assert.ok(frozenScore != null || frozenProv != null); // 有数据，至少给出分或参考分

  // 改 SEM 目标（大幅），并改覆盖率阈值
  db.prepare("UPDATE kpi_targets SET target=999 WHERE grp='sem' AND name='SEM 有效询盘数量'").run();

  // 快照读回：完全不变（冻结）
  const after = snapRepo.getOne('month', '2026-08', 'sem');
  assert.equal(after.score, frozenScore);
  assert.equal(after.provisional_score, frozenProv);
  assert.equal(after.coverage, frozenCov);
  assert.equal(after.status, frozenStatus);

  // 预览（实时）随新目标变化 → 证明「实时≠冻结」
  const pv = previewPeriod({ period_type: 'month', period_key: '2026-08', owner: 'sem' });
  const volNow = /* SEM 有效询盘数量 达成率随 target 999 骤降 */ pv.scope;
  assert.notEqual(pv.scope.score ?? pv.scope.provisionalScore, frozenScore ?? frozenProv);
});

test('owner 隔离：结算 seo 与 sem 是不同快照行', () => {
  settlePeriod({ period_type: 'quarter', period_key: '2026-Q3', owner: 'seo', settled_by: 1 });
  const seo = snapRepo.getOne('quarter', '2026-Q3', 'seo');
  const sem = snapRepo.getOne('month', '2026-08', 'sem');
  assert.equal(seo.owner, 'seo');
  assert.equal(sem.owner, 'sem');
  assert.equal(seo.range_start, '2026-07-01'); // 季度
  assert.notEqual(seo.id, sem.id);
});

test('非法周期 key → settlePeriod 抛错（路由层转 400）', () => {
  assert.throws(() => settlePeriod({ period_type: 'month', period_key: '2026-13', owner: 'sem' }));
});
