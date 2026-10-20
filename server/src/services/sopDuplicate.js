/* SOP 执行流水的「同一条证据被记了两次」软提醒。
 *
 * 为什么只提醒不拦：有合理的重叠 —— 李写完一篇集群文章，陈把它排进内容日历再推一轮，
 * 同一个链接两边都该算。机器分不清这是协同还是重复记账，分得清的只有人。
 * 所以这里只负责**让人看见**，判断留给人。
 *
 * 为什么要做规范化：SOP 自己就要求帖子链接打 UTM（「链接与 UTM 检查」那条），
 * 同一条帖子带不带 utm_source 会长成两个字符串，逐字比等于白比。
 */

// 跟踪参数不是帖子的身份，比对前一律去掉
const TRACKING = /^(utm_[a-z_]*|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|si|ref|ref_src|spm)$/i;

/**
 * 把链接压成可比对的形态：去协议、去 www、去末尾斜杠、去锚点、去跟踪参数、查询参数排序。
 * 不是合法 URL 就退回「原样去空白后小写」—— 比不了也比，总好过当成两条不同的。
 * @returns {string|null} 空输入回 null（调用方据此跳过比对）
 */
export function canonicalUrl(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : 'https://' + t); } catch (e) { return t.toLowerCase(); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return t.toLowerCase();
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '');
  const qs = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING.test(k))
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return host + (path || '/') + (qs ? '?' + qs : '');
}

/**
 * 在最近的流水里找同一条证据。
 * @param rows  近期流水（带 sop_id / day_key / evidence_url，建议 join 出 title/code）
 * @param url   这次要记的证据链接
 * @param sopId 这次记在哪条 SOP 上
 * @returns 命中的那条（附 same_sop 标记），没有则 null
 *
 * 别的 SOP 记过 **排在前面**：那是「一份工作算两份」，比同一条 SOP 内重复更值得先说。
 * 同一条 SOP 内重复也要报 —— 那是直接往自己的配额里灌水。
 */
export function findDuplicate(rows, url, sopId) {
  const key = canonicalUrl(url);
  if (!key) return null;
  const hits = (rows || [])
    .filter((r) => canonicalUrl(r.evidence_url) === key)
    .map((r) => ({ ...r, same_sop: Number(r.sop_id) === Number(sopId) }));
  if (!hits.length) return null;
  // 先别的 SOP，再同一条；各自取最近的一次
  const pick = (list) => list.sort((a, b) => String(b.day_key).localeCompare(String(a.day_key)))[0];
  const other = hits.filter((h) => !h.same_sop);
  const hit = other.length ? pick(other) : pick(hits);
  return {
    log_id: hit.id ?? null,
    sop_id: hit.sop_id,
    code: hit.code ?? null,
    title: hit.title ?? null,
    day_key: hit.day_key ?? null,
    logged_by: hit.logged_by ?? null,
    same_sop: hit.same_sop,
  };
}
