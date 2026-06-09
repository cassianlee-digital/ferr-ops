// 第三方集成密钥数据访问层（密钥 AES 加密存储，永不明文返回前端）。
import { db } from '../connection.js';
import { encrypt, decrypt } from '../../services/crypto.js';

export const PROVIDERS = ['gsc', 'ga4', 'ads'];

// 设置/更新某个 provider 的密钥
export function setSecret(provider, secret) {
  db.prepare(
    `INSERT INTO integrations (provider, secret_enc, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(provider) DO UPDATE SET secret_enc=excluded.secret_enc, updated_at=excluded.updated_at`
  ).run(provider, encrypt(secret));
}

// 取明文密钥（仅供后端同步逻辑使用，不经接口返回）
export function getSecret(provider) {
  const row = db.prepare('SELECT secret_enc FROM integrations WHERE provider = ?').get(provider);
  return row ? decrypt(row.secret_enc) : '';
}

// 配置状态（只返回是否已配置 + 更新时间，绝不返回密钥本身）
export function status() {
  const rows = db.prepare('SELECT provider, secret_enc, updated_at FROM integrations').all();
  const map = {};
  for (const p of PROVIDERS) map[p] = { configured: false, updated_at: null };
  for (const r of rows) {
    map[r.provider] = { configured: !!r.secret_enc, updated_at: r.updated_at };
  }
  return map;
}
