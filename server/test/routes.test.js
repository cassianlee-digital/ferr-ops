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

test('风险清单对所有登录角色只读可见，且不返回服务器密钥值', async () => {
  for (const role of ['seo', 'sem', 'manager', 'boss']) {
    const res = await app.inject({ method: 'GET', url: '/api/risks', headers: auth(role) });
    assert.equal(res.statusCode, 200, `${role} 应可读取风险清单`);
    const body = res.json();
    assert.ok(Array.isArray(body.items));
    assert.ok(body.items.every((item) => item.severity && item.owner && item.updatedAt && item.nextAction));
    assert.doesNotMatch(res.body, /OPENROUTER_API_KEY|ANTHROPIC_API_KEY|GOOGLE_OAUTH_CLIENT_SECRET/);
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

test('系统密钥和公司级 Hermes 记忆仅 manager/boss 可写', async () => {
  for (const role of ['seo', 'sem']) {
    const settings = await app.inject({
      method: 'PUT', url: '/api/settings/integrations', headers: auth(role),
      payload: { provider: 'invalid', secret: 'not-written' },
    });
    assert.equal(settings.statusCode, 403, `${role} 不得修改全局第三方密钥`);

    const memoryWrites = [
      { method: 'POST', url: '/api/hermes/memories', payload: { title: '越权记忆', content: '不得写入' } },
      { method: 'PATCH', url: '/api/hermes/memories/1', payload: { content: '不得修改' } },
      { method: 'DELETE', url: '/api/hermes/memories/1' },
      { method: 'POST', url: '/api/hermes/memories/daily-learning', payload: {} },
      { method: 'POST', url: '/api/hermes/conversations/999/learn', payload: {} },
      { method: 'POST', url: '/api/hermes/conversations/999/feedback', payload: { result: 'wrong' } },
    ];
    for (const item of memoryWrites) {
      const res = await app.inject({ ...item, headers: auth(role) });
      assert.equal(res.statusCode, 403, `${role} 不得通过 ${item.method} ${item.url} 写公司级记忆`);
    }
  }

  for (const role of ['manager', 'boss']) {
    const settings = await app.inject({
      method: 'PUT', url: '/api/settings/integrations', headers: auth(role),
      payload: { provider: 'invalid', secret: 'not-written' },
    });
    assert.equal(settings.statusCode, 400, `${role} 应通过权限检查并进入参数校验`);

    const memory = await app.inject({
      method: 'POST', url: '/api/hermes/memories', headers: auth(role),
      payload: { title: `权限测试-${role}`, content: '仅管理角色可写' },
    });
    assert.equal(memory.statusCode, 201, `${role} 应可维护公司级 Hermes 记忆`);
  }
});

test('登录接口按 IP 和用户名限流', async () => {
  const attempt = () => app.inject({
    method: 'POST', url: '/api/login',
    payload: { username: 'rate-limit-regression', password: 'wrong-password' },
  });
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await attempt()).statusCode, 401);
  }
  const blocked = await attempt();
  assert.equal(blocked.statusCode, 429);
});

test('改密码拒绝少于 12 位的新密码', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/change-password', headers: auth('boss'),
    payload: { oldPassword: 'old-password', newPassword: 'short123' },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'invalid_input');
});

