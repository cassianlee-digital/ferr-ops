// 可审计任务 · 路由层：完成门槛、关联键、重要标记、证据截图。
// 规则本身在 taskAudit.test.js 里测过；这里测的是「规则真的接到了每一条写入路径上」——
// 门槛只要漏接一条路（POST 直接建成完成 / 完成后清空结果 / 完成后删掉证据图），它就形同虚设。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-task-audit-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite'); // 必须在动态 import 之前：connection.js 在 import 期就开库

const { buildApp } = await import('../src/index.js');
const { db } = await import('../src/db/connection.js');
const app = await buildApp();

// 附件的 created_by 外键指向 users(id)；测试令牌用 id=1，库里得真有这个人（不依赖 .env 里的种子口令）
db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, name, role) VALUES (1, 'audit-test', 'x', '测试', 'boss')").run();

test.after(async () => {
  await app.close();
  db.close(); // 不关则 Windows 上临时库被占用，rmSync 报 EBUSY
  rmSync(tmpDir, { recursive: true, force: true });
});

const auth = (role) => ({ cookie: `ferr_token=${app.jwt.sign({ id: 1, username: 't', name: 't', role })}` });
const call = (method, url, role, payload) => app.inject({ method, url, headers: auth(role), payload });
const mk = async (payload, role = 'seo') => (await call('POST', '/api/loop-items', role, { kind: 'task', ...payload })).json().item;
const patch = (id, payload, role = 'seo') => call('PATCH', `/api/loop-items/${id}`, role, payload);
const DONE = { state: 'done', status: 'done' };
// 最小合法 PNG 头（魔数 + 补足 12 字节），够过服务端的文件头复验
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]).toString('base64');
const upload = (taskId) => call('POST', '/api/attachments', 'seo', { owner_type: 'task', owner_id: taskId, name: 'rank.png', dataBase64: PNG });

test('普通任务：不写完成结果勾不了完成；写了才戳完成时刻', async () => {
  const t = await mk({ dept: 'SEO', content: '改一个标题', start_date: '2026-10-10', task_date: '2026-10-10' });
  assert.equal(t.is_important, false);

  const denied = await patch(t.id, DONE);
  assert.equal(denied.statusCode, 400);
  assert.equal(denied.json().error, 'completion_incomplete');
  assert.deepEqual(denied.json().missing, ['result']);
  assert.match(denied.json().detail, /完成结果/, '失败原因要能直接给人看');

  const ok = await patch(t.id, { ...DONE, result: '标题已改为含核心词的版本并上线', actual_hours: '0.5' });
  assert.equal(ok.statusCode, 200);
  assert.ok(ok.json().item.done_at);
  assert.equal(ok.json().item.actual_hours, 0.5, '数字字符串归一成数字入库');
});

test('完成之后不能把结果清空（否则先随便填一句再删掉就绕过去了）；改别的字段不受影响', async () => {
  const t = await mk({ dept: 'SEO', content: '写一篇文章' });
  await patch(t.id, { ...DONE, result: '文章已发布' });
  assert.equal((await patch(t.id, { result: '' })).statusCode, 400);
  assert.equal((await patch(t.id, { result: '  ' })).statusCode, 400);
  assert.equal((await patch(t.id, { note: '补一句备注' })).statusCode, 200);
  assert.equal((await patch(t.id, { result: '文章已发布，并已提交收录' })).statusCode, 200);
});

test('重要任务（跨天）：有结果没证据也勾不了；补上链接才行，并回出判定理由', async () => {
  const t = await mk({ dept: 'SEM', content: '重做落地页', start_date: '2026-10-06', task_date: '2026-10-10' }, 'sem');
  assert.equal(t.is_important, true);
  assert.deepEqual(t.important_reasons, ['multi_day']);
  assert.equal(t.important_reason_text, '跨天任务');

  const denied = await patch(t.id, { ...DONE, result: '落地页已重做并上线' }, 'sem');
  assert.equal(denied.statusCode, 400);
  assert.deepEqual(denied.json().missing, ['evidence']);
  assert.deepEqual(denied.json().important_reasons, ['multi_day']);

  const ok = await patch(t.id, { ...DONE, result: '落地页已重做并上线', evidence: 'https://ferr.com/lp-new\nhttps://ferr.com/lp-new' }, 'sem');
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().item.evidence, 'https://ferr.com/lp-new', '重复链接只留一条');
  // 完成后把证据清掉同样不行
  assert.equal((await patch(t.id, { evidence: '' }, 'sem')).statusCode, 400);
});

