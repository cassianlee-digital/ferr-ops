// 表单线索数据访问层：独立站询盘表单提交后带着来源参数进来的原始记录。
// 线索不是询盘 —— 它不进任何统计，要有人确认「这就是业务收到的那条询盘」并评了等级，才转成询盘。
import { createHash } from 'node:crypto';
import { db } from '../connection.js';

export const COLS = ['submission_id', 'submitted_at', 'contact_name', 'contact_email', 'contact_company',
  'country', 'product', 'message', 'page_url', 'landing_page', 'referrer', 'gclid',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'campaign_id', 'adgroup_id', 'keyword', 'match_type', 'suggested_channel'];

export const STATES = ['new', 'converted', 'ignored'];

// 去重键：站点给了 submission_id 就用它；没给就按「邮箱 + 留言 + 表单页」取指纹。
// 表单的 webhook 失败会重试，同一次提交不能变成两条线索。
export function dedupeKey(lead) {
  if (lead.submission_id) return 'id:' + lead.submission_id;
  return 'fp:' + createHash('sha256')
    .update([lead.contact_email || '', lead.message || '', lead.page_url || ''].join('\u0000'))
    .digest('hex');
}

export function get(id) {
  return db.prepare('SELECT * FROM inquiry_leads WHERE id = ?').get(id);
}

// 返回 { item, duplicate }。重复提交回原来那条，不新建。
export function create(lead) {
  const key = dedupeKey(lead);
  const existing = db.prepare('SELECT * FROM inquiry_leads WHERE dedupe_key = ?').get(key);
  if (existing) return { item: existing, duplicate: true };
  const row = { dedupe_key: key };
  for (const c of COLS) row[c] = lead[c] ?? null;
  const info = db.prepare(
    `INSERT INTO inquiry_leads (${COLS.join(', ')}, dedupe_key) VALUES (${COLS.map((c) => '@' + c).join(', ')}, @dedupe_key)`
  ).run(row);
  return { item: get(info.lastInsertRowid), duplicate: false };
}

export function list(state) {
  return db.prepare('SELECT * FROM inquiry_leads WHERE state = ? ORDER BY id DESC LIMIT 300').all(state);
}

// 一段日期里收到的线索（received_at 是 UTC，按北京时间归日，与任务完成日同口径）
export function listBetween(from, to) {
  return db.prepare(
    "SELECT * FROM inquiry_leads WHERE date(received_at, '+8 hours') BETWEEN ? AND ? ORDER BY id DESC"
  ).all(from, to);
}

export function counts() {
  const out = { new: 0, converted: 0, ignored: 0 };
  for (const r of db.prepare('SELECT state, COUNT(*) n FROM inquiry_leads GROUP BY state').all()) out[r.state] = r.n;
  return out;
}

// 只有「新线索」能被处理；已经转过 / 忽略过的不能再被另一个人重复处理（返回 0 = 没改到）
export function markIgnored(id, reason, userId) {
  return db.prepare(
    "UPDATE inquiry_leads SET state='ignored', ignore_reason=?, handled_by=?, handled_at=datetime('now') WHERE id=? AND state='new'"
  ).run(reason ?? null, userId ?? null, id).changes;
}

export function markConverted(id, inquiryId, userId) {
  return db.prepare(
    "UPDATE inquiry_leads SET state='converted', inquiry_id=?, handled_by=?, handled_at=datetime('now') WHERE id=? AND state='new'"
  ).run(inquiryId, userId ?? null, id).changes;
}

// 忽略错了可以捞回来；已转成询盘的不行（那条询盘已经在统计里了，要撤得去删询盘）
export function reopen(id) {
  return db.prepare(
    "UPDATE inquiry_leads SET state='new', ignore_reason=NULL, handled_by=NULL, handled_at=NULL WHERE id=? AND state='ignored'"
  ).run(id).changes;
}
