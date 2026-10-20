/* 任务的优先级 / 日期 / 时刻选择器（ES 模块 · esbuild 打包为 IIFE）。
   参照 Todoist 的轻弹层：日期胶囊点一下就能改期改时刻，不用开整张编辑弹窗——
   改期是日计划上最高频的动作，让它走四步弹窗是这块最先被骂的地方。

   显式依赖：esc 来自 ./ui-kit.js、formatLocalDate 来自 ./timerange.js。
   不挂 window：唯一消费者是 closed-loop.js，走显式 import（编译期可查）。

   ⚠ 时刻口径：task_hour 存的是**预计完成时刻**，不是开始时刻。开始时刻由 closed-loop.js
   的 annotateTaskTimes() 按「上一条的结束时刻」顺推（上班 08:30、扣午休）。所以这里只收一个
   时刻、不收「持续时长」——持续时长在本项目是推导值，收进来两套算法会打架。 */
import { esc } from './ui-kit.js';
import { formatLocalDate } from './timerange.js';

/* ===== 优先级：1 最高 / 4 普通（Todoist 口径）。NULL 一律视作 4，不回填假值 ===== */
export const PRIOS = [
  { v: 1, label: '优先级1', cls: 'tprio-1' },
  { v: 2, label: '优先级2', cls: 'tprio-2' },
  { v: 3, label: '优先级3', cls: 'tprio-3' },
  { v: 4, label: '优先级4', cls: 'tprio-4' },
];
export const normPrio = (p) => {
  const n = Number(p);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : 4;
};
export const prioOf = (it) => normPrio(it && it.task_priority);
/* 卡上的小旗。优先级 4（普通）不画旗——四条任务三面灰旗等于没信息，只留一个可点的占位热区。 */
export function prioFlagHtml(p, { action = 'task-prio', title = '设优先级' } = {}) {
  const v = normPrio(p);
  const meta = PRIOS[v - 1];
  // cls/label 取自本模块的 PRIOS、action 是调用方给的常量 —— 但 auditHtmlSinks 把参数和
  // 算出来的表一律当未知（宁可多报不可少报）。都是短字符串，esc() 一遍不改变渲染结果。
  return `<span class="tprio ${esc(meta.cls)}${v === 4 ? ' tprio-none' : ''}" data-loop-action="${esc(action)}" data-v="${v}" title="${esc(title)}：${esc(meta.label)}">`
    + `<i class="ti ti-flag${v === 4 ? '' : '-filled'}"></i></span>`;
}

/* ===== 时刻：'HH'（老数据，整点）或 'HH:MM'（15 分钟步进）=====
   两种格式按字符串排序即可：'09' < '09:30' < '10'。解析必须走 hourToMin()，
   别再写 Number(hr)*60 —— 那行碰到 '09:30' 会得到 NaN，整列时间段跟着错位。 */
