// 前端 HTML 注入面审计。
//
// 这个后台有两百多处 innerHTML，页面上的字又大多来自人填的内容和接口返回（独立站表单接入后还有访客填的）。
// 靠「写的时候记得 esc()」守不住，靠人肉逐行复查也守不住 —— 所以让机器来证明：
// 找出每一个「进入 HTML 的表达式」（innerHTML / outerHTML / insertAdjacentHTML 的右侧、带标签的模板字符串里的插值、
// 与带标签的字符串相加的操作数），要求它**可证明安全**，证明不了就报出来。
//
// 可证明安全 =
//   · 字面量；esc() 的返回值；必然是数字 / 布尔的运算（算术、比较、Number()、toFixed()、.length、Date 取数…）
//   · 只从「全是字面量的常量表」里取的值；遍历这种常量表时回调拿到的元素
//   · 由上述东西拼成的字符串；同文件或 import 进来的函数，只要它每条 return 都满足上面的条件
//   · 局部变量：它在所在作用域里的**每一次**赋值都满足上面的条件
//   · 具名函数把参数原样拼进 HTML：把义务转给**每一个调用点**，调用点传进来的实参必须安全
// 函数参数、解构出来的名字、对象的字段（接口返回的 r.name 之类）一律当未知。
//
// 确实安全但证明不了的（例如「按钮先存下自己原来的 innerHTML，再放回去」），登记在 htmlSinksAllow.json 里并写明理由：
//   "@reviewed": { "文件:函数名": 理由 }   人工读过实现、确认返回值安全的函数
//   "文件|表达式": 理由                      那个文件里这个表达式可以原样进 HTML
//
// 管不到的（改这些地方时要自己看）：
//   · 没有任何标签字样的字符串被别的库当 HTML 渲染 —— 比如 ECharts 的 tooltip formatter 如果只返回 name + ': ' + value
//   · 链接地址的协议（javascript: 之类）—— 转义挡不住，要靠 isHttp() 这类检查
//   · 经典脚本通过 window.xxx 调用模块函数时传进来的实参
//
// 不是通用工具：它只认这个代码库的写法，宁可多报，不可少报。
// 用法：node server/scripts/auditHtmlSinks.mjs        （在仓库根目录；有发现时退出码为 1）
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* ---------- 词法 ---------- */
const KW = new Set(['return', 'const', 'let', 'var', 'if', 'else', 'case', 'typeof', 'new', 'in', 'of', 'await', 'yield', 'throw', 'delete', 'void', 'instanceof', 'do', 'while', 'for', 'function', 'export', 'import', 'default', 'async']);
function skipString(src, i) { const c = src[i]; let j = i + 1; while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; } return j + 1; }
function skipTemplate(src, i) {
  let j = i + 1;
  while (j < src.length && src[j] !== '`') {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === '$' && src[j + 1] === '{') { j = skipBraces(src, j + 2); continue; }
    j++;
  }
  return j + 1;
}
function skipBraces(src, k) { // k 在 ${ 之后；返回配对 } 之后的位置
  let depth = 1;
  while (k < src.length && depth > 0) {
    const d = src[k];
    if (d === '"' || d === "'") { k = skipString(src, k); continue; }
    if (d === '`') { k = skipTemplate(src, k); continue; }
    if (d === '{') depth++; else if (d === '}') depth--;
    k++;
  }
  return k;
}
function tokenize(src, from, to) {
  const toks = []; let i = from;
  while (i < to) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < to && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e === -1 ? to : e + 2; continue; }
    if (c === '"' || c === "'") { const e = skipString(src, i); toks.push({ t: 'str', v: src.slice(i + 1, e - 1), s: i, e }); i = e; continue; }
    if (c === '`') {
      const quasis = []; const exprs = []; let j = i + 1; let q = '';
      while (j < to && src[j] !== '`') {
        if (src[j] === '\\') { q += src.slice(j, j + 2); j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') { quasis.push(q); q = ''; const k = skipBraces(src, j + 2); exprs.push({ s: j + 2, e: k - 1 }); j = k; continue; }
        q += src[j]; j++;
      }
      quasis.push(q);
      toks.push({ t: 'tpl', quasis, exprs, s: i, e: j + 1 }); i = j + 1; continue;
    }
    if (c === '/') {
      const p = toks[toks.length - 1];
      if (!p || (p.t === 'p' && !/^[)\]}]$/.test(p.v)) || (p.t === 'id' && KW.has(p.v))) {
        let j = i + 1; let cls = false;
        while (j < to && (src[j] !== '/' || cls)) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '\n') break; j++; }
        j++; while (j < to && /[a-z]/.test(src[j])) j++;
        toks.push({ t: 'regex', s: i, e: j }); i = j; continue;
      }
    }
    if (/[A-Za-z_$]/.test(c)) { let j = i + 1; while (j < to && /[\w$]/.test(src[j])) j++; toks.push({ t: 'id', v: src.slice(i, j), s: i, e: j }); i = j; continue; }
    if (/[0-9]/.test(c)) { let j = i + 1; while (j < to && /[\w.]/.test(src[j])) j++; toks.push({ t: 'num', v: src.slice(i, j), s: i, e: j }); i = j; continue; }
    const three = src.slice(i, i + 3); const two = src.slice(i, i + 2);
    const op = ['===', '!==', '...', '**=', '>>>', '&&=', '||=', '??='].includes(three) ? three
      : ['==', '!=', '=>', '+=', '-=', '*=', '/=', '++', '--', '&&', '||', '??', '<=', '>=', '?.', '**'].includes(two) ? two : c;
    toks.push({ t: 'p', v: op, s: i, e: i + op.length }); i += op.length;
  }
  return toks;
}
function group(toks, s, e) {
  const rootG = { t: 'grp', open: '', items: [], s, e, parent: null };
  const stack = [rootG];
  for (const tk of toks) {
    const top = stack[stack.length - 1];
    if (tk.t === 'p' && /^[([{]$/.test(tk.v)) { const g = { t: 'grp', open: tk.v, items: [], s: tk.s, parent: top }; top.items.push(g); stack.push(g); continue; }
    if (tk.t === 'p' && /^[)\]}]$/.test(tk.v) && stack.length > 1) { stack.pop().e = tk.e; continue; }
    tk.parent = top; top.items.push(tk);
  }
  while (stack.length > 1) { const g = stack.pop(); g.e = g.items.length ? g.items[g.items.length - 1].e : g.s + 1; }
  return rootG;
}

