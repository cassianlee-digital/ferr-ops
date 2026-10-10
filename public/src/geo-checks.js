/* GEO 引用抽查（数据看板 → GEO 抽查，2026-10-10）。
 *
 * AI 回答里有没有提到我们、有没有引用我们的页面，没有任何接口能自动拿到，只能人去问。
 * 这一页把人工抽查做成前后可比的记录：固定题库 × 固定引擎，一轮一张矩阵，每格记「提到 / 引用」并附截图。
 * 可比性的三条规矩（问题文字不能改、引擎固定、没查的格子不算没提到）由后端 services/geoChecks.js 强制，
 * 这里只负责画和录入。全部 createElement，没有 innerHTML（截图缩略图除外，那段 HTML 由 attachments.js 全量转义）。
 */
import { closeModal, openModal, toast } from './ui-kit.js';
import { deleteImage, pickAndUpload, thumbsHtml } from './attachments.js';
import { inlineConfirm } from './keywords.js';
import { formatLocalDate } from './timerange.js';

const $ = (id) => document.getElementById(id);
const failText = (e) => (e && e.status === 403 ? '无权操作' : (e && e.message) || '请求失败');
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
}

let bound = false;
let round = '';        // 当前这一轮的日期
let questions = [];
let data = null;       // GET /api/geo/checks 的响应
let seq = 0;
let editing = null;    // { question, engine, check }

const checkOf = (qid, engine) => (data ? data.items.find((c) => c.question_id === qid && c.engine === engine) : null);

/* ---------- 汇总条 ---------- */
function engineLine(e, prev) {
  if (!e.checked) return e.label + '：还没查（应查 ' + e.expected + ' 题）';
  let s = e.label + '：已查 ' + e.checked + '/' + e.expected + ' · 提到 ' + e.mentioned + ' · 引用 ' + e.cited;
  if (prev && prev.checked) s += '（上一轮 提到 ' + prev.mentioned + '/' + prev.checked + ' · 引用 ' + prev.cited + '/' + prev.checked + '）';
  if (e.no_screenshot) s += ' · ' + e.no_screenshot + ' 条没截图';
  return s;
}
function renderSummary() {
  const box = $('geochk-summary'); box.textContent = '';
  const t = data.summary.totals;
  const head = el('div', 'geochk-total');
  head.appendChild(el('b', '', round + ' 这一轮'));
  head.appendChild(el('span', '', t.checked ? '已查 ' + t.checked + '/' + t.expected + ' 格 · 提到 ' + t.mentioned + ' · 引用 ' + t.cited : '还没有记录'));
  if (t.checked < t.expected && t.checked) head.appendChild(el('span', 'geochk-warn', '还有 ' + (t.expected - t.checked) + ' 格没查（没查的不算没提到）'));
  if (t.no_screenshot) head.appendChild(el('span', 'geochk-warn', t.no_screenshot + ' 条没有截图（没截图的只是一句话）'));
  box.appendChild(head);
  for (const e of data.summary.engines) {
    const prev = data.previous && data.previous.engines.find((x) => x.key === e.key);
    box.appendChild(el('div', 'geochk-line', engineLine(e, prev)));
  }
  box.appendChild(el('div', 'geochk-line dim', data.previous
    ? '上一轮：' + data.previous.round_date + '。建议每 ' + data.interval_days + ' 天查一轮，题目和引擎都不变，前后才能比。'
    : '这是第一轮，还没有可比的上一轮。建议每 ' + data.interval_days + ' 天查一轮，题目和引擎都不变。'));
}

