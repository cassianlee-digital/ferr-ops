const EVIDENCE_REF_RE = /\[EV-[a-z0-9-]+\]/gi;

const SOURCE_QUALITY = {
  synced_keyword_observation: 95,
  synced_query_observation: 92,
  synced_page_observation: 92,
  synced_campaign_observation: 90,
  synced_observation: 82,
  crm_observation: 82,
  company_research: 76,
  manual_weekly_report: 62,
  internal_memory: 58,
  derived_company_summary: 52,
  operational_observation: 50,
  target_only: 35,
  keyword_registry: 32,
  data_gap: 20,
};

const FRESHNESS_QUALITY = { fresh: 100, aging: 65, stale: 25, unknown: 45 };

export function stripEvidenceRefs(value) {
  return String(value || '')
    .replace(EVIDENCE_REF_RE, '')
    .replace(/[ \t]+([，。；、,.!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function evidenceRefs(value) {
  return [...new Set((String(value || '').match(EVIDENCE_REF_RE) || []).map((id) => id.slice(1, -1).toUpperCase()))];
}

export function normalizeClaimLine(value) {
  return stripEvidenceRefs(String(value || '')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/^[\s>*-]*(?:\d+[.)、]\s*)?/, '')
    .replace(/\*\*/g, ''));
}

function evidenceCatalog(context) {
  const direct = Array.isArray(context?.evidencePack) ? context.evidencePack : [];
  const operational = Array.isArray(context?.opsDiagnosis?.evidencePack) ? context.opsDiagnosis.evidencePack : [];
  const enterprise = Array.isArray(context?.enterpriseMemory?.evidencePack) ? context.enterpriseMemory.evidencePack : [];
  const byId = new Map();
  [...direct, ...operational, ...enterprise].forEach((item) => {
    const id = String(item?.id || '').toUpperCase();
    if (id && !byId.has(id)) byId.set(id, item);
  });
  return [...byId.values()];
}

export function auditHermesAnswer(parsed, context) {
  const pack = evidenceCatalog(context);
  const byId = new Map(pack.map((item) => [String(item.id || '').toUpperCase(), item]));
  const raw = [parsed?.basis, parsed?.answer].filter(Boolean).join('\n');
  const ids = evidenceRefs(raw);
  const evidence = ids.map((id) => byId.get(id)).filter(Boolean);
  const unknownEvidenceIds = ids.filter((id) => !byId.has(id));
  const status = !pack.length
    ? 'no_evidence_pool'
    : evidence.length
      ? (unknownEvidenceIds.length ? 'partial' : 'supported')
      : 'weak';
  return {
    status,
    evidence: evidence.slice(0, 12),
    evidenceIds: ids,
    unknownEvidenceIds,
    knownEvidenceIds: pack.map((item) => String(item.id || '').toUpperCase()).filter(Boolean),
    evidencePoolSize: pack.length,
    checkedAt: new Date().toISOString(),
    _evidenceById: byId,
  };
}

function isStructuralAnswerLine(line) {
  const clean = normalizeClaimLine(line).replace(/[：:]\s*$/, '');
  if (!clean) return true;
  if (/^(待验证|假设|缺失数据|不确定|需补充|证据不足|证据校验)/.test(clean)) return true;
  return clean.length <= 18 && /^(判断|依据|下一步|结论|建议|今日判断|关键证据|今天先做|复盘指标|可沉淀记忆|风险|置信度)$/i.test(clean);
}

export function lineNeedsEvidence(line) {
  if (isStructuralAnswerLine(line)) return false;
  const clean = normalizeClaimLine(line);
  return /(SEO|SEM|KPI|GSC|GA4|ADS|ROAS|CTR|CPC|CPA|ROI|询盘|关键词|周报|转化|点击|花费|排名|收录|流量|预算|投放|账户|页面|客户|市场|认证|数据|证据|建议|判断|动作|优化|复盘|整改|补齐|检查|排查|暂停|提高|降低)/i.test(clean);
}

function isHypothesis(clean) {
  return /^(假设|待验证|可能|需验证|风险)/.test(clean) || /(可能|或许|待验证|需要进一步|尚不能判断)/.test(clean);
}

function claimDomain(clean) {
  if (/(客户|市场|认证|资质|地区|国家|采购|询盘偏好)/i.test(clean)) return 'market';
  if (/(询盘|线索|A级|B级|C级)/i.test(clean)) return 'inquiry';
  if (/(Google Ads|ADS|SEM|ROAS|CPC|CPA|花费|预算|投放|广告|转化)/i.test(clean)) return 'sem';
  if (/(GSC|SEO|自然|排名|收录|展现|页面|查询词)/i.test(clean)) return 'seo';
  if (/KPI|目标|达标/i.test(clean)) return 'kpi';
  return '';
}

function evidenceText(item) {
  return [item?.metric, item?.value, item?.detail, item?.label, item?.summary].filter(Boolean).join(' ').toLowerCase();
}

function metricTokens(clean) {
  const rules = [
    ['ctr', /CTR|点击率/i], ['clicks', /点击/i], ['impressions', /展现|曝光/i],
    ['position', /排名|位置/i], ['cost', /花费|费用|成本/i], ['conversions', /转化/i],
    ['cpc', /CPC/i], ['cpa', /CPA|每次转化/i], ['roas', /ROAS/i],
    ['inquiry', /询盘|线索/i], ['quality', /质量分/i], ['indexed', /收录/i],
  ];
  return rules.filter(([, re]) => re.test(clean)).map(([token]) => token);
}

function evidenceHasMetric(item, token) {
  const text = evidenceText(item);
  const aliases = {
    ctr: ['ctr', '点击率'], clicks: ['click', '点击'], impressions: ['impression', '展现', '曝光'],
    position: ['position', '排名'], cost: ['cost', '花费', '费用', '成本'], conversions: ['conversion', '转化'],
    cpc: ['cpc'], cpa: ['cpa', 'cost_per_conv', 'costperconversion', '每次转化'], roas: ['roas'],
    inquiry: ['inquiry', '询盘', '线索'], quality: ['quality', '质量分'], indexed: ['indexed', '收录'],
  }[token] || [token];
  return aliases.some((alias) => text.includes(alias));
}

function isSpecificMutation(clean) {
  return /(暂停|否定|否词|加预算|减预算|提价|降价|放量|删除|合并|改标题|改落地页)/.test(clean);
}

function hasGranularEvidence(items) {
  return items.some((item) => ['keyword', 'query', 'page', 'campaign', 'ad_group'].includes(String(item?.granularity || '')));
}

function evidenceEntity(item) {
  const text = [item?.value, item?.detail].filter(Boolean).join('; ');
  const key = String(item?.granularity || '');
  const field = { keyword: 'keyword', query: 'query', page: 'page', campaign: 'campaign', ad_group: 'ad_group' }[key];
  if (!field) return '';
  const match = text.match(new RegExp(`(?:^|;)\\s*${field}=([^;]+)`, 'i'));
  return String(match?.[1] || '').trim().toLowerCase();
}

function granularEntityMatches(clean, items) {
  const relevant = items.filter((item) => evidenceEntity(item));
  if (!relevant.length) return true;
  if (!/(关键词|查询词|页面|系列|广告组|keyword|query|page|campaign|ad group)/i.test(clean)) return true;
  const claim = clean.toLowerCase();
  return relevant.some((item) => claim.includes(evidenceEntity(item)));
}

function companyEvidenceMatches(clean, items) {
  if (claimDomain(clean) !== 'market') return true;
  const companyItems = items.filter((item) => ['company_research', 'internal_memory', 'derived_company_summary'].includes(item?.dataRole));
  if (!companyItems.length) return true;
  const concepts = ['客户', '采购', '决策', '认证', '资质', '地区', '国家', '欧洲', '欧美', '东南亚', '巴西', '价格', '成本', '交期', '质量', '目录', 'catalog', '证书', '案例', '视频', '工厂', '产品', '材质'];
  const mentioned = concepts.filter((concept) => clean.toLowerCase().includes(concept.toLowerCase()));
  if (!mentioned.length) return false;
  return companyItems.some((item) => {
    const text = evidenceText(item);
    const specific = mentioned.filter((concept) => ['认证', '资质', '地区', '国家', '欧洲', '欧美', '东南亚', '巴西', '目录', 'catalog', '证书', '案例', '视频', '材质'].includes(concept));
    if (specific.length && !specific.every((concept) => text.includes(concept.toLowerCase()))) return false;
    return mentioned.some((concept) => text.includes(concept.toLowerCase()));
  });
}

export function evidenceSupportsClaim(line, items) {
  const clean = normalizeClaimLine(line);
  if (!clean || isHypothesis(clean)) return true;
  if (!Array.isArray(items) || !items.length) return false;

  const roles = new Set(items.map((item) => String(item?.dataRole || '')));
  if (roles.has('data_gap')) {
    const onlyGap = items.every((item) => item?.dataRole === 'data_gap');
    if (onlyGap) {
      return /(缺失|没有|无|未接入|未同步|抓取不到|核对|检查|排查|同步|数据不足|不能判断)/.test(clean)
        && !/(提高|降低|暂停|加预算|减预算|放量|效果|转化率|真实表现|实际表现|为\s*0|=\s*0)/i.test(clean);
    }
  }

  const domain = claimDomain(clean);
  if (domain && !items.some((item) => !item?.domain || item.domain === domain || (domain === 'kpi' && item.dataRole === 'target_only'))) return false;

  const causal = /(说明|证明|导致|因为|根因|表明|意味着|所以用户|用户根本|一定是|必然)/.test(clean);
  if (causal) return false;

  const evaluative = /(极低|很低|偏低|极高|很高|偏高|异常|不错|优秀|较差|未达标|超出目标|远超目标)/.test(clean);
  if (evaluative) {
    const hasBenchmark = items.some((item) => item?.dataRole === 'target_only' || /previous|prev|环比|同比|上期/i.test(evidenceText(item)));
    if (!hasBenchmark) return false;
  }

  const metrics = metricTokens(clean);
  if (metrics.length && !metrics.every((metric) => items.some((item) => evidenceHasMetric(item, metric)))) return false;

  if (isSpecificMutation(clean) && !hasGranularEvidence(items)) return false;
  if (!granularEntityMatches(clean, items)) return false;
  if (!companyEvidenceMatches(clean, items)) return false;

  if (items.every((item) => item?.dataRole === 'target_only')) {
    return /(KPI|目标|阈值|基准)/i.test(clean)
      && !/(真实|实际|当前表现|投放表现|花费|点击|转化|流量|排名|收录|为\s*0|=\s*0)/i.test(clean);
  }
  if (items.every((item) => item?.dataRole === 'keyword_registry')) {
    return /(关键词|关键字|词库|否词)/.test(clean)
      && !/(点击|花费|转化|CTR|CPC|CPA|ROAS|排名|效果|表现|机会|浪费)/i.test(clean);
  }
  return true;
}

function formatPendingClaim(line) {
  return `- ${normalizeClaimLine(line).replace(/^[-•]\s*/, '')}`;
}

export function needsEvidenceGuard(parsed, forceEvidence = false) {
  if (forceEvidence) return true;
  const raw = [parsed?.basis, parsed?.answer].filter(Boolean).join('\n');
  return /(SEO|SEM|KPI|GSC|GA4|ADS|ROAS|CTR|CPC|CPA|ROI|询盘|关键词|周报|转化|点击|花费|排名|收录|流量|预算|投放|账户|页面|客户|市场|认证|数据|证据|建议|判断|动作|优化|复盘|整改|补齐|检查|排查|暂停|提高|降低)/i.test(raw);
}

export function enforceEvidenceProtocol(parsed, audit, options = {}) {
  if (!audit || !needsEvidenceGuard(parsed, options.forceEvidence)) return parsed;
  const knownIds = new Set(audit.knownEvidenceIds || []);
  if (!knownIds.size) return parsed;

  const unsupported = [];
  const supported = [];
  const bindingIssues = [];
  const evidenceById = audit._evidenceById || new Map();
  const lines = String(parsed?.answer || '').split('\n');
  const answerLines = lines.filter((line) => {
    if (!lineNeedsEvidence(line)) return true;
    const ids = evidenceRefs(line);
    const cited = ids.filter((id) => knownIds.has(id)).map((id) => evidenceById.get(id)).filter(Boolean);
    if (evidenceSupportsClaim(line, cited)) {
      supported.push(line);
      return true;
    }
    unsupported.push(line);
    if (cited.length) bindingIssues.push({ claim: normalizeClaimLine(line), evidenceIds: cited.map((item) => item.id), reason: '证据内容、指标、层级或结论类型不匹配' });
    return false;
  });

  audit.claimCount = supported.length + unsupported.length;
  audit.supportedClaimCount = supported.length;
  if (!unsupported.length) {
    audit.claimAuditStatus = 'passed';
    return parsed;
  }

  audit.guardApplied = true;
  audit.claimAuditStatus = 'downgraded';
  audit.unsupportedClaims = unsupported.map(normalizeClaimLine).filter(Boolean);
  audit.evidenceBindingIssues = bindingIssues;
  audit.guardMessage = `强证据协议：已将 ${audit.unsupportedClaims.length} 条证据不充分的判断或动作降级为待验证。`;
  if (audit.status === 'supported') audit.status = 'partial';

  const pendingLines = audit.unsupportedClaims.map(formatPendingClaim).join('\n');
  const keptAnswer = answerLines.join('\n').trim();
  const answer = keptAnswer
    ? `${keptAnswer}\n\n待验证：\n${pendingLines}\n\n这些内容需要补充更细的数据或人工核对后再执行。`
    : `证据不足，以下内容不能作为已验证结论执行。\n\n待验证：\n${pendingLines}\n\n这些内容需要补充更细的数据或人工核对后再执行。`;
  return { basis: [String(parsed?.basis || '').trim(), audit.guardMessage].filter(Boolean).join('\n'), answer };
}

function average(values, fallback) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : fallback;
}

export function buildConfidenceAssessment(audit, parsed, options = {}) {
  if (!needsEvidenceGuard(parsed, options.forceEvidence)) {
    return { applicable: false, score: null, level: 'not_applicable', label: '非数据型回答', decision: '本回答不包含需要公司数据验证的运营结论。', dimensions: {} };
  }

  const evidence = Array.isArray(audit?.evidence) ? audit.evidence : [];
  const claimCount = Number(audit?.claimCount || 0);
  const supportedCount = Number(audit?.supportedClaimCount || 0);
  const coverage = claimCount ? Math.round((supportedCount / claimCount) * 100) : (audit?.status === 'supported' ? 100 : 0);
  const sourceQuality = average(evidence.map((item) => SOURCE_QUALITY[item.dataRole] || 45), 15);
  const freshness = average(evidence.map((item) => FRESHNESS_QUALITY[item.freshness] || 45), 25);
  const issueCount = (audit?.unknownEvidenceIds?.length || 0) + (audit?.unsupportedClaims?.length || 0) + (audit?.evidenceBindingIssues?.length || 0);
  const inferenceDiscipline = Math.max(0, 100 - (claimCount ? Math.round((issueCount / claimCount) * 75) : issueCount * 35));
  let score = Math.round(coverage * 0.35 + sourceQuality * 0.25 + freshness * 0.15 + inferenceDiscipline * 0.25);

  if (audit?.status === 'no_evidence_pool') score = Math.min(score, 20);
  if (audit?.status === 'weak') score = Math.min(score, 30);
  if (audit?.status === 'partial' || audit?.claimAuditStatus === 'downgraded') score = Math.min(score, 55);
  if (evidence.length && evidence.every((item) => ['target_only', 'keyword_registry', 'data_gap'].includes(item.dataRole))) score = Math.min(score, 45);
  if (evidence.length && evidence.every((item) => ['internal_memory', 'derived_company_summary'].includes(item.dataRole))) score = Math.min(score, 70);

  const level = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';
  const label = level === 'high' ? '高置信' : level === 'medium' ? '中等置信' : '低置信';
  const decision = level === 'high'
    ? '事实部分值得参考；涉及具体调整时仍按建议的验证指标复盘。'
    : level === 'medium'
      ? '可作为排查方向，建议先小范围验证后再扩大执行。'
      : '不可直接作为操作依据，应先补数据或人工核对。';
  return {
    applicable: true,
    score,
    level,
    label,
    decision,
    dimensions: { evidenceCoverage: coverage, sourceQuality, freshness, inferenceDiscipline },
  };
}

function evidenceGuardMessage(audit, parsed, forceEvidence = false) {
  if (!audit || !needsEvidenceGuard(parsed, forceEvidence)) return '';
  if (audit.status === 'partial') return '证据校验：部分内容缺少匹配证据或证据层级不足，只能按待验证处理。';
  if (audit.status === 'weak') return '证据校验：这条回答没有引用可匹配的公司数据，只能作为待验证建议。';
  if (audit.status === 'no_evidence_pool') return '证据校验：当前没有可用证据，不能把这条回答当作已验证结论。';
  return '';
}

export function guardHermesAnswer(parsed, audit, options = {}) {
  const enforced = enforceEvidenceProtocol(parsed, audit, options);
  if (enforced !== parsed) return enforced;
  const message = evidenceGuardMessage(audit, parsed, options.forceEvidence);
  if (!message) return parsed;
  audit.guardApplied = true;
  audit.guardMessage = message;
  return {
    basis: [String(parsed?.basis || '').trim(), message].filter(Boolean).join('\n'),
    answer: [String(parsed?.answer || '').trim(), message].filter(Boolean).join('\n\n'),
  };
}
