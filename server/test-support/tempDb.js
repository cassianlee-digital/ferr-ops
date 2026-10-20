// 给一个测试文件配一个用完即弃的临时库。
//
// 用法：放在测试文件里**所有 ../src/ 的 import 之前**：
//     import '../test-support/tempDb.js';
// ES 模块按 import 的书写顺序求值，所以它会先于后面任何会打开数据库的模块跑完。
//
// 什么时候用它：测试只是静态 import 了某个 service（哪怕只测其中的纯函数），而那个 service 连带 import 了数据库连接。
// 需要自己掌握临时目录（比如要在 test.after 里关库、删目录）的测试，照旧在文件开头自己设 process.env.DB_FILE。
//
// 这个文件故意不放在 server/test/ 下面：`node --test` 会把 test 目录里的每个 .js 都当成测试文件来跑。
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (!process.env.DB_FILE) {
  const dir = mkdtempSync(join(tmpdir(), 'ferr-test-'));
  process.env.DB_FILE = join(dir, 'test.sqlite');
  // 尽力清理：进程退出时库文件可能还被占着（Windows），删不掉就留给系统的临时目录
  process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch (e) { /* 留给系统清 */ } });
}
