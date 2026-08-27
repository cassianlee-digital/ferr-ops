// Phase 5A Execution：渠道隔离 + 到期区间过滤（DB 级）。独立临时库，不污染开发库。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-exec-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite');

const { migrate } = await import('../src/db/migrate.js');
const { db } = await import('../src/db/connection.js');
const repo = await import('../src/db/repositories/executionLoops.js');
const { deriveExecutionRate } = await import('../src/services/kpi.js');
migrate();

test.after(() => { db.close(); rmSync(tmpDir, { recursive: true, force: true }); });

const mk = (channel, status, impact, due) => repo.create({
  channel, problem: 'p', impact_level: impact, status, verification_due_at: due, source_type: 'manual',
});
// 直接落库后再把 status 调成目标值（create 固定 OPEN）
function seed(channel, status, impact, due) {
  const rec = mk(channel, status, impact, due);
  db.prepare('UPDATE execution_loops SET status=? WHERE id=?').run(status, rec.id);
  return rec.id;
}

const RANGE = { start_date: '2040-03-01', end_date: '2040-03-31' };

test('Test 3：verification_due_at 超出周期 → 不进当前 Eligible（不扣分）', () => {
  seed('seo', 'VERIFIED', 'HIGH', '2040-03-10'); // 到期在区间内
  seed('seo', 'IMPLEMENTED', 'HIGH', '2040-04-15'); // 到期在区间外（4月）
  const r = deriveExecutionRate('seo', RANGE);
  assert.equal(r.sample_size, 1);         // 只有区间内那条 eligible
  assert.equal(r.eligible_weight, 3);
  assert.equal(r.verified_weight, 3);
  assert.equal(r.actual, 100);
});

test('Test 9 & 10：SEO/SEM 记录互不串入对方 metric', () => {
  db.prepare('DELETE FROM execution_loops').run();
  seed('seo', 'VERIFIED', 'HIGH', '2040-03-05');
  seed('sem', 'FAILED', 'HIGH', '2040-03-06');
  const seo = deriveExecutionRate('seo', RANGE);
  const sem = deriveExecutionRate('sem', RANGE);
  assert.equal(seo.sample_size, 1);
  assert.equal(seo.actual, 100);           // 只看 SEO 的 verified
  assert.equal(sem.sample_size, 1);
  assert.equal(sem.actual, 0);             // 只看 SEM 的 failed
});
