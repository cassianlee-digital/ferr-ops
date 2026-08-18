// 时间范围端到端契约：KPI、总览、询盘必须消费同一日期口径，且只读查询不能污染共享快照。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-time-range-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite');

const { buildApp } = await import('../src/index.js');
const { db } = await import('../src/db/connection.js');
const app = await buildApp();
const token = app.jwt.sign({ id: 1, username: 'range-test', name: 'range-test', role: 'boss' });
const headers = { cookie: `ferr_token=${token}` };

test.after(async () => {
  await app.close();
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function seedRangeEvidence() {
  db.prepare('UPDATE kpi_targets SET actual = 77').run();

  const insertInquiry = db.prepare(
    'INSERT INTO inquiries (date,channel,grade,note) VALUES (?,?,?,?)'
  );
  insertInquiry.run('2040-01-02', 'SEM', 'A', 'range-a');
  insertInquiry.run('2040-02-02', 'SEO', 'C', 'range-b-1');
  insertInquiry.run('2040-02-03', 'SEM', 'C', 'range-b-2');

  db.prepare(
    `INSERT INTO sem_weeks
       (week_date,cost,impressions,clicks,conversions,roas,quality_score,cpc,ctr,cost_per_conv)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run('2040-01-03', 100, 1000, 100, 1, 2, 7, 1, 10, 100);

  db.prepare(
    `INSERT INTO loop_items (kind,content,state,done_at)
     VALUES ('task','range-a-task','done','2040-01-04 12:00:00')`
  ).run();
}

seedRangeEvidence();

const get = (path) => app.inject({ method: 'GET', url: path, headers });
const rangeA = 'start_date=2040-01-01&end_date=2040-01-31';
const rangeB = 'start_date=2040-02-01&end_date=2040-02-29';

test('不同日期范围驱动 KPI、总览和询盘重算，且不写共享快照', async () => {
  const snapshotsBefore = db.prepare('SELECT COUNT(*) AS count FROM monthly_snapshots').get().count;
  const actualsBefore = db.prepare('SELECT id,actual FROM kpi_targets ORDER BY id').all();

  const [kpiAResponse, kpiBResponse, overviewAResponse, overviewBResponse, inquiriesAResponse, inquiriesBResponse] = await Promise.all([
    get(`/api/kpi-targets?${rangeA}`),
    get(`/api/kpi-targets?${rangeB}`),
    get(`/api/overview?${rangeA}`),
    get(`/api/overview?${rangeB}`),
    get(`/api/inquiries?${rangeA}`),
    get(`/api/inquiries?${rangeB}`),
  ]);

  for (const response of [kpiAResponse, kpiBResponse, overviewAResponse, overviewBResponse, inquiriesAResponse, inquiriesBResponse]) {
    assert.equal(response.statusCode, 200, response.body);
  }

  const kpiA = kpiAResponse.json();
  const kpiB = kpiBResponse.json();
  const actual = (payload, name) => payload.rows.find((row) => row.name === name)?.actual;
  assert.equal(actual(kpiA, '询盘总量'), 1);
  assert.equal(actual(kpiB, '询盘总量'), 2);
  assert.equal(actual(kpiA, 'A级询盘数'), 1);
  assert.equal(actual(kpiB, 'A级询盘数'), 0);
  assert.equal(actual(kpiA, '闭环执行度'), 1);
  assert.equal(actual(kpiB, '闭环执行度'), 0);
  assert.equal(actual(kpiA, '有效询盘成本'), 100);
  assert.equal(actual(kpiB, '有效询盘成本'), null);

  const overviewA = overviewAResponse.json();
  const overviewB = overviewBResponse.json();
  assert.equal(overviewA.current.total, 1);
  assert.equal(overviewA.current.valid, 1);
  assert.equal(overviewB.current.total, 2);
  assert.equal(overviewB.current.valid, 0);
  assert.equal(overviewA.comparison, 'previous_equal_period');
  assert.notEqual(overviewA.current.company, overviewB.current.company);

  assert.deepEqual(inquiriesAResponse.json().items.map((row) => row.note), ['range-a']);
  assert.deepEqual(inquiriesBResponse.json().items.map((row) => row.note), ['range-b-2', 'range-b-1']);

  const snapshotsAfter = db.prepare('SELECT COUNT(*) AS count FROM monthly_snapshots').get().count;
  const actualsAfter = db.prepare('SELECT id,actual FROM kpi_targets ORDER BY id').all();
  assert.equal(snapshotsAfter, snapshotsBefore, '日期查询不得写 monthly_snapshots');
  assert.deepEqual(actualsAfter, actualsBefore, '日期查询不得覆盖 kpi_targets.actual');
});

test('KPI 和总览拒绝不完整或倒置的日期范围', async () => {
  for (const path of [
    '/api/kpi-targets?start_date=2040-01-01',
    '/api/overview?end_date=2040-01-31',
    '/api/kpi-targets?start_date=2040-02-01&end_date=2040-01-01',
    '/api/overview?start_date=2040-02-01&end_date=2040-01-01',
  ]) {
    assert.equal((await get(path)).statusCode, 400, path);
  }
});
