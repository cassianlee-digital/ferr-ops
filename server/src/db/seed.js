// 初始数据：四个账号（口令从 .env 读）+ KPI 默认目标（取自原型 TOTAL/SEO/SEM）。
// 幂等：账号按 username 去重；KPI 仅在表为空时写入。
// 直接运行：node src/db/seed.js
import bcrypt from 'bcryptjs';
import { db } from './connection.js';
import { migrate } from './migrate.js';
import { config } from '../config.js';

const USERS = [
  { username: 'li', name: '李', role: 'seo', pw: config.seedPasswords.li },
  { username: 'chen', name: '陈', role: 'sem', pw: config.seedPasswords.chen },
  { username: 'sales', name: '销售', role: 'sales', pw: config.seedPasswords.sales },
  { username: 'boss', name: '老板', role: 'boss', pw: config.seedPasswords.boss },
];

// KPI 默认目标/实际值，与原型 dashboard 完全一致
const KPI = [
  // grp, name, weight, target, actual, mode, unit
  ['total', '询盘总量', 25, 60, 55, 'r', '封'],
  ['total', 'A级询盘数', 35, 10, 7, 'r', '封'],
  ['total', '有效询盘成本', 25, 2000, 2400, 'i', '¥'],
  ['total', '闭环执行度', 15, 5, 4, 'r', '项'],
  ['seo', '自然流量环比', 25, 10, 8, 'r', '%'],
  ['seo', '核心词 Top10 占比', 25, 40, 30, 'r', '%'],
  ['seo', '关键词覆盖/长尾', 15, 500, 460, 'r', '词'],
  ['seo', '新增收录页面', 15, 20, 26, 'r', '页'],
  ['seo', '跳出率', 10, 55, 58, 'i', '%'],
  ['seo', '页面停留时长', 10, 150, 168, 'r', 's'],
  ['sem', 'CPC', 15, 4.0, 4.2, 'i', '¥'],
  ['sem', 'CTR', 15, 3.5, 3.4, 'r', '%'],
  ['sem', '质量分', 15, 7.5, 7.2, 'r', ''],
  ['sem', 'ROAS', 20, 3.5, 3.2, 'r', 'x'],
  ['sem', '转化次数', 15, 60, 55, 'r', '次'],
  ['sem', '每次转化费用', 20, 300, 330, 'i', '¥'],
];

export function seed() {
  migrate();

  const getUser = db.prepare('SELECT id FROM users WHERE username = ?');
  const insUser = db.prepare(
    'INSERT INTO users (username, name, role, password_hash) VALUES (?, ?, ?, ?)'
  );
  for (const u of USERS) {
    if (getUser.get(u.username)) continue; // 已存在则跳过（不覆盖已改的密码）
    if (!u.pw) {
      console.warn(`[seed] 账号 ${u.username} 的口令未在 .env 设置，已跳过创建`);
      continue;
    }
    const hash = bcrypt.hashSync(u.pw, 10);
    insUser.run(u.username, u.name, u.role, hash);
    console.log(`[seed] 已创建账号 ${u.username} (${u.role})`);
  }

  const kpiCount = db.prepare('SELECT COUNT(*) AS c FROM kpi_targets').get().c;
  if (kpiCount === 0) {
    const insKpi = db.prepare(
      'INSERT INTO kpi_targets (grp, name, weight, target, actual, mode, unit, sort_order) VALUES (?,?,?,?,?,?,?,?)'
    );
    KPI.forEach((row, i) => insKpi.run(...row, i));
    console.log(`[seed] 已写入 ${KPI.length} 条 KPI 默认目标`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
  console.log('[seed] 完成');
}
