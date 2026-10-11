// 前端每一个「进入 HTML 的表达式」都必须可证明安全（规则见 server/scripts/auditHtmlSinks.mjs 文件头）。
//
// 2026-10-10 做过一轮全量审计：205 个写入点、1103 个表达式逐个过了一遍，改了 20 多个文件之后归零。
// 这个测试把那一轮的结论焊住 —— 以后新写的代码只要把没转义的东西拼进 HTML，这里就会红，并指出是哪一行。
//
// 红了怎么办：
//   1. 那是文字 / 接口字段 → 用 esc() 包上；是数字 → Number() 或 esc() 都行；
//   2. 确实安全但工具证明不了 → 登记到 server/scripts/htmlSinksAllow.json 并写明理由（别顺手登记，先想清楚为什么安全）；
//   3. 报「登记了但没用上」→ 代码改过了，把那条登记删掉。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALLOW_FILE, auditHtmlSinks, frontendSources } from '../scripts/auditHtmlSinks.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const allow = JSON.parse(readFileSync(ALLOW_FILE, 'utf8'));

test('前端源码里没有证明不了的 HTML 拼接；登记清单里没有过期条目，每条都写了理由', () => {
  const { stats, findings, stale } = auditHtmlSinks(frontendSources(root), allow);
  assert.deepEqual(findings.map((f) => `${f.file}:${f.line}  ${f.expr}`), [],
    '上面这些表达式被拼进了 HTML，但证明不了它是安全的。\n'
    + '原因：页面上的字大多来自人填的内容和接口返回，没转义就拼进 HTML，别人就能往页面里塞标记。\n'
    + '改法：是文字 / 接口字段 → 用 esc() 包上；是数字 → Number() 或 esc() 都行；\n'
    + '      确实安全但工具证明不了 → 登记到 server/scripts/htmlSinksAllow.json 并写明理由（先想清楚为什么安全，别为了变绿顺手登记）。');
  assert.deepEqual(stale, [],
    '登记清单里有已经不对应任何代码的条目。改法：从 server/scripts/htmlSinksAllow.json 里删掉上面这几条。');
  // 防「工具瞎了所以什么都没报」：它得确实看到了这个量级的东西
  assert.ok(stats.sinks > 150 && stats.exprs > 800, `只扫到 ${stats.sinks} 个写入点 / ${stats.exprs} 个表达式，像是没扫全`);
  for (const [k, why] of [...Object.entries(allow['@reviewed']), ...Object.entries(allow).filter(([key]) => key !== '@reviewed')]) {
    assert.ok(typeof why === 'string' && why.length >= 8, `登记项 ${k} 没有写清理由`);
  }
});

// 一段代码单独喂给工具。r 是接口返回的对象（字段未知），el 是页面元素。
const run = (body, extra = {}) => auditHtmlSinks({ 'public/src/x.js': `import { esc } from './ui-kit.js';\nexport async function load(el) {\n  const r = await API.get('/x');\n  ${body}\n}\n`, ...extra }).findings;

test('反例：下面每一种写法都必须被抓到（抓不到 = 上面那条「零发现」不可信）', () => {
  const bad = {
    '模板里直接插字段': 'el.innerHTML = `<td>${r.name}</td>`;',
    '字符串相加': "el.innerHTML = '<b>' + r.name + '</b>';",
    '属性值里的字段': 'el.innerHTML = `<a class="x" title="${r.title}">链接</a>`;',
    '没有任何标签的模板直接进 innerHTML': 'el.innerHTML = `${r.a} · ${r.b}`;',
    '整个变量直接进 innerHTML': 'el.innerHTML = r.html;',
    '累加变量里混进了没转义的一段': "let h = '<ul>'; h += esc(r.a); h += r.b; el.innerHTML = h;",
    '三元的一个分支没转义': "el.innerHTML = '<b>' + (r.ok ? esc(r.a) : r.b) + '</b>';",
    '常量表查不到时退回原值': "const T = { a: '甲' }; el.innerHTML = '<i>' + (T[r.k] || r.k) + '</i>';",
    '对未知值调 toLocaleString': "el.innerHTML = '<b>' + r.n.toLocaleString() + '</b>';",
    '函数的返回值没转义': "const cell = (v) => '<td>' + v.name + '</td>'; el.innerHTML = cell(r);",
    '构造函数把参数原样拼进去，调用点传了字段': "const cell = (v) => '<td>' + v + '</td>'; el.innerHTML = cell(r.name);",
    '循环回调里没转义': "el.innerHTML = r.items.map((it) => '<li>' + it.title + '</li>').join('');",
    '数组 push 了没转义的东西再 join': "const a = []; a.push('<li>' + esc(r.a) + '</li>'); a.push(r.b); el.innerHTML = a.join('');",
    '解构出来的名字（外层有同名的安全变量也不能顶替）': "const name = ''; { const { name } = r; el.innerHTML = '<b>' + name + '</b>'; }",
    'insertAdjacentHTML': "el.insertAdjacentHTML('beforeend', '<p>' + r.text + '</p>');",
    'outerHTML': 'el.outerHTML = `<div>${r.text}</div>`;',
    '切片 / 去空格不等于转义': "el.innerHTML = '<b>' + String(r.at).slice(5, 16) + '</b>';",
    'for…of 取出的元素': "let h = ''; for (const it of r.items) { h += '<li>' + it + '</li>'; } el.innerHTML = h;",
  };
  for (const [name, code] of Object.entries(bad)) assert.ok(run(code).length > 0, `没抓到：${name}`);
});