/* ---------- 矩阵 ---------- */
function cellButton(q, engine) {
  const c = checkOf(q.id, engine.key);
  const btn = el('button', 'geochk-cell'); btn.type = 'button';
  btn.dataset.geoQuestion = q.id; btn.dataset.geoEngine = engine.key;
  if (!c) { btn.classList.add('is-empty'); btn.textContent = '未查'; return btn; }
  btn.classList.add(c.cited ? 'is-cited' : (c.mentioned ? 'is-mentioned' : 'is-none'));
  btn.textContent = c.cited ? (c.mentioned ? '提到 + 引用' : '引用') : (c.mentioned ? '提到' : '没提到');
  if (!c.evidence_images.length) btn.appendChild(el('span', 'geochk-noshot', '无截图'));
  return btn;
}
function renderMatrix() {
  const head = $('geochk-head'); const body = $('geochk-body');
  head.textContent = ''; body.textContent = '';
  const hr = el('tr'); hr.appendChild(el('th', '', '固定问题'));
  data.engines.forEach((e) => hr.appendChild(el('th', 'ctr', e.label)));
  hr.appendChild(el('th', 'ctr', '')); head.appendChild(hr);

  // 启用的题在前；停用的题只有在这一轮有记录时才列出来（历史轮次要能看全），否则不占地方。
  // 勾了「显示已停用」则全列 —— 不然停用之后就再也找不到它去重新启用了。
  const showOff = $('geochk-show-off').checked;
  const rows = questions.filter((q) => q.active || showOff || data.items.some((c) => c.question_id === q.id));
  if (!rows.length) {
    const tr = el('tr'); const td = el('td', 'dim geochk-empty', '题库还是空的。先在上面加几个客户真会拿去问 AI 的问题（例如「best gate valve manufacturer in China」）。');
    td.colSpan = data.engines.length + 2; tr.appendChild(td); body.appendChild(tr); return;
  }
  for (const q of rows) {
    const tr = el('tr', q.active ? '' : 'is-off');
    const qt = el('td', 'geochk-q', q.question);
    if (!q.active) qt.appendChild(el('span', 'badge b-gray', '已停用'));
    tr.appendChild(qt);
    data.engines.forEach((e) => { const td = el('td', 'ctr'); td.appendChild(cellButton(q, e)); tr.appendChild(td); });
    const ops = el('td', 'ctr');
    const toggle = el('button', 'btn-mini', q.active ? '停用' : '启用'); toggle.type = 'button';
    toggle.dataset.geoToggle = q.id; toggle.dataset.active = q.active ? '0' : '1';
    ops.appendChild(toggle); tr.appendChild(ops);
    body.appendChild(tr);
  }
}

/* ---------- 加载 ---------- */
export async function loadGeoChecks() {
  bind();
  if (!round) round = formatLocalDate(new Date());
  $('geochk-date').value = round;
  const my = ++seq;
  try {
    const [qs, checks] = await Promise.all([API.get('/api/geo/questions'), API.get('/api/geo/checks?round_date=' + round)]);
    if (my !== seq) return;
    questions = qs.items || []; data = checks;
    const sel = $('geochk-rounds'); sel.textContent = '';
    const first = el('option', '', data.rounds.length ? '历史轮次…' : '还没有历史轮次'); first.value = ''; sel.appendChild(first);
    data.rounds.forEach((r) => { const o = el('option', '', r.round_date + '（' + r.n + ' 格）'); o.value = r.round_date; sel.appendChild(o); });
    renderSummary(); renderMatrix();
  } catch (e) {
    if (my !== seq || (e && e.message === 'unauthorized')) return;
    const box = $('geochk-summary'); box.textContent = '';
    box.appendChild(el('div', 'task-done-error', 'GEO 抽查加载失败：' + failText(e) + ' '));
    const retry = el('button', 'btn-mini', '重试'); retry.type = 'button'; retry.addEventListener('click', loadGeoChecks);
    box.appendChild(retry);
  }
}

