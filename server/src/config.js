// 集中读取环境变量。所有密钥/口令只来自这里，代码里不写死任何敏感值。
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 项目根目录在 server/ 的上一级；优先读根目录的 .env，方便 docker 与本地共用
dotenv.config({ path: resolve(__dirname, '../../.env') });
// 兜底：也尝试 server/.env（本地单独跑后端时）
dotenv.config({ path: resolve(__dirname, '../.env') });

function required(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    // 不打印值，只提示缺失
    console.warn(`[config] 缺少环境变量 ${name}，请检查 .env`);
    return '';
  }
  return v;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  host: '0.0.0.0',

  // 数据库文件路径（容器内挂载到 /app/data）
  dbFile: resolve(__dirname, '../../data/ferr.sqlite'),

  jwtSecret: required('JWT_SECRET', 'dev-insecure-secret-change-me'),
  sessionHours: Number(process.env.SESSION_HOURS || 72),

  // 会话 cookie 是否要求 HTTPS。纯 IP/HTTP 部署需设为 false，否则浏览器不回传 cookie、登录失效。
  // 默认：显式 COOKIE_SECURE 优先，否则生产环境为 true。
  cookieSecure:
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === 'true'
      : (process.env.NODE_ENV || 'development') === 'production',

  seedPasswords: {
    li: process.env.SEED_LI_PASSWORD || '',
    chen: process.env.SEED_CHEN_PASSWORD || '',
    manager: process.env.SEED_MANAGER_PASSWORD || '',
    boss: process.env.SEED_BOSS_PASSWORD || '',
  },

  // 设置页密钥 AES 加密用的主密钥（默认从 JWT_SECRET 派生，无需额外配置）
  settingsSecret: process.env.SETTINGS_SECRET || process.env.JWT_SECRET || 'dev-settings-key',

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    maxTokens: Number(process.env.ANTHROPIC_MAX_TOKENS || 4000),
  },

  google: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || '',
    gscSiteUrl: process.env.GSC_SITE_URL || '',
    ga4PropertyId: process.env.GA4_PROPERTY_ID || '',
    adsDeveloperToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    adsCustomerId: (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, ''),
    adsLoginCustomerId: (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/-/g, ''),
    adsApiVersion: process.env.GOOGLE_ADS_API_VERSION || 'v24.1',
  },

  // 谷歌数据定时自动同步（进程内调度，无需外部 cron）。
  sync: {
    enabled: process.env.SYNC_AUTO !== 'false',                              // 默认开启；SYNC_AUTO=false 关闭
    dailyHourUtc: Number(process.env.SYNC_DAILY_HOUR_UTC ?? 5),              // 每天 UTC 几点跑（默认 5 点≈北京 13 点）
    catchUpOnStart: process.env.SYNC_CATCHUP_ON_START !== 'false',          // 启动后若近期无成功同步则补跑一次
    startDelayMs: Number(process.env.SYNC_START_DELAY_MS ?? 60_000),        // 启动补跑前的延时（等服务稳定）
    staleHours: Number(process.env.SYNC_STALE_HOURS ?? 20),                 // 最近成功同步超过此小时数才视为“过期”需补跑
  },
};
