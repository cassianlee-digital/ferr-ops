// 初始数据（V7）：四个账号（口令从 .env，bcrypt）+ KPI 目标（实际值=0，从0录入）。
// V7：移除 sales、新增 manager；不再写入任何演示业务数据（清空 mock）。
// 直接运行：node src/db/seed.js
import bcrypt from 'bcryptjs';
import { db } from './connection.js';
import { migrate } from './migrate.js';
import { config } from '../config.js';

const USERS = [
  { username: 'li', name: '李', role: 'seo', pw: config.seedPasswords.li },
  { username: 'chen', name: '陈', role: 'sem', pw: config.seedPasswords.chen },
  { username: 'manager', name: '主管', role: 'manager', pw: config.seedPasswords.manager },
  { username: 'boss', name: '老板', role: 'boss', pw: config.seedPasswords.boss },
];

// KPI 目标值（配置项，保留）；实际值一律 0，由后续录入回写
const KPI = [
  ['total', '询盘总量', 25, 60, 'r', '封'],
  ['total', 'A级询盘数', 35, 10, 'r', '封'],
  ['total', '有效询盘成本', 25, 2000, 'i', '¥'],
  ['total', '闭环执行度', 15, 5, 'r', '项'],
  ['seo', '自然流量环比', 25, 10, 'r', '%'],
  ['seo', '核心词 Top10 占比', 25, 40, 'r', '%'],
  ['seo', '关键词覆盖/长尾', 15, 500, 'r', '词'],
  ['seo', '新增收录页面', 15, 20, 'r', '页'],
  ['seo', '跳出率', 10, 55, 'i', '%'],
  ['seo', '页面停留时长', 10, 150, 'r', 's'],
  ['sem', 'CPC', 15, 4.0, 'i', '¥'],
  ['sem', 'CTR', 15, 3.5, 'r', '%'],
  ['sem', '质量分', 15, 7.5, 'r', ''],
  ['sem', 'ROAS', 20, 3.5, 'r', 'x'],
  ['sem', '转化次数', 15, 60, 'r', '次'],
  ['sem', '每次转化费用', 20, 300, 'i', '¥'],
];

export function seed() {
  migrate();

  const getUser = db.prepare('SELECT id FROM users WHERE username = ?');
  const insUser = db.prepare(
    'INSERT INTO users (username, name, role, password_hash) VALUES (?, ?, ?, ?)'
  );
  for (const u of USERS) {
    if (getUser.get(u.username)) continue;
    if (!u.pw) {
      console.warn(`[seed] 账号 ${u.username} 的口令未在 .env 设置，已跳过创建`);
      continue;
    }
    insUser.run(u.username, u.name, u.role, bcrypt.hashSync(u.pw, 10));
    console.log(`[seed] 已创建账号 ${u.username} (${u.role})`);
  }

  if (db.prepare('SELECT COUNT(*) AS c FROM kpi_targets').get().c === 0) {
    const insKpi = db.prepare(
      'INSERT INTO kpi_targets (grp, name, weight, target, actual, mode, unit, sort_order) VALUES (?,?,?,?,0,?,?,?)'
    );
    KPI.forEach((row, i) => insKpi.run(row[0], row[1], row[2], row[3], row[4], row[5], i));
    console.log(`[seed] 已写入 ${KPI.length} 条 KPI 目标（实际值=0）`);
  }

  // 市场记忆体单行占位
  db.prepare(
    `INSERT INTO market_brain (id, last_analyzed_hash, cached_summary, analyzed_month, updated_at)
     VALUES (1, NULL, NULL, NULL, NULL) ON CONFLICT(id) DO NOTHING`
  ).run();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
  console.log('[seed] 完成');
}
