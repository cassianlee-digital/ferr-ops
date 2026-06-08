// 基于数据库实时数据组装 AI 上下文，保证建议「基于本周真实数据」。
import * as kpiRepo from '../db/repositories/kpi.js';
import * as inqRepo from '../db/repositories/inquiries.js';
import * as seoRepo from '../db/repositories/seoWeeks.js';
import * as semRepo from '../db/repositories/semWeeks.js';
import * as kwRepo from '../db/repositories/keywords.js';

const MARKET =
  '目标客户=欧美来图定制工厂/中间商；欧洲毛利高最在意资质，东南亚/巴西薄难成交；' +
  '现仅 SMETA 验厂、缺欧洲认证是短板；客户索要频率 catalog>材质证书>检测报告>案例>工厂视频。';

export function buildContext() {
  const rows = kpiRepo.list();
  const fmt = (r) => `${r.name} 目标${r.target}(实际${r.actual})`;
  const lines = [];
  lines.push('【公司KPI(目标/实际)】' + rows.filter((r) => r.grp === 'total').map(fmt).join('；'));
  lines.push('【SEO·李】' + rows.filter((r) => r.grp === 'seo').map(fmt).join('；'));
  lines.push('【SEM·陈】' + rows.filter((r) => r.grp === 'sem').map(fmt).join('；'));

  const s = inqRepo.stats();
  lines.push(`【询盘】总量${s.total} 有效${s.valid}(A${s.a}/B${s.b}/C${s.c}) A级占比${s.aRatio}% 有效率${s.rate}%`);

  const sw = seoRepo.latestTwo()[0];
  if (sw) {
    lines.push(
      `【本周SEO实录】点击${sw.clicks} 展现${sw.impressions} 均排名${sw.avg_position ?? '-'} ` +
        `跳出${sw.bounce_rate ?? '-'}% Top10占比${sw.top10_ratio ?? '-'}% 覆盖${sw.coverage ?? '-'} 新增收录${sw.indexed_pages ?? '-'}`
    );
  }
  const mw = semRepo.latest();
  if (mw) {
    lines.push(
      `【本周SEM实录】花费¥${mw.cost} 点击${mw.clicks} 转化${mw.conversions} ROAS${mw.roas ?? '-'}x ` +
        `CPC¥${mw.cpc ?? '-'} CTR${mw.ctr ?? '-'}% 每转化¥${mw.cost_per_conv ?? '-'}`
    );
  }

  const seoKw = kwRepo.list('seo');
  if (seoKw.length) lines.push('【SEO关键词排名】' + seoKw.map((k) => `${k.keyword}(${k.attrs?.gscRank ?? '-'})`).join('、'));
  const high = kwRepo.list('high');
  if (high.length) lines.push('【高价值词】' + high.map((k) => k.keyword).join('、'));

  lines.push('【市场】' + MARKET);
  return lines.join('\n');
}
