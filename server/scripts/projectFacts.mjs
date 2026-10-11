// 生成 docs/FACTS.md：仓库里「现在有什么」的清单 —— 路由、服务、数据访问、前端模块、数据表、测试、环境变量。
//
// 为什么要有它：以前这些东西是人写在 CLAUDE.md 里的（「36 个路由文件」「43 个 ES 模块」「index.html 1374 行」…）。
// 那份文档自己就记着至少四轮「数字漂了」，2026-10-11 抽验 8 个数有 4 个不对，其中两个是前一天刚改过相关代码的。
// 人写的清单一定会过期；所以清单改由机器从代码里读，文档里不再手写任何「有几个」「有哪些」。
//
// 每个文件的说明取自它开头的第一句注释 —— 想让清单里的说明变好，去改那个文件的第一行注释。
//
// 用法（在仓库根目录）：
//   node server/scripts/projectFacts.mjs            打印出来看看
//   node server/scripts/projectFacts.mjs --write    写进 docs/FACTS.md
// 测试 server/test/projectFacts.test.js 会现算一份和 docs/FACTS.md 比对，不一致就失败并提示上面第二条命令。
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const FACTS_FILE = 'docs/FACTS.md';

// 文件开头第一句注释。没有注释的返回空串（清单里会显示「（没有写说明）」，提醒去补）
export function describe(src) {
  const m = src.match(/^\s*(?:\/\/([^\n]*)|\/\*+([\s\S]*?)\*\/)/);
  if (!m) return '';
  const raw = m[1] !== undefined ? m[1] : (m[2].split('\n').map((l) => l.replace(/^\s*\*?\s?/, '')).find((l) => l.trim()) || '');
  const text = raw.trim().replace(/\s+/g, ' ').replace(/\|/g, '/');
  const cut = text.split(/(?<=[。；])/)[0];
  return cut.length > 90 ? cut.slice(0, 89) + '…' : cut;
}

const jsFiles = (root, dir) => readdirSync(path.join(root, dir)).filter((f) => /\.(js|mjs)$/.test(f)).sort();
const listOf = (root, dir) => jsFiles(root, dir).map((f) => ({ file: f, about: describe(readFileSync(path.join(root, dir, f), 'utf8')) }));

/* 数据表：migrate.js 里的 CREATE TABLE，说明取紧挨在它上面的那段 SQL 注释的第一行 */
function tables(root) {
  const src = readFileSync(path.join(root, 'server/src/db/migrate.js'), 'utf8');
  const lines = src.split('\n'); const out = [];
  lines.forEach((line, i) => {
    const m = line.match(/^CREATE TABLE IF NOT EXISTS (\w+)/);
    if (!m) return;
    let j = i - 1; while (j >= 0 && lines[j].startsWith('--')) j--;
    const first = j + 1 < i ? lines[j + 1].replace(/^--\s?/, '').trim().replace(/\|/g, '/') : '';
    out.push({ name: m[1], about: first.length > 90 ? first.slice(0, 89) + '…' : first });
  });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/* 代码里读的环境变量（server/src 下所有 process.env.X / env.X） */
export function envVarsRead(root) {
  const names = new Set();
  (function walk(dir) {
    for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir + '/' + entry.name;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.js')) for (const m of readFileSync(path.join(root, rel), 'utf8').matchAll(/(?:process\.)?env\.([A-Z][A-Z0-9_]{2,})/g)) names.add(m[1]);
    }
  })('server/src');
  return [...names].sort();
}

export function buildFacts(root) {
  return {
    routes: listOf(root, 'server/src/routes'),
    services: listOf(root, 'server/src/services'),
    repositories: listOf(root, 'server/src/db/repositories'),
    sync: listOf(root, 'server/src/sync'),
    modules: listOf(root, 'public/src'),
    classic: readdirSync(path.join(root, 'public')).filter((f) => f.endsWith('.js')).sort().map((f) => ({ file: f, about: describe(readFileSync(path.join(root, 'public', f), 'utf8')) })),
    styles: readdirSync(path.join(root, 'public')).filter((f) => f.endsWith('.css')).sort(),
    tables: tables(root),
    tests: listOf(root, 'server/test').filter((t) => t.file.endsWith('.test.js')),
    scripts: listOf(root, 'server/scripts'),
    env: envVarsRead(root),
  };
}

export function renderFacts(f) {
  const table = (rows, head = '文件') => [`| ${head} | 说明 |`, '|---|---|', ...rows.map((r) => `| \`${r.file || r.name}\` | ${r.about || '（没有写说明）'} |`)].join('\n');
  const section = (title, dir, rows, head) => `## ${title}（${rows.length}）\n\n${dir ? '`' + dir + '`\n\n' : ''}${table(rows, head)}\n`;
  return [
    '# 仓库现状清单',
    '',
    '> **自动生成，不要手改。** 生成命令：`node server/scripts/projectFacts.mjs --write`（在仓库根目录）。',
    '> 这份清单和代码对不上时，提交前的测试会失败并提示这条命令。',
    '> 每行的说明取自那个文件开头的第一句注释：想改说明，去改文件的第一行注释。',
    '',
    section('后端路由', 'server/src/routes/', f.routes),
    section('后端服务（规则与业务逻辑）', 'server/src/services/', f.services),
    section('数据访问层', 'server/src/db/repositories/', f.repositories),
    section('第三方同步', 'server/src/sync/', f.sync),
    section('前端 ES 模块（打包进 dist/bundle.js）', 'public/src/', f.modules),
    section('前端经典脚本（不经打包，直接加载）', 'public/', f.classic),
    `## 样式表（${f.styles.length}）\n\n${f.styles.map((s) => '`' + s + '`').join(' · ')}\n`,
    section('数据表', 'server/src/db/migrate.js', f.tables, '表'),
    section('测试', 'server/test/', f.tests),
    section('工具脚本', 'server/scripts/', f.scripts),
    `## 代码会读的环境变量（${f.env.length}）\n\n${f.env.map((e) => '`' + e + '`').join(' · ')}\n\n每一个的含义见 \`.env.example\`（测试会检查两边对得上）。\n`,
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const text = renderFacts(buildFacts(root));
  if (process.argv.includes('--write')) { writeFileSync(path.join(root, FACTS_FILE), text); console.log('已写入 ' + FACTS_FILE); }
  else process.stdout.write(text);
}
