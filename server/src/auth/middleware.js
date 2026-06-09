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

// V7 权限矩阵（角色：seo 李 / sem 陈 / manager / boss；已移除 sales）
//  - 业务编辑（询盘/周报/否词/创意/排名/关键词/整改/闭环/市场/资产…）：四个角色都可
//  - KPI 目标修改：仅 manager / boss
export const editor = { preHandler: roles('seo', 'sem', 'manager', 'boss') }; // 任意登录角色可编辑业务数据
export const onlyManagerBoss = { preHandler: roles('manager', 'boss') };      // KPI 目标 / 系统设置

// 兼容旧引用（统一指向 editor / onlyManagerBoss），避免散落改动遗漏
export const onlySeo = editor;
export const onlySem = editor;
export const seoOrSem = editor;
export const onlyBoss = onlyManagerBoss;

export const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure, // 纯 IP/HTTP 部署设 COOKIE_SECURE=false
  path: '/',
  maxAge: config.sessionHours * 3600,
};
