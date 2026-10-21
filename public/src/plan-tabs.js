/* 日计划的赛道切换（ES 模块 · esbuild 打包为 IIFE）。
 *
 * 以前三列（公司 / 陈-SEM / 李-SEO）并排，每列内部再上下切成「SOP 固定任务」和「每日新增」，
 * 等于把屏幕横着切三刀、竖着再切一刀 —— 每一格都只剩三分之一屏宽，SOP 标题一行放不下，
 * 任务卡的内容块挤成竖条。
 *
 * 现在改成：上面一排 Tab 选人（SEM & 社媒 / SEO & GEO / 公司任务），
 * 选中的那一块吃掉整屏宽，内部左右分栏 —— SOP 固定任务 40%、每日新增 60%。
 * 每日新增的卡更长更需要宽度（里面有目的 / 完成标准 / 结果 / 证据），所以它拿大头。
 *
 * 显式依赖：无（纯 DOM + localStorage）。消费者：app.js（启动时 init）、closed-loop.js（公司列有无任务时同步）。
 */

const KEY = 'ferr:planTab';
// value ↔ .pblock 的 data-plan-tab；顺序即 Tab 的显示顺序
const TABS = ['sem', 'seo', 'co'];

const blocks = () => [...document.querySelectorAll('#panel-tasks .tboard .pblock')];
const tabBtns = () => [...document.querySelectorAll('#panel-tasks .plan-tabs [data-tab]')];

function blockOf(key) {
  return document.querySelector(`#panel-tasks .tboard .pblock[data-plan-tab="${key}"]`);
}

/* 公司那一栏历来是「有活才出现」（syncCompanyColVisibility 的老语义），改 Tab 之后同理：
   没有未完成的公司任务就不给这个 Tab，别让人每天点进去看一个空壳。 */
export function hasCompanyTasks() {
  const col = document.getElementById('newtask-company');
  return !!(col && col.querySelector('.tcard:not(.done):not(.subtask)'));
}

export function availableTabs() {
  return TABS.filter((k) => (k === 'co' ? hasCompanyTasks() : !!blockOf(k)));
}

/* 默认落在谁身上：看当前登录的人。陈开 SEM、李开 SEO，经理/老板落第一个。
   每天第一件事就是看自己那栏，默认开对了能省一次点击 ×365。 */
function defaultTab() {
  const saved = (() => { try { return localStorage.getItem(KEY); } catch (e) { return null; } })();
  const ok = availableTabs();
  if (saved && ok.includes(saved)) return saved;
  const role = (window.ME || {}).role;
  if (role === 'seo' && ok.includes('seo')) return 'seo';
  if (role === 'sem' && ok.includes('sem')) return 'sem';
  return ok[0] || 'sem';
}

export function currentTab() {
  const on = document.querySelector('#panel-tasks .tboard .pblock.is-active');
  return on ? on.dataset.planTab : null;
}

export function setPlanTab(key, { remember = true } = {}) {
  const ok = availableTabs();
  const next = ok.includes(key) ? key : (ok[0] || null);
  if (!next) return;
  blocks().forEach((b) => b.classList.toggle('is-active', b.dataset.planTab === next));
  tabBtns().forEach((b) => b.classList.toggle('on', b.dataset.tab === next));
  if (remember) { try { localStorage.setItem(KEY, next); } catch (e) { /* 隐私模式写不了，不影响用 */ } }
  document.dispatchEvent(new CustomEvent('plantabchange', { detail: { tab: next } }));
}

/* 公司任务增删之后调一次：该出现的 Tab 出现、该消失的消失；
   正停在公司 Tab 上而它没了，就退回默认那个，别留一块空白。 */
export function syncPlanTabs() {
  const ok = availableTabs();
  tabBtns().forEach((b) => b.classList.toggle('is-hidden', !ok.includes(b.dataset.tab)));
  const bar = document.querySelector('#panel-tasks .plan-tabs');
  if (bar) bar.classList.toggle('is-hidden', ok.length < 2);
  const cur = currentTab();
  if (!cur || !ok.includes(cur)) setPlanTab(defaultTab(), { remember: false });
}

let _bound = false;
export function initPlanTabs() {
  if (!_bound) {
    _bound = true;
    // 事件委托，零内联 handler（全站 onclick 已清零）
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#panel-tasks .plan-tabs [data-tab]');
      if (!btn) return;
      setPlanTab(btn.dataset.tab);
    });
  }
  syncPlanTabs();
  setPlanTab(defaultTab(), { remember: false });
}
