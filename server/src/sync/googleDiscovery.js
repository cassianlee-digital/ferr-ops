// 从已授权的谷歌账号里列出「能选的」Search Console 资源和 GA4 媒体资源，给「添加站点」当候选，省得手敲编号敲错。
//
// 两个来源互不相干：一个失败不影响另一个，失败的那个把原因带回去（没授权 / 接口没开通），界面上照样可以手填。
// 只读：这里不改谷歌那边的任何东西。
import { googleJson } from './googleClient.js';

const GSC_SITES = 'https://www.googleapis.com/webmasters/v3/sites';
const GA4_ACCOUNTS = 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200';

function reason(e) {
  if (e && e.message === 'google_not_authorized') return '这个数据源还没有授权';
  return (e && e.message) || '读取失败';
}

// 账号下已验证的 Search Console 资源。没验证过所有权的取不到数据，不列出来
async function gscProperties() {
  const json = await googleJson('gsc', GSC_SITES);
  return (json.siteEntry || [])
    .filter((s) => s.siteUrl && s.permissionLevel !== 'siteUnverifiedUser')
    .map((s) => ({ site_url: s.siteUrl, kind: s.siteUrl.startsWith('sc-domain:') ? '网域资源' : '网址前缀资源' }))
    .sort((a, b) => a.site_url.localeCompare(b.site_url));
}

// 账号下的 GA4 媒体资源，带上它所在的 Analytics 账号名（不同账号下可能有同名的媒体资源）
async function ga4Properties() {
  const json = await googleJson('ga4', GA4_ACCOUNTS);
  const out = [];
  for (const account of json.accountSummaries || []) {
    for (const p of account.propertySummaries || []) {
      const id = String(p.property || '').replace(/^properties\//, '');
      if (/^\d+$/.test(id)) out.push({ property_id: id, name: p.displayName || id, account: account.displayName || '' });
    }
  }
  return out;
}

async function attempt(fn) {
  try { return { items: await fn(), error: null }; } catch (e) { return { items: [], error: reason(e) }; }
}

export async function discoverGoogleResources() {
  const [gsc, ga4] = await Promise.all([attempt(gscProperties), attempt(ga4Properties)]);
  return { gsc, ga4 };
}
