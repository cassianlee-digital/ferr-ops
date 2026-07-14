// AES-256-GCM 对称加密，用于把设置页填入的第三方 API 密钥 / Google OAuth token 加密后存库。
//
// 密钥独立性（P0-②）：加密主密钥优先取独立的 SETTINGS_SECRET；未设时才回退 JWT_SECRET（保持对既有密文兼容）。
//   会话密钥（JWT）与数据加密密钥本应解耦——只要设置了独立的 SETTINGS_SECRET，
//   之后轮换 JWT_SECRET 就不会再让已存的凭据无法解密。
// 兼容旧密文：解密时依次尝试主密钥 + 历史上可能用过的派生源（JWT_SECRET、旧默认值），
//   这样在「补设 SETTINGS_SECRET」后，早先用 JWT_SECRET 加密的旧数据仍能解开（随刷新逐步迁移到新密钥）。
// 失败显式化：非空密文若所有候选密钥都解不开 → 抛错（不再静默返回空串，避免把「解密失败」伪装成「未配置」）。
import crypto from 'node:crypto';
import { config } from '../config.js';

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();

// 写入用的主密钥
const PRIMARY_KEY = sha256(config.settingsSecret);

// 解密候选：主密钥 + 兼容旧密文的历史派生源（去重，避免重复尝试同一把 key）。
const LEGACY_SOURCES = [config.jwtSecret, 'dev-settings-key', 'dev-insecure-secret-change-me'];
const DECRYPT_KEYS = [PRIMARY_KEY, ...LEGACY_SOURCES.map(sha256)].filter(
  (k, i, arr) => arr.findIndex((x) => x.equals(k)) === i
);

export function encrypt(plain) {
  if (plain == null || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', PRIMARY_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64'); // iv(12)|tag(16)|cipher
}

function decryptWith(key, blob) {
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag); // 密钥不对时 final() 会因 auth tag 校验失败抛错 → 换下一把候选
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// 严格解密：空值→''；非空但所有候选密钥都失败 → 抛错（显式失败）。
export function decrypt(blob) {
  if (!blob) return '';
  for (const key of DECRYPT_KEYS) {
    try {
      return decryptWith(key, blob);
    } catch {
      /* 换下一把候选密钥 */
    }
  }
  const e = new Error('decrypt_failed');
  e.reason = '密文无法解密：加密主密钥可能已变更（检查 SETTINGS_SECRET / JWT_SECRET 是否与写入时一致）';
  throw e;
}

// 安全解密：永不抛。返回 { ok, value, error }。供状态/列表等「不应因单条解密失败而崩」的路径使用。
export function decryptSafe(blob) {
  if (!blob) return { ok: true, value: '', error: null };
  try {
    return { ok: true, value: decrypt(blob), error: null };
  } catch (e) {
    return { ok: false, value: '', error: e.reason || 'decrypt_failed' };
  }
}
