// 升级不丢数据。
//
// 这个后台每次上线都是「拉代码 → 重启」，启动时自动跑迁移 —— 没有人工升级步骤，也没有回滚脚本。
// 所以每次交付时都在说同一句话：「启动时会自动加表加列，不动已有数据」。这里把这句话变成测试：
// 造一个「旧版本」的库（里面有数据，但缺最近才加的表和列），跑迁移，结构要补齐，数据一行不能少。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-migrate-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite'); // 必须在动态 import 之前：connection.js 在 import 期就开库

const { db } = await import('../src/db/connection.js');
const { migrate } = await import('../src/db/migrate.js');

test.after(() => { db.close(); rmSync(tmpDir, { recursive: true, force: true }); });

const tables = () => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
const columns = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
const counts = () => Object.fromEntries(tables().map((t) => [t, db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n]));

test('迁移可以反复跑：第二次不报错、不新增也不删除任何表', () => {
  migrate();
  const first = tables();
  assert.ok(first.includes('inquiries') && first.includes('loop_items') && first.includes('users'));
  migrate();
  assert.deepEqual(tables(), first);
});

test('旧版本的库升级：缺的表和列补上，已有的数据一行不少、内容不变', () => {
  migrate();
  db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, name, role) VALUES (1, 'old-user', 'x', '老用户', 'boss')").run();
  db.prepare("INSERT INTO inquiries (date, country, channel, grade, note, created_by) VALUES ('2026-05-01', '德国', 'SEO自然', 'A', '升级前录的询盘', 1)").run();
  db.prepare("INSERT INTO loop_items (kind, dept, content, status, task_date) VALUES ('task', 'SEO', '升级前建的任务', '待办', '2026-05-02')").run();
  db.prepare("INSERT INTO backlinks (source_url, source_domain, target_url, method, rel, status) VALUES ('https://old.example.com/a', 'old.example.com', 'https://ferr.com/', '客座投稿', 'dofollow', '有效')").run();

  // 退回成「旧版本」：删掉最近才加的一张表和三列（真实的旧库就是没有它们）
  db.exec('DROP TABLE loop_item_changes');
  db.exec('ALTER TABLE loop_items DROP COLUMN deleted_by');
  db.exec('ALTER TABLE backlinks DROP COLUMN auto_lost_at');
  db.exec('ALTER TABLE expenses DROP COLUMN deleted_by');
  assert.ok(!tables().includes('loop_item_changes'));
  assert.ok(!columns('loop_items').includes('deleted_by'));
  const before = counts();

  migrate();

  assert.ok(tables().includes('loop_item_changes'), '缺的表要建出来');
  assert.ok(columns('loop_items').includes('deleted_by'), '缺的列要补上');
  assert.ok(columns('backlinks').includes('auto_lost_at'));
  assert.ok(columns('expenses').includes('deleted_by'));
  const after = counts();
  for (const [table, n] of Object.entries(before)) {
    assert.equal(after[table], n, `表 ${table} 升级前 ${n} 行，升级后 ${after[table]} 行 —— 迁移不许删数据，也不许凭空造数据`);
  }
  const inquiry = db.prepare("SELECT date, country, channel, grade, note FROM inquiries WHERE note = '升级前录的询盘'").get();
  assert.deepEqual(inquiry, { date: '2026-05-01', country: '德国', channel: 'SEO自然', grade: 'A', note: '升级前录的询盘' });
  const task = db.prepare("SELECT content, status, task_date, deleted_by FROM loop_items WHERE content = '升级前建的任务'").get();
  assert.deepEqual(task, { content: '升级前建的任务', status: '待办', task_date: '2026-05-02', deleted_by: null }, '新加的列在老行上是空的，不补假值');
  assert.equal(db.prepare("SELECT status FROM backlinks WHERE source_domain = 'old.example.com'").get().status, '有效');
});

test('清库重建只能走显式的独立命令：迁移函数本身没有任何 DROP TABLE', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/db/migrate.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export function migrate()'), src.indexOf('function ensureColumns('));
  assert.ok(body.length > 1000, '没找到 migrate() 的函数体，这条测试需要跟着改');
  assert.doesNotMatch(body, /DROP\s+TABLE|DELETE\s+FROM\s+(?!meta\b)\w+\s*;/i,
    'migrate() 里出现了删表 / 整表删数据的语句。\n'
    + '原因：上线就是「拉代码 → 重启」，启动时会自动跑 migrate()；它里面有删表语句，等于每次重启都可能清掉生产数据。\n'
    + '改法：结构变更只用 CREATE TABLE IF NOT EXISTS 和 ensureColumns()；确实要清库，走 --reset 那条需要 CONFIRM_RESET=1 的独立流程。');
});
