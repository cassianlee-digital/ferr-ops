// SQLite 在线备份（安全，含 WAL）。输出到 /app/backup（挂载到宿主 ./backup）。
// 运行：docker compose exec -T app node src/db/backup.js
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db } from './connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = resolve(__dirname, '../../../backup');
mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = resolve(dir, `ferr-${stamp}.sqlite`);

db.backup(out)
  .then(() => {
    console.log('[backup] 完成 ->', out);
    process.exit(0);
  })
  .catch((e) => {
    console.error('[backup] 失败', e);
    process.exit(1);
  });
