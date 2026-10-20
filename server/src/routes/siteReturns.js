// 按站点的广告花费与询盘 API，以及「广告系列归到哪个站点」的指定。规则在 services/siteReturns.js。
import { requireAuth, onlyManagerBoss } from '../auth/middleware.js';
import * as inquiriesRepo from '../db/repositories/inquiries.js';
import * as campaignSites from '../db/repositories/adsCampaignSites.js';
import * as taskLinksRepo from '../db/repositories/taskLinks.js';
import { adsSummary, listProjects } from '../db/repositories/googleSync.js';
import { normalizeRange, resolveProject } from '../sync/googleClient.js';
import { computeSiteReturns } from '../services/siteReturns.js';

export async function siteReturnsRoutes(app) {
  app.get('/api/sites/returns', { preHandler: requireAuth }, async (request, reply) => {
    let range; let project;
    try { range = normalizeRange(request.query || {}); project = resolveProject({}); }
    catch (e) { return reply.code(400).send({ error: e.message || 'bad_request' }); }

    const active = listProjects();
    const mapping = campaignSites.mapping();
    // 归属里引用到的站点可能已经停用：照样列出来，它名下的花费不能凭空消失
    const staleSites = campaignSites.referencedInactiveSites().map((s) => ({ id: s.id, name: s.name + '（已停用）', active: false }));
    const ads = adsSummary({ ...range, ads_customer_id: project.ads_customer_id });
    return {
      range,
      // 金额是 Ads 账户的币种，库里没存是哪种币，界面上写「账户币种」，不猜符号
      currency: 'ADS_ACCOUNT',
      ...computeSiteReturns({
        campaigns: ads.campaigns || [],
        mapping,
        sites: [...active.map((s) => ({ id: s.id, name: s.name, active: true })), ...staleSites],
        inquiries: inquiriesRepo.list(range),
        evidence: campaignSites.formEvidence(),
      }),
    };
  });

  // 指定一个系列投的是哪个站点（site_id 为 null = 取消）。只收同步到过的系列、启用中的站点
  app.put('/api/sites/campaigns/:campaignId', onlyManagerBoss, async (request, reply) => {
    const campaignId = String(request.params.campaignId || '').trim();
    if (!taskLinksRepo.campaignNames().has(campaignId)) {
      return reply.code(400).send({ error: 'unknown_campaign', detail: '这个系列不在已同步的广告数据里' });
    }
    const body = request.body || {};
    if (!('site_id' in body)) return reply.code(400).send({ error: 'site_required', detail: '要指定站点（传 null 表示取消归属）' });
    let siteId = null;
    if (body.site_id != null && body.site_id !== '') {
      const site = listProjects().find((s) => s.id === Number(body.site_id));
      if (!site) return reply.code(400).send({ error: 'unknown_site', detail: '选的站点不存在（可能已被停用）' });
      siteId = site.id;
    }
    campaignSites.set(campaignId, siteId, request.user?.id);
    return { ok: true, campaign_id: campaignId, site_id: siteId };
  });
}
