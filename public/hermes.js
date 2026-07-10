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

  function byId(id) { return document.getElementById(id); }
  function currentUser() { return window.ME || {}; }
  function roleLabel(role) { return ROLE_LABEL[role] || role || '未识别'; }
  function escapeText(s) { return window.esc ? window.esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function renderMarkdown(s) { return window.mdToHtml ? window.mdToHtml(s) : '<p>' + escapeText(s).replace(/\n/g, '<br>') + '</p>'; }
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
    const sub = byId('hermesSub');
    const detail = byId('hermesDetail');
    const openBtn = byId('hermesOpenBtn');
    const identity = byId('hermesIdentity');
    const connected = !!lastHermesState.connected;
    const configured = !!lastHermesState.configured;
    const launchUrl = connected && lastHermesState.url ? appendLaunchParams(lastHermesState.url) : '';

    if (statusBox) {
      statusBox.classList.toggle('ok', connected);
      statusBox.classList.toggle('bad', configured && !connected);
    }
    if (sub) sub.textContent = '运营助手入口 · 官方 Hermes 保留为高级模式';
    if (statusText) {
      if (connected) statusText.textContent = '当前状态：官方 Hermes 可访问；本面板使用 ferr-ops 自有助手入口';
      else if (configured) statusText.textContent = '当前状态：官方 Hermes 已配置但连接失败；本面板仍可使用后台 AI';
      else statusText.textContent = '当前状态：未配置官方 Hermes；本面板仍可使用后台 AI';
    }
    if (identity) identity.textContent = '身份：' + roleLabel(currentUser().role);
    if (detail) {
      const parts = [];
      if (lastHermesState.error) parts.push('官方 Hermes：' + lastHermesState.error);
      if (lastHermesState.checkedAt) parts.push('检查时间：' + new Date(lastHermesState.checkedAt).toLocaleString());
      detail.textContent = parts.length
        ? parts.join(' · ')
        : '当前入口使用 ferr-ops 后台真实上下文；GSC/GA4/Google Ads 自动同步未接入时不会被当作事实。';
    }
    if (openBtn) {
      openBtn.disabled = !launchUrl;
      openBtn.dataset.url = launchUrl;
    }
  }

  async function refreshHermesStatus(manual) {
    const statusText = byId('hermesStatusText');
    if (statusText) statusText.textContent = '当前状态：正在检查官方 Hermes 连接…';
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

  function messageHistoryBlock() {
    return messages
      .filter((m) => m.content && !m.loading)
      .slice(-MAX_HISTORY)
      .map((m) => (m.role === 'assistant' ? 'AI' : '用户') + '：' + m.content)
      .join('\n');
  }

  function buildOpsPrompt(userPrompt, attachedFiles) {
    const page = collectPageContext();
    const history = messageHistoryBlock();
    return [
      '你是 ferr-ops 内置运营助手，不是通用聊天机器人。',
      '必须基于后台真实数据、当前页面上下文和用户问题回答；缺少数据时直接说明缺少什么，不要编造 GSC、GA4、Google Ads 自动同步数据。',
      '如果用户上传了附件，必须区分“后台真实数据”“当前页面数据”“用户上传附件”。不要把附件内容误写成已同步数据。',
      '输出尽量短，结构固定为：证据摘要、判断、建议动作、验证指标、风险。',
      '',
      history ? '[最近对话]\n' + history : '',
      '[当前页面上下文]\n' + JSON.stringify(page, null, 2).slice(0, 8000),
      attachmentPromptBlock(attachedFiles || []),
      '',
      '[用户问题]\n' + String(userPrompt || '').slice(0, 4000),
    ].filter(Boolean).join('\n\n');
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
    if (message.attachments && message.attachments.length) {
      const files = document.createElement('div');
      files.className = 'hermes-msg-files';
      renderAttachmentChips(files, message.attachments, { removable: false });
      bubble.appendChild(files);
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
      row.appendChild(tools);
    }
    return row;
  }

  function renderMessages() {
    const log = byId('hermesChatLog');
    const welcome = byId('hermesWelcome');
    if (!log) return;
    log.innerHTML = '';
    messages.forEach((message, index) => log.appendChild(renderMessageItem(message, index)));
    if (welcome) welcome.classList.toggle('compact', messages.length > 0);
    setTimeout(() => { log.scrollTop = log.scrollHeight; }, 20);
  }

  function setSending(isSending) {
    const btn = byId('hermesSendBtn');
    const input = byId('hermesInput');
    if (btn) btn.disabled = !!isSending;
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
    const opsPrompt = buildOpsPrompt(prompt, attachedFiles);
    const requestAttachments = attachmentRequestPayload(attachedFiles);
    attachments = [];
    renderAttachments();

    messages.push({ role: 'user', content: prompt, attachments: attachedFiles });
    messages.push({ role: 'assistant', content: '', loading: true });
    renderMessages();
    setSending(true);

    try {
      await syncHermesSession(true);
      const { text } = await window.API.post('/api/ai', { prompt: opsPrompt, attachments: requestAttachments });
      messages[messages.length - 1] = { role: 'assistant', content: text || '没有返回内容。' };
    } catch (e) {
      const reason = e && e.message ? e.message : 'ai_failed';
      messages[messages.length - 1] = {
        role: 'assistant',
        content: 'AI 暂时不可用。\n\n原因：' + reason + '\n\n请确认后端 AI 配置是否完整，或稍后重试。',
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
    messages = [];
    renderMessages();
  }

  async function copyHermesMessage(index) {
    const item = messages[Number(index)];
    if (!item || !item.content) return;
    try {
      await navigator.clipboard.writeText(item.content);
      toastSafe('已复制');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = item.content;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toastSafe('已复制'); } catch { toastSafe('复制失败，请手动选择文本'); }
      ta.remove();
    }
  }

  function openHermesPanel() {
    const panel = byId('hermesPanel');
    setupDrag();
    restoreWindowState();
    syncHermesSession(true);
    if (panel) panel.classList.add('show');
    if (!statusChecked) refreshHermesStatus(false);
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
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && document.activeElement === byId('hermesInput')) {
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
    const removeBtn = e.target.closest && e.target.closest('.hermes-file-remove');
    if (removeBtn) {
      removeHermesAttachment(removeBtn.dataset.index);
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
  window.syncHermesSession = syncHermesSession;
  window.syncHermesPageDetail = syncHermesPageDetail;
  window.sendHermesPrompt = sendHermesPrompt;
  window.askHermesStarter = askHermesStarter;
  window.clearHermesChat = clearHermesChat;
  window.addHermesFiles = addHermesFiles;

  document.addEventListener('DOMContentLoaded', () => setHermesView(lastHermesState || {}));
})();
