/* 站点管理（设置 → API 接入）：一个谷歌账号下的每个网站各登记一次。
 *
 * 后台以前只认一个网站。「站点」= 一个网站 + 它在 Search Console 里的资源 + 它的 GA4 媒体资源；
 * 登记之后每天自动同步，这一页能看到每个站点每个数据源同步到哪了、失败在哪。
 * 广告是账户级的（几个站共用一个 Ads 账户），不在站点上同步，仍在下面「Google 授权与同步」里。
 *
 * 规则只有后端一份（services/sites.js）：哪个字段不对、和哪个站点冲突了，都由后端说，这里原样显示。
 * 全部用 createElement / textContent 构建，没有 innerHTML。模块求值期不碰 DOM。
 */
import { toast } from './ui-kit.js';
import { inlineConfirm } from './keywords.js';

const $ = (id) => document.getElementById(id);
const PROVIDER_LABEL = { gsc: 'GSC', ga4: 'GA4' };
const BACKFILL_DAYS = 90;

function h(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = String(text);
  return el;
}
const failText = (e) => (e && e.message) || '请求失败';
const canManage = () => ['manager', 'boss'].includes(window.ME && window.ME.role);

let data = null;        // GET /api/google/projects
let found = null;       // GET /api/google/discover（打开表单时才取）
let editing = null;     // null | 'new' | 站点 id
let bound = false;

export async function loadSites() {
  const box = $('sites-box');
  if (!box) return;
  if (!bound) { box.addEventListener('click', onClick); box.addEventListener('submit', onSubmit); bound = true; }
  try {
    data = await window.API.get('/api/google/projects');
  } catch (e) {
    box.textContent = '';
    box.appendChild(h('div', 'sites-error', '站点列表读取失败：' + failText(e)));
    return;
  }
  render();
}

