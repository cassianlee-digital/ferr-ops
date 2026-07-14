/* Hermes / Ferr Ops assistant entry.
   The daily operator UI stays native to ferr-ops; the official Hermes console
   is kept as an advanced-mode escape hatch. */
(function () {
  const STORE_KEY = 'ferr:hermes-window';
  const ROLE_LABEL = { seo: 'SEO 李', sem: 'SEM 陈', manager: '主管', boss: '老板' };
  const MAX_HISTORY = 8;
  const MAX_ATTACHMENTS = 5;
  const MAX_TEXT_CHARS = 10000;
  const MAX_IMAGE_SIDE = 1280;
  const MAX_IMAGE_DATA_URL = 850000;
  const IMAGE_QUALITY = 0.76;

  let lastSessionSentAt = 0;
  let sessionTimer = null;
  let statusChecked = false;
  let lastHermesState = null;
  let messages = [];
  let attachments = [];
  let activeConversationId = null;
  let historyVisible = false;
  let deepThinking = false;
  let dataGapTaskKeys = new Set();
  let dataGapTaskItems = new Map();
  let currentHermesMissingData = new Set();
  let dataGapStatusLoaded = false;
  let closureEditorItems = new Map();
  let closureEditorSeq = 0;

  function byId(id) { return document.getElementById(id); }
  function currentUser() { return window.ME || {}; }
  function roleLabel(role) { return ROLE_LABEL[role] || role || '未识别'; }
  function escapeText(s) { return window.esc ? window.esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function renderMarkdown(s) {
    const lines = String(s || '').split(/\n/);
    let html = '';
    let listOpen = false;
    const closeList = () => {
      if (listOpen) {
        html += '</ul>';
        listOpen = false;
      }
    };
    const inline = (v) => escapeText(v).replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    lines.forEach((raw) => {
      const line = raw.trim();
      if (!line) {
        closeList();
        return;
      }
      const heading = line.match(/^#{1,3}\s+(.+)$/) ||
        line.match(/^【([^】]{2,16})】$/) ||
        line.match(/^(判断|依据|下一步|风险|结论|建议|可沉淀记忆)$/);
      if (heading) {
        closeList();
        html += '<h4>' + inline(heading[1]) + '</h4>';
        return;
      }
      const bullet = line.match(/^[-*]\s+(.+)$/) || line.match(/^\d+[.)、]\s+(.+)$/);
      if (bullet) {
        if (!listOpen) {
          html += '<ul>';
          listOpen = true;
        }
        html += '<li>' + inline(bullet[1]) + '</li>';
        return;
      }
      closeList();
      html += '<p>' + inline(line) + '</p>';
    });
    closeList();
    return html || '<p></p>';
  }

  function splitHermesResponse(text) {
    const raw = String(text || '').trim();
    const m = raw.match(/<hermes_basis>([\s\S]*?)<\/hermes_basis>\s*<hermes_answer>([\s\S]*?)<\/hermes_answer>/i);
    const clean = (value) => String(value || '')
      .replace(/<\/?hermes_(basis|answer)>/gi, '')
      .trim();
    if (m) return { basis: clean(m[1]), answer: clean(m[2]) || clean(raw) };
    return { basis: '', answer: clean(raw) };
  }
  function toastSafe(text) { if (window.toast) window.toast(text); }
  function formatSize(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + 'MB';
    if (n >= 1024) return Math.round(n / 1024) + 'KB';
    return n + 'B';
  }
  function extName(name) {
    const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }

  function appendLaunchParams(url) {
    const me = currentUser();
    try {
      const u = new URL(url, window.location.href);
      if (me.role) u.searchParams.set('ferr_role', me.role);
      u.searchParams.set('ferr_source', 'ferr-ops');
      return u.toString();
    } catch {
      return url;
    }
  }

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function txt(el, max) {
    return (el ? (el.innerText || el.textContent || '') : '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max || 4000);
  }
  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function tableTitle(table) {
    const card = table.closest('.card,.ai-box,.sheet');
    return txt(card && (card.querySelector('.card-title,.ai-title,.sheet-title') || card.querySelector('h2,h3')), 160);
  }

  function collectTable(table) {
    const headers = [...table.querySelectorAll('thead th')].slice(0, 10).map((th) => txt(th, 80));
    const rows = [...table.querySelectorAll('tbody tr')].filter(isVisible).slice(0, 10).map((tr) => (
      [...tr.children].slice(0, 10).map((td) => txt(td, 160))
    ));
    return { title: tableTitle(table), headers, rows };
  }

  function collectPageContext() {
    const activePanels = [...document.querySelectorAll('.panel.active')].filter(isVisible).slice(0, 4);
    const activeNav = document.querySelector('.nav-item.active');
    const activeSubtabs = [...document.querySelectorAll('.subtab.active,.planning-tab.active,.action-tab.active')].filter(isVisible);
    const panels = activePanels.map((panel) => ({
      id: panel.id || '',
      title: txt(panel.querySelector('.page-title,.card-title,h1,h2'), 160),
      subtitle: txt(panel.querySelector('.page-sub,.card-sub'), 300),
      visibleText: txt(panel, 6000),
    }));
    const tables = activePanels
      .flatMap((panel) => [...panel.querySelectorAll('table')].filter(isVisible).slice(0, 3).map(collectTable))
      .slice(0, 6);
    return {
      url: location.pathname + location.search + location.hash,
      tab: window._curTab || '',
      nav: txt(activeNav, 120),
      subtabs: activeSubtabs.map((x) => txt(x, 120)).filter(Boolean),
      panels,
      tables,
    };
  }

  function collectSessionState() {
    const page = collectPageContext();
    return {
      url: page.url,
      tab: page.tab,
      nav: page.nav,
      subtabs: page.subtabs,
      panels: page.panels.map((panel) => ({
        id: panel.id,
        title: panel.title,
        subtitle: panel.subtitle,
      })),
    };
  }

  async function syncHermesSession(force) {
    if (!window.API || !window.ME) return;
    const now = Date.now();
    if (!force && now - lastSessionSentAt < 2500) return;
    lastSessionSentAt = now;
    try { await window.API.post('/api/hermes/session-sync', collectSessionState()); } catch {}
  }

  function scheduleSessionSync(delay) {
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => syncHermesSession(false), delay == null ? 350 : delay);
  }

  async function syncHermesPageDetail(manual) {
    if (!window.API || !window.ME) return false;
    try {
      await window.API.post('/api/hermes/page-context', collectPageContext());
      await syncHermesSession(true);
      if (manual) toastSafe('已读取当前页面内容');
      return true;
    } catch (e) {
      if (manual) toastSafe('读取当前页失败：' + (e.message || 'sync_failed'));
      return false;
    }
  }

  function isTextFile(file) {
    const ext = extName(file.name);
    return /^text\//.test(file.type || '') || ['csv', 'txt', 'md', 'json'].includes(ext);
  }

  function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').slice(0, MAX_TEXT_CHARS));
      reader.onerror = () => reject(reader.error || new Error('read_failed'));
      reader.readAsText(file);
    });
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image_load_failed'));
      img.src = url;
    });
  }

  async function readImageFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width || 1, img.height || 1));
      let dataUrl = '';
      for (let attempt = 0; attempt < 5; attempt += 1) {
        canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
        canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        dataUrl = canvas.toDataURL('image/jpeg', Math.max(0.56, IMAGE_QUALITY - attempt * 0.05));
        if (dataUrl.length <= MAX_IMAGE_DATA_URL) return dataUrl;
        scale *= 0.82;
      }
      throw new Error('图片压缩后仍超过大小限制');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function unsupportedReason(file) {
    const ext = extName(file.name).toUpperCase() || (file.type || 'unknown');
    if (['PDF', 'XLS', 'XLSX'].includes(ext)) return ext + ' 内容解析未接入，本阶段不会把它当作已分析证据。';
    return '暂不支持该文件类型。';
  }

  async function buildAttachment(file) {
    const base = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: file.name || '未命名文件',
      type: file.type || '',
      size: file.size || 0,
    };
    if ((file.type || '').startsWith('image/')) {
      return { ...base, kind: 'image', imageDataUrl: await readImageFile(file), note: '图片已作为视觉输入提供给模型。' };
    }
    if (isTextFile(file)) {
      return { ...base, kind: 'text', textContent: await readTextFile(file), note: '文本内容已读取。' };
    }
    return { ...base, kind: 'unsupported', note: unsupportedReason(file) };
  }

  function attachmentRequestPayload(list) {
    return list
      .filter((item) => item.kind !== 'unsupported')
      .map((item) => ({
        name: item.name,
        type: item.type,
        size: item.size,
        kind: item.kind,
        textContent: item.kind === 'text' ? item.textContent : undefined,
        imageDataUrl: item.kind === 'image' ? item.imageDataUrl : undefined,
      }));
  }

  function attachmentPromptBlock(list) {
    if (!list.length) return '';
    const lines = ['[用户上传附件]'];
    list.forEach((item) => {
      lines.push(`- ${item.name}（${item.kind}，${formatSize(item.size)}）：${item.note || ''}`);
      if (item.kind === 'image') {
        lines.push('  图片已随请求发送。必须只在模型实际能读取图片时引用图片内容；若无法识别图片，要明确说明。');
      }
    });
    return lines.join('\n').slice(0, 24000);
  }

  function renderAttachmentChips(container, list, options) {
    if (!container) return;
    container.innerHTML = '';
    list.forEach((item, index) => {
      const chip = document.createElement('div');
      chip.className = 'hermes-file-chip ' + item.kind;
      const icon = item.kind === 'image' ? 'photo' : (item.kind === 'text' ? 'file-text' : 'alert-triangle');
      chip.innerHTML = '<i class="ti ti-' + icon + '"></i><span></span><small></small>';
      chip.querySelector('span').textContent = item.name;
      chip.querySelector('small').textContent = (item.kind === 'unsupported' ? '未解析' : formatSize(item.size));
      if (options && options.removable) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hermes-file-remove';
        btn.dataset.index = String(index);
        btn.innerHTML = '<i class="ti ti-x"></i>';
        chip.appendChild(btn);
      }
      container.appendChild(chip);
    });
  }

  function renderAttachments() {
    renderAttachmentChips(byId('hermesAttachments'), attachments, { removable: true });
  }

  async function addHermesFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      toastSafe('最多同时附加 ' + MAX_ATTACHMENTS + ' 个文件');
      return;
    }
    const selected = files.slice(0, room);
    if (files.length > room) toastSafe('已只保留前 ' + room + ' 个文件');
    for (const file of selected) {
      try {
        attachments.push(await buildAttachment(file));
      } catch (e) {
        attachments.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          name: file.name || '未命名文件',
          type: file.type || '',
          size: file.size || 0,
          kind: 'unsupported',
          note: '读取失败：' + (e.message || 'read_failed'),
        });
      }
    }
    renderAttachments();
  }

  function removeHermesAttachment(index) {
    attachments.splice(Number(index), 1);
    renderAttachments();
  }

  function saveWindowState() {
    const panel = byId('hermesPanel');
    if (!panel || panel.classList.contains('max')) return;
    const r = panel.getBoundingClientRect();
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        left: Math.round(r.left),
        top: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      }));
    } catch {}
  }

  function restoreWindowState() {
    const panel = byId('hermesPanel');
    if (!panel) return;
    let state = null;
    try { state = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch {}
    if (!state) return;
    const width = clamp(Number(state.width) || 860, 420, window.innerWidth - 24);
    const height = clamp(Number(state.height) || 720, 420, window.innerHeight - 24);
    const left = clamp(Number(state.left) || 60, 12, window.innerWidth - width - 12);
    const top = clamp(Number(state.top) || 72, 12, window.innerHeight - height - 12);
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.right = 'auto';
    panel.style.width = width + 'px';
    panel.style.height = height + 'px';
  }

  function resetHermesWindow() {
    const panel = byId('hermesPanel');
    if (!panel) return;
    panel.classList.remove('max');
    panel.style.left = '';
    panel.style.top = '';
    panel.style.right = '';
    panel.style.width = '';
    panel.style.height = '';
    try { localStorage.removeItem(STORE_KEY); } catch {}
  }

  function toggleHermesMaximize() {
    const panel = byId('hermesPanel');
    if (!panel) return;
    if (!panel.classList.contains('max')) saveWindowState();
    panel.classList.toggle('max');
  }

  function setupDrag() {
    const panel = byId('hermesPanel');
    const handle = byId('hermesDragHandle');
    if (!panel || !handle || handle.dataset.ready) return;
    handle.dataset.ready = '1';
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || panel.classList.contains('max')) return;
      const start = panel.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      handle.setPointerCapture(e.pointerId);
      panel.style.left = start.left + 'px';
      panel.style.top = start.top + 'px';
      panel.style.right = 'auto';

      const move = (ev) => {
        const width = panel.offsetWidth;
        const height = panel.offsetHeight;
        panel.style.left = clamp(start.left + ev.clientX - startX, 12, window.innerWidth - width - 12) + 'px';
        panel.style.top = clamp(start.top + ev.clientY - startY, 12, window.innerHeight - height - 12) + 'px';
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        saveWindowState();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });

    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(() => {
        if (panel.classList.contains('show')) saveWindowState();
      });
      ro.observe(panel);
    }
  }

  function setHermesView(state) {
    lastHermesState = state || {};
    const statusBox = byId('hermesStatusBox');
    const statusText = byId('hermesStatusText');
    const detail = byId('hermesDetail');
    const openBtn = byId('hermesOpenBtn');
    const connected = !!lastHermesState.connected;
    const configured = !!lastHermesState.configured;
    const launchUrl = connected && lastHermesState.url ? appendLaunchParams(lastHermesState.url) : '';
    let statusLabel = '当前状态：尚未检查智能体服务器';

    if (statusBox) {
      statusBox.classList.toggle('ok', connected);
      statusBox.classList.toggle('bad', !connected);
    }
    if (statusText) {
      if (connected) statusLabel = '当前状态：Hermes 智能体可用';
      else if (configured) statusLabel = '当前状态：Hermes 已配置但连接失败；小瑞仍可使用本地记忆与技能';
      else statusLabel = '当前状态：未配置官方 Hermes；小瑞使用本地记忆与技能';
      statusText.textContent = statusLabel;
    }
    if (statusBox) statusBox.title = statusLabel;
    if (detail) {
      const parts = [];
      if (lastHermesState.error) parts.push('官方 Hermes：' + lastHermesState.error);
      if (lastHermesState.checkedAt) parts.push('检查时间：' + new Date(lastHermesState.checkedAt).toLocaleString());
      detail.textContent = parts.length
        ? parts.join(' · ')
        : '小瑞会结合长期记忆、技能规则、工作流、当前页上下文和附件一起判断。';
    }
    if (openBtn) {
      openBtn.disabled = !launchUrl;
      openBtn.dataset.url = launchUrl;
    }
  }

  async function refreshHermesStatus(manual) {
    const statusBox = byId('hermesStatusBox');
    const statusText = byId('hermesStatusText');
    const checkingText = '当前状态：正在检查官方 Hermes 连接…';
    if (statusBox) {
      statusBox.classList.remove('ok', 'bad');
      statusBox.title = checkingText;
    }
    if (statusText) statusText.textContent = checkingText;
    try {
      const state = await window.API.get('/api/hermes/status');
      statusChecked = true;
      setHermesView(state);
      if (manual) toastSafe(state.connected ? '官方 Hermes 已连接' : '官方 Hermes 未连接：' + (state.error || 'unknown'));
    } catch (e) {
      statusChecked = true;
      setHermesView({ configured: false, connected: false, error: e.message || 'status_failed' });
      if (manual) toastSafe('Hermes 状态检查失败：' + (e.message || 'status_failed'));
    }
  }

  function messageHistoryPayload() {
    return messages
      .filter((m) => m.content && !m.loading)
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: m.content }));
  }

  function selectedGatewayMode() {
    if (deepThinking) return { skill: 'auto', workflow: 'diagnose_to_action' };
    return {
      skill: (byId('hermesSkill') && byId('hermesSkill').value) || 'auto',
      workflow: (byId('hermesWorkflow') && byId('hermesWorkflow').value) || 'answer',
    };
  }

  function renderDeepThinkingButton() {
    const btn = byId('hermesDeepBtn');
    if (!btn) return;
    btn.classList.toggle('active', deepThinking);
    btn.setAttribute('aria-pressed', deepThinking ? 'true' : 'false');
    btn.replaceChildren();
    const icon = document.createElement('i');
    icon.className = 'ti ti-brain';
    btn.appendChild(icon);
    btn.appendChild(document.createTextNode(deepThinking ? ' 深度思考：开' : ' 深度思考'));
    btn.title = deepThinking
      ? '深度思考已开启：小瑞会做更深入的证据分析和风险审查'
      : '重要问题开启后，小瑞会做更深入的证据分析和风险审查';
  }

  function setHermesHistoryMode(active) {
    const panel = byId('hermesHistory');
    const workspace = panel && panel.closest('.hermes-workspace');
    if (workspace) workspace.classList.toggle('history-open', Boolean(active));
  }

  function toggleHermesDeepThinking() {
    deepThinking = !deepThinking;
    renderDeepThinkingButton();
    toastSafe(deepThinking ? '深度思考已开启' : '深度思考已关闭');
  }

  function formatConversationTime(value) {
    if (!value) return '';
    try { return new Date(value).toLocaleString(); } catch { return String(value); }
  }

  function setConversationControls() {
    const archiveBtn = byId('hermesArchiveBtn');
    const learnBtn = byId('hermesLearnConversationBtn');
    if (archiveBtn) archiveBtn.disabled = !activeConversationId;
    if (learnBtn) learnBtn.disabled = !activeConversationId;
  }

  function closeHermesMenus() {
    document.querySelectorAll('.hermes-mode[open],.hermes-more[open]').forEach((el) => {
      el.removeAttribute('open');
    });
  }

  function renderLastConversation(conversation) {
    const box = byId('hermesLast');
    if (!box) return;
    box.innerHTML = '';
    if (!conversation || conversation.id === activeConversationId || messages.length) {
      box.hidden = true;
      return;
    }
    const icon = document.createElement('i');
    icon.className = 'ti ti-history';
    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = '上次聊到';
    const meta = document.createElement('span');
    const timeText = formatConversationTime(conversation.updated_at);
    meta.textContent = (conversation.title || '上次对话') + (timeText ? ' · ' + timeText : '');
    text.appendChild(title);
    text.appendChild(meta);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hermes-last-open';
    btn.dataset.id = String(conversation.id);
    btn.innerHTML = '<i class="ti ti-arrow-right"></i>';
    box.appendChild(icon);
    box.appendChild(text);
    box.appendChild(btn);
    box.hidden = false;
  }

  function renderHistoryList(items, archived) {
    const panel = byId('hermesHistory');
    if (!panel) return;
    panel.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'hermes-history-head';
    const title = document.createElement('strong');
    title.textContent = archived ? '已归档对话' : '历史记录';
    const switchBtn = document.createElement('button');
    switchBtn.type = 'button';
    switchBtn.className = 'hermes-history-switch';
    switchBtn.dataset.archived = archived ? '0' : '1';
    switchBtn.textContent = archived ? '看活跃' : '看归档';
    head.appendChild(title);
    head.appendChild(switchBtn);
    panel.appendChild(head);

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'hermes-history-empty';
      empty.textContent = archived ? '暂无归档对话。' : '暂无历史对话。';
      panel.appendChild(empty);
      return;
    }

    items.forEach((item) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'hermes-history-row';
      row.dataset.id = String(item.id);
      const main = document.createElement('span');
      main.className = 'hermes-history-title';
      main.textContent = item.title || '新对话';
      const meta = document.createElement('small');
      meta.textContent = [formatConversationTime(item.updated_at), item.message_count ? item.message_count + ' 条' : ''].filter(Boolean).join(' · ');
      row.appendChild(main);
      row.appendChild(meta);
      panel.appendChild(row);
    });
  }

  async function loadHermesLatest(openNow) {
    if (!window.API) return;
    try {
      const res = await window.API.get('/api/hermes/conversations/latest');
      const conversation = res && res.conversation;
      renderLastConversation(conversation);
      if (openNow) {
        if (conversation && conversation.id) await loadHermesConversation(conversation.id);
        else toastSafe('还没有可继续的对话');
      }
    } catch (e) {
      if (openNow) toastSafe('读取上次对话失败：' + (e.message || 'history_failed'));
    }
  }

  async function loadHermesConversation(id) {
    if (!window.API || !id) return;
    try {
      const res = await window.API.get('/api/hermes/conversations/' + encodeURIComponent(id));
      const conversation = res && res.conversation;
      if (!conversation) return;
      activeConversationId = conversation.id;
      messages = Array.isArray(conversation.messages) ? conversation.messages : [];
      deepThinking = conversation.workflow === 'diagnose_to_action';
      renderDeepThinkingButton();
      historyVisible = false;
      const panel = byId('hermesHistory');
      if (panel) panel.hidden = true;
      setHermesHistoryMode(false);
      renderMessages();
    } catch (e) {
      toastSafe('读取历史对话失败：' + (e.message || 'history_failed'));
    }
  }

  async function loadHermesMorningBrief() {
    if (!window.API) return;
    closeHermesMenus();
    messages.push({ role: 'user', content: '生成今日早报' });
    messages.push({ role: 'assistant', content: '', loading: true });
    renderMessages();
    setSending(true);
    try {
      await syncHermesSession(true);
      const res = await window.API.post('/api/hermes/morning-brief', {
        conversationId: activeConversationId,
      });
      if (res.conversation && res.conversation.id) activeConversationId = res.conversation.id;
      const parsed = splitHermesResponse(res.text || '');
      messages[messages.length - 1] = {
        role: 'assistant',
        content: parsed.answer || '没有返回今日早报。',
        basis: parsed.basis,
        hermes: res.hermes,
      };
      if (typeof window.loadHermesMemories === 'function') await window.loadHermesMemories(false);
    } catch (e) {
      messages[messages.length - 1] = {
        role: 'assistant',
        content: '今日早报生成失败。\n\n原因：' + (e.message || 'morning_brief_failed') + '\n\n请确认后端 AI 配置和 Hermes 上下文是否正常。',
      };
    } finally {
      setSending(false);
      renderMessages();
    }
  }

  async function loadHermesHistory(archived) {
    if (!window.API) return;
    const panel = byId('hermesHistory');
    if (panel) panel.hidden = false;
    setHermesHistoryMode(true);
    historyVisible = true;
    try {
      const res = await window.API.get('/api/hermes/conversations?archived=' + (archived ? '1' : '0'));
      renderHistoryList((res && res.items) || [], archived);
    } catch (e) {
      if (panel) {
        panel.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'hermes-history-empty';
        empty.textContent = '历史记录读取失败：' + (e.message || 'history_failed');
        panel.appendChild(empty);
      }
    }
  }

  function toggleHermesHistory() {
    const panel = byId('hermesHistory');
    if (!panel) return;
    if (historyVisible && !panel.hidden) {
      panel.hidden = true;
      historyVisible = false;
      setHermesHistoryMode(false);
      return;
    }
    loadHermesHistory(false);
  }

  async function archiveHermesConversation() {
    if (!window.API || !activeConversationId) return;
    try {
      await window.API.post('/api/hermes/conversations/' + encodeURIComponent(activeConversationId) + '/archive', {});
      activeConversationId = null;
      messages = [];
      renderMessages();
      await loadHermesLatest(false);
      if (historyVisible) await loadHermesHistory(false);
      toastSafe('当前对话已归档');
    } catch (e) {
      toastSafe('归档失败：' + (e.message || 'archive_failed'));
    }
  }

  async function learnHermesConversation() {
    if (!window.API || !activeConversationId) return;
    const btn = byId('hermesLearnConversationBtn');
    if (btn) btn.disabled = true;
    try {
      await window.API.post('/api/hermes/conversations/' + encodeURIComponent(activeConversationId) + '/learn', {});
      if (typeof window.loadHermesMemories === 'function') await window.loadHermesMemories(false);
      toastSafe('当前对话已沉淀到 Hermes 记忆');
    } catch (e) {
      toastSafe(e.status === 403 ? '无权沉淀 AI 记忆' : '沉淀失败：' + (e.message || 'learn_failed'));
    } finally {
      setConversationControls();
    }
  }

  async function sendHermesFeedback(index, result) {
    if (!window.API || !activeConversationId) {
      toastSafe('需要先发送或打开一段已保存对话');
      return;
    }
    const label = { adopted: '有用', generic: '太泛', wrong: '不准' }[result] || '反馈';
    try {
      await window.API.post('/api/hermes/conversations/' + encodeURIComponent(activeConversationId) + '/feedback', {
        messageIndex: Number(index),
        result,
      });
      if (typeof window.loadHermesMemories === 'function') await window.loadHermesMemories(false);
      toastSafe('已记录反馈：' + label);
    } catch (e) {
      toastSafe(e.status === 403 ? '无权沉淀 AI 反馈' : '反馈失败：' + (e.message || 'feedback_failed'));
    }
  }

  function evidenceStatusLabel(status, audit) {
    if (audit && audit.claimAuditStatus === 'downgraded') return '结论待验证';
    if (audit && audit.claimAuditStatus === 'passed' && status === 'supported') return '证据通过';
    return {
      supported: '已引用证据',
      partial: '部分证据需核对',
      weak: '未引用证据',
      no_evidence_pool: '暂无证据池',
    }[status] || '待核验';
  }

  function evidenceLine(item) {
    const roleLabel = {
      synced_observation: '同步观测',
      crm_observation: 'CRM观测',
      manual_weekly_report: '人工周报',
      target_only: '目标值',
      keyword_registry: '关键词库',
      data_gap: '数据缺口',
      operational_observation: '运营观测',
    }[item.dataRole] || item.dataRole || '';
    return [
      item.id,
      item.source ? 'source=' + item.source : '',
      roleLabel ? '性质=' + roleLabel : '',
      item.metric ? 'metric=' + item.metric : '',
      item.date ? 'date=' + item.date : '',
      item.freshness ? 'freshness=' + item.freshness : '',
      item.value ? 'value=' + item.value : '',
    ].filter(Boolean).join(' · ');
  }

  function evidenceCopyText(item) {
    return [
      evidenceLine(item),
      item.detail || '',
    ].filter(Boolean).join('\n');
  }

  function evidenceTarget(source) {
    const key = String(source || '');
    if (key.startsWith('kpi_')) return { tab: 'kpi', label: 'KPI 考核' };
    if (key.startsWith('inquiries')) return { tab: 'inquiry', label: '询盘评级' };
    if (key.startsWith('sem_')) return { tab: 'data', sub: 'data-sem', label: '数据看板 · SEM' };
    if (key.startsWith('seo_')) return { tab: 'data', sub: 'data-seo', label: '数据看板 · SEO' };
    if (key === 'keywords') return { tab: 'keywords', label: '关键词库' };
    return null;
  }

  async function copyText(text, okMessage) {
    const value = String(text || '');
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toastSafe(okMessage || '已复制');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toastSafe(okMessage || '已复制'); } catch { toastSafe('复制失败，请手动选择文本'); }
      ta.remove();
    }
  }

  function openEvidenceSource(source) {
    const target = evidenceTarget(source);
    if (!target) {
      toastSafe('这条证据暂时没有可跳转的来源模块');
      return;
    }
    if (typeof window.go === 'function') window.go(target.tab);
    setTimeout(() => {
      if (target.sub) {
        const panel = document.getElementById('panel-' + target.tab);
        const sub = panel && panel.querySelector('.subtab[data-sub="' + target.sub + '"]');
        if (sub) sub.click();
      }
      const panel = document.getElementById('panel-' + target.tab);
      if (panel) panel.scrollIntoView({ block: 'start' });
      toastSafe('已打开来源：' + target.label);
    }, 40);
  }

  function encodeTask(task) {
    try { return JSON.stringify(task || {}); } catch { return '{}'; }
  }

  function dataGapTaskKey(task) {
    return [
      task && task.dept || '公司',
      task && task.task_date || '',
      String(task && task.content || '').trim(),
    ].join('|');
  }

  function markGapButtonAdded(button) {
    if (!button) return;
    button.disabled = true;
    button.classList.add('added');
    button.innerHTML = '<i class="ti ti-check"></i><span>已加入</span>';
  }

  function gapTaskState(task) {
    const key = dataGapTaskKey(task);
    const existing = dataGapTaskItems.get(key);
    if (dataGapStatusLoaded && task && task.key && !currentHermesMissingData.has(task.key)) return 'resolved';
    if (existing && (existing.state === 'done' || existing.status === 'done')) return 'done_still_missing';
    if (existing) return 'added';
    return 'missing';
  }

  function gapTaskStateText(state) {
    return {
      resolved: '数据已补齐',
      done_still_missing: '任务完成 · 数据仍缺',
      added: '已加入日计划',
      missing: '待补数',
    }[state] || '待补数';
  }

  function setGapButtonState(button, state) {
    if (!button) return;
    button.classList.remove('added', 'resolved', 'warn');
    if (state === 'resolved') {
      button.disabled = true;
      button.classList.add('resolved');
      button.innerHTML = '<i class="ti ti-checks"></i><span>已补齐</span>';
    } else if (state === 'done_still_missing') {
      button.disabled = true;
      button.classList.add('warn');
      button.innerHTML = '<i class="ti ti-alert-triangle"></i><span>仍缺</span>';
    } else if (state === 'added') {
      markGapButtonAdded(button);
    } else {
      button.disabled = false;
      button.innerHTML = '<i class="ti ti-plus"></i><span>加入日计划</span>';
    }
  }

  function applyGapTaskButtonStates() {
    document.querySelectorAll('.hermes-gap-add').forEach((btn) => {
      const key = btn.dataset.key || '';
      if (!key) return;
      let task = {};
      try { task = JSON.parse(btn.dataset.task || '{}'); } catch {}
      setGapButtonState(btn, gapTaskState(task));
      const row = btn.closest('.hermes-gap-task');
      const badge = row && row.querySelector('.hermes-gap-state');
      if (badge) badge.textContent = gapTaskStateText(gapTaskState(task));
    });
    document.querySelectorAll('.hermes-gap-refresh').forEach((box) => {
      let tasks = [];
      try { tasks = JSON.parse(box.dataset.tasks || '[]'); } catch {}
      const resolved = tasks.filter((task) => gapTaskState(task) === 'resolved');
      const note = box.querySelector('.hermes-gap-refresh-note');
      if (resolved.length) {
        box.hidden = false;
        if (note) note.textContent = '已补齐 ' + resolved.length + ' 个数据缺口，可基于最新数据重新判断。';
      } else {
        box.hidden = true;
      }
    });
  }

  async function refreshDataGapTaskKeys() {
    if (!window.API) return dataGapTaskKeys;
    try {
      const [taskRes, contextRes] = await Promise.all([
        window.API.get('/api/loop-items?kind=task'),
        window.API.get('/api/hermes/context'),
      ]);
      const items = (taskRes && taskRes.items) || [];
      dataGapTaskItems = new Map(items.map((item) => [dataGapTaskKey(item), item]));
      dataGapTaskKeys = new Set(dataGapTaskItems.keys());
      currentHermesMissingData = new Set([
        ...(((contextRes && contextRes.opsDiagnosis && contextRes.opsDiagnosis.missingData) || [])),
        ...(((contextRes && contextRes.enterpriseMemory && contextRes.enterpriseMemory.missingData) || [])),
      ].filter(Boolean));
      dataGapStatusLoaded = true;
      applyGapTaskButtonStates();
    } catch {}
    return dataGapTaskKeys;
  }

  async function createDataGapTask(taskJson, button) {
    if (!window.API) return;
    let task = {};
    try { task = JSON.parse(taskJson || '{}'); } catch {}
    const content = String(task.content || '').trim();
    if (!content) {
      toastSafe('补数任务内容为空');
      return;
    }
    const key = dataGapTaskKey(task);
    await refreshDataGapTaskKeys();
    if (dataGapTaskKeys.has(key)) {
      markGapButtonAdded(button);
      toastSafe('这条补数任务今天已在日计划中');
      return;
    }
    if (button) button.disabled = true;
    try {
      const body = {
        kind: 'task',
        dept: task.dept || '公司',
        content,
        owner: task.owner || '',
        status: task.status || '待办',
        task_date: task.task_date || '',
        note: task.note || '',
      };
      await window.API.post('/api/loop-items', body);
      dataGapTaskKeys.add(dataGapTaskKey(body));
      dataGapTaskItems.set(dataGapTaskKey(body), body);
      applyGapTaskButtonStates();
      if (typeof window.loadClosedLoop === 'function') await window.loadClosedLoop();
      toastSafe('已加入日计划：' + content.slice(0, 28));
    } catch (e) {
      if (button) button.disabled = false;
      toastSafe(e && e.status === 403 ? '无权新增任务' : '补数任务入库失败：' + ((e && e.message) || 'save_failed'));
    }
  }

  function appendHermesEvidenceAudit(bubble, hermes) {
    const audit = hermes && hermes.evidenceAudit;
    if (!audit) return;

    const evidence = Array.isArray(audit.evidence) ? audit.evidence : [];
    const unknown = Array.isArray(audit.unknownEvidenceIds) ? audit.unknownEvidenceIds : [];
    const missing = Array.isArray(hermes.missingData) ? hermes.missingData.filter(Boolean) : [];
    const details = document.createElement('details');
    details.className = 'hermes-evidence';
    details.open = audit.status === 'weak' || audit.status === 'partial' || audit.claimAuditStatus === 'downgraded';

    const summary = document.createElement('summary');
    const status = document.createElement('span');
    status.className = 'hermes-evidence-status ' + (audit.status || 'unknown');
    status.textContent = evidenceStatusLabel(audit.status, audit);
    summary.innerHTML = '<i class="ti ti-shield-check"></i><strong>证据核验</strong>';
    summary.appendChild(status);
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'hermes-evidence-body';

    const unsupportedClaims = Array.isArray(audit.unsupportedClaims) ? audit.unsupportedClaims.filter(Boolean) : [];
    const bindingIssueCount = Array.isArray(audit.evidenceBindingIssues) ? audit.evidenceBindingIssues.length : 0;
    if (audit.claimAuditStatus === 'downgraded' && unsupportedClaims.length) {
      const claimAudit = document.createElement('div');
      claimAudit.className = 'hermes-claim-audit downgraded';
      const title = document.createElement('strong');
      title.textContent = `已降级 ${unsupportedClaims.length} 条判断或动作${bindingIssueCount ? `，其中 ${bindingIssueCount} 条证据性质不匹配` : ''}`;
      claimAudit.appendChild(title);
      const list = document.createElement('ul');
      unsupportedClaims.slice(0, 6).forEach((claim) => {
        const item = document.createElement('li');
        item.textContent = claim;
        list.appendChild(item);
      });
      claimAudit.appendChild(list);
      const note = document.createElement('span');
      note.textContent = '补充并核对公司数据后，才能作为执行依据。';
      claimAudit.appendChild(note);
      body.appendChild(claimAudit);
    }

    if (evidence.length) {
      evidence.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'hermes-evidence-row';
        const main = document.createElement('strong');
        main.textContent = evidenceLine(item);
        const detail = document.createElement('span');
        detail.textContent = item.detail || '';
        row.appendChild(main);
        if (detail.textContent) row.appendChild(detail);
        const actions = document.createElement('div');
        actions.className = 'hermes-evidence-actions';
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'hermes-evidence-copy';
        copy.dataset.evidence = evidenceCopyText(item);
        copy.innerHTML = '<i class="ti ti-copy"></i><span>复制</span>';
        actions.appendChild(copy);
        const target = evidenceTarget(item.source);
        if (target) {
          const source = document.createElement('button');
          source.type = 'button';
          source.className = 'hermes-evidence-source';
          source.dataset.source = item.source || '';
          source.innerHTML = '<i class="ti ti-external-link"></i><span>来源</span>';
          actions.appendChild(source);
        }
        row.appendChild(actions);
        body.appendChild(row);
      });
    } else {
      const empty = document.createElement('div');
      empty.className = 'hermes-evidence-empty';
      empty.textContent = audit.evidencePoolSize ? '这条回答没有引用可匹配的证据编号，结论应按待验证处理。' : '当前没有可用证据池，不能把回答当成已验证结论。';
      body.appendChild(empty);
    }

    if (unknown.length) {
      const warn = document.createElement('div');
      warn.className = 'hermes-evidence-warn';
      warn.textContent = '未知证据编号：' + unknown.slice(0, 5).join('、');
      body.appendChild(warn);
    }

    if (missing.length) {
      const miss = document.createElement('div');
      miss.className = 'hermes-evidence-missing';
      miss.textContent = '缺失数据：' + missing.slice(0, 6).join('、');
      body.appendChild(miss);
    }

    const tasks = Array.isArray(hermes.dataGapTasks) ? hermes.dataGapTasks : [];
    if (tasks.length) {
      const taskBox = document.createElement('div');
      taskBox.className = 'hermes-gap-tasks';
      const title = document.createElement('div');
      title.className = 'hermes-gap-title';
      title.textContent = '建议补数任务';
      taskBox.appendChild(title);
      tasks.slice(0, 4).forEach((task) => {
        const row = document.createElement('div');
        row.className = 'hermes-gap-task';
        const main = document.createElement('span');
        main.textContent = task.content || task.key || '';
        const state = gapTaskState(task);
        const meta = document.createElement('small');
        meta.className = 'hermes-gap-state';
        meta.textContent = gapTaskStateText(state);
        const text = document.createElement('div');
        text.className = 'hermes-gap-task-text';
        text.appendChild(main);
        text.appendChild(meta);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hermes-gap-add';
        btn.dataset.key = dataGapTaskKey(task);
        btn.dataset.task = encodeTask(task);
        setGapButtonState(btn, state);
        row.appendChild(text);
        row.appendChild(btn);
        taskBox.appendChild(row);
      });
      const refresh = document.createElement('div');
      refresh.className = 'hermes-gap-refresh';
      refresh.dataset.tasks = encodeTask(tasks.slice(0, 4));
      refresh.hidden = true;
      const note = document.createElement('span');
      note.className = 'hermes-gap-refresh-note';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hermes-gap-refresh-btn';
      btn.innerHTML = '<i class="ti ti-refresh"></i><span>重新生成诊断</span>';
      refresh.appendChild(note);
      refresh.appendChild(btn);
      taskBox.appendChild(refresh);
      body.appendChild(taskBox);
    }

    details.appendChild(body);
    bubble.appendChild(details);
  }

  function appendHermesClosureAudit(bubble, hermes) {
    const audit = hermes && hermes.closureAudit;
    if (!audit || audit.status === 'no_data' || !audit.issueCount) return;

    const details = document.createElement('details');
    details.className = 'hermes-closure';
    details.open = true;
    const summary = document.createElement('summary');
    summary.innerHTML = '<i class="ti ti-git-merge"></i><strong>闭环审查</strong>';
    const status = document.createElement('span');
    status.className = 'hermes-closure-status';
    status.textContent = `待处理 ${audit.issueCount} 项`;
    summary.appendChild(status);
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'hermes-closure-body';
    const rows = [];
    const addRow = (text, type, data) => {
      const row = document.createElement('div');
      row.className = 'hermes-closure-row';
      const label = document.createElement('span');
      label.textContent = text;
      row.appendChild(label);
      if (type) {
        const key = String(++closureEditorSeq);
        closureEditorItems.set(key, { type, ...data });
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'hermes-closure-action';
        button.dataset.key = key;
        button.innerHTML = '<i class="ti ti-edit"></i><span>处理</span>';
        row.appendChild(button);
      }
      rows.push(row);
    };
    (audit.memoryConflicts || []).slice(0, 3).forEach((item) => addRow(`记忆冲突：${(item.titles || []).join(' / ')}`, '', {}));
    (audit.overdueActions || []).slice(0, 3).forEach((item) => addRow(`逾期动作：${item.content}（${item.taskDate}）`, 'action', { item, overdue: true }));
    (audit.unverifiedActions || []).slice(0, 3).forEach((item) => addRow(`${item.state === 'archived' ? '归档但未验证' : '执行未复盘'}：${item.content}，缺少${(item.missing || []).join('、')}`, 'action', { item }));
    (audit.reviewGaps || []).slice(0, 3).forEach((item) => addRow(`周报缺口：${item.weekKey || ''} ${item.dept || ''}，缺少${(item.missing || []).join('、')}`, 'report', { item }));
    const list = document.createElement('ul');
    rows.slice(0, 8).forEach((row) => { const item = document.createElement('li'); item.appendChild(row); list.appendChild(item); });
    body.appendChild(list);
    details.appendChild(body);
    bubble.appendChild(details);
  }

  function closureField(label, type, value, multiline) {
    const wrap = document.createElement('label');
    wrap.className = 'hermes-closure-field';
    const title = document.createElement('span');
    title.textContent = label;
    const input = document.createElement(multiline ? 'textarea' : 'input');
    input.dataset.field = type;
    input.value = value || '';
    input.required = true;
    input.rows = multiline ? 4 : undefined;
    wrap.appendChild(title);
    wrap.appendChild(input);
    return wrap;
  }

  function closureFieldLabel(field) {
    return { summary: '周报内容', analysis: '分析结论', next_plan: '下一步计划', metric: '验证指标', conclusion: '执行结果/结论' }[field] || field;
  }

  function closeClosureEditor(editor) {
    if (editor) editor.remove();
  }

  async function refreshClosureAuditView() {
    try {
      const context = await window.API.get('/api/hermes/context');
      const current = [...messages].reverse().find((message) => message.role === 'assistant' && message.hermes);
      if (current) current.hermes.closureAudit = context.closureAudit || context.enterpriseMemory?.closureAudit || null;
      renderMessages();
    } catch (e) {
      toastSafe('闭环审查刷新失败：' + (e.message || 'unknown_error'));
    }
  }

  function openClosureEditor(type, data) {
    const item = data.item || {};
    const editor = document.createElement('div');
    editor.className = 'hermes-closure-editor';
    const card = document.createElement('div');
    card.className = 'hermes-closure-card';
    const head = document.createElement('div');
    head.className = 'hermes-closure-editor-head';
    const title = document.createElement('strong');
    title.textContent = type === 'report' ? '补充周报闭环' : '补充动作结果';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'hermes-closure-editor-close';
    close.innerHTML = '<i class="ti ti-x"></i>';
    close.title = '关闭';
    close.addEventListener('click', () => closeClosureEditor(editor));
    head.appendChild(title);
    head.appendChild(close);
    card.appendChild(head);

    const description = document.createElement('p');
    description.className = 'hermes-closure-editor-desc';
    description.textContent = item.content || `${item.weekKey || ''} ${item.dept || ''}`;
    card.appendChild(description);
    const fields = type === 'report' ? (item.fields || []) : (item.fields || ['metric', 'conclusion']);
    fields.forEach((field) => card.appendChild(closureField(closureFieldLabel(field), field, '', field !== 'metric')));

    const foot = document.createElement('div');
    foot.className = 'hermes-closure-editor-foot';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn-ghost';
    cancel.textContent = '取消';
    cancel.addEventListener('click', () => closeClosureEditor(editor));
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn-primary';
    save.innerHTML = '<i class="ti ti-device-floppy"></i><span>保存并复核</span>';
    save.addEventListener('click', async () => {
      const values = {};
      let valid = true;
      card.querySelectorAll('[data-field]').forEach((input) => {
        values[input.dataset.field] = String(input.value || '').trim();
        if (input.required && !values[input.dataset.field]) valid = false;
      });
      if (!valid) { toastSafe('请先补全闭环字段'); return; }
      save.disabled = true;
      try {
        if (type === 'action') {
          const payload = {};
          if (Object.prototype.hasOwnProperty.call(values, 'metric')) payload.metric = values.metric;
          if (Object.prototype.hasOwnProperty.call(values, 'conclusion')) payload.conclusion = values.conclusion;
          if (data.overdue) { payload.status = 'done'; payload.state = 'done'; }
          await window.API.patch('/api/loop-items/' + encodeURIComponent(item.id), payload);
        } else {
          await Promise.all(Object.entries(values).map(([field, value]) => window.API.put('/api/weekly-reports', {
            week_key: item.weekKey, dept: item.dept, field, items: [value],
          })));
        }
        closeClosureEditor(editor);
        toastSafe('闭环内容已保存，正在重新审查');
        await refreshClosureAuditView();
      } catch (e) {
        save.disabled = false;
        toastSafe('闭环保存失败：' + (e.message || 'save_failed'));
      }
    });
    foot.appendChild(cancel);
    foot.appendChild(save);
    card.appendChild(foot);
    editor.appendChild(card);
    editor.addEventListener('click', (event) => { if (event.target === editor) closeClosureEditor(editor); });
    document.body.appendChild(editor);
    const first = card.querySelector('[data-field]');
    if (first) first.focus();
  }

  function renderMessageItem(message, index) {
    const row = document.createElement('div');
    row.className = 'hermes-msg ' + (message.role === 'user' ? 'user' : 'assistant');

    const bubble = document.createElement('div');
    bubble.className = 'hermes-msg-bubble';
    if (message.loading) {
      bubble.innerHTML = '<div class="ai-loading"><span class="spin"></span> 正在基于后台数据分析...</div>';
    } else if (message.role === 'assistant') {
      bubble.innerHTML = '<div class="ai-render">' + renderMarkdown(message.content) + '</div>';
    } else {
      bubble.textContent = message.content;
    }
    if (message.basis) {
      const details = document.createElement('details');
      details.className = 'hermes-basis';
      const summary = document.createElement('summary');
      summary.innerHTML = '<i class="ti ti-route"></i> 判断依据';
      const body = document.createElement('div');
      body.className = 'hermes-basis-body ai-render';
      body.innerHTML = renderMarkdown(message.basis);
      details.appendChild(summary);
      details.appendChild(body);
      bubble.appendChild(details);
    }
    if (message.attachments && message.attachments.length) {
      const files = document.createElement('div');
      files.className = 'hermes-msg-files';
      renderAttachmentChips(files, message.attachments, { removable: false });
      bubble.appendChild(files);
    }
    appendHermesEvidenceAudit(bubble, message.hermes);
    appendHermesClosureAudit(bubble, message.hermes);
    if (message.hermes) {
      const meta = document.createElement('div');
      meta.className = 'hermes-msg-meta';
      const missing = (message.hermes.missingData || []).filter(Boolean);
      const refresh = message.hermes.dataRefresh;
      const refreshText = refresh && Array.isArray(refresh.providers)
        ? refresh.providers.map((item) => {
          const label = item.provider === 'ads' ? 'Ads' : 'GSC';
          if (item.status !== 'synced') return `${label}同步失败${item.error ? '：' + item.error : ''}`;
          return item.rowsWritten > 0 ? `${label}写入${item.rowsWritten}行` : `${label}同步完成但无新数据`;
        }).join('、')
        : '';
      meta.textContent = [
        '小瑞已参考',
        message.hermes.skill && message.hermes.skill.label ? '技能：' + message.hermes.skill.label : '',
        message.hermes.workflow && message.hermes.workflow.label ? '工作流：' + message.hermes.workflow.label : '',
        message.hermes.usedMemory ? '已使用长期记忆' : '',
        message.hermes.usedPageContext ? '已使用当前页' : '',
        refreshText ? '数据抓取：' + refreshText : '',
        missing.length ? '缺失：' + missing.slice(0, 3).join('、') : '',
      ].filter(Boolean).join(' · ');
      bubble.appendChild(meta);
    }
    row.appendChild(bubble);

    if (!message.loading) {
      const tools = document.createElement('div');
      tools.className = 'hermes-msg-tools';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'hermes-copy';
      copy.dataset.index = String(index);
      copy.innerHTML = '<i class="ti ti-copy"></i> 复制';
      tools.appendChild(copy);
      if (message.role === 'assistant') {
        [
          ['adopted', '有用'],
          ['generic', '太泛'],
          ['wrong', '不准'],
        ].forEach(([result, label]) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'hermes-feedback';
          btn.dataset.index = String(index);
          btn.dataset.result = result;
          btn.textContent = label;
          tools.appendChild(btn);
        });
      }
      row.appendChild(tools);
    }
    return row;
  }

  function renderMessages() {
    const log = byId('hermesChatLog');
    const welcome = byId('hermesWelcome');
    if (!log) return;
    closureEditorItems = new Map();
    log.innerHTML = '';
    messages.forEach((message, index) => log.appendChild(renderMessageItem(message, index)));
    if (welcome) welcome.classList.toggle('compact', messages.length > 0);
    const last = byId('hermesLast');
    if (last && messages.length) last.hidden = true;
    setConversationControls();
    if (messages.some((message) => message.hermes && Array.isArray(message.hermes.dataGapTasks) && message.hermes.dataGapTasks.length)) {
      refreshDataGapTaskKeys();
    }
    setTimeout(() => { log.scrollTop = log.scrollHeight; }, 20);
  }

  function setSending(isSending) {
    const btn = byId('hermesSendBtn');
    const briefBtn = byId('hermesBriefBtn');
    const input = byId('hermesInput');
    if (btn) btn.disabled = !!isSending;
    if (briefBtn) briefBtn.disabled = !!isSending;
    if (input) input.disabled = !!isSending;
  }

  async function sendHermesPrompt(rawPrompt) {
    if (!window.API) return;
    const input = byId('hermesInput');
    const prompt = String(rawPrompt || (input && input.value) || '').trim();
    if (!prompt) {
      toastSafe('请输入要问 Hermes 的内容');
      return;
    }
    if (input) input.value = '';
    const attachedFiles = attachments.slice();
    const requestAttachments = attachmentRequestPayload(attachedFiles);
    const gatewayMode = selectedGatewayMode();
    const historyPayload = messageHistoryPayload();
    attachments = [];
    renderAttachments();

    messages.push({ role: 'user', content: prompt, attachments: attachedFiles });
    messages.push({ role: 'assistant', content: '', loading: true });
    renderMessages();
    setSending(true);

    try {
      await syncHermesSession(true);
      const res = await window.API.post('/api/hermes/chat', {
        message: prompt,
        history: historyPayload,
        attachments: requestAttachments,
        skill: gatewayMode.skill,
        workflow: gatewayMode.workflow,
        conversationId: activeConversationId,
      });
      if (res.conversation && res.conversation.id) activeConversationId = res.conversation.id;
      const parsed = splitHermesResponse(res.text || '');
      messages[messages.length - 1] = { role: 'assistant', content: parsed.answer || '没有返回内容。', basis: parsed.basis, hermes: res.hermes };
      if (res.memory) {
        if (typeof window.loadHermesMemories === 'function') await window.loadHermesMemories(false);
        toastSafe('已记住：' + (res.memory.title || '长期偏好'));
      }
    } catch (e) {
      const reason = e && e.message ? e.message : 'ai_failed';
      messages[messages.length - 1] = {
        role: 'assistant',
        content: '小瑞暂时不可用。\n\n原因：' + reason + '\n\n请确认后端 AI 配置、Hermes 记忆上下文或模型视觉能力是否正常。',
      };
    } finally {
      setSending(false);
      renderMessages();
    }
  }

  function askHermesStarter(prompt) {
    sendHermesPrompt(prompt);
  }

  function clearHermesChat() {
    activeConversationId = null;
    messages = [];
    historyVisible = false;
    deepThinking = false;
    renderDeepThinkingButton();
    const panel = byId('hermesHistory');
    if (panel) panel.hidden = true;
    setHermesHistoryMode(false);
    renderMessages();
    loadHermesLatest(false);
  }

  async function copyHermesMessage(index) {
    const item = messages[Number(index)];
    if (!item || !item.content) return;
    await copyText(item.content, '已复制');
  }

  function openHermesPanel() {
    const panel = byId('hermesPanel');
    setupDrag();
    restoreWindowState();
    syncHermesSession(true);
    if (panel) panel.classList.add('show');
    if (!statusChecked) refreshHermesStatus(false);
    if (!messages.length) loadHermesLatest(false);
    refreshDataGapTaskKeys();
  }

  function closeHermesPanel() {
    const panel = byId('hermesPanel');
    const backdrop = byId('hermesBackdrop');
    if (panel) panel.classList.remove('show');
    if (backdrop) backdrop.classList.remove('show');
    saveWindowState();
  }

  function openHermesAgent() {
    const btn = byId('hermesOpenBtn');
    const url = btn && btn.dataset && btn.dataset.url;
    if (!url) {
      toastSafe('官方 Hermes 未连接');
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  async function createHermesDailyLearning() {
    if (!window.API || !window.ME) return;
    const btn = byId('hermesLearnBtn');
    const oldText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '沉淀中...';
    }
    try {
      await syncHermesSession(true);
      await window.API.post('/api/hermes/memories/daily-learning', {});
      if (typeof window.loadHermesMemories === 'function') await window.loadHermesMemories(false);
      toastSafe('Hermes 已沉淀今日运营记忆');
    } catch (e) {
      toastSafe('Hermes 记忆沉淀失败：' + (e.message || 'learning_failed'));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText || '沉淀今日记忆';
      }
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeHermesPanel();
    if (e.key === 'Enter' && document.activeElement === byId('hermesInput') && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendHermesPrompt();
    }
  });

  document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest && e.target.closest('.hermes-copy');
    if (copyBtn) {
      copyHermesMessage(copyBtn.dataset.index);
      return;
    }
    const evidenceCopyBtn = e.target.closest && e.target.closest('.hermes-evidence-copy');
    if (evidenceCopyBtn) {
      copyText(evidenceCopyBtn.dataset.evidence, '已复制证据');
      return;
    }
    const evidenceSourceBtn = e.target.closest && e.target.closest('.hermes-evidence-source');
    if (evidenceSourceBtn) {
      openEvidenceSource(evidenceSourceBtn.dataset.source);
      return;
    }
    const gapAddBtn = e.target.closest && e.target.closest('.hermes-gap-add');
    if (gapAddBtn) {
      createDataGapTask(gapAddBtn.dataset.task, gapAddBtn);
      return;
    }
    const gapRefreshBtn = e.target.closest && e.target.closest('.hermes-gap-refresh-btn');
    if (gapRefreshBtn) {
      sendHermesPrompt('我已经补齐了部分缺失数据。请基于最新 ferr-ops 后台数据重新生成一次运营诊断，必须引用新的证据编号，并明确哪些缺口仍未补齐。');
      return;
    }
    const closureActionBtn = e.target.closest && e.target.closest('.hermes-closure-action');
    if (closureActionBtn) {
      const item = closureEditorItems.get(closureActionBtn.dataset.key);
      if (item) openClosureEditor(item.type, item);
      return;
    }
    const feedbackBtn = e.target.closest && e.target.closest('.hermes-feedback');
    if (feedbackBtn) {
      sendHermesFeedback(feedbackBtn.dataset.index, feedbackBtn.dataset.result);
      return;
    }
    if (e.target.closest && e.target.closest('.hermes-menu button')) {
      setTimeout(closeHermesMenus, 0);
    }
    const removeBtn = e.target.closest && e.target.closest('.hermes-file-remove');
    if (removeBtn) {
      removeHermesAttachment(removeBtn.dataset.index);
      return;
    }
    const lastBtn = e.target.closest && e.target.closest('.hermes-last-open');
    if (lastBtn) {
      loadHermesConversation(lastBtn.dataset.id);
      return;
    }
    const historySwitch = e.target.closest && e.target.closest('.hermes-history-switch');
    if (historySwitch) {
      loadHermesHistory(historySwitch.dataset.archived === '1');
      return;
    }
    const historyRow = e.target.closest && e.target.closest('.hermes-history-row');
    if (historyRow) {
      loadHermesConversation(historyRow.dataset.id);
      return;
    }
    if (e.target.closest('.nav-item,.subtab,.planning-tab,.action-tab,.btn-primary,.btn-ghost,.btn-ai')) {
      scheduleSessionSync(500);
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.closest('.panel.active')) scheduleSessionSync(900);
  });

  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'hermesFiles') {
      addHermesFiles(e.target.files);
      e.target.value = '';
    }
  });

  document.addEventListener('paste', (e) => {
    if (document.activeElement !== byId('hermesInput')) return;
    const files = [...(e.clipboardData && e.clipboardData.files || [])].filter((file) => (file.type || '').startsWith('image/'));
    if (files.length) addHermesFiles(files);
  });

  window.addEventListener('message', (event) => {
    const data = event && event.data;
    if (!data || data.type !== 'ferr:read-page-context') return;
    syncHermesPageDetail(false).then((ok) => {
      event.source && event.source.postMessage({ type: 'ferr:page-context-ready', ok }, '*');
    });
  });

  window.openHermesPanel = openHermesPanel;
  window.closeHermesPanel = closeHermesPanel;
  window.refreshHermesStatus = refreshHermesStatus;
  window.openHermesAgent = openHermesAgent;
  window.createHermesDailyLearning = createHermesDailyLearning;
  window.resetHermesWindow = resetHermesWindow;
  window.toggleHermesMaximize = toggleHermesMaximize;
  window.toggleHermesDeepThinking = toggleHermesDeepThinking;
  window.syncHermesSession = syncHermesSession;
  window.syncHermesPageDetail = syncHermesPageDetail;
  window.sendHermesPrompt = sendHermesPrompt;
  window.askHermesStarter = askHermesStarter;
  window.clearHermesChat = clearHermesChat;
  window.addHermesFiles = addHermesFiles;
  window.loadHermesMorningBrief = loadHermesMorningBrief;
  window.loadHermesLatest = loadHermesLatest;
  window.toggleHermesHistory = toggleHermesHistory;
  window.archiveHermesConversation = archiveHermesConversation;
  window.learnHermesConversation = learnHermesConversation;
  window.sendHermesFeedback = sendHermesFeedback;

  document.addEventListener('DOMContentLoaded', () => {
    setHermesView(lastHermesState || {});
    setConversationControls();
    renderDeepThinkingButton();
  });
})();