/* ---------- 录入弹框 ---------- */
function renderShots() {
  const box = $('geochk-thumbs');
  const c = editing && editing.check;
  box.innerHTML = c ? thumbsHtml(c.evidence_images, { deletable: true }) : ''; // thumbsHtml 内部全部 esc 过
  // 截图要挂在记录上，记录得先存在：没保存过的格子先点「保存」
  $('geochk-shot-btn').disabled = !c;
  $('geochk-shot-tip').textContent = c ? '' : '先保存这一格，再上传截图';
}
function openCell(qid, engineKey) {
  const question = questions.find((q) => q.id === qid);
  const engine = data.engines.find((e) => e.key === engineKey);
  if (!question || !engine) return;
  const check = checkOf(qid, engineKey) || null;
  editing = { question, engine, check };
  $('geochk-title').textContent = engine.label + ' · ' + round;
  $('geochk-question').textContent = question.question;
  $('geochk-mentioned').checked = !!(check && check.mentioned);
  $('geochk-cited').checked = !!(check && check.cited);
  $('geochk-url').value = (check && check.cited_url) || '';
  $('geochk-note').value = (check && check.note) || '';
  $('geochk-error').textContent = '';
  $('geochk-del').classList.toggle('is-hidden', !check);
  renderShots();
  openModal('geoCheckMask');
}
export async function submitGeoCheck(btn) {
  const e = editing; if (!e) return;
  const body = {
    question_id: e.question.id, engine: e.engine.key, round_date: round,
    mentioned: $('geochk-mentioned').checked, cited: $('geochk-cited').checked,
    cited_url: $('geochk-url').value.trim(), note: $('geochk-note').value,
  };
  if (btn) btn.disabled = true;
  try {
    const { item } = await API.put('/api/geo/checks', body);
    e.check = item;
    // 不关窗：存完紧接着就该传截图。矩阵和汇总在后台刷新。
    $('geochk-error').textContent = '';
    $('geochk-del').classList.remove('is-hidden');
    renderShots();
    toast('已保存 · 已入库' + (item.evidence_images.length ? '' : '，请补上截图'));
    loadGeoChecks();
  } catch (err) {
    $('geochk-error').textContent = '未入库：' + failText(err);
  } finally { if (btn) btn.disabled = false; }
}
export async function pickGeoShot() {
  const e = editing; if (!e || !e.check) return;
  const added = await pickAndUpload('geo_check', e.check.id);
  if (!added.length) return;
  e.check.evidence_images = (e.check.evidence_images || []).concat(added);
  if (editing === e) renderShots();
  loadGeoChecks();
}

/* ---------- 事件 ---------- */
function bind() {
  if (bound) return;
  const panel = $('sub-data-geo'); if (!panel) return;
  bound = true;
  panel.addEventListener('click', async (e) => {
    const cell = e.target.closest('[data-geo-question]');
    if (cell) { openCell(Number(cell.dataset.geoQuestion), cell.dataset.geoEngine); return; }
    const toggle = e.target.closest('[data-geo-toggle]');
    if (toggle) {
      try { await API.patch('/api/geo/questions/' + toggle.dataset.geoToggle, { active: toggle.dataset.active === '1' }); loadGeoChecks(); }
      catch (err) { toast('未入库：' + failText(err)); }
      return;
    }
    if (e.target.closest('#geochk-add')) {
      const input = $('geochk-new'); const question = input.value.trim();
      if (!question) { toast('先写下要问 AI 的问题'); return; }
      try { await API.post('/api/geo/questions', { question }); input.value = ''; toast('已加入题库'); loadGeoChecks(); }
      catch (err) { toast('未入库：' + failText(err)); }
      return;
    }
    if (e.target.closest('#geochk-today')) { round = formatLocalDate(new Date()); loadGeoChecks(); }
  });
  $('geochk-date').addEventListener('change', (e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { round = e.target.value; loadGeoChecks(); } });
  $('geochk-show-off').addEventListener('change', () => { if (data) renderMatrix(); });
  $('geochk-rounds').addEventListener('change', (e) => { if (e.target.value) { round = e.target.value; loadGeoChecks(); } });
  $('geochk-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('geochk-add').click(); } });

  const mask = $('geoCheckMask');
  mask.addEventListener('click', async (e) => {
    const delShot = e.target.closest('[data-att-del]');
    if (delShot && editing && editing.check) {
      if (!inlineConfirm(delShot, '删除')) return;
      const cur = editing;
      try {
        await deleteImage(delShot.dataset.attDel);
        cur.check.evidence_images = cur.check.evidence_images.filter((im) => String(im.id) !== String(delShot.dataset.attDel));
        if (editing === cur) renderShots();
        loadGeoChecks();
      } catch (err) { toast('删除失败：' + failText(err)); }
      return;
    }
    const del = e.target.closest('#geochk-del');
    if (del && editing && editing.check) {
      if (!inlineConfirm(del, '确认删除这一格')) return;
      try { await API.del('/api/geo/checks/' + editing.check.id); closeModal('geoCheckMask'); editing = null; toast('已删除这一格的记录'); loadGeoChecks(); }
      catch (err) { toast('删除失败：' + failText(err)); }
    }
  });
}

// 子页签被点到（含刷新后恢复路由时的那次点击）才加载。typeof 守卫：保持本模块「无 DOM 也能被 import」。
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (e.target.closest('.subtab[data-sub="data-geo"]')) loadGeoChecks();
  });
}
