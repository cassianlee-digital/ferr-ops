/* 统一 REST 调用封装（替代原型里的 window.storage/localStorage）。
   - 自动带 cookie 会话；遇 401 跳登录页。
   - window.ME 保存当前用户；window.can(...) 做前端权限提示（后端才是权威）。*/
(function () {
  async function _fetch(method, path, body) {
    const opt = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    const res = await fetch(path, opt);
    if (res.status === 401) {
      if (!location.pathname.endsWith('login.html')) location.href = '/login.html';
      throw new Error('unauthorized');
    }
    if (!res.ok) {
      let e = null;
      try { e = await res.json(); } catch {}
      // 优先用 detail 当错误文案：后端 400（含 updateById 类型闸门，如「字段 due_date 需要字符串，
      // 收到 number(99999999)」）、AI 502、Google 授权被拒都会带 detail，它比 error 码
      // （bad_request / ai_failed）对用户有用得多。缺 detail 才退回 error 码，再退回 HTTP 状态。
      // 原始响应仍挂在 err.body 上，需要判错误码的调用方读 err.body.error / err.status。
      const err = new Error((e && (e.detail || e.error)) || 'HTTP ' + res.status);
      err.status = res.status; err.body = e;
      throw err;
    }
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : res.text();
  }

  const API = {
    get: (p) => _fetch('GET', p),
    post: (p, b) => _fetch('POST', p, b),
    put: (p, b) => _fetch('PUT', p, b),
    patch: (p, b) => _fetch('PATCH', p, b),
    del: (p) => _fetch('DELETE', p),
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
