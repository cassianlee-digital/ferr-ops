/* Hermes / Ferr Ops assistant entry.
   The daily operator UI stays native to ferr-ops; the official Hermes console
   is kept as an advanced-mode escape hatch. */
(function () {
  const STORE_KEY = 'ferr:hermes-window';
  const ROLE_LABEL = { seo: 'SEO 李', sem: 'SEM 陈', manager: '主管', boss: '老板' };
  const MAX_HISTORY = 8;

  let lastSessionSentAt = 0;
  let sessionTimer = null;
  let statusChecked = false;
  let lastHermesState = null;
  let messages = [];

  function byId(id) { return document.getElementById(id); }
  function currentUser() { return window.ME || {}; }
  function roleLabel(role) { return ROLE_LABEL[role] || role || '未识别'; }
  function escapeText(s) { return window.esc ? window.esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function renderMarkdown(s) { return window.mdToHtml ? window.mdToHtml(s) : '<p>' + escapeText(s).replace(/\n/g, '<br>') + '</p>'; }
  function toastSafe(text) { if (window.toast) window.toast(text); }

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

  function buildOpsPrompt(userPrompt) {
    const page = collectPageContext();
    const history = messageHistoryBlock();
    return [
      '你是 ferr-ops 内置运营助手，不是通用聊天机器人。',
      '必须基于后台真实数据、当前页面上下文和用户问题回答；缺少数据时直接说明缺少什么，不要编造 GSC、GA4、Google Ads 自动同步数据。',
      '输出尽量短，结构固定为：证据摘要、判断、建议动作、验证指标、风险。',
      '',
      history ? '[最近对话]\n' + history : '',
      '[当前页面上下文]\n' + JSON.stringify(page, null, 2).slice(0, 8000),
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
    const opsPrompt = buildOpsPrompt(prompt);

    messages.push({ role: 'user', content: prompt });
    messages.push({ role: 'assistant', content: '', loading: true });
    renderMessages();
    setSending(true);

    try {
      await syncHermesSession(true);
      const { text } = await window.API.post('/api/ai', { prompt: opsPrompt });
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
    if (e.target.closest('.nav-item,.subtab,.planning-tab,.action-tab,.btn-primary,.btn-ghost,.btn-ai')) {
      scheduleSessionSync(500);
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.closest('.panel.active')) scheduleSessionSync(900);
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

  document.addEventListener('DOMContentLoaded', () => setHermesView(lastHermesState || {}));
})();