test('询盘录入落库新字段（客户编码/公司/业务员/是否成交），公司与是否成交只认合法值', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/inquiries', headers: auth('boss'),
    payload: { date: '2026-08-24', country: '德国', region: '西欧', channel: 'SEO自然',
      source: 'ductile iron casting', product: '铸造', grade: 'A',
      customer_code: 'DE-2026-018', company: '费尔瑞', salesperson: '张伟', deal_status: '已成交' },
  });
  assert.equal(created.statusCode, 201);
  const item = created.json().item;
  assert.equal(item.customer_code, 'DE-2026-018');
  assert.equal(item.company, '费尔瑞');
  assert.equal(item.salesperson, '张伟');
  assert.equal(item.deal_status, '已成交');

  // 不传是否成交 → 默认「未成交」，不留 NULL 让前端猜
  const bare = await app.inject({
    method: 'POST', url: '/api/inquiries', headers: auth('boss'),
    payload: { date: '2026-08-24', country: '法国', grade: 'B' },
  });
  assert.equal(bare.json().item.deal_status, '未成交');
  // 公司相反：没选就留 NULL，不替业务归属到某一家
  assert.equal(bare.json().item.company, null);

  // 表格里改：编码/业务员可改，是否成交只认两个值
  const patched = await app.inject({
    method: 'PATCH', url: `/api/inquiries/${item.id}`, headers: auth('boss'),
    payload: { customer_code: 'DE-2026-019', company: '贝孚特', salesperson: 'Amy', deal_status: '未成交' },
  });
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.json().item.customer_code, 'DE-2026-019');
  assert.equal(patched.json().item.deal_status, '未成交');
  assert.equal(patched.json().item.company, '贝孚特');

  const dirty = await app.inject({
    method: 'PATCH', url: `/api/inquiries/${item.id}`, headers: auth('boss'), payload: { deal_status: '差不多成了' },
  });
  assert.equal(dirty.statusCode, 400);
  assert.equal(dirty.json().error, 'invalid_deal_status');

  const dirtyCompany = await app.inject({
    method: 'PATCH', url: `/api/inquiries/${item.id}`, headers: auth('boss'), payload: { company: '别的公司' },
  });
  assert.equal(dirtyCompany.statusCode, 400);
  assert.equal(dirtyCompany.json().error, 'invalid_company');
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

// 推进打卡：跨天任务的问责证据。幂等、可撤销、不给不存在的任务留孤儿记录。
test('跨天任务推进打卡：打→汇总→重复打不加天→撤销', async () => {
  const task = await app.inject({
    method: 'POST', url: '/api/loop-items', headers: auth('boss'),
    payload: { kind: 'task', dept: 'SEM', content: '跨天任务', start_date: '2026-08-10', task_date: '2026-08-20' },
  });
  const id = task.json().item.id;

  const mark = await app.inject({
    method: 'POST', url: '/api/task-checkins', headers: auth('sem'),
    payload: { loop_item_id: id, day_key: '2026-08-13', note: '写了两段' },
  });
  assert.equal(mark.statusCode, 201);
  assert.equal(mark.json().item.note, '写了两段');

  // 同一天再打一次：幂等，天数不涨
  await app.inject({
    method: 'POST', url: '/api/task-checkins', headers: auth('sem'),
    payload: { loop_item_id: id, day_key: '2026-08-13' },
  });
  await app.inject({
    method: 'POST', url: '/api/task-checkins', headers: auth('sem'),
    payload: { loop_item_id: id, day_key: '2026-08-14' },
  });
  const sum = await app.inject({ method: 'GET', url: '/api/task-checkins/summary?day=2026-08-14', headers: auth('boss') });
  const row = sum.json().items.find((x) => x.loop_item_id === id);
  assert.equal(row.days, 2, '两天两条，重复打不重复计');
  assert.equal(row.last_day, '2026-08-14');
  assert.equal(row.today_done, 1);

  const del = await app.inject({
    method: 'DELETE', url: `/api/task-checkins/${id}?day_key=2026-08-14`, headers: auth('sem'),
  });
  assert.equal(del.statusCode, 200);
  const sum2 = await app.inject({ method: 'GET', url: '/api/task-checkins/summary?day=2026-08-14', headers: auth('boss') });
  assert.equal(sum2.json().items.find((x) => x.loop_item_id === id).days, 1);
});

