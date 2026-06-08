// 鉴权路由：登录 / 登出 / 当前用户 / 改密码。
import bcrypt from 'bcryptjs';
import { db } from '../db/connection.js';
import { config } from '../config.js';
import { requireAuth, cookieOpts } from './middleware.js';

export async function registerAuth(app) {
  // 登录
  app.post('/api/login', async (request, reply) => {
    const { username, password } = request.body || {};
    if (!username || !password) {
      return reply.code(400).send({ error: 'missing_credentials' });
    }
    const user = db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(String(username));
    if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    const token = await reply.jwtSign(
      { id: user.id, username: user.username, name: user.name, role: user.role },
      { expiresIn: `${config.sessionHours}h` }
    );
    reply.setCookie('ferr_token', token, cookieOpts);
    return { user: { username: user.username, name: user.name, role: user.role } };
  });

  // 登出
  app.post('/api/logout', async (_request, reply) => {
    reply.clearCookie('ferr_token', { path: '/' });
    return { ok: true };
  });

  // 当前用户
  app.get('/api/me', { preHandler: requireAuth }, async (request) => {
    const { username, name, role } = request.user;
    return { user: { username, name, role } };
  });

  // 改自己的密码
  app.post('/api/change-password', { preHandler: requireAuth }, async (request, reply) => {
    const { oldPassword, newPassword } = request.body || {};
    if (!oldPassword || !newPassword || String(newPassword).length < 6) {
      return reply.code(400).send({ error: 'invalid_input' });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(request.user.id);
    if (!user || !bcrypt.compareSync(String(oldPassword), user.password_hash)) {
      return reply.code(401).send({ error: 'wrong_old_password' });
    }
    const hash = bcrypt.hashSync(String(newPassword), 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
    return { ok: true };
  });
}