/* sources = { 路径: 源码 }；allow = htmlSinksAllow.json 的内容。返回 { stats, findings, stale }。
   一次审计的全部状态（缓存、进行中的推理前提、发现）都关在这个函数里，所以可以对着不同的源码反复调用（测试要喂反例）。
   函数体没有再缩进一层：到文件末尾前的那个「}」为止都是它。 */
export function auditHtmlSinks(sources, allow = {}) {
const REVIEWED = new Set(Object.keys(allow['@reviewed'] || {}));
const ctxs = new Map();
const defByParams = new Map(); // 参数节点 → { key, name, def, ctx }
const defByKey = new Map();
function regDef(ctx, name, def) { ctx.funcs.set(name, def); const info = { key: ctx.file + ':' + name, name, def, ctx }; defByParams.set(def.params, info); defByKey.set(info.key, info); }
function link(ctx, g) { // 给模板里的每个插值建子树，并挂回外层
  for (const it of g.items) {
    if (it.t === 'grp') link(ctx, it);
    else if (it.t === 'tpl') for (const ex of it.exprs) { ex.tree = group(tokenize(ctx.src, ex.s, ex.e), ex.s, ex.e); ex.tree.parent = it.parent; ex.tree.anchor = it; link(ctx, ex.tree); }
  }
}
const isP = (x, v) => x && x.t === 'p' && x.v === v;
const isId = (x, v) => x && x.t === 'id' && (v === undefined || x.v === v);
function collectDefs(ctx, g) {
  const L = g.items;
  for (let i = 0; i < L.length; i++) {
    const it = L[i];
    if (isId(it, 'function') && isId(L[i + 1]) && L[i + 2]?.open === '(' && L[i + 3]?.open === '{') regDef(ctx, L[i + 1].v, { params: L[i + 2], body: L[i + 3] });
    if (isId(it) && isP(L[i + 1], '=') && (isId(L[i - 1], 'const') || isId(L[i - 1], 'let') || isId(L[i - 1], 'var'))) {
      let k = i + 2; if (isId(L[k], 'async')) k++;
      const params = L[k];
      if ((params?.open === '(' || isId(params)) && isP(L[k + 1], '=>')) {
        const body = L[k + 2];
        regDef(ctx, it.v, body?.open === '{' ? { params, body } : { params, expr: rhsFrom(ctx, L, k + 2) });
      }
    }
    if (isId(it, 'import') && L[i + 1]?.open === '{') {
      const j = L.findIndex((x, n) => n > i && isId(x, 'from'));
      const spec = j !== -1 && L[j + 1]?.t === 'str' ? L[j + 1].v : null;
      if (spec) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(ctx.file), spec));
        const names = L[i + 1].items;
        for (let n = 0; n < names.length; n++) {
          if (!isId(names[n])) continue;
          if (isId(names[n + 1], 'as') && isId(names[n + 2])) { ctx.imports.set(names[n + 2].v, { file: target, name: names[n].v }); n += 2; }
          else ctx.imports.set(names[n].v, { file: target, name: names[n].v });
        }
      }
    }
    if (it.t === 'grp') collectDefs(ctx, it);
  }
}
const STMT_KW = new Set(['const', 'let', 'var', 'return', 'if', 'for', 'while', 'function', 'throw', 'else', 'try', 'switch', 'export', 'break', 'continue', 'case', 'default']);
// 从 L[k] 起取一个表达式：到本层的 ; 或 , 为止；没写分号时在「换行 + 下一条语句开头」处断开
function rhsFrom(ctx, L, k) {
  const out = [];
  for (let i = k; i < L.length; i++) {
    const x = L[i];
    if (x.t === 'p' && (x.v === ';' || x.v === ',')) break;
    if (x.t === 'id' && STMT_KW.has(x.v) && out.length) break;
    if (out.length) {
      const prev = out[out.length - 1];
      const nl = ctx.src.slice(prev.e, x.s).includes('\n');
      if (nl && prev.t !== 'p' && x.t === 'id' && !isP(L[i + 1], '=>') ) break;
    }
    out.push(x);
  }
  return out;
}