test('打卡拒绝脏输入：日期格式不对 / 任务不存在', async () => {
  const bad = await app.inject({
    method: 'POST', url: '/api/task-checkins', headers: auth('boss'),
    payload: { loop_item_id: 1, day_key: '2026/08/13' },
  });
  assert.equal(bad.statusCode, 400);
  const ghost = await app.inject({
    method: 'POST', url: '/api/task-checkins', headers: auth('boss'),
    payload: { loop_item_id: 999999, day_key: '2026-08-13' },
  });
  assert.equal(ghost.statusCode, 404, '不存在的任务不能留下孤儿打卡');
});

// 诊断→整改→日计划→回写：整条闭环的最后一环。断在任何一节，整改清单和日计划就又是两套各写各的表。
test('整改排进日计划：幂等、带出身、把整改推到进行中', async () => {
  const fix = await app.inject({
    method: 'POST', url: '/api/fixes', headers: auth('boss'),
    payload: { title: '补齐落地页 H1', dept: 'SEO', owner: '李', due_date: '2026-08-20', status: '计划下周' },
  });
  const fixId = fix.json().item.id;

  const plan = await app.inject({ method: 'POST', url: `/api/fixes/${fixId}/plan`, headers: auth('seo'), payload: { start_date: '2026-08-13' } });
  assert.equal(plan.statusCode, 201);
  const task = plan.json().item;
  assert.equal(task.fix_id, fixId, '任务必须带着出身，否则回写无从谈起');
  assert.equal(task.content, '补齐落地页 H1');
  assert.equal(task.owner, '李');
  assert.equal(task.task_date, '2026-08-20', '整改的截止日就是任务的截止日');
  assert.equal(plan.json().fix.status, '进行中', '排进日计划 = 已开工');

  // 幂等：再排一次不该多出一条任务
  const again = await app.inject({ method: 'POST', url: `/api/fixes/${fixId}/plan`, headers: auth('seo') });
  assert.equal(again.json().existed, true);
  assert.equal(again.json().item.id, task.id);

  // 列表带排期状态
  const list = await app.inject({ method: 'GET', url: '/api/fixes', headers: auth('boss') });
  const row = list.json().items.find((f) => f.id === fixId);
  assert.equal(row.planned_task_id, task.id);
  assert.equal(row.planned_done, false);

  // 回写：勾完 → 已改；撤销 → 进行中
  await app.inject({ method: 'PATCH', url: `/api/loop-items/${task.id}`, headers: auth('seo'), payload: { state: 'done', status: 'done' } });
  let cur = await app.inject({ method: 'GET', url: '/api/fixes', headers: auth('boss') });
  assert.equal(cur.json().items.find((f) => f.id === fixId).status, '已改');
  assert.equal(cur.json().items.find((f) => f.id === fixId).planned_done, true);

  await app.inject({ method: 'PATCH', url: `/api/loop-items/${task.id}`, headers: auth('seo'), payload: { state: 'todo', status: '待办' } });
  cur = await app.inject({ method: 'GET', url: '/api/fixes', headers: auth('boss') });
  assert.equal(cur.json().items.find((f) => f.id === fixId).status, '进行中', '撤销完成必须把整改状态也退回去');
});

test('放弃的整改不被任务状态牵着走；归档的整改不能再排', async () => {
  const fix = await app.inject({
    method: 'POST', url: '/api/fixes', headers: auth('boss'), payload: { title: '不打算做的事', dept: 'SEM', status: '放弃' },
  });
  const fixId = fix.json().item.id;
  const task = (await app.inject({ method: 'POST', url: `/api/fixes/${fixId}/plan`, headers: auth('boss') })).json().item;
  await app.inject({ method: 'PATCH', url: `/api/loop-items/${task.id}`, headers: auth('boss'), payload: { state: 'done', status: 'done' } });
  const list = await app.inject({ method: 'GET', url: '/api/fixes', headers: auth('boss') });
  assert.equal(list.json().items.find((f) => f.id === fixId).status, '放弃', '放弃是人的决定，不该被勾选覆盖');

  await app.inject({ method: 'POST', url: `/api/fixes/${fixId}/archive`, headers: auth('boss'), payload: {} });
  const denied = await app.inject({ method: 'POST', url: `/api/fixes/${fixId}/plan`, headers: auth('boss') });
  assert.equal(denied.statusCode, 409);
});

