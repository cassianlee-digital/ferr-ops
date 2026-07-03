/* Hermes long-term memory admin page.
   Uses DOM textContent for API/user text so memories cannot inject HTML. */
(function () {
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
  function toastSafe(message) { if (window.toast) window.toast(message); }

  function field(id) {
    const el = byId(id);
    return el ? el.value.trim() : '';
  }

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
    main.append(title, content, source);
    tr.appendChild(main);

    const evidence = td(row.evidence || '—', '');
    evidence.style.whiteSpace = 'pre-wrap';
    evidence.style.fontSize = '11.5px';
    tr.appendChild(evidence);
    tr.appendChild(td(row.updated_at || row.created_at || '—', 'dim'));

    const action = td('', 'ctr');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-ghost';
    btn.textContent = '停用';
    btn.addEventListener('click', () => deactivateHermesMemory(row.id));
    action.appendChild(btn);
    tr.appendChild(action);
    return tr;
  }

  async function loadHermesMemories(manual) {
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
      if (manual) toastSafe('AI 记忆已刷新');
    } catch (e) {
      setText(count, '加载失败');
      if (empty) empty.style.display = 'block';
      toastSafe('AI 记忆加载失败：' + (e.message || 'unknown_error'));
    }
  }

  function resetHermesMemoryForm() {
    ['hm-title', 'hm-content', 'hm-evidence'].forEach((id) => { const el = byId(id); if (el) el.value = ''; });
    const kind = byId('hm-kind'); if (kind) kind.value = 'market';
    const importance = byId('hm-importance'); if (importance) importance.value = '3';
    const source = byId('hm-source'); if (source) source.value = 'manual';
  }

  async function saveHermesMemory() {
    const body = {
      kind: field('hm-kind') || 'learning',
      importance: Number(field('hm-importance')) || 3,
      title: field('hm-title'),
      content: field('hm-content'),
      evidence: field('hm-evidence'),
      source: field('hm-source') || 'manual',
    };
    if (!body.title || !body.content) {
      toastSafe('标题和记忆内容不能为空');
      return;
    }
    try {
      await window.API.post('/api/hermes/memories', body);
      resetHermesMemoryForm();
      await loadHermesMemories(false);
      toastSafe('已存入 AI 记忆');
    } catch (e) {
      toastSafe(e.status === 403 ? '无权修改 AI 记忆' : '保存失败：' + (e.message || 'unknown_error'));
    }
  }

  async function deactivateHermesMemory(id) {
    if (!id || !window.API) return;
    if (!confirm('确定停用这条 AI 记忆吗？停用后 Hermes 不会再参考它。')) return;
    try {
      await window.API.del('/api/hermes/memories/' + encodeURIComponent(id));
      await loadHermesMemories(false);
      toastSafe('已停用这条 AI 记忆');
    } catch (e) {
      toastSafe(e.status === 403 ? '无权停用 AI 记忆' : '停用失败：' + (e.message || 'unknown_error'));
    }
  }

  window.loadHermesMemories = loadHermesMemories;
  window.saveHermesMemory = saveHermesMemory;
  window.resetHermesMemoryForm = resetHermesMemoryForm;
})();
