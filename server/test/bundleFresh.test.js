// 线上跑的是 public/dist/bundle.js —— 它是手动打包之后提交进仓库的，构建镜像时原样拷贝，不会重新打。
// 所以「改了 public/src 却忘了重新打包」的后果是：代码审过了、测试过了、合并了，线上跑的还是旧代码，而且没有任何报错。
// 这条测试用 package.json 里的同一条打包命令现打一份，和仓库里那份逐字节比。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts['build:web'];

// esbuild 是仓库根目录的开发依赖。运行环境里没有它（比如只装了 server 的依赖）就查不了 —— 明说跳过，不能悄悄当成通过
function findEsbuild() {
  try { return createRequire(join(root, 'package.json')).resolve('esbuild/bin/esbuild'); } catch (e) { return null; }
}
const esbuild = findEsbuild();

test('打包产物 public/dist/bundle.js 是用当前的 public/src 打出来的', {
  skip: esbuild ? false : '找不到 esbuild（仓库根目录没装开发依赖）。在根目录运行 npm install 之后这条检查才会生效',
}, () => {
  // 直接复用 package.json 里的命令，只把输出位置换成临时文件：命令哪天改了参数，这条测试跟着变，不会各说各话
  const args = script.split(/\s+/).slice(1);
  const outIndex = args.findIndex((a) => a.startsWith('--outfile='));
  assert.ok(outIndex !== -1, 'package.json 的 build:web 命令里找不到 --outfile=，这条测试需要跟着改');
  const committed = join(root, args[outIndex].slice('--outfile='.length));
  const dir = mkdtempSync(join(tmpdir(), 'ferr-bundle-'));
  try {
    const fresh = join(dir, 'bundle.js');
    args[outIndex] = '--outfile=' + fresh;
    execFileSync(process.execPath, [esbuild, ...args, '--log-level=error'], { cwd: root, stdio: 'pipe' });
    const norm = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    assert.ok(norm(fresh) === norm(committed),
      'public/dist/bundle.js 已经过期：它不是用当前的 public/src 打出来的。\n'
      + '原因：线上直接用仓库里的这份文件，不会重新打包 —— 现在这样合并上线，跑的是旧代码。\n'
      + '改法：在仓库根目录运行  npm run build:web  ，然后把 public/dist/bundle.js 和源码一起提交。');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