export function hourToMin(h) {
  const t = String(h || '').trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = m[2] ? Number(m[2]) : 0;
  if (!(hh >= 0 && hh <= 23) || !(mm >= 0 && mm <= 59)) return null;
  return hh * 60 + mm;
}
export function fmtHour(h) {
  const min = hourToMin(h);
  if (min == null) return '';
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}
/* 15 分钟一档，00:00–23:45。Todoist 同款粒度；再细没人真的用得上。 */
export const TIME_OPTS = (() => {
  const out = [];
  for (let m = 0; m < 24 * 60; m += 15) out.push(fmtHour(Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0')));
  return out;
})();

/* ===== 弹层宿主：全局只有一个，开新的自动关旧的 ===== */
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
let _host = null;
let _onClose = null;
let _openedAt = 0;
function host() {
  if (_host) return _host;
  _host = document.createElement('div');
  _host.className = 'tpop';
  _host.hidden = true;
  document.body.appendChild(_host);
  // 点外面关掉。用捕获阶段：卡片上那些 data-loop-action 的委托在冒泡阶段跑，
  // 等它们跑完再关会让「点另一张卡的日期胶囊」先关后开，弹层位置闪一下。
  document.addEventListener('mousedown', (e) => {
    if (_host.hidden) return;
    if (e.target.closest('.tpop')) return;
    closePop();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
  window.addEventListener('resize', () => closePop());
  /* 看板各列自己滚动：锚点滚走了弹层还浮在原地 = 它指着一张已经不在那儿的卡，所以要关。
     捕获阶段监听才收得到列内滚动（scroll 不冒泡）。
     ⚠ 但捕获也会收到**弹层自己内部**的滚动 —— 月历和时刻列表都是可滚区。
     不排除掉的话：鼠标在月历里滚一下，弹层当场自己关掉，日期根本选不了。
     250ms 静默期另外挡的是：点按钮前的惯性滚动 / scrollIntoView 的余波。 */
  document.addEventListener('scroll', (e) => {
    if (!_host || _host.hidden) return;
    const t = e.target;
    if (t === _host || (t && t.nodeType === 1 && t.closest && t.closest('.tpop'))) return;
    if (Date.now() - _openedAt < 250) return;
    closePop();
  }, true);
  // 滚轮落在弹层里时直接吞掉冒泡，连带挡住某些浏览器把滚动链传给祖先容器（滚到底继续滚父级）
  _host.addEventListener('wheel', (e) => { e.stopPropagation(); }, { passive: true });
  return _host;
}
export function closePop() {
  if (!_host || _host.hidden) return;
  _host.hidden = true;
  _host.innerHTML = '';
  const cb = _onClose; _onClose = null;
  if (cb) cb();
}
/* anchor 下方弹出；贴右边界时左移，贴下边界时翻到上方。 */
function openPop(anchor, html, onClick, onClose) {
  const h = host();
  _onClose = onClose || null;
  _openedAt = Date.now();
  h.innerHTML = html;
  // 先归零再测：留着上一次的 left/top 会把弹层推到视口外，offsetHeight 量到的就是被压扁的高度
  h.style.left = '0px';
  h.style.top = '0px';
  h.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = h.offsetWidth, ht = h.offsetHeight;
  let left = r.left;
  if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
  let top = r.bottom + 6;
  if (top + ht > window.innerHeight - 8) top = r.top - ht - 6;   // 贴底就翻到锚点上方
  // 最后无条件夹进视口。三列看板各自带滚动，锚点可能本来就在可视区边缘甚至之外；
  // 只做「翻上方」不夹一刀，弹层会定位到屏幕外——点得到按钮、看不到弹层，最难查的那种。
  const fit = (v, size, max) => Math.min(Math.max(8, v), Math.max(8, max - size - 8));
  h.style.left = fit(left, w, window.innerWidth) + 'px';
  h.style.top = fit(top, ht, window.innerHeight) + 'px';
  h.onclick = (e) => {
    const hit = e.target.closest('[data-pop]');
    if (!hit) return;
    e.stopPropagation();
    onClick(hit.dataset.pop, hit.dataset.v || '', hit);
  };
  return h;
}

/* ===== 优先级弹层 ===== */
export function openPrioPop(anchor, cur, onPick) {
  const v = normPrio(cur);
  const rows = PRIOS.map((p) => `<div class="tpop-opt${p.v === v ? ' on' : ''}" data-pop="prio" data-v="${p.v}">`
    + `<i class="ti ti-flag${p.v === 4 ? '' : '-filled'} ${p.cls}"></i><span>${p.label}</span>`
    + (p.v === v ? '<i class="ti ti-check tpop-tick"></i>' : '') + '</div>').join('');
  openPop(anchor, `<div class="tpop-list">${rows}</div>`, (kind, val) => {
    if (kind !== 'prio') return;
    closePop();
    onPick(Number(val));
  });
}

/* ===== 日期 + 时刻弹层 =====
   state: { date:'YYYY-MM-DD'|'', hour:'HH'|'HH:MM'|'' }
   onApply(next) 由调用方负责落库；弹层自己不发请求（这块要能被别的卡复用）。 */
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const parseYmd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const cnDate = (d) => (d.getMonth() + 1) + '月' + d.getDate() + '日';

/* 快捷项按 Todoist：明天 / 本周稍后 / 本周周末 / 下周 / 没有日期。
   「本周稍后」= 本周内下一个工作日跳一天（周四那种），本周已经到周四往后就不给这项——
   给一个点了等于没动的按钮，比不给更烦人。 */
function quickRows(today) {
  const dow = today.getDay(); // 0=周日
  const out = [];
  const tm = addDays(today, 1);
  out.push({ k: 'd', v: formatLocalDate(tm), icon: 'ti-sun', label: '明天', hint: WD[tm.getDay()] });
  // 本周稍后：取本周四（周一=1…周四=4）；今天已过周三就跳过
  if (dow >= 1 && dow <= 2) {
    const thu = addDays(today, 4 - dow);
    out.push({ k: 'd', v: formatLocalDate(thu), icon: 'ti-calendar', label: '本周稍后', hint: WD[4] });
  }
  // 本周周末：本周六；周六周日当天不给
  if (dow >= 1 && dow <= 5) {
    const sat = addDays(today, 6 - dow);
    out.push({ k: 'd', v: formatLocalDate(sat), icon: 'ti-sofa', label: '本周周末', hint: WD[6] });
  }
  const nextMon = addDays(today, ((8 - (dow || 7)) % 7) || 7);
  out.push({ k: 'd', v: formatLocalDate(nextMon), icon: 'ti-arrow-right', label: '下周', hint: WD[1] + ' ' + cnDate(nextMon) });
  out.push({ k: 'clear', v: '', icon: 'ti-ban', label: '没有日期', hint: '' });
  return out;
}
/* 月历：当月 + 下月，周一起始（与项目里 ISO 周口径一致）。 */
function monthHtml(base, sel, today) {
  const y = base.getFullYear(), m = base.getMonth();
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7; // 周一=0
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<i></i>');
  for (let d = 1; d <= days; d++) {
    const ds = formatLocalDate(new Date(y, m, d));
    const isSel = ds === sel, isToday = ds === formatLocalDate(today);
    cells.push(`<b class="${isSel ? 'on' : ''}${isToday && !isSel ? ' td' : ''}" data-pop="d" data-v="${ds}">${d}</b>`);
  }
  return `<div class="tpop-mcap">${y}年${m + 1}月</div><div class="tpop-grid">${cells.join('')}</div>`;
}
export function openDatePop(anchor, state, onApply) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let date = state.date || '';
  let hour = state.hour || '';
  let mode = 'date'; // date | time

  const render = () => {
    if (mode === 'time') {
      const opts = TIME_OPTS.map((t) => `<div class="tpop-opt${t === fmtHour(hour) ? ' on' : ''}" data-pop="h" data-v="${esc(t)}">${esc(t)}</div>`).join('');
      return `<div class="tpop-head"><button type="button" class="tpop-back" data-pop="back"><i class="ti ti-chevron-left"></i> 返回</button>`
        + `<button type="button" class="tpop-clear" data-pop="hclear">清除时刻</button></div>`
        + `<div class="tpop-times">${opts}</div>`;
    }
    const sel = parseYmd(date);
    const title = date ? (cnDate(sel) + ' ' + WD[sel.getDay()]) : '未设日期';
    const quick = quickRows(today).map((q) => `<div class="tpop-opt" data-pop="${esc(q.k)}" data-v="${esc(q.v)}">`
      + `<i class="ti ${esc(q.icon)}"></i><span>${esc(q.label)}</span><em>${esc(q.hint)}</em></div>`).join('');
    const m1 = monthHtml(sel || today, date, today);
    const m2 = monthHtml(new Date((sel || today).getFullYear(), (sel || today).getMonth() + 1, 1), date, today);
    return `<div class="tpop-title">${esc(title)}</div>`
      + `<div class="tpop-list">${quick}</div>`
      + `<div class="tpop-cal">${m1}${m2}</div>`
      + `<button type="button" class="tpop-foot" data-pop="time"><i class="ti ti-clock"></i> 完成时刻<em>${hour ? esc(fmtHour(hour)) : '未定'}</em></button>`;
  };
  const paint = () => {
    const h = host();
    h.innerHTML = render();
    // 时刻列表 96 档，开在 00:00 的话选 16:30 要滚大半屏。滚到当前选中项（没选就滚到 09:00 附近，
    // 上班时间，而不是半夜）。
    const times = h.querySelector('.tpop-times');
    if (times) {
      const target = times.querySelector('.tpop-opt.on') || times.querySelector('[data-v="09:00"]');
      if (target) times.scrollTop = Math.max(0, target.offsetTop - times.clientHeight / 2 + target.offsetHeight / 2);
    }
  };

  openPop(anchor, render(), (kind, val) => {
    if (kind === 'd') { date = val; onApply({ date, hour }); closePop(); return; }
    if (kind === 'clear') { date = ''; hour = ''; onApply({ date, hour }); closePop(); return; }
    if (kind === 'time') { mode = 'time'; paint(); return; }
    if (kind === 'back') { mode = 'date'; paint(); return; }
    if (kind === 'hclear') { hour = ''; onApply({ date, hour }); closePop(); return; }
    if (kind === 'h') { hour = val; onApply({ date, hour }); closePop(); }
  });
}

/* 弹窗里那颗优先级胶囊（新增/编辑任务用）。回填 + 点开弹层改值，值存在胶囊的 dataset 上。 */
export function bindPrioChip(chip) {
  if (!chip || chip._bound) return;
  chip._bound = true;
  chip.addEventListener('click', () => {
    openPrioPop(chip, chip.dataset.v, (v) => setPrioChip(chip, v));
  });
}
export function setPrioChip(chip, v) {
  if (!chip) return;
  const p = normPrio(v);
  const meta = PRIOS[p - 1];
  chip.dataset.v = String(p);
  chip.className = 'tprio-chip ' + meta.cls + (p === 4 ? ' tprio-none' : '');
  chip.innerHTML = `<i class="ti ti-flag${p === 4 ? '' : '-filled'}"></i> ${meta.label}`;
}
