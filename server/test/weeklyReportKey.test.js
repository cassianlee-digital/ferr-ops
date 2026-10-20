// 周报的周 / 月标识会原样出现在所有人的周报页上，所以只收固定的几种写法。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-weekkey-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite'); // 必须在动态 import 之前：connection.js 在 import 期就开库

const { buildApp } = await import('../src/index.js');
const { db } = await import('../src/db/connection.js');
const app = await buildApp();

test.after(async () => {
  await app.close();
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const auth = { cookie: `ferr_token=${app.jwt.sign({ id: 1, username: 't', name: 't', role: 'seo' })}` };
const put = (payload) => app.inject({ method: 'PUT', url: '/api/weekly-reports', headers: auth, payload });
const keys = () => db.prepare('SELECT DISTINCT week_key FROM weekly_reports ORDER BY week_key').all().map((r) => r.week_key);

test('周报标识：三种合法写法都收；带标签 / 引号 / 空格 / 超长的一律拒绝，且不落库', async () => {
  for (const week_key of ['2026-10-05', '2026-10-month', '2026-W41']) {
    const r = await put({ week_key, dept: 'SEO', field: 'summary', items: ['做了事'] });
    assert.equal(r.statusCode, 200, week_key + ' ' + r.body);
  }
  for (const week_key of ['<img src=x>', '2026-10-05" data-x="1', '2026 10 05', 'x'.repeat(21), 'abc', 20261005, { a: 1 }]) {
    const r = await put({ week_key, dept: 'SEO', field: 'summary', items: ['x'] });
    assert.equal(r.statusCode, 400, JSON.stringify(week_key));
    assert.equal(r.json().error, 'bad_week_key');
  }
  assert.deepEqual(keys(), ['2026-10-05', '2026-10-month', '2026-W41']);
});

test('周报列表：?current= 会自动建出当前周，但标识不合规时不建行（那是个 GET）', async () => {
  const ok = await app.inject({ method: 'GET', url: '/api/weekly-reports?current=2026-10-12', headers: auth });
  assert.equal(ok.statusCode, 200);
  assert.ok(keys().includes('2026-10-12'));
  const before = keys();
  const bad = await app.inject({ method: 'GET', url: '/api/weekly-reports?current=' + encodeURIComponent('<b>x</b>'), headers: auth });
  assert.equal(bad.statusCode, 200, '列表照常返回');
  assert.deepEqual(keys(), before, '不合规的标识不能建出行来');
});