test('证据截图也算证据；已完成的重要任务不能删掉最后一份证据', async () => {
  const t = await mk({ dept: 'SEO', content: '排名对比', important: 1 });
  assert.deepEqual(t.important_reasons, ['manual']);
  const img = await upload(t.id);
  assert.equal(img.statusCode, 201);

  const ok = await patch(t.id, { ...DONE, result: '核心词排名从 14 升到 8' });
  assert.equal(ok.statusCode, 200, '没有链接但有截图，应当放行');
  assert.equal(ok.json().item.evidence_images.length, 1);

  const del = await call('DELETE', `/api/attachments/${img.json().item.id}`, 'seo');
  assert.equal(del.statusCode, 409);
  assert.equal(del.json().error, 'last_evidence');

  // 先补一张再删旧的 → 可以（换图的正常流程）
  await upload(t.id);
  assert.equal((await call('DELETE', `/api/attachments/${img.json().item.id}`, 'seo')).statusCode, 200);
});

test('证据截图只能挂在任务上：计划/测试/不存在的条目都不行', async () => {
  const plan = (await call('POST', '/api/loop-items', 'seo', { kind: 'plan', content: '月度计划' })).json().item;
  assert.equal((await upload(plan.id)).statusCode, 404);
  assert.equal((await upload(999999)).statusCode, 404);
});

test('绕门槛的几条路都堵死：生来就完成 / 危险链接 / 传错类型', async () => {
  const born = await call('POST', '/api/loop-items', 'seo', { kind: 'task', content: 'x', status: 'done' });
  assert.equal(born.statusCode, 400);
  assert.equal(born.json().error, 'create_done_forbidden');

  const t = await mk({ dept: 'SEO', content: '任务' });
  const js = await patch(t.id, { ...DONE, result: '已完成并上线', evidence: 'javascript:alert(1)' });
  assert.equal(js.statusCode, 400);
  assert.equal(js.json().error, 'bad_evidence');
  // 对象类型的 result 必须是 400 而不是 500（门槛里的 trim 不能被它炸穿）
  assert.equal((await patch(t.id, { ...DONE, result: { a: 1 } })).statusCode, 400);
  assert.equal((await patch(t.id, { est_hours: -1 })).statusCode, 400);
  assert.equal((await patch(t.id, { est_hours: 'abc' })).statusCode, 400);
  assert.equal((await patch(t.id, { est_hours: '' })).json().item.est_hours, null, '空 = 没填');
  // 夹带白名单外的 parent_id 不能把公司任务伪装成子任务来逃证据
  const co = await mk({ dept: '公司', content: '公司派的活' }, 'boss');
  const sneak = await patch(co.id, { ...DONE, result: '已完成并上线', parent_id: 5 });
  assert.equal(sneak.statusCode, 400);
  assert.deepEqual(sneak.json().missing, ['evidence']);
});

test('不存在的条目 PATCH 回 404（以前回 200 + 空 item，前端会当成保存成功）', async () => {
  assert.equal((await patch(999999, { content: 'x' })).statusCode, 404);
});

test('撤销完成不需要理由，结果与证据保留（不是删记录，只是状态回退）', async () => {
  const t = await mk({ dept: 'SEO', content: '可撤销' });
  await patch(t.id, { ...DONE, result: '已发布上线' });
  const undo = await patch(t.id, { state: 'todo', status: '待办' });
  assert.equal(undo.statusCode, 200);
  assert.equal(undo.json().item.done_at, null);
  assert.equal(undo.json().item.result, '已发布上线');
});

test('「重要」谁都能加，只有经理/老板能摘', async () => {
  const t = await mk({ dept: 'SEO', content: '被标重要的活' });
  assert.equal((await patch(t.id, { important: 1 })).json().item.is_important, true);
  const denied = await patch(t.id, { important: null });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().error, 'important_locked');
  const cleared = await patch(t.id, { important: null }, 'manager');
  assert.equal(cleared.statusCode, 200);
  assert.equal(cleared.json().item.is_important, false);
});