test('反例：参数原样进 HTML 的导出函数，如果没有任何调用点可核对，也要报', () => {
  const src = "export function badge(cls, text) { return '<span class=\"' + cls + '\">' + text + '</span>'; }\n";
  const none = auditHtmlSinks({ 'public/src/y.js': src }).findings;
  assert.ok(none.some((f) => /找不到任何调用点/.test(f.expr)), JSON.stringify(none));
  // 有调用点、且实参安全：不报；调用点传了未知值：报在调用点上
  const ok = auditHtmlSinks({ 'public/src/y.js': src, 'public/src/z.js': "import { badge } from './y.js';\nexport function f(el) { el.innerHTML = badge('b-red', '逾期'); }\n" }).findings;
  assert.deepEqual(ok, []);
  const leak = auditHtmlSinks({ 'public/src/y.js': src, 'public/src/z.js': "import { badge } from './y.js';\nexport async function f(el) { const r = await API.get('/x'); el.innerHTML = badge('b-red', r.label); }\n" }).findings;
  assert.ok(leak.some((f) => f.file === 'public/src/z.js' && /r\.label/.test(f.expr)), JSON.stringify(leak));
});

test('正例：这些常见的安全写法不能误报（否则没人愿意用它）', () => {
  const good = {
    '转义过的字段': 'el.innerHTML = `<td title="${esc(r.title)}">${esc(r.name)}</td>`;',
    '数字运算与格式化': "el.innerHTML = '<b>' + Math.round(r.rate * 100) + '%</b><i>' + Number(r.n || 0).toLocaleString() + '</i><u>' + (r.a - r.b).toFixed(1) + '</u>';",
    '常量表取值，带字面量兜底': "const TONE = { A: 'b-green', B: 'b-blue' }; el.innerHTML = '<span class=\"badge ' + (TONE[r.grade] || 'b-gray') + '\">' + esc(r.grade) + '</span>';",
    '循环 + 转义 + 下标': "el.innerHTML = r.items.map((it, i) => `<li data-i=\"${i}\">${esc(it.title)}</li>`).join('');",
    '遍历字面量数组': "el.innerHTML = [20, 50, 100].map((n) => `<option value=\"${n}\">${n}</option>`).join('');",
    '局部变量每次赋值都安全': "let h = '<ul>'; for (let i = 0; i < 3; i++) { h += '<li>' + i + '</li>'; } h += r.more ? '<li>' + esc(r.more) + '</li>' : ''; el.innerHTML = h + '</ul>';",
    '构造函数 + 字面量实参': "const badge = (cls, text) => '<span class=\"' + cls + '\">' + esc(text) + '</span>'; el.innerHTML = badge('b-red', r.label);",
    '条件渲染': "el.innerHTML = '<div>' + (r.note ? '<p>' + esc(r.note) + '</p>' : '') + (r.urgent && '<b>急</b>') + '</div>';",
    '日期取数': "const d = new Date(r.at); el.innerHTML = '<i>' + (d.getMonth() + 1) + '/' + d.getDate() + '</i>';",
  };
  for (const [name, code] of Object.entries(good)) assert.deepEqual(run(code).map((f) => f.expr), [], `误报：${name}`);
});

test('登记清单：登记过的表达式放行，用不上的登记会被报成过期', () => {
  const code = "const old = el.innerHTML; el.innerHTML = '<i>处理中</i>'; el.innerHTML = old;";
  assert.ok(run(code).length > 0, '没登记时应当报出来');
  const src = { 'public/src/x.js': `export function f(el) { ${code} }\n` };
  assert.deepEqual(auditHtmlSinks(src, { 'public/src/x.js|el.innerHTML': '元素自己原来的内容' }).findings, []);
  assert.deepEqual(auditHtmlSinks(src, { 'public/src/x.js|el.innerHTML': '元素自己原来的内容', 'public/src/x.js|r.gone': '已经删掉的代码' }).stale, ['public/src/x.js|r.gone']);
});
