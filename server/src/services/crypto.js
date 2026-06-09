// AES-256-GCM 对称加密，用于把设置页填入的第三方 API 密钥加密后存库。
// 主密钥从 config.settingsSecret 派生（sha256 → 32 字节），无需额外配置。
import crypto from 'node:crypto';
import { config } from '../config.js';

const KEY = crypto.createHash('sha256').update(String(config.settingsSecret)).digest();

export function encrypt(plain) {
  if (plain == null || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64'); // iv(12)|tag(16)|cipher
}

export function decrypt(blob) {
  if (!blob) return '';
  try {
    const buf = Buffer.from(blob, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
