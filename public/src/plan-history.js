/* 日计划回放（ES 模块 · esbuild 打包为 IIFE）。
   日计划只认「今天」，"上周三他俩干了啥"以前答不出来——归档页是按归档时间分桶的，不是那天的视角。
   选一个别的日期 → 三列换成那天的只读快照；回到今天 → 还给实时看板。
   运行时依赖的全局（调用时解析）：API、esc()、toast()。
   不新增内联 handler：日期条用事件委托，全部在本模块内注册。
   必须挂 window：planDayIsToday —— closed-loop.js 的换天重排要问"现在是不是在回放态"。 */
import { formatLocalDate } from './timerange.js';

const DEPTS = [
  { key: '公司', label: '公司任务', badge: 'b-red' },
  { key: 'SEM', label: 'SEM 任务（陈）', badge: 'b-purple' },
  { key: 'SEO', label: 'SEO 任务（李）', badge: 'b-blue' },
];
const FREQ_TAG = { daily: '日', weekly: '周', monthly: '月' };

let _day = null; // null = 实时（今天）

export function planDayIsToday() { return !_day || _day === formatLocalDate(new Date()); }

const today = () => formatLocalDate(new Date());
const shiftDay = (day, n) => { const d = new Date(day + 'T00:00:00'); d.setDate(d.getDate() + n); return formatLocalDate(d); };

// 与 sop.js 同一套算法：周/月的 period_key 按本地时间算好再传给后端，服务端不重算 ISO 周
function periodKeysFor(day) {
  const d = new Date(day + 'T00:00:00');
  const tmp = new Date(d); tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));
  const yearStart = new Date(tmp.getFullYear(), 0, 1);
  const week = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return {
    weekly: tmp.getFullYear() + '-W' + String(week).padStart(2, '0'),
    monthly: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
  };
}

/* 那天这条任务有没有交代：当天完成 > 当天推进 > 此前已完成 > 无记录 */
function taskStateFor(t, day, pushed) {
  const doneDay = (t.done_at || '').slice(0, 10);
  if (doneDay === day) return { cls: 'hs-done', text: '当天完成' };
  if (pushed.has(t.id)) return { cls: 'hs-push', text: '当天推进' };
  if (doneDay && doneDay < day) return { cls: 'hs-old', text: '此前已完成' };
  return { cls: 'hs-none', text: '无记录' };
}

function taskRowHtml(t, day, pushed, note) {
  const st = taskStateFor(t, day, pushed);
  const span = t.start_date && t.task_date && t.start_date < t.task_date
    ? `${esc(t.start_date.slice(5))} ~ ${esc(t.task_date.slice(5))}`
    : esc(t.task_date || '');
  const src = t.fix_id ? '<span class="badge b-amber">整改</span>' : '';
  const owner = t.owner ? `<span class="badge ${t.owner === '陈' ? 'b-purple' : 'b-blue'}">${esc(t.owner)}</span>` : '';
  const memo = note ? `<span class="hnote">${esc(note)}</span>` : '';
  return `<div class="hcard">
    <div class="hrow"><span class="htext">${esc(t.content || '')}</span>
      <span class="hright">${src}${owner}${span ? `<span class="hdue">${span}</span>` : ''}<span class="hstat ${st.cls}">${st.text}</span></span></div>
    ${memo ? `<div class="hmemo">${memo}</div>` : ''}
  </div>`;
}

