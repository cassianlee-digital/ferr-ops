// SQLite 连接（单例）。数据访问统一经此模块 + repositories/，
// 将来换 PostgreSQL 只需替换这一层与 repository 实现。
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { UNDER_TEST, config } from '../config.js';

// 测试绝不碰真实的库：没声明 DB_FILE 就不打开。以前会落到默认的 data/ferr.sqlite，也就是开发库本身
if (UNDER_TEST && !process.env.DB_FILE) {
  throw new Error(
    '测试要用到数据库，但没有声明 DB_FILE。\n'
    + '原因：不声明的话会打开默认的 data/ferr.sqlite —— 那是真实的开发库。\n'
    + '改法（二选一）：\n'
    + '  · 测试是静态 import 的：把  import \'../test-support/tempDb.js\';  放在所有 ../src/ 的 import 之前；\n'
    + '  · 测试要自己管临时目录：在任何 import(\'../src/…\') 之前设置 process.env.DB_FILE，再用动态 import()（照抄 server/test/routes.test.js 开头）。'
  );
}

mkdirSync(dirname(config.dbFile), { recursive: true });

export const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;
