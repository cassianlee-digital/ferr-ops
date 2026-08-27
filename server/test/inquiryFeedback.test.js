// 跟踪反馈：一条询盘多条带时间的记录（2026-08-27 改版）。
//
// 存在理由：改版前 tracking_feedback 是单个 TEXT，覆盖式保存 —— 跟进三次只剩最后一次，
// 而且没有任何时间戳。这次拆成 inquiry_feedbacks 表，最容易出事的两处是
// ①「老数据迁移时被编造日期」②「迁移重复跑造成记录翻倍」，所以两条都钉死在测试里。
//
// 隔离：connection.js 在 **import 期**就打开 config.dbFile，故 DB_FILE 必须在动态 import 之前设好。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-inqfb-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite');

const { migrate } = await import('../src/db/migrate.js');
const { db } = await import('../src/db/connection.js');
const repo = await import('../src/db/repositories/inquiries.js');

migrate();

const userId = db
  .prepare("INSERT INTO users (username,password_hash,name,role) VALUES ('t','x','测试员','boss')")
  .run().lastInsertRowid;

const newInquiry = (extra = {}) =>
  repo.create({
    date: '2026-08-20', country: '德国', region: '西欧', channel: 'SEO自然',
    source: 'x', product: '铸造', grade: 'A', note: null,
    customer_code: 'DE-1', company: '费尔瑞', salesperson: '张三', deal_status: '未成交',
    original_grade: 'A', ...extra,
  }, userId);

test.after(() => {
  db.close(); // app 之外也要显式关，否则 Windows 上 rmSync 报 EBUSY
  rmSync(tmpDir, { recursive: true, force: true });
});

test('新建询盘带空的 feedbacks 数组，与列表同形', () => {
  const item = newInquiry();
  assert.deepEqual(item.feedbacks, []);
  const listed = repo.list().find((r) => r.id === item.id);
  assert.deepEqual(listed.feedbacks, []);
});

test('可以加多条跟踪记录：服务端盖时间戳，新的在前，带记录人姓名', () => {
  const inq = newInquiry();
  const first = repo.addFeedback(inq.id, '第一次跟进：已发报价', userId);
  const second = repo.addFeedback(inq.id, '第二次跟进：客户确认图纸', userId);

  assert.ok(first.created_at, '新记录必须有服务端时间戳');
  assert.equal(first.created_by_name, '测试员');

  const items = repo.listFeedbacks(inq.id);
  assert.equal(items.length, 2);
  assert.equal(items[0].id, second.id, '新的排在前面');
  assert.equal(items[1].id, first.id);

  // list() 一次性挂上，避免 N+1
  const listed = repo.list().find((r) => r.id === inq.id);
  assert.equal(listed.feedbacks.length, 2);
  assert.equal(listed.feedbacks[0].text, '第二次跟进：客户确认图纸');
});

test('删掉一条不影响其它条（写错了要能改回来）', () => {
  const inq = newInquiry();
  const a = repo.addFeedback(inq.id, 'A', userId);
  repo.addFeedback(inq.id, 'B', userId);
  repo.removeFeedback(a.id);
  const left = repo.listFeedbacks(inq.id);
  assert.equal(left.length, 1);
  assert.equal(left[0].text, 'B');
});

test('物理删除询盘会连带清掉它的跟踪记录，不留孤儿行', () => {
  const inq = newInquiry();
  repo.addFeedback(inq.id, '待删', userId);
  repo.remove(inq.id);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM inquiry_feedbacks WHERE inquiry_id=?').get(inq.id).c, 0);
});

test('老列 tracking_feedback 只读不写：PATCH 改不动它，避免两处各存一份', () => {
  const inq = newInquiry();
  db.prepare('UPDATE inquiries SET tracking_feedback=? WHERE id=?').run('历史那段话', inq.id);
  try {
    repo.update(inq.id, { tracking_feedback: '试图覆盖', note: '这个才该生效' });
  } catch (e) {
    // updateHelper 对「全是非白名单字段」可能直接拒绝；这里只关心老列没被改写
  }
  const row = db.prepare('SELECT tracking_feedback, note FROM inquiries WHERE id=?').get(inq.id);
  assert.equal(row.tracking_feedback, '历史那段话');
  assert.equal(row.note, '这个才该生效');
});

test('老数据迁移：原文进 inquiry_feedbacks，日期留 NULL（不编造），且重复跑不翻倍', () => {
  const legacy = newInquiry();
  db.prepare('UPDATE inquiries SET tracking_feedback=? WHERE id=?').run('  客户嫌贵，等下轮预算  ', legacy.id);
  // 空白/纯空格的老值不该产生记录
  const blank = newInquiry();
  db.prepare('UPDATE inquiries SET tracking_feedback=? WHERE id=?').run('   ', blank.id);

  // 迁移是一次性的（meta 打标），要重测得先清标记
  db.prepare("DELETE FROM meta WHERE key='backfill_inquiry_feedbacks'").run();
  migrate();

  const migrated = repo.listFeedbacks(legacy.id);
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].text, '客户嫌贵，等下轮预算', '迁移时应 TRIM 掉两端空白');
  assert.equal(migrated[0].created_at, null, '老字段本来就没时间戳，必须留 NULL 而不是补一个假日期');
  assert.equal(repo.listFeedbacks(blank.id).length, 0, '空白老值不产生记录');

  // 再跑一次 migrate：meta 标记已在，不应重复插入
  migrate();
  assert.equal(repo.listFeedbacks(legacy.id).length, 1, '迁移必须幂等，否则每次重启都翻倍');
});
