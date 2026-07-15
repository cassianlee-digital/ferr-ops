// updateById：7 个仓库共用的「按白名单部分更新」helper。白名单是防越权写 / 列名注入的闸门，必须守住。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db/connection.js';
import { updateById } from '../src/db/updateHelper.js';

test('updateById: 只更新白名单字段，未授权字段被忽略(不越权写、不注入列名)', () => {
  db.exec('CREATE TEMP TABLE t_upd (id INTEGER PRIMARY KEY, a TEXT, b TEXT, secret TEXT)');
  db.prepare("INSERT INTO t_upd (id,a,b,secret) VALUES (1,'a0','b0','keep')").run();
  const changes = updateById('t_upd', 1, { a: 'a1', b: 'b1', secret: 'hacked', nope: 'x' }, ['a', 'b']);
  assert.equal(changes, 1);
  const row = db.prepare('SELECT * FROM t_upd WHERE id=1').get();
  assert.equal(row.a, 'a1');
  assert.equal(row.b, 'b1');
  assert.equal(row.secret, 'keep'); // 不在白名单 → 未被改
  db.exec('DROP TABLE t_upd');
});

test('updateById: 无可更新字段时不执行、返回 0', () => {
  db.exec('CREATE TEMP TABLE t_upd2 (id INTEGER PRIMARY KEY, a TEXT)');
  db.prepare("INSERT INTO t_upd2 (id,a) VALUES (1,'a0')").run();
  const changes = updateById('t_upd2', 1, { nope: 'x', other: 'y' }, ['a']);
  assert.equal(changes, 0);
  assert.equal(db.prepare('SELECT a FROM t_upd2 WHERE id=1').get().a, 'a0');
  db.exec('DROP TABLE t_upd2');
});

// ---- 类型闸门（白名单只管列名，不管值；下面每条都对应一个实测过的真实缺口）----

// 与生产表同构：TEXT 日期列 + INTEGER 标志列（对应 fixes.due_date / loop_items.urgent）
function typedTable(name) {
  db.exec(`CREATE TEMP TABLE ${name} (id INTEGER PRIMARY KEY, title TEXT, due_date TEXT, urgent INTEGER)`);
  db.prepare(`INSERT INTO ${name} VALUES (1,'原标题','2026-07-01',0)`).run();
  return ['title', 'due_date', 'urgent'];
}
const bad400 = (fn) => {
  try { fn(); } catch (e) { return e; }
  throw new Error('应当抛错，却通过了');
};

test('类型闸门: 数字写进 TEXT 日期列 → 400（原为静默存成 "99999999.0" 污染区间统计）', () => {
  const allowed = typedTable('t_type1');
  const err = bad400(() => updateById('t_type1', 1, { due_date: 99999999 }, allowed));
  assert.equal(err.statusCode, 400);
  assert.match(err.message, /due_date/);
  // 关键：拦下之后原值必须没被动过
  assert.equal(db.prepare('SELECT due_date FROM t_type1 WHERE id=1').get().due_date, '2026-07-01');
  db.exec('DROP TABLE t_type1');
});

test('类型闸门: 非数字字符串写进 INTEGER 列 → 400（原为静默存 "abc"）', () => {
  const allowed = typedTable('t_type2');
  const err = bad400(() => updateById('t_type2', 1, { urgent: 'abc' }, allowed));
  assert.equal(err.statusCode, 400);
  assert.equal(db.prepare('SELECT urgent FROM t_type2 WHERE id=1').get().urgent, 0);
  db.exec('DROP TABLE t_type2');
});

test('类型闸门: 对象/数组/布尔 → 400 而不是 500（原为 better-sqlite3 抛错伪装成服务端故障）', () => {
  const allowed = typedTable('t_type3');
  for (const fields of [{ title: { evil: 1 } }, { title: ['a', 'b'] }, { urgent: true }, { title: undefined }]) {
    const err = bad400(() => updateById('t_type3', 1, fields, allowed));
    assert.equal(err.statusCode, 400, `${JSON.stringify(fields)} 应被拦成 400`);
  }
  assert.equal(db.prepare('SELECT title FROM t_type3 WHERE id=1').get().title, '原标题');
  db.exec('DROP TABLE t_type3');
});

test('类型闸门: 一个字段不合法 → 整条 UPDATE 不执行（不留半截写入）', () => {
  const allowed = typedTable('t_type4');
  bad400(() => updateById('t_type4', 1, { title: '新标题', due_date: 12345 }, allowed));
  const row = db.prepare('SELECT * FROM t_type4 WHERE id=1').get();
  assert.equal(row.title, '原标题', 'title 合法但同批有非法字段 → 必须一起回绝，不能半写');
  assert.equal(row.due_date, '2026-07-01');
  db.exec('DROP TABLE t_type4');
});

test('类型闸门: 合法输入照常放行（前端现有写法必须不受影响）', () => {
  const allowed = typedTable('t_type5');
  // 前端实测发的就是这些：字符串给 TEXT、数字 1 给 urgent
  assert.equal(updateById('t_type5', 1, { title: '改了', due_date: '2026-08-01', urgent: 1 }, allowed), 1);
  let row = db.prepare('SELECT * FROM t_type5 WHERE id=1').get();
  assert.deepEqual([row.title, row.due_date, row.urgent], ['改了', '2026-08-01', 1]);
  // 数字字符串给 INTEGER 列 → 归一成数字（避免 "1"/1 混存）
  updateById('t_type5', 1, { urgent: '0' }, allowed);
  row = db.prepare('SELECT urgent FROM t_type5 WHERE id=1').get();
  assert.equal(row.urgent, 0);
  assert.equal(typeof row.urgent, 'number');
  // null = 显式清空，任何列都允许
  updateById('t_type5', 1, { title: null }, allowed);
  assert.equal(db.prepare('SELECT title FROM t_type5 WHERE id=1').get().title, null);
  db.exec('DROP TABLE t_type5');
});

test('类型闸门: 白名单列在表上不存在 → 500 而非 400（那是代码 bug，不是客户端的错）', () => {
  const allowed = typedTable('t_type6');
  const err = bad400(() => updateById('t_type6', 1, { ghost: 'x' }, [...allowed, 'ghost']));
  assert.equal(err.statusCode, undefined, '代码 bug 不应伪装成客户端 400');
  assert.match(err.message, /无列 ghost/);
  db.exec('DROP TABLE t_type6');
});
