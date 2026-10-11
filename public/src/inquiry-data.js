/* 询盘列表的取数。
 *
 * 三个地方各按自己的时间范围取同一份列表：询盘评级页的表格、总览的询盘趋势、KPI 页的两个圆环。
 * 时间范围相同的时候（默认都是近 30 天），它们发出去的是一模一样的请求 —— 打开后台一次就要取三遍。
 * 这里让「同一时刻、同一地址」的请求共用一次。
 *
 * 只合并**正在路上**的请求，不缓存结果：录入 / 修改询盘之后的重拉必须拿到新数据，
 * 缓存哪怕一两秒，都可能出现「刚录的询盘没显示」。
 * 每个调用方拿到的是自己的一份拷贝：询盘页会就地改行对象（补录客户编码、改等级），
 * 不能让它顺手改到 KPI 圆环和总览趋势手里的那份。
 */
import { withRange } from './timerange.js';

const pending = new Map();

export function fetchInquiries(scope) {
  const url = withRange('/api/inquiries', scope);
  let p = pending.get(url);
  if (!p) {
    p = API.get(url).finally(() => pending.delete(url));
    pending.set(url, p);
  }
  return p.then((res) => structuredClone(res));
}
