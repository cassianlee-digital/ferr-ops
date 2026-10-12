// 多站点下的「任务完成前后数据对比」：关联的页面是哪个站的，就去哪个站的数据里找。
// 以前一律查默认站点 —— 关联了别的站的页面永远是「没有数据」，看起来像那个页面没人搜。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-effect-sites-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite'); // 必须在动态 import 之前：connection.js 在 import 期就开库
process.env.SYNC_AUTO = 'false';

const { buildApp } = await import('../src/index.js');
const { db } = await import('../src/db/connection.js');
const googleRepo = await import('../src/db/repositories/googleSync.js');
const app = await buildApp();
db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, name, role) VALUES (1, 'effect-sites', 'x', '测试', 'boss')").run();

test.after(async () => { await app.close(); db.close(); rmSync(tmpDir, { recursive: true, force: true }); });

const auth = { cookie: `ferr_token=${app.jwt.sign({ id: 1, username: 't', name: 't', role: 'seo' })}` };
const call = (method, url, payload) => app.inject({ method, url, headers: auth, payload });
const ymd = (d) => '2026-09-' + String(d).padStart(2, '0');

const A = { site: 'sc-domain:ferrcasting.com', page: 'https://www.ferrcasting.com/oem/' };
const B = { site: 'sc-domain:bestflowfitting.com', page: 'https://www.bestflowfitting.com/elbow/' };
const putDaily = db.prepare('INSERT INTO gsc_daily (date, site_url, clicks, impressions, ctr, position) VALUES (?,?,?,?,?,?)');
const putQuery = db.prepare('INSERT INTO gsc_query_daily (date, site_url, query, page, clicks, impressions, ctr, position) VALUES (?,?,?,?,?,?,?,?)');
// 完成日 09-15。A 站数据到 09-22（后 7 天齐）；B 站只同步到 09-18（后 3 天）
function seed(s, day, pageClicks, siteClicks) {
  putDaily.run(ymd(day), s.site, siteClicks, siteClicks * 10, 0.1, 8);
  putQuery.run(ymd(day), s.site, 'q', s.page, pageClicks, pageClicks * 10, 0.1, 8);
}
for (let d = 8; d <= 14; d++) { seed(A, d, 1, 100); seed(B, d, 3, 500); }
for (let d = 16; d <= 22; d++) seed(A, d, 2, 110);
for (let d = 16; d <= 18; d++) seed(B, d, 9, 600);

async function doneTask(links) {
  const task = (await call('POST', '/api/loop-items', { kind: 'task', dept: 'SEO', content: '改页面', links })).json().item;
  db.prepare("UPDATE loop_items SET state='done', status='done', result='已上线', done_at='2026-09-15 03:00:00' WHERE id=?").run(task.id);
  return (await call('GET', `/api/loop-items/${task.id}/effect?days=7`)).json();
}
const clicks = (item) => [item.before.clicks, item.after.clicks];

test('没登记站点时和以前一样：不分站点', async () => {
  const r = await doneTask([{ type: 'page', ref: B.page }]);
  assert.equal(r.site, null);
  assert.deepEqual(clicks(r.items[0]), [21, 27], '前 7 天每天 3 次；后面只有 3 天有数据，每天 9 次');
});

test('登记了多个站点：页面各用各自站点的数据，参照行跟着这条任务的主站点走', async () => {
  googleRepo.createProject({ name: 'FERR-OEM五金件', gsc_site_url: A.site, domain: 'ferrcasting.com', is_default: true });
  googleRepo.createProject({ name: '贝孚特-管件', gsc_site_url: B.site, domain: 'bestflowfitting.com' });

  // 关联的是非默认站点的页面：以前查默认站点，是「没有数据」
  const onB = await doneTask([{ type: 'page', ref: B.page }]);
  assert.equal(onB.site, '贝孚特-管件');
  assert.equal(onB.items[0].status, 'PARTIAL', 'B 站只同步到完成后第 3 天：两边一起缩短');
  assert.deepEqual(clicks(onB.items[0]), [9, 27], '前后各 3 天');
  assert.deepEqual(clicks(onB.baseline.gsc), [1500, 1800], '参照行是 B 站自己的全站同期，不是默认站点的');
  assert.equal(onB.items[0].site, undefined, '和主站点是同一个站，不用再标');

  // 默认站点的页面
  const onA = await doneTask([{ type: 'page', ref: A.page }]);
  assert.equal(onA.site, 'FERR-OEM五金件');
  assert.equal(onA.items[0].status, 'OK');
  assert.deepEqual(clicks(onA.items[0]), [7, 14]);
  assert.deepEqual(clicks(onA.baseline.gsc), [700, 770]);

  // 一条任务关联了两个站的页面：各取各的，窗口也各算各的；另一个站的那行标出站点
  const both = await doneTask([{ type: 'page', ref: A.page }, { type: 'page', ref: B.page }]);
  assert.equal(both.site, 'FERR-OEM五金件', '主站点 = 第一个认得出站点的页面所在的站');
  assert.deepEqual(both.items.map((i) => [i.site || null, i.status, ...clicks(i)]), [[null, 'OK', 7, 14], ['贝孚特-管件', 'PARTIAL', 9, 27]]);

  // 页面的域名没有登记成站点：按默认站点找，找不到就是「无数据」，不借别的站的数
  const unknown = await doneTask([{ type: 'page', ref: 'https://some-other-site.example/x' }]);
  assert.equal(unknown.items[0].status, 'NO_DATA');
});

test('外链的前后对比同样按它指向的页面认站点', async () => {
  const made = await call('POST', '/api/backlinks', { source_url: 'https://blog.example.org/post', target_url: B.page, acquired_date: '2026-09-15', paid: false });
  assert.equal(made.statusCode, 201, made.body);
  const r = (await call('GET', `/api/backlinks/${made.json().item.id}/effect?days=7`)).json();
  assert.equal(r.site, '贝孚特-管件');
  assert.deepEqual(clicks(r.items[0]), [9, 27]);
});
