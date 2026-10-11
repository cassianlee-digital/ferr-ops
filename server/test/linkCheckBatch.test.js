// 外链的定时批量核查：轮到谁、查完怎么记、「上次还在这次没了」怎么标。
// 单条核查的规则（SSRF 防线、三种结论）在 linkCheck.test.js；这里只测「批量」多出来的那部分。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-linkbatch-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite'); // 必须在动态 import 之前：connection.js 在 import 期就开库

const { buildApp } = await import('../src/index.js');
const { db } = await import('../src/db/connection.js');
const backlinksRepo = await import('../src/db/repositories/backlinks.js');
const { runBacklinkChecks } = await import('../src/services/linkCheckBatch.js');
const { backlinkStats } = await import('../src/services/spend.js');
const app = await buildApp();

test.after(async () => {
  await app.close();
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const TARGET = 'https://ferr.com/valves';
const add = (n, over = {}) => backlinksRepo.create({
  source_url: `https://site${n}.example.com/post`, source_domain: `site${n}.example.com`, target_url: TARGET,
  method: '客座投稿', rel: 'dofollow', status: '有效', ...over,
});
const row = (id) => db.prepare('SELECT status, checked_date, auto_status, auto_checked_at, auto_lost_at FROM backlinks WHERE id = ?').get(id);
const aged = (id, days) => db.prepare("UPDATE backlinks SET auto_checked_at = datetime('now', ?) WHERE id = ?").run(`-${days} days`, id);
// 假的取页函数：按网址决定页面上有没有链接；顺便记下被访问的顺序
const pages = new Map(); const visited = [];
const fetcher = async (url) => {
  visited.push(url);
  const p = pages.get(url);
  if (p === 'down') throw Object.assign(new Error('连接被对方中断'), { code: 'ECONNRESET' });
  return { status: 200, body: p === 'gone' ? '<p>链接被撤了</p>' : `<a href="${TARGET}">valves</a>`, finalUrl: url, truncated: false };
};
const run = (over = {}) => runBacklinkChecks({ fetcher, pauseMs: 0, staleDays: 7, batch: 40, ...over });

test('轮到谁：没查过的先查，其余按上次核查从旧到新；刚查过的、标了失效的、没填指向页面的不查', async () => {
  const never = add(1);
  const old = add(2); aged(old.id, 30);
  const older = add(3); aged(older.id, 60);
  const fresh = add(4); aged(fresh.id, 2);
  const dead = add(5, { status: '失效' });
  const noTarget = add(6, { target_url: null });
  assert.deepEqual(backlinksRepo.dueForAutoCheck(7, 40).map((b) => b.id), [never.id, older.id, old.id]);
  assert.deepEqual(backlinksRepo.dueForAutoCheck(7, 2).map((b) => b.id), [never.id, older.id], '一次只查一批');

  const r = await run({ batch: 2 });
  assert.deepEqual(r, { checked: 2, found: 2, not_found: 0, unreachable: 0, lost: 0 });
  assert.deepEqual(visited, ['https://site1.example.com/post', 'https://site3.example.com/post']);
  // 没轮到的下一次接着查：谁也不会一直排不上
  assert.deepEqual((await run({ batch: 2 })).checked, 1);
  assert.deepEqual((await run()).checked, 0, '都查过了，这一轮没有可查的');
  for (const b of [fresh, dead, noTarget]) assert.notEqual(row(b.id).auto_status, 'found', '这三条不该被这几轮碰到');
  for (const id of [dead.id, noTarget.id]) assert.equal(row(id).auto_checked_at, null);
});

test('上次还在、这次没找到：单独标出来；人工填的状态一个字都不动；再次找到就清掉', async () => {
  const b = add(10);
  await run();
  assert.equal(row(b.id).auto_status, 'found');
  assert.ok(row(b.id).checked_date, '找到了才更新核查日');
  assert.equal(row(b.id).auto_lost_at, null);

  // 一周后对方把链接撤了
  aged(b.id, 8); pages.set('https://site10.example.com/post', 'gone');
  const r = await run();
  assert.equal(r.not_found, 1); assert.equal(r.lost, 1);
  assert.equal(row(b.id).auto_status, 'not_found');
  assert.ok(row(b.id).auto_lost_at, '要记下是哪次开始找不到的');
  assert.equal(row(b.id).status, '有效', '没找到不等于失效：状态由人来改');
  assert.equal(backlinkStats([backlinksRepo.get(b.id)]).free.auto_lost, 1, '统计里要数得到');

  // 再过一周还是没有：不重复算「新丢的」，标记保留
  const since = row(b.id).auto_lost_at;
  aged(b.id, 8);
  assert.equal((await run()).lost, 0);
  assert.equal(row(b.id).auto_lost_at, since);

  // 链接又回来了：标记清掉
  aged(b.id, 8); pages.delete('https://site10.example.com/post');
  await run();
  assert.equal(row(b.id).auto_status, 'found');
  assert.equal(row(b.id).auto_lost_at, null);
});

test('页面没取到不算丢（多半是对方临时拦了）；一条出问题不拖垮整批', async () => {
  const a = add(20); const b = add(21);
  await run();
  aged(a.id, 8); aged(b.id, 8);
  pages.set('https://site20.example.com/post', 'down');
  const r = await run();
  assert.equal(r.unreachable, 1); assert.equal(r.found, 1); assert.equal(r.lost, 0);
  assert.equal(row(a.id).auto_status, 'unreachable');
  assert.equal(row(a.id).auto_lost_at, null);
  // 从没找到过的，谈不上「丢」
  const c = add(22); pages.set('https://site22.example.com/post', 'gone');
  assert.equal((await run()).lost, 0);
  assert.equal(row(c.id).auto_lost_at, null);
});
