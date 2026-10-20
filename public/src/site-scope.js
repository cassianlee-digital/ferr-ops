/* 当前看的是哪个站点（多站点第 2 步）。
 *
 * 后台登记了多个站点之后，SEO / GA4 / 诊断 / GEO 这些「按网站算」的数据要能选看哪个站。
 * 整个后台只有一个「当前站点」（不像时间范围那样每页各存各的）：在数据看板选了管件站，回到总览看到的
 * 也应该是管件站，否则两个页面各说各的站，对不上。选择器可以放在多个页面上，它们是同一个状态的不同入口。
 *
 * 取数的模块用 withSite(url) 给请求带上站点；选了别的站点时，复用时间范围那套「重新取数」的通知
 *（refreshRangeConsumers）—— 它会顺带作废还在路上的旧请求，旧站点的结果不会盖到新站点上。
 *
 * 不跟着站点切的：SEM 看板（广告是整个账户的，几个站共用）、询盘和考核（部门口径，不按站点拆）。
 * 只登记了一个站点、或一个都没登记时：选择器不出现，一切和以前一样。
 */
import { toast } from './ui-kit.js';
import { refreshRangeConsumers } from './timerange.js';

const LS_KEY = 'ferr:site';
// 这两个页面上有按站点算的数据：数据看板（SEO / GA4 / 诊断），总览（SEO 小看板、GEO 卡）
const SCOPES_BY_SITE = ['data', 'dashboard'];

let sites = [];        // 启用中的站点，默认站点在最前
let current = null;    // 当前站点 id；null = 还没取到站点列表（请求不带站点，后端按默认站点算）
let bound = false;

// 启用中的全部站点（询盘的「站点」下拉、线索收件箱用）。还没取到时是空数组
export const allSites = () => sites;
const defaultSite = () => sites.find((s) => s.is_default) || sites[0] || null;
export const currentSite = () => sites.find((s) => s.id === current) || null;
// 选的是不是默认站点以外的站（AI 分析目前只读默认站点的数据，界面要在这种时候说明）
export const viewingOtherSite = () => { const d = defaultSite(); return !!(d && current != null && current !== d.id); };
export const defaultSiteName = () => (defaultSite() ? defaultSite().name : '');

export function withSite(path) {
  if (current == null) return path;
  return path + (path.includes('?') ? '&' : '?') + 'project_id=' + encodeURIComponent(current);
}

function remembered() {
  try { const v = Number(localStorage.getItem(LS_KEY)); return Number.isInteger(v) && v > 0 ? v : null; } catch (e) { return null; }
}

function render() {
  document.querySelectorAll('[data-site-select]').forEach((box) => {
    box.textContent = '';
    box.classList.toggle('is-hidden', sites.length < 2);
    if (sites.length < 2) return;
    const label = document.createElement('label');
    label.className = 'site-select';
    const text = document.createElement('span');
    text.textContent = '站点';
    const select = document.createElement('select');
    select.className = 'site-select-input';
    for (const s of sites) {
      const o = document.createElement('option');
      o.value = String(s.id);
      o.textContent = s.name + (s.is_default ? '（默认）' : '');
      select.appendChild(o);
    }
    select.value = String(current);
    label.appendChild(text); label.appendChild(select);
    box.appendChild(label);
    if (box.dataset.siteNote) {
      const note = document.createElement('span');
      note.className = 'site-select-note';
      note.textContent = box.dataset.siteNote;
      box.appendChild(note);
    }
  });
}

function choose(id) {
  if (!sites.some((s) => s.id === id) || id === current) return;
  current = id;
  try { localStorage.setItem(LS_KEY, String(id)); } catch (e) { /* 记不住就只在这次打开有效 */ }
  render();
  for (const scope of SCOPES_BY_SITE) refreshRangeConsumers(scope);
  toast('当前站点：' + currentSite().name);
}

/* 取站点列表、定下当前站点、画出选择器。启动时调一次；站点管理里增删改之后再调一次。
   返回 true = 当前站点变了（调用方不用管，取数已经重新触发）。 */
export async function loadSiteScope() {
  if (!bound) {
    document.addEventListener('change', (e) => {
      const select = e.target.closest && e.target.closest('.site-select-input');
      if (select) choose(Number(select.value));
    });
    document.addEventListener('siteschanged', () => { loadSiteScope(); });
    bound = true;
  }
  let list;
  try { list = (await window.API.get('/api/google/projects')).sites || []; }
  catch (e) { return false; } // 取不到就保持现状：请求不带站点，后端按默认站点算
  sites = list;
  const before = current;
  const want = current != null ? current : remembered();
  // 记住的站点已经不在了（被停用）：回到默认站点，不带着一个不存在的站点去取数
  current = sites.some((s) => s.id === want) ? want : (defaultSite() ? defaultSite().id : null);
  render();
  // 之前发出去的请求是按谁算的：还没取到列表时不带站点 = 默认站点。和现在定下的不一样，就得重新取
  const servedBefore = before != null ? before : (defaultSite() ? defaultSite().id : null);
  const changed = servedBefore !== current;
  if (changed) for (const scope of SCOPES_BY_SITE) refreshRangeConsumers(scope);
  return changed;
}
