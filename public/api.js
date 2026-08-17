/* 统一 REST 调用封装（替代原型里的 window.storage/localStorage）。
   - 自动带 cookie 会话；遇 401 跳登录页。
   - window.ME 保存当前用户；window.can(...) 做前端权限提示（后端才是权威）。*/
(function () {
  const DEFAULT_TIMEOUT_MS = 120000;

  async function _fetch(method, path, body, options) {
    const requestOptions = options || {};
    const timeoutMs = requestOptions.timeoutMs == null ? DEFAULT_TIMEOUT_MS : Number(requestOptions.timeoutMs);
    const controller = new AbortController();
    const upstreamSignal = requestOptions.signal;
    const abortFromUpstream = () => controller.abort(upstreamSignal && upstreamSignal.reason);
    if (upstreamSignal && upstreamSignal.aborted) abortFromUpstream();
    else if (upstreamSignal) upstreamSignal.addEventListener('abort', abortFromUpstream, { once: true });
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const opt = { method, headers: {}, credentials: 'same-origin' };
    opt.signal = controller.signal;
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    try {
      const res = await fetch(path, opt);
      if (res.status === 401) {
        if (!location.pathname.endsWith('login.html')) location.href = '/login.html';
        throw new Error('unauthorized');
      }
      if (!res.ok) {
        let e = null;
        try { e = await res.json(); } catch {}
        // 优先用 detail 当错误文案；原始响应仍挂在 err.body 上供调用方判断错误码。
        const err = new Error((e && (e.detail || e.error)) || 'HTTP ' + res.status);
        err.status = res.status; err.body = e;
        throw err;
      }
      const ct = res.headers.get('content-type') || '';
      return ct.includes('application/json') ? res.json() : res.text();
    } catch (error) {
      if (controller.signal.aborted && (!error || error.message !== 'unauthorized')) {
        const timeoutError = new Error('请求超时，请检查网络或稍后重试');
        timeoutError.code = 'REQUEST_TIMEOUT';
        timeoutError.status = 408;
        throw timeoutError;
      }
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      if (upstreamSignal) upstreamSignal.removeEventListener('abort', abortFromUpstream);
    }
  }

  const API = {
    get: (p, o) => _fetch('GET', p, undefined, o),
    post: (p, b, o) => _fetch('POST', p, b, o),
    put: (p, b, o) => _fetch('PUT', p, b, o),
    patch: (p, b, o) => _fetch('PATCH', p, b, o),
    del: (p, o) => _fetch('DELETE', p, undefined, o),
    async me() { return (await _fetch('GET', '/api/me')).user; },
    async logout() { try { await _fetch('POST', '/api/logout'); } catch {} location.href = '/login.html'; },
  };
  window.API = API;

  window.ME = null;
  // 必须登录才能进；返回用户对象或跳登录页
  window.ensureAuth = async function () {
    try {
      window.ME = await API.me();
      return window.ME;
    } catch {
      location.href = '/login.html';
      throw new Error('redirecting to login');
    }
  };

  /* 前端能力判断（仅用于隐藏/禁用控件，越权请求由后端拒绝）
     cap: 'seo' | 'sem' | 'inquiry' | 'kpiTarget' */
  // V7 权限：seo/sem/manager/boss 都能编辑业务数据；KPI 目标仅 manager/boss。
  window.can = function (cap) {
    const r = window.ME && window.ME.role;
    if (!r) return false;
    if (cap === 'kpiTarget') return r === 'manager' || r === 'boss';
    return ['seo', 'sem', 'manager', 'boss'].includes(r);
  };
})();