/* ---------- 判定 ---------- */
const textOf = (ctx, items) => (items.length ? ctx.src.slice(items[0].s, items[items.length - 1].e) : '');
function splitTop(items, pred) { const out = [[]]; for (const it of items) { if (pred(it)) out.push([]); else out[out.length - 1].push(it); } return out; }
const NUM_CALL = /^(Number|parseInt|parseFloat|Math\.\w+|Date\.now|Boolean)$/;
const ESC_CALL = /^(window\.)?esc$|^escapeText$/;
const memo = new Map(); const busy = new Set();

const CMP = new Set(['<', '>', '<=', '>=', '==', '===', '!=', '!==']);
function exprSafe(ctx, items) {
  if (!items.length) return true;
  const q = items.findIndex((x) => isP(x, '?'));
  if (q !== -1) {
    let depth = 0; let colon = -1;
    for (let i = q + 1; i < items.length; i++) { if (isP(items[i], '?')) depth++; else if (isP(items[i], ':')) { if (depth === 0) { colon = i; break; } depth--; } }
    if (colon !== -1) return exprSafe(ctx, items.slice(q + 1, colon)) && exprSafe(ctx, items.slice(colon + 1));
  }
  for (const op of ['||', '??']) { const parts = splitTop(items, (x) => isP(x, op)); if (parts.length > 1) return parts.every((p) => exprSafe(ctx, p)); }
  { const parts = splitTop(items, (x) => isP(x, '&&')); if (parts.length > 1) return exprSafe(ctx, parts[parts.length - 1]); }
  if (items.some((x) => (x.t === 'p' && CMP.has(x.v)) || isId(x, 'instanceof') || isId(x, 'in'))) return true; // 比较：布尔
  return splitTop(items, (x) => isP(x, '+')).every((p) => operandSafe(ctx, p));
}
function tplSafe(ctx, tpl) { return tpl.exprs.every((ex) => exprSafe(ctx, ex.tree.items)); }

