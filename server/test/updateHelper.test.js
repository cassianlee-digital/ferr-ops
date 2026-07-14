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
