// 诊断规则：点击率偏低（纯函数，不碰数据库）。
//
// 要找的是这种词：已经排在首页、曝光也不少，但愿意点进来的人明显比「同样排位的其它词」少 ——
// 排名不用再冲，改标题和描述就可能多拿点击，是 SEO 里投入最小的一类动作。
//
// 和谁比：**本站自己同位次的词**（按排名四舍五入分成 1~10 十档，取那一档里各词点击率的中位数）。
//   · 不用行业平均点击率曲线：那是别人的站、别的行业，拿来判自己的词等于编一个基准；
//   · 用中位数不用加权平均：品牌词的点击率高得离谱且曝光大，加权平均会被它一个词拉上去，把正常的词都判成偏低。
// 所以它说的是「在你自己的站里偏低」，整站标题都写得差的话，这条规则一条都报不出来 —— 界面上要把这句话写明。
//
// 诚实口径：某一档可比的词不到 minBucketRows 个、或中位数是 0，就没有基准，那一档的词不判（不是「没问题」）。

export const CTR_RULE = {
  maxPosition: 10,      // 只看首页
  minImpressions: 50,   // 曝光太少的词点击率全是噪音：10 次曝光 0 次点击说明不了任何事
  minBucketRows: 5,     // 一档里至少要有这么多个可比的词才算有基准
  ratio: 0.5,           // 点击率不到同位次中位数的一半才报
  minMissedClicks: 3,   // 按中位数算本该多拿的点击不到 3 次的不报（省得满屏鸡毛蒜皮）
  limit: 50,
};

function median(sorted) {
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/* rows = 区间内按「查询词 × 页面」汇总的行：{ query, page, clicks, impressions, position }。
   返回 { items, baselines }：
     items     点击率偏低的词，按「少拿的点击」从多到少
     baselines 每一档的基准（界面要能让人看到拿什么比的）：{ position, ctr, rows }，没有基准的档不在里面 */
export function findCtrAnomalies(rows, opts = {}) {
  const o = { ...CTR_RULE, ...opts };
  const eligible = [];
  for (const r of rows || []) {
    const impressions = Number(r.impressions) || 0; const position = Number(r.position);
    if (impressions < o.minImpressions || !Number.isFinite(position) || position < 1 || position >= o.maxPosition + 0.5) continue;
    const clicks = Number(r.clicks) || 0;
    eligible.push({ query: r.query, page: r.page, clicks, impressions, position, ctr: clicks / impressions, bucket: Math.min(o.maxPosition, Math.max(1, Math.round(position))) });
  }
  const byBucket = new Map();
  for (const r of eligible) { if (!byBucket.has(r.bucket)) byBucket.set(r.bucket, []); byBucket.get(r.bucket).push(r.ctr); }
  const base = new Map();
  for (const [bucket, ctrs] of byBucket) {
    if (ctrs.length < o.minBucketRows) continue;
    const m = median(ctrs.slice().sort((a, b) => a - b));
    if (m > 0) base.set(bucket, { ctr: m, rows: ctrs.length });
  }
  const items = [];
  for (const r of eligible) {
    const b = base.get(r.bucket);
    if (!b || !(r.ctr < b.ctr * o.ratio)) continue;
    const missed = r.impressions * b.ctr - r.clicks;
    if (missed < o.minMissedClicks) continue;
    items.push({ query: r.query, page: r.page, clicks: r.clicks, impressions: r.impressions, position: r.position, ctr: r.ctr, expectedCtr: b.ctr, missedClicks: Math.round(missed) });
  }
  items.sort((a, b) => b.missedClicks - a.missedClicks || b.impressions - a.impressions);
  return {
    items: items.slice(0, o.limit),
    baselines: [...base.entries()].sort((a, b) => a[0] - b[0]).map(([position, b]) => ({ position, ctr: b.ctr, rows: b.rows })),
  };
}
