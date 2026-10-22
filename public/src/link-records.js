// 外链记录表格：复用后台时间范围，新增与编辑都在表格行内完成。
import { esc, toast } from './ui-kit.js';
import { formatLocalDate, getCurrentRange } from './timerange.js';

let kind = 'paid', items = [], directory = null;
const $ = s => document.querySelector(s);
const values = (list, selected = '', first = '请选择') => `<option value="">${esc(first)}</option>` + list.map(v => `<option value="${esc(v)}"${selected === v ? ' selected' : ''}>${esc(v)}</option>`).join('');
const input = (field, value = '', type = 'text') => `<input class="lr-cell" data-field="${field}" type="${type}" value="${esc(value || '')}" autocomplete="off">`;
const select = (field, list, value) => `<select class="lr-cell" data-field="${field}">${values(list, value)}</select>`;

function rowHtml(item = {}) {
  const paid = kind === 'paid';
  const row = `<tr data-id="${esc(item.id || '')}" data-new="${item.id ? '0' : '1'}">`
    + `<td>${input('added_date', item.added_date || formatLocalDate(new Date()), 'date')}</td>`
    + `<td>${input('site_name', item.site_name)}</td><td>${select('category', directory.categories, item.category)}</td>`
    + `<td>${input('link_form', item.link_form)}</td><td>${input('link_url', item.link_url, 'url')}</td>`
    + `<td>${input('anchor_text', item.anchor_text)}</td><td>${select('owner_site', directory.sites, item.owner_site)}</td>`
    + `<td>${select('registrant', directory.registrants, item.registrant)}</td>`
    + `<td>${paid ? input('fee_record', item.fee_record) : `<button type="button" class="btn-mini" data-credentials>${item.has_credentials ? '查看/编辑账密' : '登记账密'}</button>`}</td>`
    + '<td><button type="button" class="btn-mini" data-delete>删除</button></td></tr>';
  return row;
}
function rowPayload(tr) {
  const data = { kind };
  tr.querySelectorAll('[data-field]').forEach(el => { data[el.dataset.field] = el.value.trim(); });
  if (kind === 'paid') data.fee_record = tr.querySelector('[data-field="fee_record"]').value.trim();
  return data;
}
function required(data) { return data.added_date && data.site_name && data.category && data.link_url && data.owner_site && data.registrant; }
function remember(tr, snapshot) { tr.querySelectorAll('[data-field]').forEach(el => { el.dataset.savedValue = snapshot ? snapshot[el.dataset.field] ?? '' : el.value; }); }
function changed(tr) { return [...tr.querySelectorAll('[data-field]')].some(el => el.value !== el.dataset.savedValue); }
function syncFilters() {
  if (!directory) return;
  const defs = [['category', directory.categories, '全部分类'], ['site', directory.sites, '全部站点'], ['registrant', directory.registrants, '全部登记人']];
  defs.forEach(([key, list, label]) => {
    const el = document.querySelector(`#link-record-filters [data-filter="${key}"]`);
    const selected = el.value;
    el.innerHTML = values(list, selected, label);
  });
}
async function saveRow(tr) {
  if (tr.dataset.saving === '1') { tr.dataset.saveAgain = '1'; return; }
  if (!changed(tr)) return;
  const data = rowPayload(tr);
  if (!required(data)) { tr.classList.add('lr-incomplete'); return; }
  tr.classList.remove('lr-incomplete'); tr.dataset.saving = '1';
  try {
    if (tr.dataset.new === '1') {
      const { item } = await API.post('/api/link-records', data);
      tr.dataset.id = item.id; tr.dataset.new = '0'; items.unshift(item); toast('已新增外链记录');
    } else {
      const { item } = await API.patch('/api/link-records/' + tr.dataset.id, data);
      const i = items.findIndex(x => x.id === item.id); if (i >= 0) items[i] = item;
    }
    remember(tr, data);
  } catch (e) { toast('保存失败：' + (e.message || e)); }
  finally {
    delete tr.dataset.saving;
    if (tr.dataset.saveAgain === '1') { delete tr.dataset.saveAgain; saveRow(tr); }
  }
}
async function load() {
  try {
    directory ||= await API.get('/api/link-records/options'); syncFilters();
    const range = getCurrentRange('linkRecords'), query = new URLSearchParams({ kind });
    if (range?.start_date && range?.end_date) { query.set('start_date', range.start_date); query.set('end_date', range.end_date); }
    items = (await API.get('/api/link-records?' + query)).items;
    draw();
  } catch (e) { $('#tb-link-records').innerHTML = `<tr><td colspan="10">加载失败：${esc(e.message || e)}</td></tr>`; }
}
function draw() {
  const filters = Object.fromEntries([...document.querySelectorAll('#link-record-filters [data-filter]')].map(el => [el.dataset.filter, el.value]));
  const visible = items.filter(x => (!filters.category || x.category === filters.category) && (!filters.site || x.owner_site === filters.site) && (!filters.registrant || x.registrant === filters.registrant));
  const body = $('#tb-link-records');
  body.innerHTML = visible.length ? visible.map(rowHtml).join('') : '<tr><td colspan="10" class="dim">暂无符合条件的记录</td></tr>';
  body.querySelectorAll('tr[data-id]').forEach(remember);
}
async function reveal(tr) {
  if (tr.dataset.new === '1') { toast('先填写必填项并保存记录'); return; }
  try {
    const { credential_record } = await API.get('/api/link-records/' + tr.dataset.id + '/credentials');
    tr.cells[8].innerHTML = `<input class="lr-secret" type="password" autocomplete="new-password" maxlength="2000" value="${esc(credential_record || '')}"><button type="button" class="btn-mini" data-secret-save>保存</button><button type="button" class="btn-mini" data-secret-toggle>显示</button>`;
  } catch (e) { toast('账密读取失败：' + (e.message || e)); }
}
document.addEventListener('click', async e => {
  const tab = e.target.closest('[data-link-kind]');
  if (tab) { kind = tab.dataset.linkKind; document.querySelectorAll('[data-link-kind]').forEach(t => t.classList.toggle('active', t === tab)); load(); return; }
  if (e.target.closest('[data-link-add]')) {
    if (!directory) await load();
    if (!directory) return;
    const body = $('#tb-link-records');
    if (body.querySelector('tr[data-new="1"]')) { body.querySelector('tr[data-new="1"] [data-field="site_name"]').focus(); return; }
    const empty = body.querySelector('tr:not([data-id])'); if (empty) empty.remove();
    body.insertAdjacentHTML('afterbegin', rowHtml());
    const draft = body.querySelector('tr[data-new="1"]'); remember(draft);
    draft.querySelector('[data-field="site_name"]').focus(); return;
  }
  const tr = e.target.closest('#tb-link-records tr[data-id]'); if (!tr) return;
  if (e.target.closest('[data-credentials]')) { reveal(tr); return; }
  if (e.target.closest('[data-secret-toggle]')) { const field = tr.querySelector('.lr-secret'); field.type = field.type === 'password' ? 'text' : 'password'; return; }
  if (e.target.closest('[data-secret-save]')) {
    try { await API.patch('/api/link-records/' + tr.dataset.id, { kind, credential_record: tr.querySelector('.lr-secret').value }); tr.cells[8].innerHTML = '<button type="button" class="btn-mini" data-credentials>查看/编辑账密</button>'; toast('账密已加密保存'); }
    catch (err) { toast('保存失败：' + (err.message || err)); }
    return;
  }
  if (e.target.closest('[data-delete]')) {
    if (!confirm('确定删除这条外链记录？')) return;
    if (tr.dataset.new === '1') { tr.remove(); return; }
    try { await API.del('/api/link-records/' + tr.dataset.id); items = items.filter(x => x.id !== Number(tr.dataset.id)); tr.remove(); toast('已删除'); }
    catch (err) { toast('删除失败：' + (err.message || err)); }
  }
});
document.addEventListener('change', e => {
  if (e.target.matches('#link-record-filters select')) draw();
  if (e.target.matches('#tb-link-records .lr-cell')) saveRow(e.target.closest('tr'));
});
document.addEventListener('focusout', e => { if (e.target.matches('#tb-link-records .lr-cell')) saveRow(e.target.closest('tr')); });
document.addEventListener('timerange', e => { if (e.detail?.scope === 'linkRecords') load(); });
export function loadLinkRecords() { load(); }
