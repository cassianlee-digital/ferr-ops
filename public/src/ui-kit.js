/* 全站 UI 基础工具（ES 模块 · esbuild 打包为 IIFE）—— 转义 / 弹窗 / toast 的**唯一实现**。
   从 public/app.js 原样搬来（零行为差异），目的是让 ES 模块**显式 import**这些工具，
   而不是继续靠 `window.esc` / `window.toast` 隐式解析：
     - 隐式全局对打包器和静态分析完全隐形，改名不会有编译期报错；
     - 改成 import 后，名字写错 esbuild 当场报错，这是我们要的那层保护。
   仍由 main.js 挂 window，但**只为两类真实消费者**：经典脚本 public/hermes.js，以及
   尚未模块化的 public/app.js。ES 模块请一律 import，不要再读 window。
   本模块**不 import 任何业务模块**（避免环）；唯一的跨层调用 toastGo→go 走 window 延迟解析。 */

/* ===== 安全工具 ===== */
// 全站唯一转义入口：& < > " ' ；null/undefined → ''
export function esc(s) {
  return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// 单值文本写入，杜绝 HTML 解析
export function renderText(el, s) { if (el) el.textContent = (s == null ? '' : String(s)); }
// AI/Markdown → 安全 HTML：先整体 esc(原始 HTML 一律变文本，无法成标签)，再仅生成白名单标签 p/br/strong/ul/li
export function mdToHtml(t) {
  const src = esc(t).split(/\n/);
  let html = '', para = [], inList = false;
  const flushP = () => { if (para.length) { html += '<p>' + para.join('<br>') + '</p>'; para = []; } };
  const flushL = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (let line of src) {
    line = line.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>'); // 仅白名单：加粗
    const m = line.match(/^\s*[-*]\s+(.*)$/);
    if (m) { flushP(); if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + m[1] + '</li>'; }
    else if (line.trim() === '') { flushP(); flushL(); }
    else { flushL(); para.push(line); }
  }
  flushP(); flushL();
  return html;
}

/* ===== MODALS ===== */
export function openModal(id) { document.getElementById(id).classList.add('show'); }
export function closeModal(id) { document.getElementById(id).classList.remove('show'); }
// 点遮罩关闭。bundle 为经典脚本且位于 body 之后，模块求值时 DOM 已解析（与 timerange.js 同一前提）。
// typeof 守卫不是防御性摆设：本模块已被 22 个模块 import，其中 table-editor.js 会被 node --test
// 真实 import（无 DOM），求值期直接碰 document 会让整个测试文件崩掉（已实测踩到）。
if (typeof document !== 'undefined') {
  document.querySelectorAll('.modal-mask').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('show'); }));
}

/* ===== TOAST ===== */
let tt;
// #toast 不存在就安静退场（登录页等没有它；3.4 秒后触发的隐藏定时器也可能在 DOM 已消失时才跑）。
// 原实现直接 t.style 会抛，把调用方的正常流程一起带崩 —— 提示失败不该让业务失败。
const toastEl = () => (typeof document === 'undefined' ? null : document.getElementById('toast'));
export function showToast() {
  const t = toastEl(); if (!t) return;
  t.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(tt);
  tt = setTimeout(hideToast, 3400);
  // 浏览器里 setTimeout 返回数字（无 unref），此行是空操作；在 node --test 里它返回 Timeout，
  // 不 unref 的话这个纯 UI 定时器会把测试进程多吊住 3.4 秒（实测 1.6s→3.7s）。
  if (tt && typeof tt.unref === 'function') tt.unref();
}
export function hideToast() { const t = toastEl(); if (!t) return; t.style.transform = 'translateX(-50%) translateY(80px)'; }
export function toast(m) { const t = toastEl(); if (!t) return; t.textContent = m; showToast(); }
/* 带「撤销」的 toast：勾错一条任务，刷新后它就被「已完成」折叠条收走了，找回来要先展开。
   趁 toast 还在，给一次一键撤销。 */
export function toastUndo(m, fn) {
  const t = toastEl(); if (!t) return; t.textContent = (m == null ? '' : String(m));
  const b = document.createElement('b'); b.textContent = '  撤销'; b.style.color = '#ff8a82'; b.style.cursor = 'pointer';
  b.onclick = () => { hideToast(); try { fn(); } catch (e) {} };
  t.appendChild(b); showToast();
}
export function toastGo(m, tab) {
  const t = toastEl(); if (!t) return; t.textContent = (m == null ? '' : String(m));
  if (tab) {
    t.appendChild(document.createTextNode('  ')); // NBSP：普通空格在此处会被 HTML 折叠掉，原实现即为 NBSP
    const b = document.createElement('b'); b.textContent = '查看 →'; b.style.color = '#ff8a82'; b.style.cursor = 'pointer';
    // go() 是导航层，仍在经典脚本 app.js 里 —— 此处延迟到点击时解析，避免 ui-kit 反向依赖上层。
    b.onclick = () => { if (typeof window.go === 'function') window.go(tab); hideToast(); };
    t.appendChild(b);
  }
  showToast();
}
