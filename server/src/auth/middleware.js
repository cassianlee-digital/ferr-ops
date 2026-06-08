// 鉴权 / 角色校验中间件。权限在后端强制，前端隐藏只是体验。
import { config } from '../config.js';

// 校验登录态：从 httpOnly cookie 里的 JWT 解析用户，挂到 request.user。
export async function requireAuth(request, reply) {
  try {
    await request.jwtVerify(); // 自动读取 ferr_token cookie
  } catch {
    return reply.code(401).send({ error: 'unauthorized' });
  }
}

// 限定可访问角色。用法：{ preHandler: roles('seo','sem') }
export function roles(...allowed) {
  return async function (request, reply) {
    await requireAuth(request, reply);
    if (reply.sent) return;
    const role = request.user?.role;
    if (!allowed.includes(role)) {
      return reply.code(403).send({ error: 'forbidden', need: allowed });
    }
  };
}

// 登录态可读（任何已登录角色都能读）
export const readAuth = { preHandler: requireAuth };

// 写权限矩阵的便捷封装
export const onlySeo = { preHandler: roles('seo') };           // 李
export const onlySem = { preHandler: roles('sem') };           // 陈
export const seoOrSem = { preHandler: roles('seo', 'sem') };   // 李或陈
export const onlySales = { preHandler: roles('sales') };       // 销售
export const onlyBoss = { preHandler: roles('boss') };         // 老板（KPI 目标）

export const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure, // 纯 IP/HTTP 部署设 COOKIE_SECURE=false
  path: '/',
  maxAge: config.sessionHours * 3600,
};
