/* Hermes Agent adapter.
   Kept separate from the core dashboard so agent integration can fail safely. */
(function () {
  const STORE_KEY = 'ferr:hermes-window';
  const ROLE_LABEL = { seo: 'SEO 李', sem: 'SEM 陈', manager: '主管', boss: '老板' };
  let lastSessionSentAt = 0;
  let sessionTimer = null;
  let prewarmStarted = false;
  let prewarmAttempts = 0;

  function byId(id) { return document.getElementById(id); }
  function currentUser() { return window.ME || {}; }
  function roleLabel(role) { return ROLE_LABEL[role] || role || '未识别'; }

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
  function txt(el, max) { return (el ? (el.innerText || el.textContent || '') : '').replace(/\s+/g, ' ').trim().slice(0, max || 4000); }
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
    const tables = activePanels.flatMap((panel) => [...panel.querySelectorAll('table')].filter(isVisible).slice(0, 3).map(collectTable)).slice(0, 6);
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
    const activeNav = document.querySelector('.nav-item.active');
    const activePanels = [...document.querySelectorAll('.panel.active')].filter(isVisible).slice(0, 4);
    const activeSubtabs = [...document.querySelectorAll('.subtab.active,.planning-tab.active,.action-tab.active')].filter(isVisible);
    return {
      url: location.pathname + location.search + location.hash,
      tab: window._curTab || '',
      nav: txt(activeNav, 120),
      subtabs: activeSubtabs.map((x) => txt(x, 120)).filter(Boolean),
      panels: activePanels.map((panel) => ({
        id: panel.id || '',
        title: txt(panel.querySelector('.page-title,.card-title,h1,h2'), 160),
        subtitle: txt(panel.querySelector('.page-sub,.card-sub'), 300),
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
    if (!window.API || !window.ME) return;
    try {
      await window.API.post('/api/hermes/page-context', collectPageContext());
      await syncHermesSession(true);
      if (manual && window.toast) window.toast('Hermes 已读取当前页面内容');
      return true;
    } catch (e) {
      if (manual && window.toast) window.toast('Hermes 读取当前页失败：' + (e.message || 'sync_failed'));
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
        const left = clamp(start.left + ev.clientX - startX, 12, window.innerWidth - width - 12);
        const top = clamp(start.top + ev.clientY - startY, 12, window.innerHeight - height - 12);
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
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
    const statusBox = byId('hermesStatusBox');
    const statusText = byId('hermesStatusText');
    const sub = byId('hermesSub');
    const endpoint = byId('hermesEndpoint');
    const detail = byId('hermesDetail');
    const openBtn = byId('hermesOpenBtn');
    const frame = byId('hermesFrame');
    const frameWrap = byId('hermesFrameWrap');
    const identity = byId('hermesIdentity');
    const connected = !!(state && state.connected);
    const configured = !!(state && state.configured);
    const me = currentUser();
    const launchUrl = connected && state.url ? appendLaunchParams(state.url) : '';

    if (statusBox) {
      statusBox.classList.toggle('ok', connected);
      statusBox.classList.toggle('bad', configured && !connected);
    }
    if (sub) sub.textContent = connected ? '运营管家入口 · 已连接独立服务' : (configured ? '运营管家入口 · 服务暂不可达' : '运营管家入口 · 尚未配置');
    if (statusText) {
      if (connected) statusText.textContent = '当前状态：Hermes 智能体服务器可访问';
      else if (configured) statusText.textContent = '当前状态：已配置，但连接失败';
      else statusText.textContent = '当前状态：尚未配置智能体服务器';
    }
    if (endpoint) endpoint.textContent = state && state.url ? state.url : '需要在服务器 .env 配置 HERMES_AGENT_URL。';
    if (identity) identity.textContent = '身份：' + roleLabel(me.role);
    if (detail) {
      const parts = [];
      if (state && state.statusCode) parts.push('HTTP ' + state.statusCode + ' ' + (state.statusText || ''));
      if (state && state.error) parts.push('原因：' + state.error);
      if (state && state.detail) parts.push(state.detail);
      if (state && state.checkedAt) parts.push('检查时间：' + new Date(state.checkedAt).toLocaleString());
      detail.textContent = parts.length ? parts.join(' · ') : '当前阶段只检查 Hermes 服务是否可达，并提供独立打开入口；不会把后台密钥、Google 授权或数据库凭据交给前端。';
    }
    if (openBtn) {
      openBtn.disabled = !connected || !(state && state.url);
      openBtn.dataset.url = launchUrl;
    }
    if (frameWrap) frameWrap.classList.toggle('connected', connected);
    if (frame) {
      if (launchUrl && frame.dataset.src !== launchUrl) {
        frame.dataset.src = launchUrl;
        frame.src = launchUrl;
      } else if (!launchUrl) {
        frame.removeAttribute('src');
        frame.dataset.src = '';
      }
    }
  }

  async function refreshHermesStatus(manual) {
    const statusText = byId('hermesStatusText');
    if (statusText) statusText.textContent = '当前状态：正在检查 Hermes 智能体服务器…';
    try {
      const state = await window.API.get('/api/hermes/status');
      setHermesView(state);
      if (manual && window.toast) window.toast(state.connected ? 'Hermes 已连接' : 'Hermes 未连接：' + (state.error || 'unknown'));
    } catch (e) {
      setHermesView({ configured: false, connected: false, error: e.message || 'status_failed' });
      if (manual && window.toast) window.toast('Hermes 状态检查失败：' + (e.message || 'status_failed'));
    }
  }

  function openHermesPanel() {
    const panel = byId('hermesPanel');
    setupDrag();
    restoreWindowState();
    syncHermesSession(true);
    if (panel) panel.classList.add('show');
    refreshHermesStatus(false);
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
      if (window.toast) window.toast('Hermes 智能体服务器未连接');
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  function prewarmHermesFrame() {
    if (prewarmStarted) return;
    prewarmStarted = true;
    const run = () => {
      prewarmAttempts += 1;
      if (window.API) {
        refreshHermesStatus(false);
        return;
      }
      if (prewarmAttempts < 8) setTimeout(run, 1200);
    };
    setTimeout(run, 1200);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeHermesPanel();
  });
  document.addEventListener('click', (e) => {
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
      const frame = byId('hermesFrame');
      if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'ferr:page-context-ready', ok }, '*');
    });
  });

  window.openHermesPanel = openHermesPanel;
  window.closeHermesPanel = closeHermesPanel;
  window.refreshHermesStatus = refreshHermesStatus;
  window.openHermesAgent = openHermesAgent;
  window.resetHermesWindow = resetHermesWindow;
  window.toggleHermesMaximize = toggleHermesMaximize;
  window.syncHermesSession = syncHermesSession;
  window.syncHermesPageDetail = syncHermesPageDetail;

  if (document.readyState === 'complete') prewarmHermesFrame();
  else window.addEventListener('load', prewarmHermesFrame, { once: true });
})();
