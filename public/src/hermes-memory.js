/* Hermes 长期记忆管理页（ES 模块 · esbuild 打包为 IIFE）。
   原本就是 IIFE + 末尾显式 window.X=X 的干净写法：这里只是去掉 IIFE 壳，改为 ES 模块导出，
   由 main.js 统一挂 window——暴露面与原来完全一致（正是内联 onclick 用到的那 5 个）。
   运行时依赖：window.API、window._curTab（带 window. 前缀，无裸全局）；toast 已改为显式 import。
   使用 DOM textContent 渲染 API/用户文本，记忆内容无法注入 HTML。
   KIND_LABEL/FEEDBACK_LABEL/byId/td/badge/renderMemory/editHermesMemory/deactivateHermesMemory 保持模块内私有
   （注意：本模块的 badge 是局部工具，不会与 kpi-view 导出的 window.badge 冲突）。 */

import { toast } from './ui-kit.js';

const KIND_LABEL = {
  company: '公司事实',
  customer: '客户画像',
  market: '市场 / 客户',
  operation: '运营经验',
  decision: '决策标准',
  learning: '每日学习',
  preference: '偏好',
  risk: '风险提醒',
};

function byId(id) { return document.getElementById(id); }
function text(value) { return value == null ? '' : String(value); }
function setText(el, value) { if (el) el.textContent = text(value); }

function field(id) {
  const el = byId(id);
  return el ? el.value.trim() : '';
}

const FEEDBACK_LABEL = {
  adopted: '采纳 · 有价值',
  done: '已执行 · 后续可复用',
  rejected: '暂不采纳 · 不符合当前策略',
  wrong: '不准 · 判断错误',
  generic: '太泛 · 没有结合业务',
};

function td(value, className) {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  cell.textContent = text(value);
  return cell;
}

function badge(label, className) {
  const span = document.createElement('span');
  span.className = 'badge ' + (className || 'b-gray');
  span.textContent = label;
  return span;
}

function renderMemory(row) {
  const tr = document.createElement('tr');
  const kind = td('', '');
  kind.appendChild(badge(KIND_LABEL[row.kind] || row.kind || '记忆', row.kind === 'risk' ? 'b-red' : row.kind === 'decision' ? 'b-amber' : 'b-blue'));
  tr.appendChild(kind);

  const importance = td('', 'ctr');
  importance.appendChild(badge(String(row.importance || 3), Number(row.importance) >= 4 ? 'b-green' : 'b-gray'));
  tr.appendChild(importance);

  const main = document.createElement('td');
  const title = document.createElement('div');
  title.style.fontWeight = '800';
  title.style.marginBottom = '5px';
  title.textContent = text(row.title);
  const content = document.createElement('div');
  content.className = 'dim';
  content.style.fontSize = '11.5px';
  content.style.whiteSpace = 'pre-wrap';
  content.textContent = text(row.content);
  const source = document.createElement('div');
  source.className = 'dim';
  source.style.fontSize = '11px';
  source.style.marginTop = '6px';
  source.textContent = row.source ? '来源：' + row.source : '';
  const trust = document.createElement('div');
  trust.style.marginTop = '6px';
  trust.appendChild(row.trust?.trusted
    ? badge('可作为回答证据', 'b-green')
    : badge('待人工确认 · 不进入回答证据', 'b-amber'));
  main.append(title, content, source, trust);
  tr.appendChild(main);

  const evidence = td(row.evidence || '—', '');
  evidence.style.whiteSpace = 'pre-wrap';
  evidence.style.fontSize = '11.5px';
  tr.appendChild(evidence);
  tr.appendChild(td(row.updated_at || row.created_at || '—', 'dim'));

  const action = td('', 'ctr');
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn-ghost';
  editBtn.textContent = '编辑';
  editBtn.addEventListener('click', () => editHermesMemory(row));
  const stopBtn = document.createElement('button');
  stopBtn.type = 'button';
  stopBtn.className = 'btn-ghost';
  stopBtn.textContent = '停用';
  stopBtn.style.marginLeft = '6px';
  stopBtn.addEventListener('click', () => deactivateHermesMemory(row.id));
  action.append(editBtn, stopBtn);
  tr.appendChild(action);
  return tr;
}

export async function loadHermesMemories(manual) {
  const tbody = byId('tb-hermes-memory');
  const empty = byId('hm-empty');
  const count = byId('hm-count');
  if (!tbody || !window.API) return;
  tbody.textContent = '';
  setText(count, '加载中...');
  try {
    const data = await window.API.get('/api/hermes/memories');
    const items = data.items || [];
    items.forEach((item) => tbody.appendChild(renderMemory(item)));
    if (empty) empty.style.display = items.length ? 'none' : 'block';
    setText(count, items.length ? items.length + ' 条有效记忆' : '暂无有效记忆');
    if (manual) toast('AI 记忆已刷新');
  } catch (e) {
    setText(count, '加载失败');
    if (empty) empty.style.display = 'block';
    toast('AI 记忆加载失败：' + (e.message || 'unknown_error'));
  }
}

