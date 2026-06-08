// 排名快照数据访问层。每个关键词一行，按 snapshot_date 分组还原“每周快照”。
import { db } from '../connection.js';

export function create(date, items) {
  const ins = db.prepare(
    'INSERT INTO rank_snapshots (snapshot_date, keyword, rank, url) VALUES (?,?,?,?)'
  );
  const tx = db.transaction((rows) => {
    for (const it of rows) ins.run(date, String(it.keyword), it.rank ?? null, it.url ?? null);
  });
  tx(items);
}

// 返回按日期分组的快照：[{ date, items:[{keyword,rank,url}] }]，日期升序
export function listGrouped() {
  const rows = db
    .prepare('SELECT snapshot_date, keyword, rank, url FROM rank_snapshots ORDER BY snapshot_date ASC, id ASC')
    .all();
  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.snapshot_date)) byDate.set(r.snapshot_date, []);
    byDate.get(r.snapshot_date).push({ keyword: r.keyword, rank: r.rank, url: r.url });
  }
  return [...byDate.entries()].map(([date, items]) => ({ date, items }));
}

export function distinctDateCount() {
  return db.prepare('SELECT COUNT(DISTINCT snapshot_date) AS c FROM rank_snapshots').get().c;
}
