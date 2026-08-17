const form = document.getElementById('loginForm');
const err = document.getElementById('err');
const btn = document.getElementById('btn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = '登录中…';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value,
      }),
    });
    if (res.ok) {
      location.href = '/';
      return;
    }
    err.textContent = res.status === 401 ? '账号或密码错误' : '登录失败，请重试';
  } catch {
    err.textContent = '网络错误，无法连接服务器';
  }
  btn.disabled = false;
  btn.textContent = '登录';
});
