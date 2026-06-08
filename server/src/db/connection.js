// SQLite 连接（单例）。数据访问统一经此模块 + repositories/，
// 将来换 PostgreSQL 只需替换这一层与 repository 实现。
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';

mkdirSync(dirname(config.dbFile), { recursive: true });

export const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;
