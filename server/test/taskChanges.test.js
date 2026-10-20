// 任务的改动留痕与日期校验。
// 询盘改渠道 / 等级早就留痕，任务却没有：完成之后还能改标题、把截止日往后挪、把跨天任务改成单日来躲
// 「重要任务要证据」，系统里一点痕迹都不剩；截止日随便写成 10/12，这条任务就从所有时间区间里消失。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importance, taskChanges } from '../src/services/taskAudit.js';
import { taskFlags } from '../src/services/auditRules.js';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-task-changes-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite'); // 必须在动态 import 之前：connection.js 在 import 期就开库

const { buildApp } = await import('../src/index.js');
const { db } = await import('../src/db/connection.js');
const app = await buildApp();
db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, name, role) VALUES (1, 'chg-test', 'x', '测试', 'boss')").run();

test.after(async () => {
  await app.close();
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const auth = (role) => ({ cookie: `ferr_token=${app.jwt.sign({ id: 1, username: 't', name: 't', role })}` });
const call = (method, url, role, payload) => app.inject({ method, url, headers: auth(role), payload });
const mk = async (payload, role = 'seo') => {
  const r = await call('POST', '/api/loop-items', role, { kind: 'task', dept: 'SEO', content: '任务', ...payload });
  assert.equal(r.statusCode, 201, r.body);
  return r.json().item;
};
const patch = (id, payload, role = 'seo') => call('PATCH', `/api/loop-items/${id}`, role, payload);
const log = (id) => db.prepare('SELECT field, old_value, new_value FROM loop_item_changes WHERE loop_item_id = ? ORDER BY id').all(id);
const DONE = { state: 'done', status: 'done' };

/* ---------- 规则（纯函数） ---------- */

test('哪些算改动：内容 / 负责人 / 起止日 / 工时算；完成时第一次填结果不算，之后再改才算', () => {
  const cur = { content: '写文章', owner: '李', start_date: '2026-10-05', task_date: '2026-10-05', est_hours: 2, result: null, evidence: null, state: null, status: '待办' };
  assert.deepEqual(taskChanges(cur, { ...cur }), [], '什么都没变');
  assert.deepEqual(taskChanges(cur, { ...cur, note: '备注改了', task_hour: '下午' }), [], '备注、时段不记：记得太多，真正要看的就被淹了');
  assert.deepEqual(taskChanges(cur, { ...cur, content: '写两篇文章', task_date: '2026-10-09' }), [
    { field: 'content', old_value: '写文章', new_value: '写两篇文章' },
    { field: 'task_date', old_value: '2026-10-05', new_value: '2026-10-09' },
  ]);
  // 完成：结果 / 证据 / 实际用时从空到有是「完成」这个动作本身，只记一条完成状态
  const done = { ...cur, state: 'done', status: 'done', result: '已发布', evidence: 'https://a.com/x', actual_hours: 3 };
  assert.deepEqual(taskChanges(cur, done), [{ field: 'done', old_value: '0', new_value: '1' }]);
  // 完成之后再改结果：记
  assert.deepEqual(taskChanges(done, { ...done, result: '已发布并收录' }), [{ field: 'result', old_value: '已发布', new_value: '已发布并收录' }]);
  // 预估工时事后才填也要记（它不是完成时填的东西）
  assert.deepEqual(taskChanges({ ...cur, est_hours: null }, cur), [{ field: 'est_hours', old_value: null, new_value: '2' }]);
  // 撤销完成：记（done_at 会被清掉，不记就查不到「完成过又撤销」）
  assert.deepEqual(taskChanges(done, { ...done, state: null, status: '待办' }), [{ field: 'done', old_value: '1', new_value: '0' }]);
  // 数字和字符串写法不同但值相同：不算改
  assert.deepEqual(taskChanges(cur, { ...cur, est_hours: '2' }), []);
});

test('跨天改单日：多记一个记号；它让任务继续算重要', () => {
  const multi = { start_date: '2026-10-05', task_date: '2026-10-09' };
  const fields = (a, b) => taskChanges(a, b).map((c) => c.field);
  assert.deepEqual(fields(multi, { ...multi, start_date: '2026-10-09' }), ['start_date', 'multi_day']);
  assert.deepEqual(fields(multi, { ...multi, task_date: '2026-10-12' }), ['task_date'], '仍然跨天：只是改了日期');
  assert.deepEqual(fields({ start_date: '2026-10-05', task_date: '2026-10-05' }, multi), ['task_date'], '单日改跨天不需要记号');
  const single = { start_date: '2026-10-09', task_date: '2026-10-09' };
  assert.deepEqual(importance(single), { important: false, reasons: [] });
  assert.deepEqual(importance(single, { wasMultiDay: true }).reasons, ['was_multi_day']);
  assert.deepEqual(importance(multi, { wasMultiDay: true }).reasons, ['multi_day'], '现在就是跨天的，不重复列原因');
});

test('周度审核的三条疑点：截止日往后挪、跨天改单日、完成之后又改', () => {
  const item = { task_date: '2026-10-10', done_at: '2026-10-08 03:00:00', result: '好了好了', est_hours: 1, actual_hours: 1 };
  const flags = (changes, it = item) => taskFlags(it, { state: 'completed', links: [{ type: 'page', ref: 'x' }], changes });
  assert.deepEqual(flags([]), []);
  assert.deepEqual(flags([{ field: 'task_date', old_value: '2026-10-07', new_value: '2026-10-10', changed_at: '2026-10-07 01:00:00' }]), ['DUE_MOVED']);
  assert.deepEqual(flags([{ field: 'task_date', old_value: '2026-10-12', new_value: '2026-10-10', changed_at: '2026-10-07 01:00:00' }]), [], '往前提不算');
  assert.deepEqual(flags([{ field: 'multi_day', old_value: '1', new_value: '0', changed_at: '2026-10-07 01:00:00' }]), ['SHORTENED']);
  assert.deepEqual(flags([{ field: 'result', old_value: '好了', new_value: '好了好了', changed_at: '2026-10-09 01:00:00' }]), ['EDITED_AFTER_DONE']);
  assert.deepEqual(flags([{ field: 'content', old_value: 'a', new_value: 'b', changed_at: '2026-10-08 03:00:00' }]), [], '完成那一下自己带的改动不算事后改');
  assert.deepEqual(flags([{ field: 'owner', old_value: '李', new_value: '陈', changed_at: '2026-10-09 01:00:00' }]), [], '换负责人不算改内容');
  // 没完成的任务也看前两条
  assert.deepEqual(taskFlags({ task_date: '2026-10-10', est_hours: 1 }, { state: 'in_progress', changes: [{ field: 'task_date', old_value: '2026-10-07', new_value: '2026-10-10', changed_at: 'x' }] }), ['DUE_MOVED']);
});

/* ---------- 接到写入路径上 ---------- */

test('路由：改动进流水，带出是谁改的；列表上有「改 N」；被拒的请求不留痕', async () => {
  // 不填开始日：下面把截止日往后挪一天时，它不会因此变成跨天的重要任务（那是另一条测试的事）
  const t = await mk({ content: '写一篇文章', task_date: '2026-10-05', est_hours: 2 });
  assert.equal(t.change_count, 0);
  assert.deepEqual(log(t.id), [], '新建不算改动');

  assert.equal((await patch(t.id, { content: '写两篇文章', task_date: '2026-10-06', note: '顺便改了备注' })).statusCode, 200);
  assert.deepEqual(log(t.id), [
    { field: 'content', old_value: '写一篇文章', new_value: '写两篇文章' },
    { field: 'task_date', old_value: '2026-10-05', new_value: '2026-10-06' },
  ]);
  assert.equal((await patch(t.id, { content: '写两篇文章' })).statusCode, 200);
  assert.equal(log(t.id).length, 2, '提交了同样的值：不记');

  // 类型不对被拒：改动没落库，流水也不能有
  const bad = await patch(t.id, { content: '第三版', note: { x: 1 } });
  assert.equal(bad.statusCode, 400);
  assert.equal(log(t.id).length, 2);
  assert.equal(db.prepare('SELECT content FROM loop_items WHERE id = ?').get(t.id).content, '写两篇文章');

  // 完成：只记一条完成状态；完成后改结果：记
  assert.equal((await patch(t.id, { ...DONE, result: '两篇都已发布' })).statusCode, 200);
  assert.equal((await patch(t.id, { result: '两篇都已发布并收录' })).statusCode, 200);
  assert.deepEqual(log(t.id).slice(2), [
    { field: 'done', old_value: '0', new_value: '1' },
    { field: 'result', old_value: '两篇都已发布', new_value: '两篇都已发布并收录' },
  ]);

  const res = await call('GET', `/api/loop-items/${t.id}/changes`, 'seo');
  assert.equal(res.statusCode, 200);
  const items = res.json().items;
  assert.deepEqual(items.map((c) => c.label), ['完成结果', '完成状态', '截止日', '任务内容'], '新的在前，字段名是给人看的');
  assert.equal(items[0].changed_by_name, '测试');
  assert.ok(items[0].changed_at);
  assert.equal((await call('GET', '/api/loop-items/999999/changes', 'seo')).statusCode, 404);

  // 「改 N」不数完成状态
  const listed = (await call('GET', '/api/loop-items?kind=task', 'seo')).json().items.find((x) => x.id === t.id);
  assert.equal(listed.change_count, 3);

  // 彻底删除：流水跟着清，不留孤儿
  assert.equal((await call('DELETE', `/api/loop-items/${t.id}?hard=1`, 'boss')).statusCode, 200);
  assert.deepEqual(log(t.id), []);
});

test('旁路：执行人把跨天任务改成单日，完成时照样要证据；经理改的是重新定范围，不算', async () => {
  const t = await mk({ start_date: '2026-10-05', task_date: '2026-10-09' });
  assert.deepEqual(t.important_reasons, ['multi_day']);
  const shortened = (await patch(t.id, { start_date: '2026-10-09' })).json().item;
  assert.equal(shortened.is_important, true, '改成单日之后仍然是重要任务');
  assert.deepEqual(shortened.important_reasons, ['was_multi_day']);
  assert.match(shortened.important_reason_text, /原本是跨天任务/);
  const denied = await patch(t.id, { ...DONE, result: '做完了做完了' });
  assert.equal(denied.statusCode, 400);
  assert.deepEqual(denied.json().missing, ['evidence']);

  // 同一个请求里又改日期又勾完成：一样拦
  const t2 = await mk({ start_date: '2026-10-05', task_date: '2026-10-09' });
  const sneaky = await patch(t2.id, { start_date: '2026-10-09', ...DONE, result: '做完了做完了' });
  assert.equal(sneaky.statusCode, 400);
  assert.deepEqual(sneaky.json().missing, ['evidence']);
  assert.deepEqual(log(t2.id), [], '被拒的请求不留痕');

  // 经理把范围改小：不留「曾经跨天」的记号，之后就是普通任务
  const t3 = await mk({ start_date: '2026-10-05', task_date: '2026-10-09' });
  const byManager = (await patch(t3.id, { start_date: '2026-10-09' }, 'manager')).json().item;
  assert.equal(byManager.is_important, false);
  assert.deepEqual(log(t3.id), [{ field: 'start_date', old_value: '2026-10-05', new_value: '2026-10-09' }]);
  assert.equal((await patch(t3.id, { ...DONE, result: '做完了做完了' })).statusCode, 200);
});

test('日期只收真实的 YYYY-MM-DD；空 = 没填；开始日不能晚于截止日', async () => {
  for (const bad of ['10/12', '2026-13-01', '2026-02-30', '20261012', '明天', 20261012]) {
    const r = await call('POST', '/api/loop-items', 'seo', { kind: 'task', dept: 'SEO', content: 'x', task_date: bad });
    assert.equal(r.statusCode, 400, JSON.stringify(bad));
    assert.equal(r.json().error, 'invalid_date');
    assert.match(r.json().detail, /截止日/);
  }
  const t = await mk({ start_date: '2026-10-05', task_date: '2026-10-07', task_verify_date: '' });
  assert.equal(t.task_verify_date, null, "'' 存成没填");
  for (const [field, label] of [['task_date', '截止日'], ['start_date', '开始日'], ['task_verify_date', '验证日']]) {
    const r = await patch(t.id, { [field]: '2026-10-32' });
    assert.equal(r.json().error, 'invalid_date', field);
    assert.match(r.json().detail, new RegExp(label));
  }
  assert.equal((await patch(t.id, { task_date: '2026-10-04' })).json().error, 'bad_date_range', '截止日挪到了开始日之前');
  assert.equal((await patch(t.id, { start_date: '2026-10-08' })).json().error, 'bad_date_range');
  assert.equal((await patch(t.id, { start_date: '2026-10-04', task_date: '2026-10-04' })).statusCode, 200, '两个一起改成同一天可以');
  assert.equal((await patch(t.id, { task_date: '' })).json().item.task_date, null, '清空截止日可以');
  assert.equal((await call('POST', '/api/loop-items', 'seo', { kind: 'task', dept: 'SEO', content: 'x', start_date: '2026-10-09', task_date: '2026-10-05' })).json().error, 'bad_date_range');

  // 老数据不追溯：库里已经是「开始晚于截止」的任务，改别的字段不受影响
  db.prepare("UPDATE loop_items SET start_date = '2026-10-09', task_date = '2026-10-05' WHERE id = ?").run(t.id);
  assert.equal((await patch(t.id, { note: '只改备注' })).statusCode, 200);
  // 别的类型（计划 / 测试 / 沉淀）不走这套校验：它们的日期字段另有用法
  assert.equal((await call('POST', '/api/loop-items', 'seo', { kind: 'plan', dept: 'SEO', content: '月度计划', task_date: '10 月' })).statusCode, 201);
});

test('周度审核包：区间内的改动跟着任务出来，疑点按全部流水判', async () => {
  const t = await mk({ owner: '李', start_date: '2026-09-14', task_date: '2026-09-15' });
  await patch(t.id, { task_date: '2026-09-18' });
  db.prepare("UPDATE loop_item_changes SET changed_at = '2026-09-15 02:00:00' WHERE loop_item_id = ?").run(t.id);
  const pkg = (await call('GET', '/api/audit/weekly?start_date=2026-09-14&end_date=2026-09-20&today=2026-09-20', 'boss')).json();
  const row = pkg.tasks.find((x) => x.id === t.id);
  assert.ok(row, '任务应在这一周里');
  assert.deepEqual(row.changes, [{ field: 'task_date', label: '截止日', old: '2026-09-15', new: '2026-09-18', by: '测试', date: '2026-09-15' }]);
  assert.ok(row.flags.includes('DUE_MOVED'));
  assert.equal(pkg.meta.flags.DUE_MOVED.label, '截止日被往后改过');
  // 下一周：改动不在区间里所以不列，但疑点还在（它是这条任务的事实，不是某一周的事）
  const next = (await call('GET', '/api/audit/weekly?start_date=2026-09-21&end_date=2026-09-27&today=2026-09-27', 'boss')).json();
  const again = next.tasks.find((x) => x.id === t.id);
  assert.deepEqual(again.changes, []);
  assert.ok(again.flags.includes('DUE_MOVED'));
  const csv = (await call('GET', '/api/audit/weekly/export?start_date=2026-09-14&end_date=2026-09-20&format=csv&section=tasks', 'boss')).body;
  assert.ok(csv.includes('区间内的改动') && csv.includes('截止日：2026-09-15 → 2026-09-18（测试 2026-09-15）'), csv.slice(0, 600));
});