function render(data) {
  const box = document.getElementById('plan-history');
  if (!box) return;
  const day = data.day;
  const pushed = new Set((data.checkins || []).map((c) => c.loop_item_id));
  const noteOf = new Map((data.checkins || []).filter((c) => c.note).map((c) => [c.loop_item_id, c.note]));
  const subsByParent = new Map();
  (data.subtasks || []).forEach((s) => {
    if (!subsByParent.has(s.parent_id)) subsByParent.set(s.parent_id, []);
    subsByParent.get(s.parent_id).push(s);
  });

  box.innerHTML = '<div class="tboard">' + DEPTS.map((d) => {
    const sops = (data.sops || []).filter((s) => s.dept === d.key);
    const tasks = (data.tasks || []).filter((t) => (t.dept || 'SEO') === d.key);
    const sopDone = sops.filter((s) => s.done).length;
    const spoken = tasks.filter((t) => (t.done_at || '').slice(0, 10) === day || pushed.has(t.id)).length;

    const sopHtml = sops.length
      ? '<div class="sop-list">' + sops.map((s) => `<div class="hcard hsop${s.done ? ' on' : ''}">
          <div class="hrow"><span class="hcheck">${s.done ? '<i class="ti ti-check"></i>' : ''}</span>
            <span class="htext">${esc(s.title)}</span>
            <span class="hright">${s.active ? '' : '<span class="badge b-gray">已停用</span>'}<span class="freq-tag">${FREQ_TAG[s.freq] || ''}</span></span></div>
        </div>`).join('') + '</div>'
      : '<div class="hempty">当时没有配置 SOP</div>';

    const taskHtml = tasks.length
      ? tasks.map((t) => {
        const subs = subsByParent.get(t.id) || [];
        return taskRowHtml(t, day, pushed, noteOf.get(t.id))
          + (subs.length ? `<div class="hsubs">${subs.map((s2) => taskRowHtml(s2, day, pushed, noteOf.get(s2.id))).join('')}</div>` : '');
      }).join('')
      : '<div class="hempty">那天这一列没有任务</div>';

    return `<div class="pblock">
      <div class="pblock-head"><span class="badge ${d.badge}">${esc(d.key)}</span><span class="pn">${esc(d.label)}</span>
        <span class="kcount">SOP ${sopDone}/${sops.length} · 任务 ${tasks.length} · 有交代 ${spoken}</span></div>
      <div class="sopnew">
        <div><div class="colcap"><i class="ti ti-pin"></i> SOP 固定任务</div>${sopHtml}</div>
        <div><div class="colcap"><i class="ti ti-list-check"></i> 当天在盘子里的任务</div>${taskHtml}</div>
      </div>
    </div>`;
  }).join('') + '</div>';
}

async function load(day) {
  const box = document.getElementById('plan-history');
  if (!box) return;
  const pk = periodKeysFor(day);
  box.innerHTML = '<div class="hloading">正在取 ' + esc(day) + ' 的记录…</div>';
  try {
    const data = await API.get('/api/daily-plan?day=' + encodeURIComponent(day)
      + '&weekly=' + encodeURIComponent(pk.weekly) + '&monthly=' + encodeURIComponent(pk.monthly));
    render(data);
  } catch (e) {
    // API 失败必须说清原因，不能只留一片空白
    box.innerHTML = '<div class="hempty">读取失败：' + esc((e && e.message) || '请求失败')
      + '<br>可重新选一次日期重试</div>';
  }
}

/* 切换日期：今天 = 实时看板；其他 = 只读回放 */
export function setPlanDay(day) {
  const isToday = !day || day === today();
  _day = isToday ? null : day;
  // 必须是直接子元素：回放渲染出来的快照里也有一个 .tboard，而且排在实时看板前面，
  // 用后代选择器会抓到它，于是"回到今天"永远把实时看板留在 display:none。
  const board = document.querySelector('#panel-tasks > .tboard');
  const hist = document.getElementById('plan-history');
  const hint = document.getElementById('planday-hint');
  const input = document.getElementById('planday-input');
  if (input) input.value = day || today();
  if (board) board.style.display = isToday ? '' : 'none';
  if (hist) hist.classList.toggle('is-hidden',isToday);
  if (hint) {
    hint.textContent = isToday ? '' : '回放模式 · 只读';
    hint.className = 'planday-hint' + (isToday ? '' : ' on');
  }
  if (!isToday) load(day);
}

document.addEventListener('click', (e) => {
  const step = e.target.closest('[data-planday]');
  if (step) {
    const base = (document.getElementById('planday-input') || {}).value || today();
    setPlanDay(shiftDay(base, Number(step.dataset.planday)));
    return;
  }
  if (e.target.closest('#planday-today')) setPlanDay(today());
});
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'planday-input') setPlanDay(e.target.value || today());
});

// 日期框先摆上今天（bundle 在 body 末尾执行，#panel-tasks 已解析完）
const _dayInput = document.getElementById('planday-input');
if (_dayInput && !_dayInput.value) _dayInput.value = today();
