// 提交前门禁（.githooks/pre-commit）装上了没有。
//
// 钩子脚本在仓库里，但「让 git 用它」是每个克隆自己的本地配置，克隆下来默认是没开的 ——
// 一个存在但不触发的检查，和没有是一回事。所以让测试来盯这件事：没开就红，并直接给出那条命令。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

function git(...args) {
  try { return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch (e) { return null; }
}
// 不是一个 git 检出（比如构建出来的镜像里）或者没装 git：这条检查没有意义，明说跳过
const inRepo = git('rev-parse', '--is-inside-work-tree') === 'true';

test('提交前门禁已启用（git 会在每次提交前跑 .githooks/pre-commit）', {
  skip: inRepo ? false : '这里不是 git 检出（或没装 git），没有「提交」可拦',
}, () => {
  assert.ok(existsSync(join(root, '.githooks/pre-commit')), '仓库里的 .githooks/pre-commit 不见了');
  assert.match(readFileSync(join(root, '.githooks/pre-commit'), 'utf8'), /--test/, '.githooks/pre-commit 里已经不跑测试了');
  assert.equal(git('config', '--get', 'core.hooksPath'), '.githooks',
    '提交前门禁没有启用：这个克隆的 git 还没被告知去用仓库里的钩子。\n'
    + '原因：钩子脚本随仓库走，但启用它是每个克隆自己的本地配置，克隆下来默认不开。\n'
    + '改法：在仓库根目录运行一次  git config core.hooksPath .githooks  （主仓库和它的工作树共用这份配置，一次就够）。');
});