let failLeaf = null;
function operandSafe(ctx, items) {
  const ok = operandSafe0(ctx, items);
  if (!ok && failLeaf === null && items.length) failLeaf = textOf(ctx, items).trim().replace(/\s+/g, ' ').slice(0, 70);
  return ok;
}
function operandSafe0(ctx, items) {
  if (!items.length) return true;
  if (allowed(ctx, items)) return true;
  const f = items[0];
  if (f.t === 'p' && ['!', '-', '~'].includes(f.v)) return true;        // 布尔 / 数字
  if (isId(f, 'typeof') || isId(f, 'void')) return true;
  if (isId(f, 'await')) return operandSafe(ctx, items.slice(1));
  if (items.length === 1) {
    if (f.t === 'str' || f.t === 'num') return true;
    if (f.t === 'tpl') return tplSafe(ctx, f);
    if (f.t === 'grp' && f.open === '(') return exprSafe(ctx, f.items);
    if (f.t === 'grp' && f.open === '{') return literalOnly(ctx, f); // 选项对象：toLocaleString(undefined, { maximumFractionDigits: 2 })
    if (f.t === 'id') return ['true', 'false', 'null', 'undefined', 'NaN'].includes(f.v) || resolveIdent(ctx, f);
    return false;
  }
  if (items.some((x) => x.t === 'p' && ['*', '/', '-', '%', '**'].includes(x.v))) return true; // 算术：结果只能是数字
  if (items.some((x) => isP(x, '++') || isP(x, '--'))) return true;

  const last = items[items.length - 1];
  if (last.t === 'grp' && last.open === '(') {
    const calleeItems = items.slice(0, -1); const callee = textOf(ctx, calleeItems).replace(/\s+/g, '');
    if (ESC_CALL.test(callee) || NUM_CALL.test(callee) || callee === 'encodeURIComponent') return true;
    if (/\.toFixed$/.test(callee)) return true;
    if (/\.(getFullYear|getMonth|getDate|getDay|getHours|getMinutes|getSeconds|getTime)$/.test(callee)) return true; // Date 的取数方法：数字
    if (callee === 'String') return exprSafe(ctx, last.items);
    // 这些方法不引入新字符：结果安不安全取决于接收者（和实参）。x.toLocaleString() 对字符串什么都不防，所以接收者得先证明安全
    if (/\.(toLocaleString|toString|padStart|padEnd|slice|trim|toUpperCase|toLowerCase|substring)$/.test(callee)) {
      return operandSafe(ctx, calleeItems.slice(0, -2)) && splitTop(last.items, (x) => isP(x, ',')).every((a) => exprSafe(ctx, a));
    }
    if (/\.join$/.test(callee)) return joinSafe(ctx, calleeItems.slice(0, -2), last);
    if (calleeItems.length === 1 && isId(calleeItems[0])) return callSafeArgs(ctx, calleeItems[0].v, last);
    if (calleeItems.length === 3 && isId(calleeItems[0], 'window') && isP(calleeItems[1], '.') && isId(calleeItems[2])) return callSafeArgs(ctx, calleeItems[2].v, last);
    return false;
  }
  if (isId(last, 'length') && isP(items[items.length - 2], '.')) return true;
  // 字面量表取值：TABLE[x] / TABLE.key
  if (isId(f) && (items[1]?.open === '[' || isP(items[1], '.'))) {
    if (constTable(ctx, f)) return true;
    const saved = noParam; noParam = true; const ok = resolveIdent(ctx, f); noParam = saved;
    if (ok) return true;
  }
  return false;
}
// xxx.map(cb).join(sep)：回调的返回值安全、分隔符安全
function joinSafe(ctx, recv, joinArgs) { return exprSafe(ctx, joinArgs.items) && arraySafe(ctx, recv); }
// 一个数组表达式的每个元素是否都安全
function arraySafe(ctx, items) {
  if (!items.length) return false;
  for (const op of ['||', '??']) { const parts = splitTop(items, (x) => isP(x, op)); if (parts.length > 1) return parts.every((p) => arraySafe(ctx, p)); }
  const last = items[items.length - 1];
  if (items.length === 1) {
    if (last.open === '[') return splitTop(last.items, (x) => isP(x, ',')).every((p) => (isP(p[0], '...') ? arraySafe(ctx, p.slice(1)) : exprSafe(ctx, p)));
    if (last.open === '(') return arraySafe(ctx, last.items);
    if (isId(last)) return resolveIdent(ctx, last, true);
    return false;
  }
  const m = items[items.length - 2]; const dot = items[items.length - 3];
  if (last.open === '(' && isId(m) && (isP(dot, '.') || isP(dot, '?.'))) {
    const recv = items.slice(0, -3);
    if (m.v === 'map' || m.v === 'flatMap') return callbackSafe(ctx, last.items);
    if (['filter', 'slice', 'reverse', 'sort'].includes(m.v)) return arraySafe(ctx, recv);
    if (m.v === 'concat') return arraySafe(ctx, recv) && splitTop(last.items, (x) => isP(x, ',')).every((p) => arraySafe(ctx, p));
  }
  return false;
}
function callbackSafe(ctx, args) {
  const a = args.findIndex((x) => isP(x, '=>'));
  if (a === -1) { const first = splitTop(args, (x) => isP(x, ','))[0]; return first.length === 1 && isId(first[0]) ? callSafe(ctx, first[0].v) : false; }
  const body = args.slice(a + 1);
  if (body[0]?.open === '{' && body.length === 1) return returnsSafe(ctx, body[0]);
  return exprSafe(ctx, rhsFrom(ctx, body, 0));
}
function returnsSafe(ctx, g) {
  let ok = true;
  (function scan(grp) {
    const L = grp.items;
    for (let i = 0; i < L.length && ok; i++) {
      if (isId(L[i], 'return')) { if (!exprSafe(ctx, rhsFrom(ctx, L, i + 1))) ok = false; }
      else if (L[i].t === 'grp') {
        const nestedFn = L[i].open === '{' && (isP(L[i - 1], '=>') || (L[i - 1]?.open === '(' && (isId(L[i - 2], 'function') || isId(L[i - 3], 'function'))));
        if (!nestedFn) scan(L[i]);
      }
    }
  })(g);
  return ok;
}
function callSafe(ctx, name) {
  let c = ctx; let n = name;
  if (!c.funcs.has(n) && c.imports.has(n)) { const im = c.imports.get(n); c = ctxs.get(im.file); n = im.name; }
  if (!c) return false;
  const key = c.file + ':' + n;
  if (REVIEWED.has(key)) return true;
  const def = c.funcs.get(n);
  if (!def) return false;
  if (memo.has(key)) return memo.get(key);
  if (busy.has(key)) return false;
  busy.add(key);
  const ok = def.expr ? exprSafe(c, def.expr) : returnsSafe(c, def.body);
  busy.delete(key); if (!paramMode) memo.set(key, ok);
  return ok;
}
const ITER = new Set(['map', 'forEach', 'filter', 'some', 'every', 'flatMap', 'find', 'findIndex']);
// params 是某个箭头函数的参数；callGroup 是这个箭头所在的调用实参组。name 是迭代回调的第二个参数（下标）→ 数字
function isIndexParam(params, name, callGroup) {
  if (!params || params.open !== '(' || !callGroup || callGroup.open !== '(' || !callGroup.parent) return false;
  const names = splitTop(params.items, (x) => isP(x, ','));
  if (!(names[1] && names[1].length === 1 && isId(names[1][0], name))) return false;
  const P = callGroup.parent.items; const gi = P.indexOf(callGroup);
  return isId(P[gi - 1]) && ITER.has(P[gi - 1].v) && (isP(P[gi - 2], '.') || isP(P[gi - 2], '?.'));
}
let transparent = null; // 正在按「参数透传」评估的函数：{ def, used:Set<参数名> }
function lookupDef(ctx, name) {
  let c = ctx; let n = name;
  if (!c.funcs.has(n) && c.imports.has(n)) { const im = c.imports.get(n); c = ctxs.get(im.file); n = im.name; }
  return c && c.funcs.has(n) ? { c, n, def: c.funcs.get(n) } : null;
}
function paramNames(params) {
  if (params.t === 'id') return [params.v];
  return splitTop(params.items, (x) => isP(x, ',')).map((q) => (q.length && isId(q[0]) ? q[0].v : null));
}
function callSafeArgs(ctx, name, argsGroup) {
  if (callSafe(ctx, name)) return true;
  const r = lookupDef(ctx, name); if (!r) return false;
  const key = r.c.file + ':' + r.n + '|T';
  let info = memo.get(key);
  if (info === undefined) {
    if (busy.has(key)) return false;
    busy.add(key);
    const saved = transparent; transparent = { def: r.def, used: new Set() };
    const ok = r.def.expr ? exprSafe(r.c, r.def.expr) : returnsSafe(r.c, r.def.body);
    info = ok ? [...transparent.used] : false;
    transparent = saved; busy.delete(key); if (!paramMode) memo.set(key, info);
  }
  if (info === false) return false;
  const names = paramNames(r.def.params);
  const args = splitTop(argsGroup.items, (x) => isP(x, ','));
  return info.every((pn) => {
    const idx = names.indexOf(pn); if (idx === -1) return false;
    if (args[idx] && args[idx].length > 0) return exprSafe(ctx, args[idx]);
    const decl = r.def.params.t === 'id' ? [] : (splitTop(r.def.params.items, (x) => isP(x, ','))[idx] || []);
    const eq = decl.findIndex((x) => isP(x, '='));
    return eq === -1 ? true : exprSafe(r.c, decl.slice(eq + 1));
  });
}
let paramMode = null; // { nodes:Set<参数节点>, hits:Set<"key#参数名"> }：把「所在具名函数的参数」先当安全，记下义务，回头查每个调用点
let noParam = false;  // 成员访问（x.y / x[0]）时不许把参数当安全：参数是个对象，它的字段是未知的
function paramHit(paramsNode, name) {
  if (noParam) return null;
  if (transparent && paramsNode === transparent.def.params) { transparent.used.add(name); return true; }
  if (paramMode && paramMode.nodes.has(paramsNode)) { paramMode.hits.add(defByParams.get(paramsNode).key + '#' + name); return true; }
  return null;
}
// 遍历一个字面量常量数组：回调的第一个参数就是数组里的字面量
function isConstIter(ctx, params, name, callGroup) {
  if (!params || !callGroup || callGroup.open !== '(' || !callGroup.parent) return false;
  const first = params.t === 'id' ? params.v : (splitTop(params.items, (x) => isP(x, ','))[0] || [])[0]?.v;
  if (first !== name) return false;
  const P = callGroup.parent.items; const gi = P.indexOf(callGroup);
  if (!(isId(P[gi - 1]) && ITER.has(P[gi - 1].v) && isP(P[gi - 2], '.'))) return false;
  const recv = P[gi - 3];
  if (recv?.t === 'grp' && recv.open === '[') return literalOnly(ctx, recv);
  return isId(recv) && !isP(P[gi - 4], '.') && constTable(ctx, recv);
}
function enclosingParamNodes(node) {
  const out = new Set();
  while (node) {
    const G = node.parent; if (!G) break;
    const L = G.items; const i = L.indexOf(node);
    for (let j = i; j >= 1; j--) { if (isP(L[j], ';')) break; if (isP(L[j], '=>') && defByParams.has(L[j - 1])) out.add(L[j - 1]); }
    if (G.open === '{' && G.parent) { const P = G.parent.items; const gi = P.indexOf(G); const before = isP(P[gi - 1], '=>') ? P[gi - 2] : P[gi - 1]; if (before && defByParams.has(before)) out.add(before); }
    node = G.anchor ? G.anchor : G;
  }
  return out;
}
const isAssign = (x) => !!x && x.t === 'p' && ['=', '+=', '||=', '??=', '&&='].includes(x.v);
const hasIdent = (g, name) => (g.t === 'id' ? g.v === name : g.t === 'grp' ? g.items.some((x) => hasIdent(x, name)) : false);
// 找名字在最近一层作用域里的全部赋值；全部安全才算安全。是参数 / 解构出来的 / 找不到 → 不安全
function resolveIdent(ctx, tok, asArray = false) {
  const name = tok.v;
  const key = ctx.file + '#' + name + '@' + tok.s + (asArray ? '[]' : '');
  if (busy.has(key)) return false;
  busy.add(key);
  try {
    let node = tok;
    while (node) {
      const G = node.parent; if (!G) break;
      const L = G.items; const i = L.indexOf(node.anchor && !L.includes(node) ? node.anchor : node);
      // 表达式体箭头函数的参数
      for (let j = i; j >= 0; j--) {
        if (isP(L[j], ';')) break;
        if (isP(L[j], '=>') && L[j - 1] && hasIdent(L[j - 1], name)) return paramHit(L[j - 1], name) ?? (isIndexParam(L[j - 1], name, G) || isConstIter(ctx, L[j - 1], name, G));
      }
      // 这一层有没有声明
      const assigns = []; let declared = false;
      for (let k = 0; k < L.length; k++) {
        // const { name } = obj / const [name] = arr：这一层声明了它，但值来自解构，未知。不能再往外找同名变量顶替
        if ((isId(L[k], 'const') || isId(L[k], 'let') || isId(L[k], 'var')) && L[k + 1]?.t === 'grp' && hasIdent(L[k + 1], name)) return false;
        if (isId(L[k], name) && !isP(L[k - 1], '.') && !isP(L[k - 1], '?.')) {
          if (isAssign(L[k + 1])) {
            if (isId(L[k - 1], 'const') || isId(L[k - 1], 'let') || isId(L[k - 1], 'var') || (isP(L[k - 1], ',') && inDeclaration(L, k))) declared = true;
          } else if ((isId(L[k - 1], 'let') || isId(L[k - 1], 'var')) ) declared = true; // let x; 之后再赋值
        }
      }
      if (declared) {
        (function scan(grp) {
          const M = grp.items;
          for (let k = 0; k < M.length; k++) {
            if (isId(M[k], name) && !isP(M[k - 1], '.') && !isP(M[k - 1], '?.') && isAssign(M[k + 1])) assigns.push(rhsFrom(ctx, M, k + 2));
            if (M[k].t === 'grp') scan(M[k]);
            if (M[k].t === 'tpl') for (const ex of M[k].exprs) scan(ex.tree);
          }
        })(G);
        if (!asArray) return assigns.length > 0 && assigns.every((a) => exprSafe(ctx, a));
        let pushesOk = true;
        (function scanPush(grp) {
          const M = grp.items;
          for (let k = 0; k < M.length && pushesOk; k++) {
            if (isId(M[k], name) && !isP(M[k - 1], '.') && M[k + 1]?.open === '[' && isAssign(M[k + 2])) pushesOk = false; // arr[i] = x：查不了，按不安全算
            if (isId(M[k], name) && isP(M[k + 1], '.') && isId(M[k + 2]) && ['splice', 'fill'].includes(M[k + 2].v)) pushesOk = false;
            if (isId(M[k], name) && isP(M[k + 1], '.') && isId(M[k + 2]) && ['push', 'unshift'].includes(M[k + 2].v) && M[k + 3]?.open === '(') {
              if (!splitTop(M[k + 3].items, (x) => isP(x, ',')).every((a) => (isP(a[0], '...') ? arraySafe(ctx, a.slice(1)) : exprSafe(ctx, a)))) pushesOk = false;
            }
            if (M[k].t === 'grp') scanPush(M[k]);
            if (M[k].t === 'tpl') for (const ex of M[k].exprs) scanPush(ex.tree);
          }
        })(G);
        return pushesOk && assigns.length > 0 && assigns.every((a) => arraySafe(ctx, a));
      }
      // 块作用域的参数：function f(a){…} / (a)=>{…} / for(const a of …){…} / catch(e){…}
      if (G.open === '{' && G.parent) {
        const P = G.parent.items; const gi = P.indexOf(G);
        const before = isP(P[gi - 1], '=>') ? P[gi - 2] : P[gi - 1];
        const kw = !isP(P[gi - 1], '=>') && isId(P[gi - 2]) ? P[gi - 2].v : '';
        if (kw === 'for' && before?.open === '(') {
          const F = before.items; const k = F.findIndex((x, n) => isId(x, name) && (isId(F[n - 1], 'let') || isId(F[n - 1], 'var')) && isP(F[n + 1], '='));
          if (k !== -1) return exprSafe(ctx, rhsFrom(ctx, F, k + 2)); // for (let i = 0; …; i++)：只会被 ++ / += 数字改
          if (hasIdent(before, name) && F.some((x) => isId(x, 'of') || isId(x, 'in'))) return false; // for (const x of arr)：元素未知
        } else if (!['if', 'while', 'switch'].includes(kw) && before && hasIdent(before, name)) {
          return paramHit(before, name) ?? (isP(P[gi - 1], '=>') && (isIndexParam(before, name, G.parent) || isConstIter(ctx, before, name, G.parent)));
        }
      }
      if (G.open === '(' || G.open === '[' || G.open === '{') { // 解构声明 const {a} = … / 参数表里的自己
        const P = G.parent ? G.parent.items : []; const gi = P.indexOf(G);
        if ((isId(P[gi - 1], 'const') || isId(P[gi - 1], 'let') || isId(P[gi - 1], 'var')) && hasIdent(G, name)) return false;
      }
      node = G.anchor || G; // 往上一层（模板插值的子树挂在模板那个 token 上）
    }
    return false;
  } finally { busy.delete(key); }
}
function inDeclaration(L, k) { for (let j = k - 1; j >= 0; j--) { if (isP(L[j], ';')) return false; if (isId(L[j], 'const') || isId(L[j], 'let') || isId(L[j], 'var')) return true; } return false; }
// 模块顶层的 const TABLE = { … } / [ … ]，里面只有字面量
function constTable(ctx, tok) {
  const find = (c, L, name) => {
    for (let k = 0; k < L.length; k++) {
      if (isId(L[k], name) && isId(L[k - 1], 'const') && isP(L[k + 1], '=')) {
        const v = L[k + 2];
        const end = L[k + 3];
        if (!(v?.t === 'grp' && (v.open === '{' || v.open === '[')) || (end && !isP(end, ';') && !isP(end, ',') && !(end.t === 'id'))) return false;
        return literalOnly(c, v);
      }
    }
    return null;
  };
  for (let g = tok.parent; g; g = g.anchor ? g.anchor.parent : g.parent) { const r = find(ctx, g.items, tok.v); if (r !== null) return r; }
  const im = ctx.imports.get(tok.v);
  if (im && ctxs.get(im.file)) { const c = ctxs.get(im.file); const r = find(c, c.root.items, im.name); if (r !== null) return r; }
  return false;
}
function literalOnly(ctx, g) {
  const L = g.items;
  for (let i = 0; i < L.length; i++) {
    const x = L[i];
    if (x.t === 'str' || x.t === 'num') continue;
    if (x.t === 'p' && [',', ':', '-'].includes(x.v)) continue;
    if (x.t === 'id' && (isP(L[i + 1], ':') || ['true', 'false', 'null'].includes(x.v))) continue;
    if (x.t === 'grp' && (x.open === '{' || x.open === '[')) { if (literalOnly(ctx, x)) continue; return false; }
    return false;
  }
  return true;
}

