// 文档不许悄悄烂掉。
//
// 这个仓库的主文档曾经长到 438 行 / 69KB：处处都标着「重要」，同一条规矩重复写两遍，
// 「还没做」的记录在代码做完之后继续留着（并且真的误导过人），提到的文件早就改名了。
// 2026-10-11 把它拆成了「入口当目录 + 按模块的细节 + 机器生成的清单」。这里盯着它别长回去：
//   1. 入口文件有行数上限 —— 想往里加东西时，先想它该进哪篇模块文档；
//   2. 每篇文档都被入口的目录收录、都标了状态 —— 没人维护的孤儿文档和不知道还算不算数的文档，都不许有；
//   3. 还在生效的文档里提到的文件必须真的存在 —— 这是最便宜的「文档与代码对不上」探测器。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', '.tooling', 'data', 'vendor']);
function walk(dir, out = []) {
  for (const name of readdirSync(join(root, dir))) {
    if (SKIP_DIRS.has(name)) continue;
    const rel = dir ? dir + '/' + name : name;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out); else out.push(rel);
  }
  return out;
}
const files = walk('');
const docs = files.filter((f) => f.endsWith('.md') && (f.startsWith('docs/') || !f.includes('/')));
const STATUS = /^> 状态：(active|completed|proposed|superseded)/m;
const statusOf = (rel) => (read(rel).split('\n').slice(0, 6).join('\n').match(STATUS) || [])[1] || null;
const GENERATED = new Set(['docs/FACTS.md']);        // 机器生成，自己有「自动生成」的抬头
const ENTRY = new Set(['AGENTS.md', 'CLAUDE.md']);   // 入口本身

const MAX_ENTRY_LINES = 130;

test('入口文件是目录不是百科：AGENTS.md 有行数上限，CLAUDE.md 只做转发', () => {
  const n = read('AGENTS.md').split('\n').length;
  assert.ok(n <= MAX_ENTRY_LINES,
    `AGENTS.md 现在 ${n} 行，上限 ${MAX_ENTRY_LINES}。\n`
    + '原因：入口文件每次会话都要整篇读进去。它一长，真正不能做错的那几条就被淹没了 —— 它长到 438 行的时候就是这样。\n'
    + '改法：把新加的内容挪到 docs/modules/ 里对应那篇（没有合适的就新建一篇并登记进「地图」），入口里只留一行指路。');
  const claude = read('CLAUDE.md');
  assert.ok(claude.startsWith('@AGENTS.md'), 'CLAUDE.md 的第一行必须是 @AGENTS.md（它只负责把 Claude Code 引到 AGENTS.md）');
  assert.ok(claude.split('\n').length <= 8,
    'CLAUDE.md 只做转发，不放内容。改法：把加进去的东西移到 AGENTS.md 或 docs/modules/。');
});

test('每篇文档都被入口的「地图」收录，没有孤儿', () => {
  const entry = read('AGENTS.md');
  const orphans = docs.filter((d) => !ENTRY.has(d) && !d.startsWith('docs/archive/') && !entry.includes(d));
  assert.deepEqual(orphans, [],
    '这些文档没有出现在 AGENTS.md 的「地图」里：\n  ' + orphans.join('\n  ') + '\n'
    + '原因：入口里查不到的文档，下一个人（或 AI）不会知道它存在，它会在没人看的地方慢慢过期。\n'
    + '改法：在 AGENTS.md 的「地图」表里加一行（路径 + 一句话说明）；如果它已经没用了，移到 docs/archive/ 并把状态改成 superseded。');
  assert.ok(entry.includes('docs/archive/'), 'AGENTS.md 的地图里要提到 docs/archive/（并说明那里的东西不能当事实引用）');
});

test('每篇文档都标了状态；归档的一律是 superseded', () => {
  const missing = docs.filter((d) => !ENTRY.has(d) && !GENERATED.has(d) && !statusOf(d));
  assert.deepEqual(missing, [],
    '这些文档开头没有状态行：\n  ' + missing.join('\n  ') + '\n'
    + '原因：读的人需要先知道这篇还算不算数。没标状态的方案稿和已经作废的旧文档，被当成现状引用过不止一次。\n'
    + '改法：在标题下面加一行  > 状态：active  （可选值：active 在生效 / completed 已完成的历史记录 / proposed 还没实施的方案 / superseded 已被取代）。');
  const wrong = docs.filter((d) => d.startsWith('docs/archive/') && statusOf(d) !== 'superseded');
  assert.deepEqual(wrong, [], 'docs/archive/ 下的文档状态必须是 superseded：\n  ' + wrong.join('\n  '));
});

test('还在生效的文档里提到的文件都真的存在', () => {
  const live = docs.filter((d) => d === 'AGENTS.md' || (!ENTRY.has(d) && !GENERATED.has(d) && statusOf(d) === 'active'));
  const dead = [];
  for (const d of live) {
    const text = read(d);
    for (const m of text.matchAll(/`([A-Za-z0-9_.\-/]+\.(?:js|mjs|cjs|css|md|json|html|sql|yml))`/g)) {
      const ref = m[1].replace(/^\.\//, '');
      // 文档里常写简称（routes/audit.js、auditRules.js）：只要仓库里有以它结尾的文件就算存在
      if (!files.some((f) => f === ref || f.endsWith('/' + ref))) dead.push(d + '：`' + m[1] + '`');
    }
  }
  assert.deepEqual([...new Set(dead)], [],
    '这些文档提到了仓库里已经不存在的文件。\n'
    + '原因：文件改名、搬走或删掉之后，文档没有跟着改 —— 照着它去找的人会扑空，然后开始怀疑整篇文档。\n'
    + '改法：把路径改成现在的；如果那句话是在讲历史（「原来在 xxx.js，后来搬走了」），去掉文件名两边的反引号，测试就不再把它当成现存的文件。');
});