// 日计划回放：那天在盘子里的任务 + 那天的打卡 + 完成时刻。
// 没有 done_at 就答不了"那天完成了什么"，所以完成时刻必须在 PATCH 时被戳上。
test('日计划回放：跨天任务的每一天都在、当天完成的算数、完成时刻被记下', async () => {
  const mk = (payload) => app.inject({ method: 'POST', url: '/api/loop-items', headers: auth('boss'), payload: { kind: 'task', ...payload } });
  const span = (await mk({ dept: 'SEO', content: '跨天的活', start_date: '2026-08-10', task_date: '2026-08-14' })).json().item;
  const oneDay = (await mk({ dept: 'SEO', content: '只在 08-12 那天', start_date: '2026-08-12', task_date: '2026-08-12' })).json().item;

  // 勾完 → done_at 被戳上
  const done = await app.inject({
    method: 'PATCH', url: `/api/loop-items/${oneDay.id}`, headers: auth('seo'), payload: { state: 'done', status: 'done' },
  });
  assert.ok(done.json().item.done_at, '完成必须留下时刻，否则回放答不出"那天完成了什么"');

  await app.inject({
    method: 'POST', url: '/api/task-checkins', headers: auth('seo'),
    payload: { loop_item_id: span.id, day_key: '2026-08-12', note: '写了两段' },
  });

  const d12 = await app.inject({ method: 'GET', url: '/api/daily-plan?day=2026-08-12', headers: auth('boss') });
  assert.equal(d12.statusCode, 200);
  const ids12 = d12.json().tasks.map((t) => t.id);
  assert.ok(ids12.includes(span.id), '跨天任务的中间那天也该在盘子里');
  assert.ok(ids12.includes(oneDay.id));
  assert.equal(d12.json().checkins.filter((c) => c.loop_item_id === span.id)[0].note, '写了两段');

  // 区间外的日子：跨天任务不该出现
  const d09 = await app.inject({ method: 'GET', url: '/api/daily-plan?day=2026-08-09', headers: auth('boss') });
  assert.ok(!d09.json().tasks.map((t) => t.id).includes(span.id), '开始日之前不该算它在盘子里');

  // 撤销完成 → done_at 清掉，不留假记录
  await app.inject({ method: 'PATCH', url: `/api/loop-items/${oneDay.id}`, headers: auth('seo'), payload: { state: 'todo', status: '待办' } });
  const after = await app.inject({ method: 'GET', url: '/api/daily-plan?day=2026-08-12', headers: auth('boss') });
  assert.equal(after.json().tasks.find((t) => t.id === oneDay.id).done_at, null);
});

test('回放要日期，且格式必须对（脏参数不能悄悄回空盘子）', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/api/daily-plan', headers: auth('boss') })).statusCode, 400);
  assert.equal((await app.inject({ method: 'GET', url: '/api/daily-plan?day=2026/08/12', headers: auth('boss') })).statusCode, 400);
});