/* ---------- 扫描 ---------- */
const HTMLISH = /<\/?[a-zA-Z!]|^\s*>|["']\s*\/?>|\s(class|style|href|src|title|data-[\w-]+|id|value|colspan)=/;
const isHtmlText = (s) => HTMLISH.test(s);
const lineOf = (ctx, pos) => { let n = 1; for (let i = 0; i < pos; i++) if (ctx.src.charCodeAt(i) === 10) n++; return n; };
const SEPS = new Set([',', ';', '?', ':', '=', '+=', '=>', '&&', '||', '??', '==', '===', '!=', '!==', '<', '>', '<=', '>=', '-=', '*=', '/=']);
const SEP_KW = new Set(['return', 'const', 'let', 'var', 'if', 'else', 'case', 'throw', 'export', 'await', 'yield']);
const usedAllow = new Set();
const allowed = (ctx, items) => { const k = ctx.file + '|' + textOf(ctx, items).trim().replace(/\s+/g, ' '); if (!Object.prototype.hasOwnProperty.call(allow, k)) return false; usedAllow.add(k); return true; };
const findings = []; const stats = { templates: 0, chains: 0, sinks: 0, exprs: 0, auto: 0 };
const obligations = new Set();
function withParams(ctx, kind, items) {
  const nodes = enclosingParamNodes(items[0]);
  if (!nodes.size) return false;
  paramMode = { nodes, hits: new Set() };
  const ok = kind === 'cat' ? operandSafe(ctx, items) : exprSafe(ctx, items);
  const hits = paramMode.hits; paramMode = null;
  if (!ok) return false;
  for (const h of hits) obligations.add(h);
  return true;
}
function note(ctx, kind, items, ok) {
  stats.exprs++;
  if (ok) { failLeaf = null; stats.auto++; return; }
  const why = failLeaf; failLeaf = null;
  if (items[0].parent && withParams(ctx, kind, items)) { failLeaf = null; stats.auto++; stats.deferred = (stats.deferred || 0) + 1; return; }
  failLeaf = null;
  if (why && why !== textOf(ctx, items).trim().replace(/\s+/g, ' ').slice(0, 70)) { findings.push({ file: ctx.file, line: lineOf(ctx, items[0].s), kind, expr: textOf(ctx, items).trim().replace(/\s+/g, ' ').slice(0, 90) + '   〔卡在：' + why + '〕' }); return; }
  findings.push({ file: ctx.file, line: lineOf(ctx, items[0].s), kind, expr: textOf(ctx, items).trim().replace(/\s+/g, ' ').slice(0, 150) });
}
function walk(ctx, g) {
  const L = g.items;
  for (let i = 0; i < L.length; i++) {
    const it = L[i];
    if (it.t === 'tpl') {
      if (isHtmlText(it.quasis.join('\u0000'))) { stats.templates++; for (const ex of it.exprs) note(ctx, 'tpl', ex.tree.items.length ? ex.tree.items : [{ s: ex.s, e: ex.e }], exprSafe(ctx, ex.tree.items)); }
      for (const ex of it.exprs) walk(ctx, ex.tree);
    } else if (it.t === 'grp') walk(ctx, it);
    // 落点
    if (isId(it) && ['innerHTML', 'outerHTML'].includes(it.v) && isP(L[i - 1], '.') && (isP(L[i + 1], '=') || isP(L[i + 1], '+='))) {
      stats.sinks++;
      const rhs = rhsFrom(ctx, L, i + 2);
      if (rhs.length) note(ctx, 'sink', rhs, exprSafe(ctx, rhs));
    }
    if (isId(it, 'insertAdjacentHTML') && L[i + 1]?.open === '(') {
      stats.sinks++;
      const arg = splitTop(L[i + 1].items, (x) => isP(x, ','))[1] || [];
      if (arg.length) note(ctx, 'sink', arg, exprSafe(ctx, arg));
    }
  }
  // 这一层的拼接链
  for (const seg of splitTop(L, (x) => (x.t === 'p' && SEPS.has(x.v)) || (x.t === 'id' && SEP_KW.has(x.v)))) {
    const ops = splitTop(seg, (x) => isP(x, '+'));
    if (ops.length < 2) continue;
    if (!ops.some((o) => o.length === 1 && ((o[0].t === 'str' && isHtmlText(o[0].v)) || (o[0].t === 'tpl' && isHtmlText(o[0].quasis.join('\u0000')))))) continue;
    stats.chains++;
    for (const o of ops) { if (!o.length || (o.length === 1 && o[0].t === 'str')) continue; note(ctx, 'cat', o, operandSafe(ctx, o)); }
  }
}

for (const [file, src] of Object.entries(sources)) {
  const ctx = { file, src, funcs: new Map(), imports: new Map() };
  ctx.root = group(tokenize(src, 0, src.length), 0, src.length);
  link(ctx, ctx.root); collectDefs(ctx, ctx.root);
  ctxs.set(file, ctx);
}
for (const ctx of ctxs.values()) walk(ctx, ctx.root);

/* ---------- 参数义务：每个调用点传进来的实参必须安全 ---------- */
{
  const queue = [...obligations]; const seenOb = new Set(queue);
  while (queue.length) {
    const ob = queue.pop(); const [key, param] = ob.split('#'); const info = defByKey.get(key);
    const idx = paramNames(info.def.params).indexOf(param);
    let callSites = 0;
    for (const ctx of ctxs.values()) {
      (function scan(g) {
        const L = g.items;
        for (let i = 0; i < L.length; i++) {
          const it = L[i];
          if (it.t === 'grp') scan(it);
          else if (it.t === 'tpl') for (const ex of it.exprs) scan(ex.tree);
          if (!isId(it, info.name) || isP(L[i - 1], '.') || isId(L[i - 1], 'function')) continue;
          const r = lookupDef(ctx, it.v); if (!r || r.def !== info.def) continue;
          const call = L[i + 1];
          if (call?.t === 'grp' && call.open === '(') {
            if (call === info.def.params) continue; // 定义本身
            callSites++;
            const arg = splitTop(call.items, (x) => isP(x, ','))[idx] || [];
            if (!arg.length || exprSafe(ctx, arg)) continue; // 没传 = 用默认值
            const before = new Set(obligations);
            if (withParams(ctx, 'tpl', arg)) { for (const o of obligations) if (!before.has(o) && !seenOb.has(o)) { seenOb.add(o); queue.push(o); } continue; }
            findings.push({ file: ctx.file, line: lineOf(ctx, arg[0].s), kind: 'arg', expr: textOf(ctx, arg).trim().replace(/\s+/g, ' ').slice(0, 110) + '  ⇒ ' + info.name + '(' + param + ')' });
          } else if (idx === 0 && g.open === '(' && g.parent) { // 作为回调传给 map / forEach：第一个参数是数组元素，查不了
            const P = g.parent.items; const gi = P.indexOf(g);
            if (isId(P[gi - 1]) && ITER.has(P[gi - 1].v)) { callSites++; findings.push({ file: ctx.file, line: lineOf(ctx, it.s), kind: 'arg', expr: info.name + ' 作为回调传入，参数 ' + param + ' 来自数组元素' }); }
          }
        }
      })(ctx.root);
    }
    // 一个调用点都没找到：这个函数是从扫描不到的地方被调用的（事件委托表、经典脚本的 window.xxx），实参没人把过关
    if (!callSites) findings.push({ file: info.ctx.file, line: lineOf(info.ctx, info.def.params.s), kind: 'arg', expr: info.name + '(' + param + ')：参数原样进了 HTML，但找不到任何调用点来核对实参' });
  }
}

// 同一位置的同一表达式可能既作为模板插值又作为拼接操作数被报两次
const seen = new Set();
const uniq = findings.filter((f) => { const k = f.file + ':' + f.line + ':' + f.expr; if (seen.has(k)) return false; seen.add(k); return true; });
// 登记了却没用上的条目：代码改过之后它已经不对应任何东西，留着只会让人以为那里还有个例外
const stale = [
  ...Object.keys(allow).filter((k) => k !== '@reviewed' && !usedAllow.has(k)),
  ...[...REVIEWED].filter((k) => !defByKey.has(k)).map((k) => '@reviewed ' + k),
];
return { stats, findings: uniq, stale };
}

