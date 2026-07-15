// Fastify 启动入口：建库 + seed → 注册插件/路由 → 托管前端静态资源 → 监听。
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

import { config } from './config.js';
import { seed } from './db/seed.js';
import { registerAuth } from './auth/routes.js';
import { registerRoutes } from './routes/index.js';
import { startSyncScheduler } from './sync/scheduler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../../public');

// 组装完整的 app（建库 + 插件 + 路由 + 静态托管），但不监听、不起调度。
// 与 main() 分开是为了让 test/routes.test.js 能用 app.inject() 打**真实**的这一份配置——
// 若测试自建 Fastify 复刻一份 setup，测的就是副本，错误处理器/JWT 配置漂了也测不出来。
// onRoute 可选：注册期逐条回调（Fastify 的 onRoute 钩子只对其后注册的路由生效，
// 故必须在 buildApp 内部、路由注册前挂上，测试无法从外部补挂）。
export async function buildApp({ onRoute } = {}) {
  // 启动即确保表结构与初始账号就绪（幂等）
  seed();

  const app = Fastify({
    logger: { level: config.env === 'production' ? 'info' : 'debug' },
    // Hermes attachments are capped at 8MB raw per request; allow Base64 and JSON overhead.
    bodyLimit: 16_000_000,
    trustProxy: true, // 位于 Caddy 反代之后
  });

  // 统一错误处理：校验错误回 400，其余回 500，且不泄漏堆栈
  app.setErrorHandler((err, request, reply) => {
    if (err.validation || err.statusCode === 400) {
      return reply.code(400).send({ error: 'bad_request', detail: err.message });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message || 'error' });
    }
    request.log.error({ err: err.message }, 'unhandled error');
    return reply.code(500).send({ error: 'server_error' });
  });

  if (onRoute) app.addHook('onRoute', onRoute);

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

  return app;
}

async function main() {
  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`FERR 运营后台已启动 :${config.port}`);

  // 谷歌数据定时自动同步（进程内调度）
  startSyncScheduler(app.log);
}

// 仅「直接执行本文件」时才起服务器；被 import（如测试）时只导出 buildApp。
// 必须用 pathToFileURL 归一化：Windows 下 `file://${process.argv[1]}` 因反斜杠/空格永远对不上
// （migrate.js/seed.js 曾栽在这里，导致 npm run migrate 静默失效）；
// argv[1] 判空则是防 `node -e` / REPL 下它为 undefined 时 pathToFileURL 抛错。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