test('关联键：建、读、整组替换、清空；候选只列已同步的系列', async () => {
  db.prepare(
    `INSERT INTO google_ads_campaign_daily (date, customer_id, campaign_id, campaign_name, cost_micros)
     VALUES ('2026-10-01','c1','777','Valves-EU-old', 5000000), ('2026-10-08','c1','777','Valves-EU', 9000000)`
  ).run();

  const t = await mk({
    dept: 'SEM', content: '调整阀门系列出价', project: ' 阀门 ', est_hours: 2,
    links: [{ type: 'campaign', ref: '777' }, { type: 'keyword', ref: 'Gate Valve' }, { type: 'kpi', ref: 'cost_a' }],
  }, 'sem');
  assert.equal(t.project, '阀门');
  assert.equal(t.est_hours, 2);
  assert.deepEqual(t.links, [
    { type: 'campaign', ref: '777', label: 'Valves-EU' }, // 取最近一次同步到的名字
    { type: 'keyword', ref: 'gate valve', label: null },
    { type: 'kpi', ref: 'cost_a', label: 'A 级询价成本' },
  ]);

  // 列表里也带着（卡片渲染靠它，不是只有创建那一下才有）
  const list = (await call('GET', '/api/loop-items?kind=task', 'boss')).json().items;
  assert.equal(list.find((x) => x.id === t.id).links.length, 3);

  const bad = await patch(t.id, { links: [{ type: 'campaign', ref: 'no-such' }] }, 'sem');
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.json().error, 'bad_links');
  assert.equal((await call('GET', '/api/loop-items?kind=task', 'boss')).json().items.find((x) => x.id === t.id).links.length, 3, '校验失败不能把原有关联清掉');

  const replaced = await patch(t.id, { links: [{ type: 'page', ref: 'https://ferr.com/valves' }] }, 'sem');
  assert.deepEqual(replaced.json().item.links, [{ type: 'page', ref: 'https://ferr.com/valves', label: null }]);
  // 没传 links = 不动
  assert.equal((await patch(t.id, { note: 'x' }, 'sem')).json().item.links.length, 1);
  assert.deepEqual((await patch(t.id, { links: [] }, 'sem')).json().item.links, []);

  const opts = (await call('GET', '/api/loop-items/link-options', 'seo')).json();
  assert.deepEqual(opts.campaigns, [{ id: '777', name: 'Valves-EU' }]);
  assert.ok(opts.kpis.some((k) => k.key === 'a_count'));
  assert.ok(Array.isArray(opts.pages) && Array.isArray(opts.keywords));
});

test('彻底删除任务时连同关联键与证据截图一起清掉，不留孤儿', async () => {
  const t = await mk({ dept: 'SEO', content: '要被彻删', links: [{ type: 'keyword', ref: 'orphan' }] });
  await upload(t.id);
  await call('DELETE', `/api/loop-items/${t.id}?hard=1`, 'boss');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM task_links WHERE loop_item_id=?').get(t.id).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM attachments WHERE owner_type='task' AND owner_id=?").get(t.id).n, 0);
});

test('整改排下来的任务：返回时就带着「重要 · 整改出身」，前端才知道要收证据', async () => {
  const fix = (await call('POST', '/api/fixes', 'boss', { title: '补 H1', dept: 'SEO', owner: '李', due_date: '2026-10-12' })).json().item;
  const plan = await call('POST', `/api/fixes/${fix.id}/plan`, 'seo', { start_date: '2026-10-12' });
  assert.equal(plan.json().item.is_important, true);
  assert.ok(plan.json().item.important_reasons.includes('fix'));
  const again = await call('POST', `/api/fixes/${fix.id}/plan`, 'seo');
  assert.equal(again.json().item.is_important, true, '幂等返回的那条也要带');
});

test('测试登记：没写结论不能归档；写了才行；计划不受这条限制', async () => {
  const mkRow = async (kind) => (await call('POST', '/api/loop-items', 'seo', { kind, dept: 'SEO', content: kind + ' 行' })).json().item;
  const t = await mkRow('test');
  const denied = await call('POST', `/api/loop-items/${t.id}/archive`, 'seo', { archive_kind: 'seo' });
  assert.equal(denied.statusCode, 400);
  assert.equal(denied.json().error, 'conclusion_required');
  assert.match(denied.json().detail, /结论/);
  await call('PATCH', `/api/loop-items/${t.id}`, 'seo', { conclusion: '   ' });
  assert.equal((await call('POST', `/api/loop-items/${t.id}/archive`, 'seo', {})).statusCode, 400, '只有空格不算结论');
  await call('PATCH', `/api/loop-items/${t.id}`, 'seo', { conclusion: 'B 版标题点击率高 18%，全量切换' });
  const ok = await call('POST', `/api/loop-items/${t.id}/archive`, 'seo', { archive_kind: 'seo' });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().item.state, 'archived');
  assert.equal((await call('POST', `/api/loop-items/${t.id}/archive`, 'seo', {})).statusCode, 200, '已归档的再归档仍是幂等的');
  const plan = await mkRow('plan');
  assert.equal((await call('POST', `/api/loop-items/${plan.id}/archive`, 'seo', {})).statusCode, 200);
});
