/* 改动流水弹框：询盘（渠道 / 等级 / 日期…）和任务（内容 / 日期 / 工时 / 结果…）共用这一个。
 *
 * 两边的流水长得一样 —— 谁、什么时候、把什么从 A 改成了 B、（有的话）为什么 —— 所以只做一个弹框，
 * 调用方告诉它去哪取、标题叫什么、每一条怎么念。全部 textContent，流水里的值是人填的原文。
 * 模块求值期不碰 DOM。
 */
import { openModal } from './ui-kit.js';

const $ = (id) => document.getElementById(id);

function localTime(utc) {
  const d = new Date(String(utc || '').replace(' ', 'T') + 'Z');
  if (isNaN(d)) return utc || '时间不详';
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function line(parent, cls, text) { const d = document.createElement('div'); d.className = cls; d.textContent = text; parent.appendChild(d); return d; }

/* path     取流水的接口，返回 { items: [{ old_value, new_value, changed_by_name, changed_at, reason? … }] }
   title    弹框标题
   rule     弹框底部那句「为什么要留这个档」
   empty    一条都没有时显示什么
   describe (item) => '渠道：SEO自然 → SEM付费' 这样的一行 */
export async function openChangeLog({ path, title, rule, empty, describe }) {
  const box = $('attrLogBody'); if (!box) return;
  $('attrLogTitle').textContent = title;
  $('attrLogRule').textContent = rule;
  box.textContent = ''; line(box, 'attr-log-empty', '加载中…');
  openModal('attrLogModal');
  try {
    const { items } = await API.get(path);
    box.textContent = '';
    if (!items.length) { line(box, 'attr-log-empty', empty); return; }
    for (const c of items) {
      const item = document.createElement('div'); item.className = 'attr-log-item';
      line(item, 'attr-log-head', describe(c));
      line(item, 'attr-log-meta', (c.changed_by_name || '未记录是谁') + ' · ' + localTime(c.changed_at));
      if (c.reason) line(item, 'attr-log-reason', '原因：' + c.reason);
      box.appendChild(item);
    }
  } catch (e) {
    box.textContent = ''; line(box, 'attr-log-empty', '加载失败：' + ((e && e.message) || '请求失败'));
  }
}