// SOP 执行率：分母必须诚实——未来的日子、SOP 创建之前的日子，都不算漏。
test('SOP 执行率：分母按创建日起算、只算到今天，漏的日子逐条列出', async () => {
  const def = await app.inject({
    method: 'POST', url: '/api/sop', headers: auth('boss'),
    payload: { dept: 'SEO', freq: 'daily', title: '每日观测数据' },
  });
  const sopId = def.json().item.id;
  const week = { from: '2026-08-10', to: '2026-08-16' }; // 周一~周日

  // 只打了两天的卡
  for (const day of ['2026-08-10', '2026-08-12']) {
    await app.inject({
      method: 'POST', url: '/api/sop/completions', headers: auth('seo'),
      payload: { sop_id: sopId, period_key: day },
    });
  }
  // completed_at 由服务器写「现在」，测试里改成那两天，才能验区间统计
  const { db } = await import('../src/db/connection.js');
  db.prepare("UPDATE sop_completions SET completed_at = period_key || ' 09:00:00' WHERE sop_id = ?").run(sopId);
  db.prepare("UPDATE sop_definitions SET created_at = '2026-08-01 09:00:00' WHERE id = ?").run(sopId);

  // today=08-13 → 分母只到 13 号（4 天），后面 3 天还没到，不算漏
  const res = await app.inject({ method: 'GET', url: `/api/sop/stats?from=${week.from}&to=${week.to}&today=2026-08-13`, headers: auth('boss') });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().counted_to, '2026-08-13');
  const row = res.json().items.find((i) => i.id === sopId);
  assert.equal(row.expected, 4, '未来的日子不该进分母');
  assert.equal(row.done, 2);
  assert.deepEqual(row.missed_days, ['2026-08-11', '2026-08-13']);

  // 创建日晚于区间起点 → 之前的日子不是它漏的
  db.prepare("UPDATE sop_definitions SET created_at = '2026-08-12 09:00:00' WHERE id = ?").run(sopId);
  const later = await app.inject({ method: 'GET', url: `/api/sop/stats?from=${week.from}&to=${week.to}&today=2026-08-13`, headers: auth('boss') });
  assert.equal(later.json().items.find((i) => i.id === sopId).expected, 2, 'SOP 建之前的日子不算漏');
});

test('SOP 执行率要区间，脏参数回 400 而不是悄悄回空', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/api/sop/stats', headers: auth('boss') })).statusCode, 400);
  assert.equal((await app.inject({ method: 'GET', url: '/api/sop/stats?from=x&to=y', headers: auth('boss') })).statusCode, 400);
});

test('Hermes 真实路由发送的是完整且受预算约束的 JSON 上下文', async () => {
  const originalFetch = globalThis.fetch;
  let contextText = '';
  let promptText = '';
  globalThis.fetch = async (_url, init) => {
    const requestBody = JSON.parse(init.body);
    const prompt = String(requestBody.messages?.[1]?.content || '');
    promptText = prompt;
    const startMarker = '[Hermes 上下文]\n';
    const start = prompt.indexOf(startMarker) + startMarker.length;
    const end = prompt.indexOf('[用户问题]', start);
    contextText = prompt.slice(start, end).trim();
    return new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: {
          content: '<hermes_basis>本次仅验证上下文结构。</hermes_basis><hermes_answer>上下文结构有效。</hermes_answer>',
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/hermes/chat',
      headers: auth('boss'),
      payload: { message: '检查 Hermes 上下文结构', skill: 'auto', workflow: 'answer' },
    });
    assert.equal(response.statusCode, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(contextText.length > 0);
  assert.ok(contextText.length <= 26_000);
  const context = JSON.parse(contextText);
  assert.equal(context.contextBudget.maxChars, 26_000);
  assert.ok(context.contextBudget.evidenceIncluded <= context.contextBudget.evidenceAvailable);
  assert.ok((context.evidencePack || []).every((item) => !Object.hasOwn(item, 'detail')));
  assert.match(promptText, /\[本轮可引用证据\]/);
  assert.match(promptText, /EV-[a-z0-9-]+:/i);
});

test('Hermes 对完全未引用证据的快速回答只做一次有界纠偏，并采用更可信版本', async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async (_url, init) => {
    attempts += 1;
    const requestBody = JSON.parse(init.body);
    const prompt = String(requestBody.messages?.[1]?.content || '');
    const evidenceId = (prompt.match(/EV-[a-z0-9-]+/i) || [])[0];
    assert.ok(evidenceId, '纠偏请求必须携带可引用证据编号');
    const content = attempts === 1
      ? '<hermes_basis>当前数据需要核验。</hermes_basis><hermes_answer>SEO 数据存在问题，建议立即检查。</hermes_answer>'
      : `<hermes_basis>引用 [${evidenceId}]。</hermes_basis><hermes_answer>待验证：请先核对该证据对应的数据口径 [${evidenceId}]。</hermes_answer>`;
    return new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/hermes/chat',
      headers: auth('boss'),
      payload: { message: '根据后台数据检查 SEO 问题', skill: 'seo_diagnosis', workflow: 'diagnose_to_action' },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.hermes.answerQualityRepair.attempted, true);
    assert.equal(body.hermes.answerQualityRepair.used, true);
    assert.ok(body.hermes.evidenceAudit.evidence.length > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(attempts, 2);
});

test('仪表盘 AI 的无证据结论会降级并禁止采纳、沉淀和拆动作', async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: {
          content: '<hermes_basis>根据当前数据。</hermes_basis><hermes_answer>SEM 实际 CTR 为 0，说明广告没有效果，应立即暂停全部广告。</hermes_answer>',
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  let item;
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ai/analyze',
      headers: auth('boss'),
      payload: {
        scope_key: 'test:verified-dashboard-ai', scope_type: 'data-sem', title: 'SEM 检查',
        prompt: '根据后台真实数据判断是否要暂停广告', context: { page: { tab: 'data-sem' } }, force: true,
      },
    });
    assert.equal(response.statusCode, 200);
    item = response.json().item;
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(attempts, 2);
  assert.equal(item.quality.confidenceAssessment.level, 'low');
  assert.match(item.result_text, /待验证/);

  for (const action of ['adopted', 'deposited']) {
    const response = await app.inject({
      method: 'POST', url: `/api/ai/analyses/${item.id}/action`, headers: auth('boss'), payload: { action },
    });
    assert.equal(response.statusCode, 409);
  }
  const split = await app.inject({
    method: 'POST', url: `/api/ai/analyses/${item.id}/actions`, headers: auth('boss'), payload: {},
  });
  assert.equal(split.statusCode, 200);
  assert.equal(split.json().blocked, true);
  assert.deepEqual(split.json().actions, []);
});