export function resetHermesMemoryForm() {
  ['hm-id', 'hm-title', 'hm-content', 'hm-evidence'].forEach((id) => { const el = byId(id); if (el) el.value = ''; });
  const kind = byId('hm-kind'); if (kind) kind.value = 'market';
  const importance = byId('hm-importance'); if (importance) importance.value = '3';
  const source = byId('hm-source'); if (source) source.value = 'manual';
  setText(byId('hm-submit-label'), '存入 AI 记忆');
}

function editHermesMemory(row) {
  const id = byId('hm-id'); if (id) id.value = row.id || '';
  const kind = byId('hm-kind'); if (kind) kind.value = row.kind || 'learning';
  const importance = byId('hm-importance'); if (importance) importance.value = String(row.importance || 3);
  const title = byId('hm-title'); if (title) title.value = text(row.title);
  const content = byId('hm-content'); if (content) content.value = text(row.content);
  const evidence = byId('hm-evidence'); if (evidence) evidence.value = text(row.evidence);
  const source = byId('hm-source'); if (source) source.value = text(row.source || 'manual');
  setText(byId('hm-submit-label'), '更新 AI 记忆');
  const panel = byId('panel-ai-memory');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export async function saveHermesMemory() {
  const body = {
    kind: field('hm-kind') || 'learning',
    importance: Number(field('hm-importance')) || 3,
    title: field('hm-title'),
    content: field('hm-content'),
    evidence: field('hm-evidence'),
    source: field('hm-source') || 'manual',
  };
  if (!body.title || !body.content) {
    toast('标题和记忆内容不能为空');
    return;
  }
  try {
    const id = field('hm-id');
    if (id) await window.API.patch('/api/hermes/memories/' + encodeURIComponent(id), body);
    else await window.API.post('/api/hermes/memories', body);
    resetHermesMemoryForm();
    await loadHermesMemories(false);
    toast(id ? 'AI 记忆已更新' : '已存入 AI 记忆');
  } catch (e) {
    toast(e.status === 403 ? '无权修改 AI 记忆' : '保存失败：' + (e.message || 'unknown_error'));
  }
}

async function deactivateHermesMemory(id) {
  if (!id || !window.API) return;
  if (!confirm('确定停用这条 AI 记忆吗？停用后 Hermes 不会再参考它。')) return;
  try {
    await window.API.del('/api/hermes/memories/' + encodeURIComponent(id));
    await loadHermesMemories(false);
    toast('已停用这条 AI 记忆');
  } catch (e) {
    toast(e.status === 403 ? '无权停用 AI 记忆' : '停用失败：' + (e.message || 'unknown_error'));
  }
}

export function resetHermesFeedbackForm() {
  ['hf-scope', 'hf-suggestion', 'hf-note'].forEach((id) => { const el = byId(id); if (el) el.value = ''; });
  const result = byId('hf-result'); if (result) result.value = 'adopted';
}

export async function saveHermesFeedback() {
  const result = field('hf-result') || 'adopted';
  const suggestion = field('hf-suggestion');
  const note = field('hf-note');
  const scope = field('hf-scope') || '未指定范围';
  if (!suggestion || !note) {
    toast('原建议和你的判断不能为空');
    return;
  }
  const negative = result === 'wrong' || result === 'generic';
  const body = {
    kind: negative ? 'risk' : (result === 'rejected' ? 'preference' : 'learning'),
    importance: negative ? 4 : 3,
    title: 'Hermes建议反馈：' + (FEEDBACK_LABEL[result] || result),
    content: [
      '适用范围：' + scope,
      '反馈结果：' + (FEEDBACK_LABEL[result] || result),
      '原建议：' + suggestion,
      '人工判断：' + note,
    ].join('\n'),
    evidence: '来源：AI记忆页人工反馈；页面：' + (window._curTab || location.pathname),
    source: 'hermes_feedback',
  };
  try {
    await window.API.post('/api/hermes/memories', body);
    resetHermesFeedbackForm();
    await loadHermesMemories(false);
    toast('反馈已沉淀，Hermes 后续会参考');
  } catch (e) {
    toast(e.status === 403 ? '无权沉淀反馈' : '反馈保存失败：' + (e.message || 'unknown_error'));
  }
}