/* ---------- 列表 ---------- */
// 库里存的是 UTC（'YYYY-MM-DD HH:MM:SS'）：换成本地时间显示
function localTime(utc) {
  const d = new Date(String(utc || '').replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function runText(provider, site) {
  const label = PROVIDER_LABEL[provider];
  if (provider === 'gsc' ? !site.gsc_site_url : !site.ga4_property_id) return { text: label + '：没有配置', cls: 'sites-run dim' };
  const run = site.runs && site.runs[provider];
  if (!run) return { text: label + '：还没同步过', cls: 'sites-run warn' };
  const at = localTime(run.finished_at || run.started_at);
  if (run.status === 'success') return { text: label + '：' + at + ' 同步成功 · ' + (run.rows_written || 0) + ' 行（' + run.date_start + ' ~ ' + run.date_end + '）', cls: 'sites-run ok' };
  if (run.status === 'failed') return { text: label + '：' + at + ' 同步失败 —— ' + (run.error || '原因未知'), cls: 'sites-run bad' };
  return { text: label + '：' + at + ' 开始同步，还没结束', cls: 'sites-run dim' };
}

function actionBtn(action, id, text, cls, title) {
  const b = h('button', cls || 'btn-ghost', text);
  b.type = 'button'; b.dataset.siteAction = action; b.dataset.id = String(id);
  if (title) b.title = title;
  return b;
}

function siteRow(site) {
  const row = h('div', 'sites-row');
  const main = h('div', 'sites-main');
  const head = h('div', 'sites-name');
  head.appendChild(h('b', '', site.name));
  if (site.is_default) head.appendChild(h('span', 'badge b-blue', '默认'));
  if (site.company) head.appendChild(h('span', 'badge b-gray', site.company));
  main.appendChild(head);
  main.appendChild(h('div', 'sites-meta', [
    site.domain || '域名未填',
    site.gsc_site_url ? 'Search Console：' + site.gsc_site_url : '没有 Search Console 资源',
    site.ga4_property_id ? 'GA4：' + site.ga4_property_id : '没有 GA4 媒体资源',
  ].join(' · ')));
  for (const provider of ['gsc', 'ga4']) {
    const r = runText(provider, site);
    main.appendChild(h('div', r.cls, r.text));
  }
  row.appendChild(main);

  const acts = h('div', 'sites-acts');
  if (site.gsc_site_url || site.ga4_property_id) {
    acts.appendChild(actionBtn('sync', site.id, '立即同步', 'btn-primary', '同步最近 7 天'));
    acts.appendChild(actionBtn('backfill', site.id, '补 ' + BACKFILL_DAYS + ' 天历史', 'btn-ghost', '新加的站点、或图表前段是空的时候用。分段取，可能要一两分钟'));
  }
  if (canManage()) {
    acts.appendChild(actionBtn('edit', site.id, '编辑'));
    if (!site.is_default) {
      acts.appendChild(actionBtn('default', site.id, '设为默认', 'btn-ghost', '看板在没有选站点时显示默认站点的数据'));
      acts.appendChild(actionBtn('disable', site.id, '停用', 'btn-ghost', '不再同步、不再出现在选择里；已同步的数据保留'));
    }
  }
  row.appendChild(acts);
  return row;
}

function render() {
  const box = $('sites-box');
  box.textContent = '';
  const sites = data.sites || [];
  if (data.env_site) {
    const e = data.env_site;
    box.appendChild(h('div', 'sites-tip',
      '还没有登记站点。后台现在用的是服务器配置里的这一个：' + (e.domain || e.gsc_site_url || 'GA4 ' + e.ga4_property_id)
      + '。添加第二个站点时，它会自动登记成默认站点，现有数据和看板都不受影响。'));
  } else if (!sites.length) {
    box.appendChild(h('div', 'sites-tip', '还没有登记站点，服务器上也没有配置默认站点。'));
  }
  for (const site of sites) {
    box.appendChild(editing === site.id ? formEl(site) : siteRow(site));
  }
  if (editing === 'new') box.appendChild(formEl(null));
  else if (canManage()) {
    const add = actionBtn('new', 0, '＋ 添加站点', 'btn-ghost sites-add');
    box.appendChild(add);
  } else if (!sites.length) {
    box.appendChild(h('div', 'sites-tip dim', '添加站点需要经理或老板账号。'));
  }
}

/* ---------- 表单 ---------- */
function field(labelText, input, hint) {
  const wrap = h('label', 'sites-field');
  wrap.appendChild(h('span', 'sites-label', labelText));
  wrap.appendChild(input);
  if (hint) wrap.appendChild(h('span', 'sites-hint', hint));
  return wrap;
}
function textInput(name, value, placeholder, listId) {
  const i = h('input', 'input');
  i.type = 'text'; i.name = name; i.value = value || ''; i.placeholder = placeholder || ''; i.autocomplete = 'off';
  if (listId) i.setAttribute('list', listId);
  return i;
}
// 候选清单：能直接选，也能手敲（账号里列不出来的时候）
function datalist(id, items) {
  const dl = h('datalist');
  dl.id = id;
  for (const it of items) {
    const o = h('option');
    o.value = it.value; o.label = it.label;
    dl.appendChild(o);
  }
  return dl;
}

function formEl(site) {
  const form = h('form', 'sites-form');
  form.dataset.id = site ? String(site.id) : '';
  form.appendChild(h('div', 'sites-form-title', site ? '编辑站点：' + site.name : '添加站点'));

  const gscItems = ((found && found.gsc.items) || []).map((i) => ({ value: i.site_url, label: i.kind + (i.used_by ? ' · 已登记在「' + i.used_by + '」' : '') }));
  const ga4Items = ((found && found.ga4.items) || []).map((i) => ({ value: i.property_id, label: i.name + (i.account ? ' · ' + i.account : '') + (i.used_by ? ' · 已登记在「' + i.used_by + '」' : '') }));
  form.appendChild(datalist('sites-gsc-options', gscItems));
  form.appendChild(datalist('sites-ga4-options', ga4Items));

  const grid = h('div', 'sites-grid');
  grid.appendChild(field('站点名称', textInput('name', site && site.name, '比如：贝孚特-管件')));
  const company = h('select', 'input');
  company.name = 'company';
  const blank = h('option', '', '未标注'); blank.value = '';
  company.appendChild(blank);
  for (const c of data.companies || []) { const o = h('option', '', c); o.value = c; company.appendChild(o); }
  company.value = (site && site.company) || '';
  grid.appendChild(field('所属公司', company));
  grid.appendChild(field('Search Console 资源', textInput('gsc_site_url', site && site.gsc_site_url, 'sc-domain:example.com', 'sites-gsc-options'),
    found ? (found.gsc.error ? '账号里的资源列不出来：' + found.gsc.error + '。可以手填' : '点输入框可以从账号里的 ' + gscItems.length + ' 个资源里选') : '正在读取账号里的资源…'));
  grid.appendChild(field('GA4 媒体资源编号', textInput('ga4_property_id', site && site.ga4_property_id, '一串数字，比如 508026067', 'sites-ga4-options'),
    found ? (found.ga4.error ? '账号里的媒体资源列不出来：' + found.ga4.error + '。可以手填 —— GA4 的媒体资源列表里，名字下面那串数字' : '点输入框可以从账号里的 ' + ga4Items.length + ' 个媒体资源里选') : '正在读取账号里的媒体资源…'));
  grid.appendChild(field('域名', textInput('domain', site && site.domain, '留空 = 按 Search Console 资源自动带出'), '用来认「这条询盘、这个网址是哪个站的」'));
  form.appendChild(grid);

  form.appendChild(h('div', 'sites-form-error'));
  const foot = h('div', 'sites-form-foot');
  const save = h('button', 'btn-primary', site ? '保存' : '添加');
  save.type = 'submit';
  foot.appendChild(save);
  foot.appendChild(actionBtn('cancel', 0, '取消'));
  foot.appendChild(h('span', 'sites-hint', '广告账户几个站共用，不用在这里填；添加后记得点一次「补 ' + BACKFILL_DAYS + ' 天历史」。'));
  form.appendChild(foot);
  return form;
}

async function openForm(target) {
  editing = target;
  render();
  if (found) return;
  // 候选只在第一次打开表单时取一次；取不到不拦着填
  try { found = await window.API.get('/api/google/discover'); }
  catch (e) { found = { gsc: { items: [], error: failText(e) }, ga4: { items: [], error: failText(e) } }; }
  // 取候选的这一会儿，表单里可能已经敲了字：把敲的东西带进重画后的表单
  const typed = readForm($('sites-box').querySelector('.sites-form'));
  if (editing !== target) return;
  render();
  const form = $('sites-box').querySelector('.sites-form');
  if (form && typed) for (const [k, v] of Object.entries(typed)) form.elements[k].value = v;
}

function readForm(form) {
  if (!form) return null;
  const out = {};
  for (const name of ['name', 'company', 'gsc_site_url', 'ga4_property_id', 'domain']) out[name] = form.elements[name].value.trim();
  return out;
}

async function onSubmit(ev) {
  const form = ev.target.closest('.sites-form');
  if (!form) return;
  ev.preventDefault();
  const body = readForm(form);
  const errEl = form.querySelector('.sites-form-error');
  const btn = form.querySelector('button[type="submit"]');
  errEl.textContent = '';
  btn.disabled = true;
  try {
    if (form.dataset.id) await window.API.patch('/api/google/projects/' + form.dataset.id, body);
    else await window.API.post('/api/google/projects', body);
    toast(form.dataset.id ? '已保存' : '站点已添加。点「补 ' + BACKFILL_DAYS + ' 天历史」把它的数据取进来');
    editing = null; found = null; // 候选里的「已登记在…」变了，下次打开重新取
    document.dispatchEvent(new CustomEvent('siteschanged'));
    await loadSites();
  } catch (e) {
    // 哪个字段不对、和哪个站点冲突，由后端说；留在表单里让人直接改
    errEl.textContent = '没有保存：' + failText(e);
    btn.disabled = false;
  }
}

/* ---------- 操作 ---------- */
function syncSummary(results) {
  return results.map((r) => {
    const label = PROVIDER_LABEL[r.provider] || r.provider;
    if (r.status === 'not_configured') return label + ' 没有配置';
    if (r.status === 'ok') return label + ' 写入 ' + r.rows + ' 行' + (r.truncated ? '（有一段没取全，请缩短天数重取）' : '');
    return label + ' 失败：' + r.error + (r.chunks > 1 ? '（' + r.chunks + ' 段里完成了 ' + r.chunks_done + ' 段，已取到的保留）' : '');
  }).join('；');
}

async function runSync(btn, id, days) {
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = days ? '补历史中…' : '同步中…';
  try {
    const r = await window.API.post('/api/google/projects/' + id + '/sync', days ? { days } : {}, { timeoutMs: 600000 });
    toast(syncSummary(r.results));
    document.dispatchEvent(new CustomEvent('sitesynced', { detail: { id: Number(id) } }));
  } catch (e) {
    toast('同步没有完成：' + failText(e));
  } finally {
    btn.disabled = false; btn.textContent = old;
    await loadSites();
  }
}

async function onClick(ev) {
  const btn = ev.target.closest('[data-site-action]');
  if (!btn) return;
  const action = btn.dataset.siteAction; const id = btn.dataset.id;
  if (action === 'new') return openForm('new');
  if (action === 'edit') return openForm(Number(id));
  if (action === 'cancel') { editing = null; return render(); }
  if (action === 'sync') return runSync(btn, id, null);
  if (action === 'backfill') return runSync(btn, id, BACKFILL_DAYS);
  if (action === 'default' || action === 'disable') {
    if (!inlineConfirm(btn, action === 'default' ? '确认设为默认' : '确认停用')) return;
    try {
      if (action === 'default') await window.API.patch('/api/google/projects/' + id, { is_default: true });
      else await window.API.del('/api/google/projects/' + id);
      toast(action === 'default' ? '已设为默认站点' : '已停用');
      found = null;
      document.dispatchEvent(new CustomEvent('siteschanged'));
    } catch (e) { toast('没有完成：' + failText(e)); }
    await loadSites();
  }
}