test('未知 /api 路径回 404 JSON，而不是把前端 index.html 当 API 响应吐回来', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/nope-not-a-route' });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, 'not_found');
});

test('HTML、静态资源和 API 响应都携带严格脚本 CSP', async () => {
  for (const url of ['/', '/login.html', '/login.js', '/api/health']) {
    const res = await app.inject({ method: 'GET', url });
    const policy = res.headers['content-security-policy'];
    assert.match(policy, /(?:^|; )script-src 'self'(?:;|$)/, `${url} 未限制脚本来源`);
    assert.match(policy, /(?:^|; )script-src-attr 'none'(?:;|$)/, `${url} 未禁用内联事件脚本`);
    assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/, `${url} 仍允许内联脚本`);
    assert.match(policy, /(?:^|; )style-src 'self'(?:;|$)/, `${url} 未限制样式来源`);
    assert.match(policy, /(?:^|; )style-src-attr 'none'(?:;|$)/, `${url} 未禁用内联 style 属性`);
    assert.doesNotMatch(policy, /style-src[^;]*'unsafe-inline'/, `${url} 仍允许内联样式`);
    assert.match(policy, /(?:^|; )object-src 'none'(?:;|$)/, `${url} 未禁用 object 插件内容`);
    assert.match(policy, /(?:^|; )frame-ancestors 'none'(?:;|$)/, `${url} 未阻止页面被嵌入`);
  }
});

test('静态文件服务不允许编码路径穿越读取后端文件', async () => {
  for (const url of ['/%2e%2e/server/package.json', '/..%2fserver/package.json', '/%2e%2e%5cserver%5cpackage.json']) {
    const res = await app.inject({ method: 'GET', url });
    assert.doesNotMatch(res.body, /"name"\s*:\s*"ferr-ops-server"/, `${url} 泄漏了后端 package.json`);
  }
});
