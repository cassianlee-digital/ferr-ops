// 文档里的「事实」不许过期。
//
// 这个项目的主文档曾经手写着「36 个路由文件」「43 个 ES 模块」这类数字，并且自己记录了至少四轮漂移。
// 现在这些清单由 server/scripts/projectFacts.mjs 从代码里读出来写进 docs/FACTS.md，这里盯着三件事：
//   1. docs/FACTS.md 和代码一致（加了文件、改了第一行注释却没重新生成，就红）；
//   2. 新加的文件开头要有一句说明（老文件豁免，名单只许变短）；
//   3. 代码会读的环境变量，在 .env.example 里都能查到。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACTS_FILE, buildFacts, describe, envVarsRead, renderFacts } from '../scripts/projectFacts.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const facts = buildFacts(root);

test('docs/FACTS.md 与代码一致', () => {
  assert.ok(renderFacts(facts) === read(FACTS_FILE),
    'docs/FACTS.md 已经过期：仓库里的文件、数据表或某个文件的第一行注释变了，清单没有跟着更新。\n'
    + '原因：这份清单是别人（和别的 AI）了解「仓库里现在有什么」的入口，过期的清单比没有更误导人。\n'
    + '改法：在仓库根目录运行  node server/scripts/projectFacts.mjs --write  ，把 docs/FACTS.md 一起提交。');
});

test('文件开头的第一句注释就是它在清单里的说明：新文件必须写，老文件豁免且名单只许变短', () => {
  const legacy = JSON.parse(read('server/scripts/factsLegacy.json')).noDescription;
  const groups = { 'server/src/routes': facts.routes, 'server/src/services': facts.services, 'server/src/db/repositories': facts.repositories, 'server/src/sync': facts.sync, 'public/src': facts.modules, public: facts.classic, 'server/test': facts.tests, 'server/scripts': facts.scripts };
  const missing = [];
  for (const [dir, rows] of Object.entries(groups)) for (const r of rows) if (!r.about) missing.push(dir + '/' + r.file);
  const fresh = missing.filter((f) => !legacy.includes(f));
  assert.deepEqual(fresh, [],
    '这些文件开头没有说明：\n  ' + fresh.join('\n  ') + '\n'
    + '原因：docs/FACTS.md 里每个文件的说明取自它开头的第一句注释，没有注释的文件在清单里就是一行空白。\n'
    + '改法：在文件第一行加一句注释，说清它是干什么的（例：// 外链台账数据访问层。），然后运行 node server/scripts/projectFacts.mjs --write。');
  const stale = legacy.filter((f) => !missing.includes(f));
  assert.deepEqual(stale, [],
    '这些文件已经有说明（或者已经不存在）了，请把它们从 server/scripts/factsLegacy.json 的豁免名单里删掉：\n  ' + stale.join('\n  '));
});

test('describe()：取开头第一句注释；没有注释就是空', () => {
  assert.equal(describe('// 外链台账数据访问层。软删：台账是审计材料。\nimport x from "y";'), '外链台账数据访问层。');
  assert.equal(describe('/* 询盘列表的取数。\n *\n * 三个地方…\n */\nimport a from "b";'), '询盘列表的取数。');
  assert.equal(describe('/**\n * 生成清单\n */'), '生成清单');
  assert.equal(describe('import a from "b";\n// 后面的注释不算'), '');
  assert.equal(describe('// 表里有 | 竖线也不能把表格弄坏'), '表里有 / 竖线也不能把表格弄坏');
});

/* 代码会读、但不需要运维配置的环境变量，各写明为什么不用进 .env.example */
const NOT_FOR_OPERATORS = {
  NODE_TEST_CONTEXT: 'Node 的测试运行器自己设的，用来判断「现在是不是在跑测试」',
  CONFIRM_RESET: '清库重建时在命令行里临时给的确认开关，写进 .env 等于拆掉这道保险',
  DB_FILE: '测试和本地验证用来指向临时库 / 副本库；生产用默认路径',
};

test('代码会读的环境变量，在 .env.example 里都查得到', () => {
  const documented = new Set([...read('.env.example').matchAll(/^#?\s?([A-Z][A-Z0-9_]{2,})=/gm)].map((m) => m[1]));
  const missing = envVarsRead(root).filter((name) => !documented.has(name) && !(name in NOT_FOR_OPERATORS));
  assert.deepEqual(missing, [],
    '代码里读了这些环境变量，但 .env.example 里没有：' + missing.join('、') + '\n'
    + '原因：部署的人只看 .env.example。那里没有的开关，等于不存在 —— 没人知道可以配、该怎么配。\n'
    + '改法：在 .env.example 里加上它（可选项写成注释掉的一行，如  # NAME=默认值），并写一句它管什么；\n'
    + '      如果它不该由运维配置，加进本测试的 NOT_FOR_OPERATORS 并写明原因。');
  for (const name of Object.keys(NOT_FOR_OPERATORS)) {
    assert.ok(envVarsRead(root).includes(name), `NOT_FOR_OPERATORS 里的 ${name} 代码已经不读了，请从名单里删掉`);
  }
});