/* 仓库里要审的前端源码：全部 ES 模块 + 三个经典脚本（打包产物和第三方库不审） */
export function frontendSources(root) {
  const files = [
    ...readdirSync(path.join(root, 'public/src')).filter((f) => f.endsWith('.js')).sort().map((f) => 'public/src/' + f),
    'public/api.js', 'public/hermes.js', 'public/login.js',
  ];
  return Object.fromEntries(files.map((f) => [f, readFileSync(path.join(root, f), 'utf8')]));
}
export const ALLOW_FILE = fileURLToPath(new URL('./htmlSinksAllow.json', import.meta.url));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const { stats, findings, stale } = auditHtmlSinks(frontendSources(root), JSON.parse(readFileSync(ALLOW_FILE, 'utf8')));
  console.log(`写入点 ${stats.sinks} 处，带标签的模板 ${stats.templates} 个，拼接链 ${stats.chains} 条；进入 HTML 的表达式 ${stats.exprs} 个，证明不了的 ${findings.length} 个`);
  let last = '';
  for (const f of findings) { if (f.file !== last) { console.log('\n== ' + f.file); last = f.file; } console.log(`  ${String(f.line).padStart(4)} ${f.kind.padEnd(4)} ${f.expr}`); }
  for (const k of stale) console.log('登记了但没用上：' + k);
  process.exit(findings.length || stale.length ? 1 : 0);
}
