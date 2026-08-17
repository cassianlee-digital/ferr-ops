function compactText(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

export function compactHermesEvidence(items, limit = 24) {
  return (Array.isArray(items) ? items : []).slice(0, limit).map((item) => ({
    id: compactText(item?.id, 60),
    source: compactText(item?.source, 80),
    dataRole: compactText(item?.dataRole, 40),
    granularity: compactText(item?.granularity, 40),
    domain: compactText(item?.domain, 30),
    label: compactText(item?.label, 120),
    summary: compactText(item?.summary || item?.detail, 500),
    metric: compactText(item?.metric, 80),
    date: compactText(item?.date, 40),
    freshness: compactText(item?.freshness, 30),
    value: compactText(item?.value, 260),
  }));
}

export function buildHermesEvidenceCitationIndex(items, limit = 24) {
  return compactHermesEvidence(items, limit)
    .filter((item) => /^EV-[a-z0-9-]+$/i.test(item.id))
    .map((item) => `${item.id}: ${item.label || item.source || '数据证据'}`)
    .join('\n')
    .slice(0, 3_000);
}

export function compactHermesMemories(items, limit = 6) {
  return (Array.isArray(items) ? items : []).slice(0, limit).map((item) => ({
    kind: compactText(item?.kind, 40),
    title: compactText(item?.title, 120),
    content: compactText(item?.content, 500),
    evidence: compactText(item?.evidence, 300),
    source: compactText(item?.source, 100),
    updatedAt: compactText(item?.updated_at, 40),
  }));
}

export function compactHermesPageContext(pageContext) {
  if (!pageContext || typeof pageContext !== 'object') return null;
  return {
    capturedAt: compactText(pageContext.capturedAt, 40),
    url: compactText(pageContext.url, 300),
    tab: compactText(pageContext.tab, 80),
    nav: compactText(pageContext.nav, 120),
    subtabs: (Array.isArray(pageContext.subtabs) ? pageContext.subtabs : [])
      .slice(0, 8).map((item) => compactText(item, 100)),
    panels: (Array.isArray(pageContext.panels) ? pageContext.panels : []).slice(0, 4).map((panel) => ({
      id: compactText(panel?.id, 80),
      title: compactText(panel?.title, 120),
      subtitle: compactText(panel?.subtitle, 240),
      visibleText: compactText(panel?.visibleText, 1200),
    })),
    tables: (Array.isArray(pageContext.tables) ? pageContext.tables : []).slice(0, 4).map((table) => ({
      title: compactText(table?.title, 120),
      headers: (Array.isArray(table?.headers) ? table.headers : []).slice(0, 10)
        .map((item) => compactText(item, 80)),
      rows: (Array.isArray(table?.rows) ? table.rows : []).slice(0, 6).map((row) =>
        (Array.isArray(row) ? row : []).slice(0, 10).map((item) => compactText(item, 120))),
    })),
  };
}

export function serializeHermesPayload(payload, maxChars = 26_000) {
  const limit = Math.max(1_000, Number(maxChars) || 26_000);
  const working = JSON.parse(JSON.stringify(payload || {}));
  const evidenceAvailable = Array.isArray(working.evidencePack) ? working.evidencePack.length : 0;
  let reduced = false;

  const render = () => JSON.stringify({
    ...working,
    contextBudget: {
      maxChars: limit,
      reduced,
      evidenceAvailable,
      evidenceIncluded: Array.isArray(working.evidencePack) ? working.evidencePack.length : 0,
    },
  });

  let json = render();
  if (json.length <= limit) return json;

  reduced = true;
  working.backendContext = compactText(working.backendContext, 500);
  if (working.enterpriseMemory?.longTermMemories?.length > 3) {
    working.enterpriseMemory.longTermMemories = working.enterpriseMemory.longTermMemories.slice(0, 3);
  }
  json = render();

  while (json.length > limit && working.evidencePack?.length > 8) {
    working.evidencePack.pop();
    json = render();
  }
  if (json.length <= limit) return json;

  working.pageContext = null;
  while (json.length > limit && working.evidencePack?.length > 2) {
    working.evidencePack.pop();
    json = render();
  }
  if (json.length <= limit) return json;

  const fallback = {
    operator: working.operator || null,
    opsDiagnosis: { missingData: working.opsDiagnosis?.missingData || [] },
    evidencePack: (working.evidencePack || []).slice(0, 2),
    enterpriseMemory: { missingData: working.enterpriseMemory?.missingData || [] },
    contextBudget: {
      maxChars: limit,
      reduced: true,
      evidenceAvailable,
      evidenceIncluded: Math.min(2, working.evidencePack?.length || 0),
    },
  };
  json = JSON.stringify(fallback);
  return json.length <= limit
    ? json
    : JSON.stringify({ contextBudget: { maxChars: limit, reduced: true, evidenceAvailable, evidenceIncluded: 0 } });
}
