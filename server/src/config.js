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

  // 数据加密主密钥（Google 凭据 / 第三方密钥的 AES）。优先独立的 SETTINGS_SECRET；
  // 未设时回退 JWT_SECRET（兼容既有密文）。settingsSecretExplicit 标记是否已真正解耦。
  settingsSecret: process.env.SETTINGS_SECRET || process.env.JWT_SECRET || 'dev-settings-key',
  settingsSecretExplicit: !!process.env.SETTINGS_SECRET,

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    maxTokens: Number(process.env.ANTHROPIC_MAX_TOKENS || 4000),
  },

  hermes: {
    url: (process.env.HERMES_AGENT_URL || '').replace(/\/+$/, ''),
    sharedSecret: process.env.HERMES_SHARED_SECRET || '',
    dailyLearningAuto: process.env.HERMES_DAILY_LEARNING_AUTO !== 'false',
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
    staleHours: Number(process.env.SYNC_STALE_HOURS ?? 12),                 // 最近成功同步超过此小时数才视为“过期”需补跑（默认半天）
    checkIntervalHours: Number(process.env.SYNC_CHECK_INTERVAL_HOURS ?? 6), // 周期性检查新鲜度的间隔（只读时间戳，过期才真同步）
  },
};

// 密钥解耦提醒：未设独立 SETTINGS_SECRET 时，数据加密密钥实际派生自 JWT_SECRET，
// 轮换 JWT_SECRET 会导致已存的 Google 凭据 / 第三方密钥无法解密。建议设置独立 SETTINGS_SECRET 以解耦。
if (!config.settingsSecretExplicit) {
  console.warn(
    '[config] 未设置 SETTINGS_SECRET：数据加密密钥当前派生自 JWT_SECRET，轮换 JWT_SECRET 会使已存凭据无法解密。建议在 .env 设置独立的 SETTINGS_SECRET。'
  );
}
