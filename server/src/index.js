// Fastify 启动入口：建库 + seed → 注册插件/路由 → 托管前端静态资源 → 监听。
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { config } from './config.js';
import { seed } from './db/seed.js';
import { registerAuth } from './auth/routes.js';
import { registerRoutes } from './routes/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../../public');

async function main() {
  // 启动即确保表结构与初始账号就绪（幂等）
  seed();

  const app = Fastify({
    logger: { level: config.env === 'production' ? 'info' : 'debug' },
    bodyLimit: 1_000_000,
  });

  // cookie + jwt（会话令牌存 httpOnly cookie，浏览器 JS 读不到）
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: 'ferr_token', signed: false },
  });

  // 健康检查
  app.get('/api/health', async () => ({ ok: true, ts: Date.now() }));

  // 鉴权路由 + 业务路由（业务路由内部各自做角色校验）
  await registerAuth(app);
  await registerRoutes(app);

  // 静态托管前端（dashboard）。API 之外的路径回退到 index.html。
  await app.register(fastifyStatic, { root: publicDir, prefix: '/' });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url && req.raw.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.sendFile('index.html');
  });

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`FERR 运营后台已启动 :${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
