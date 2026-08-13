// 路由层冒烟测试。
// 存在理由：审计发现 27 个路由文件、123 个 API 路由**零覆盖** —— 原有 7 个测试文件全是纯函数
// （derive/kpi/attribution/dateRange/documentParser/memoryPolicy/updateHelper），而纯函数恰恰是
// 最不会坏的部分；真正会在生产炸的（路由接线、鉴权、错误处理）一张网都没有。
//
// 隔离：connection.js 在 **import 期**就打开 config.dbFile，所以 DB_FILE 必须在动态 import 之前设好，
// 否则冒烟测试会写进真实开发库 data/ferr.sqlite。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-routes-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite');

const { buildApp } = await import('../src/index.js');

// onRoute 只对其后注册的路由生效，故由 buildApp 在内部转交（测试无法从外部补挂）。
const registered = [];
const app = await buildApp({ onRoute: (r) => registered.push({ method: r.method, url: r.url }) });

test.after(async () => {
  await app.close();
  // app.close() 只关 Fastify，不关 better-sqlite3 —— 那是 connection.js 的模块单例，
  // 不显式 close 则 Windows 上临时库文件仍被占用，rmSync 报 EBUSY。
  const { db } = await import('../src/db/connection.js');
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const token = (role) => app.jwt.sign({ id: 1, username: 't', name: 't', role });
const auth = (role) => ({ cookie: `ferr_token=${token(role)}` });

// 无需登录的公开端点。**新增公开端点必须在此显式登记**，否则下面的测试会红 —— 这正是本测试的意义：
// 让「不小心漏挂 preHandler 的新路由」变成一条失败的测试，而不是一个上线后才发现的洞。
const PUBLIC = new Set(['GET /api/health', 'POST /api/login', 'POST /api/logout']);

// 展开 onRoute 收到的路由（method 可能是数组），只取 API，丢掉 HEAD（Fastify 为 GET 自动生成）。
function apiRoutes() {
  const out = [];
  for (const r of registered) {
    for (const m of [].concat(r.method)) {
      if (m === 'HEAD' || m === 'OPTIONS') continue;
      if (!r.url.startsWith('/api/')) continue;
      out.push({ method: m, url: r.url });
    }
  }
  return out;
}

// :id / :provider 这类参数填占位值，让请求真正打到 handler 前的鉴权链上。
const concrete = (url) => url.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '1');

test('路由表非空且规模合理（守住「测试其实没跑到路由」的假绿）', () => {
  const api = apiRoutes();
  assert.ok(api.length > 100, `API 路由只有 ${api.length} 条，疑似没注册全`);
});

test('每个 API 路由都必须鉴权：无令牌一律 401（公开端点须显式登记）', async () => {
  const leaks = [];
  for (const { method, url } of apiRoutes()) {
    const key = `${method} ${url}`;
    if (PUBLIC.has(key)) continue;
    const res = await app.inject({
      method,
      url: concrete(url),
      payload: method === 'GET' || method === 'DELETE' ? undefined : {},
    });
    if (res.statusCode !== 401) leaks.push(`${key} -> ${res.statusCode}`);
  }
  assert.deepEqual(leaks, [], `以下路由无令牌也能进（漏挂 preHandler？）：\n${leaks.join('\n')}`);
});

test('公开端点确实公开（否则说明 PUBLIC 名单已过期）', async () => {
  for (const key of PUBLIC) {
    const [method, url] = key.split(' ');
    const res = await app.inject({ method, url, payload: method === 'GET' ? undefined : {} });
    assert.notEqual(res.statusCode, 401, `${key} 已改为需鉴权，请更新 PUBLIC 名单`);
  }
});

test('权限分档在真实路由上生效：KPI 目标仅 manager/boss', async () => {
  const put = (role) => app.inject({
    method: 'PUT', url: '/api/kpi-targets', headers: auth(role), payload: { updates: [] },
  });
  for (const role of ['seo', 'sem']) {
    assert.equal((await put(role)).statusCode, 403, `${role} 不该能改 KPI 目标`);
  }
  for (const role of ['manager', 'boss']) {
    assert.notEqual((await put(role)).statusCode, 403, `${role} 应能改 KPI 目标`);
  }
});

test('业务数据编辑：四个角色都放行（editor 档）', async () => {
  for (const role of ['seo', 'sem', 'manager', 'boss']) {
    const res = await app.inject({
      method: 'POST', url: '/api/fixes', headers: auth(role), payload: { title: `smoke-${role}` },
    });
    assert.equal(res.statusCode, 201, `${role} 应能新建整改项`);
  }
});

test('整改 CRUD 走通（建→改→读→软删），并验类型闸门在真实路由上生效', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/fixes', headers: auth('boss'),
    payload: { title: 'smoke-crud', due_date: '2026-07-20' },
  });
  assert.equal(created.statusCode, 201);
  const id = created.json().item.id;

  const patched = await app.inject({
    method: 'PATCH', url: `/api/fixes/${id}`, headers: auth('boss'),
    payload: { status: 'done', due_date: '2026-09-01' },
  });
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.json().item.due_date, '2026-09-01');

  // 类型闸门（updateHelper）：脏数据必须 400，且原值不被污染
  const dirty = await app.inject({
    method: 'PATCH', url: `/api/fixes/${id}`, headers: auth('boss'), payload: { due_date: 99999999 },
  });
  assert.equal(dirty.statusCode, 400);
  assert.equal(dirty.json().error, 'bad_request');

  const list = await app.inject({ method: 'GET', url: '/api/fixes', headers: auth('boss') });
  assert.equal(list.statusCode, 200);
  const row = list.json().items.find((x) => x.id === id);
  assert.equal(row.due_date, '2026-09-01', '脏数据被拦下后，原值必须保持不变');

  const del = await app.inject({ method: 'DELETE', url: `/api/fixes/${id}`, headers: auth('boss') });
  assert.equal(del.statusCode, 200);
});

// 跨天任务：start_date 是新加的列，POST/PATCH 两条路都得放行——任一处漏白名单，
// 前端能存进去、刷新后却丢日期，而且不报错，只能靠这条测试挡。
test('任务的 start_date 建、改、读一路通（跨天任务的开始日不能在任何一层被吞掉）', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/loop-items', headers: auth('boss'),
    payload: { kind: 'task', dept: 'SEO', content: '优化文章', start_date: '2026-08-13', task_date: '2026-08-20' },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().item.start_date, '2026-08-13');
  const id = created.json().item.id;

  const patched = await app.inject({
    method: 'PATCH', url: `/api/loop-items/${id}`, headers: auth('boss'), payload: { start_date: '2026-08-14' },
  });
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.json().item.start_date, '2026-08-14');

  const list = await app.inject({ method: 'GET', url: '/api/loop-items?kind=task', headers: auth('boss') });
  assert.equal(list.json().items.find((x) => x.id === id).start_date, '2026-08-14');
});

test('只给最少字段也能建任务（INSERT 具名参数由仓储补全，调用方不必跟着新列改）', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/loop-items', headers: auth('boss'), payload: { kind: 'task', content: '仅内容' },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().item.start_date, null);
});

test('未知 /api 路径回 404 JSON，而不是把前端 index.html 当 API 响应吐回来', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/nope-not-a-route' });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, 'not_found');
});
