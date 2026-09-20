/* 询盘的「可选值目录」——产品 / 大区 的唯一真相（2026-09-20 新增）。
 *
 * 为什么要有这个文件：老板反馈「产品这里和产品的筛选框不同步」。根因是同一份产品清单
 * 以前散在四个地方各写一遍 —— tagselect 的 OPT.product、inquiries.js 的 PROD_BADGE、
 * 录入弹框 index.html 里的 <select>、以及表头筛选（它只列数据里出现过的值）。
 * 加一个产品要改四处，漏一处就「对不上」。现在全部从这里取。
 *
 * 加新产品/大区：只改本文件的数组。录入弹框的下拉在运行时按它渲染，彩色标签、表头筛选
 * 也一并跟着变，不需要动 HTML。
 *
 * 本模块保持「无 DOM 也能被 import」——纯数据，没有任何 document 访问。
 */

/* 产品目录。第二项是彩色标签的样式类（可用：b-blue/b-purple/b-teal/b-green/b-amber/b-red/b-gray）。
   颜色只有 7 个而产品有 11 个，必然重复；分配时刻意让**名字相近的两个不同色**
   （电力金具=绿 / 电力=红），免得一眼扫过去分不清。 */
export const PRODUCTS = [
  ['铸造', 'b-amber'],
  ['锻造', 'b-red'],
  ['机加工', 'b-blue'],
  ['阀门', 'b-purple'],
  ['管件', 'b-teal'],
  ['电力金具', 'b-green'],
  // 2026-09-20 老板新增
  ['爬梯', 'b-blue'],
  ['紧线器', 'b-amber'],
  ['电力', 'b-red'],
  ['建筑预埋件', 'b-teal'],
  ['AI算力', 'b-purple'],
];

/* 大区目录。原先录入弹框写死 16 个 <option>，而表格里的大区是只读彩色标签、根本改不了 ——
   老板要求「后期可以改」，所以这里同时供给下拉与表格里的 tagselect。 */
export const REGIONS = [
  ['西欧', 'b-blue'],
  ['南欧', 'b-blue'],
  ['北欧', 'b-blue'],
  ['中东欧', 'b-teal'],
  ['东欧/俄罗斯', 'b-amber'],
  ['北美', 'b-purple'],
  ['拉美', 'b-red'],
  ['中东', 'b-amber'],
  ['北非', 'b-amber'],
  ['撒哈拉以南非洲', 'b-gray'],
  ['南亚', 'b-teal'],
  ['东南亚', 'b-red'],
  ['东亚', 'b-green'],
  ['中亚', 'b-gray'],
  ['大洋洲', 'b-teal'],
  ['其他', 'b-gray'],
];

// 历史数据里出现过、但已不在录入下拉中的旧写法。只为「老行也能上色」，不进任何下拉。
const LEGACY_REGION_BADGE = { 欧洲: 'b-blue', 俄罗斯: 'b-amber', '东南亚/巴西': 'b-red' };

const toMap = (pairs, extra) => Object.assign(Object.fromEntries(pairs), extra || {});

export const PRODUCT_BADGE = toMap(PRODUCTS);
export const REGION_BADGE = toMap(REGIONS, LEGACY_REGION_BADGE);

export const PRODUCT_NAMES = PRODUCTS.map((p) => p[0]);
export const REGION_NAMES = REGIONS.map((r) => r[0]);

/* 把一个 <select> 按目录重建。录入弹框用它，保证下拉永远与表格里的可选项一致。
   keepValue：重建前记住当前选中值，值还在目录里就还原（避免打开弹框时莫名跳回第一项）。 */
export function fillSelect(el, names, { placeholder = null } = {}) {
  if (!el) return;
  const keepValue = el.value;
  const opts = [];
  if (placeholder != null) opts.push(`<option value="">${placeholder}</option>`);
  for (const n of names) opts.push(`<option>${n}</option>`);
  el.innerHTML = opts.join('');
  if (keepValue && names.indexOf(keepValue) >= 0) el.value = keepValue;
}
