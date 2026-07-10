/* Weekly/monthly review workspace.
   Keeps the existing weekly_reports API and separates week keys from month keys. */

const RV_SECTIONS = [
  ['summary', '① 本周工作总结', []],
  ['problems', '② 遇到的问题', ['测试', '采纳']],
  ['analysis', '③ 分析', ['采纳']],
  ['next_plan', '④ 下周工作计划', []]
];

const RV_MONTH_SECTIONS = [
  ['summary', '① 本月工作总结', []],
  ['problems', '② 遇到的问题', ['测试', '采纳']],
  ['analysis', '③ 分析', ['采纳']],
  ['next_plan', '④ 下月工作计划', []]
];

function reportWeekStart(now = new Date()) {
  const d = new Date(now);
  const day = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day + 1);
  if ((now.getDay() || 7) === 1 && now.getHours() < 8) d.setDate(d.getDate() - 7);
  return d;
}

function keyFromWeekStart(start) {
  // 周归属于「本周周一所在的月」，周序 = ceil(周一日期/7)。
  // 不做「第5周→次月第1周」进位:那会让上月末的周(周一在29-31)与次月真正的第1周撞成同一 key。
  const d = new Date(start);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const week = Math.ceil(d.getDate() / 7);
  return `${year}-${month}-${week}`;
}

function curWeekKey() {
  return keyFromWeekStart(reportWeekStart());
}

function curMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-month`;
}

function parseWeekKey(key) {
  const p = String(key || '').split('-').map(Number);
  if (p.length < 3 || !p[0] || !p[1] || !p[2]) return null;
  const [year, month, week] = p;
  return { year, month, week, monthKey: `${year}-${month}` };
}

function parseMonthKey(key) {
  const m = String(key || '').match(/^(\d{4})-(\d{1,2})-month$/);
  return m ? { year: Number(m[1]), month: Number(m[2]), monthKey: `${Number(m[1])}-${Number(m[2])}` } : null;
}

function currentWeekShouldOpen() {
  const now = new Date();
  const start = reportWeekStart(now);
  const openAt = new Date(start);
  openAt.setHours(8, 0, 0, 0);
  const closeAt = new Date(start);
  closeAt.setDate(closeAt.getDate() + 4);
  closeAt.setHours(22, 0, 0, 0);
  return now >= openAt && now < closeAt;
}

function weekLabel(key) {
  const p = parseWeekKey(key);
  return p ? `${p.year}年${p.month}月第${p.week}周` : key;
}

function canonicalWeekKey(key) {
  const p = parseWeekKey(key);
  return p ? `${p.year}-${p.month}-${p.week}` : key;
}

function monthLabel(key) {
  const p = parseMonthKey(key) || parseWeekKey(key);
  return p ? `${p.year}年${p.month}月月报` : key;
}

function monthGroupLabel(monthKey) {
  const [year, month] = String(monthKey || '').split('-');
  return `${year}年${Number(month)}月周报`;
}

function sortWeekKeys(keys) {
  return [...keys].sort((a, b) => {
    const pa = parseWeekKey(a) || { year: 0, month: 0, week: 0 };
    const pb = parseWeekKey(b) || { year: 0, month: 0, week: 0 };
    return (pb.year - pa.year) || (pb.month - pa.month) || (pb.week - pa.week);
  });
}

function sortMonthKeys(keys) {
  return [...keys].sort((a, b) => {
    const pa = parseMonthKey(a) || { year: 0, month: 0 };
    const pb = parseMonthKey(b) || { year: 0, month: 0 };
    return (pb.year - pa.year) || (pb.month - pa.month);
  });
}

function rvItemHtml(text, acts) {
  const btns = (acts || []).map((a) => `<button class="aibtn ${a === '采纳' ? 'adopt' : 'test'}" onclick="rvAct(this,'${a}')">${a}</button>`).join('');
  return `<div class="rv-item"><span class="txt" contenteditable>${esc(text)}</span>${btns}<span class="rv-del" onclick="rvDel(this)" title="删除"><i class="ti ti-x"></i></span></div>`;
}

function rvColHtml(dept, rec, key, prevPlan, sections = RV_SECTIONS) {
  const name = dept === 'SEM' ? 'SEM · 陈' : 'SEO · 李';
  let h = `<div class="rv-col ${dept === 'SEM' ? 'sem' : 'seo'}"><div class="rv-owner">${name}</div>`;
  sections.forEach(([field, title, acts]) => {
    const items = (rec && rec[field]) || [];
    h += `<div class="rv-sec" data-field="${field}" data-dept="${dept}" data-week="${key}"><h5>${title}</h5>`;
    if (field === 'summary' && !items.length && prevPlan && prevPlan.length) {
      h += `<div class="rv-prev">上期计划：${prevPlan.map((x) => esc(x)).join('；')}</div>`;
    }
    h += `<div class="rv-list">${items.map((t) => rvItemHtml(t, acts)).join('')}</div>`;
    h += `<span class="rv-add" onclick="rvAdd(this)"><i class="ti ti-plus"></i> 添加</span></div>`;
  });
  return h + '</div>';
}

function prevPlanOf(keys, byKey, key, dept) {
  const idx = keys.indexOf(key);
  for (let i = idx + 1; i < keys.length; i++) {
    const r = byKey[keys[i]][dept];
    if (r && r.next_plan && r.next_plan.length) return r.next_plan;
  }
  return null;
}

async function renderReview() {
  const cur = curWeekKey();
  let items = [];
  try {
    const r = await API.get('/api/weekly-reports?current=' + encodeURIComponent(cur));
    items = r.items || [];
  } catch (e) {}

  const byWeek = {};
  items.filter((it) => !parseMonthKey(it.week_key)).forEach((it) => {
    const key = canonicalWeekKey(it.week_key);
    (byWeek[key] = byWeek[key] || {})[it.dept] = { ...it, week_key: key };
  });
  if (!byWeek[cur]) byWeek[cur] = {};

  const keys = sortWeekKeys(Object.keys(byWeek));
  const curMeta = parseWeekKey(cur);
  const currentMonthKey = curMeta && curMeta.monthKey;
  const currentKeys = keys.filter((key) => (parseWeekKey(key) || {}).monthKey === currentMonthKey);
  const oldGroups = {};
  keys.filter((key) => (parseWeekKey(key) || {}).monthKey !== currentMonthKey).forEach((key) => {
    const meta = parseWeekKey(key);
    if (!meta) return;
    (oldGroups[meta.monthKey] = oldGroups[meta.monthKey] || []).push(key);
  });

  const acc = document.getElementById('review-acc');
  if (!acc) return;

  const currentHtml = currentKeys.map((week) => {
    const isCurrent = week === cur;
    const collapsed = isCurrent ? !currentWeekShouldOpen() : true;
    return `<div class="acc-week${collapsed ? ' collapsed' : ''}">
      <div class="acc-bar" onclick="this.parentElement.classList.toggle('collapsed')"><i class="ti ti-chevron-down hicon"></i> ${weekLabel(week)} ${isCurrent ? '<span class="badge b-green" style="margin-left:6px">本周</span>' : ''}</div>
      <div class="acc-body">${rvColHtml('SEO', byWeek[week].SEO, week, prevPlanOf(keys, byWeek, week, 'SEO'))}${rvColHtml('SEM', byWeek[week].SEM, week, prevPlanOf(keys, byWeek, week, 'SEM'))}</div>
    </div>`;
  }).join('');

  const groupHtml = Object.keys(oldGroups).sort((a, b) => {
    const [ay, am] = a.split('-').map(Number);
    const [by, bm] = b.split('-').map(Number);
    return (by - ay) || (bm - am);
  }).map((monthKey) => {
    const inner = sortWeekKeys(oldGroups[monthKey]).map((week) => `
      <div class="acc-week collapsed">
        <div class="acc-bar" onclick="this.parentElement.classList.toggle('collapsed')"><i class="ti ti-chevron-down hicon"></i> ${weekLabel(week)}</div>
        <div class="acc-body">${rvColHtml('SEO', byWeek[week].SEO, week, prevPlanOf(keys, byWeek, week, 'SEO'))}${rvColHtml('SEM', byWeek[week].SEM, week, prevPlanOf(keys, byWeek, week, 'SEM'))}</div>
      </div>`).join('');
    return `<div class="acc-month collapsed">
      <div class="acc-month-bar" onclick="this.parentElement.classList.toggle('collapsed')"><i class="ti ti-chevron-down hicon"></i> ${monthGroupLabel(monthKey)}</div>
      <div class="acc-month-body">${inner}</div>
    </div>`;
  }).join('');

  acc.innerHTML = currentHtml + groupHtml;
}

async function renderMonthReview() {
  const cur = curMonthKey();
  let items = [];
  try {
    const r = await API.get('/api/weekly-reports?current=' + encodeURIComponent(cur));
    items = r.items || [];
  } catch (e) {}

  const byMonth = {};
  items.filter((it) => parseMonthKey(it.week_key)).forEach((it) => {
    (byMonth[it.week_key] = byMonth[it.week_key] || {})[it.dept] = it;
  });
  if (!byMonth[cur]) byMonth[cur] = {};

  const keys = sortMonthKeys(Object.keys(byMonth));
  const acc = document.getElementById('month-review-acc');
  if (!acc) return;
  acc.innerHTML = keys.map((key) => {
    const collapsed = key !== cur;
    return `<div class="acc-week${collapsed ? ' collapsed' : ''}">
      <div class="acc-bar" onclick="this.parentElement.classList.toggle('collapsed')"><i class="ti ti-chevron-down hicon"></i> ${monthLabel(key)} ${key === cur ? '<span class="badge b-green" style="margin-left:6px">本月</span>' : ''}</div>
      <div class="acc-body">${rvColHtml('SEO', byMonth[key].SEO, key, null, RV_MONTH_SECTIONS)}${rvColHtml('SEM', byMonth[key].SEM, key, null, RV_MONTH_SECTIONS)}</div>
    </div>`;
  }).join('');
}

function rvSectionSave(sec) {
  if (!sec) return;
  const field = sec.dataset.field;
  const dept = sec.dataset.dept;
  const week = sec.dataset.week;
  const items = [...sec.querySelectorAll('.rv-list .txt')].map((t) => t.innerText.trim()).filter(Boolean);
  API.put('/api/weekly-reports', { week_key: week, dept, field, items }).catch((err) => toast(err.status === 403 ? '无权修改' : '保存失败'));
}

function rvAdd(el) {
  const sec = el.closest('.rv-sec');
  const list = sec.querySelector('.rv-list');
  const isMonth = !!parseMonthKey(sec.dataset.week);
  const sections = isMonth ? RV_MONTH_SECTIONS : RV_SECTIONS;
  const acts = (sections.find((s) => s[0] === sec.dataset.field) || [])[2] || [];
  const tmp = document.createElement('div');
  tmp.innerHTML = rvItemHtml('', acts);
  const node = tmp.firstChild;
  list.appendChild(node);
  const t = node.querySelector('.txt');
  if (t) t.focus();
}

function rvDel(el) {
  const sec = el.closest('.rv-sec');
  el.closest('.rv-item').remove();
  rvSectionSave(sec);
}

async function rvAct(el, kind) {
  const item = el.closest('.rv-item');
  const text = item.querySelector('.txt').innerText.trim();
  if (!text) {
    toast('请先填写内容');
    return;
  }
  const sec = el.closest('.rv-sec');
  const s = sFromDept(sec.dataset.dept);
  try {
    if (kind === '测试') {
      await persistLoop('test', s, text, '观察中');
      addTest(s, text);
      toastGo('已加入测试登记 · 已入库', 'test');
    } else {
      await persistLoop('deposit', s, text, '采纳');
      addDeposit(s, text, '采纳');
      toastGo('已采纳 → 沉淀表 · 已入库', 'deposit');
    }
  } catch (e) {
    toast(persistFailMsg(e));
  }
}

document.addEventListener('focusout', (e) => {
  const t = e.target.closest && e.target.closest('#review-acc .rv-list .txt, #month-review-acc .rv-list .txt');
  if (!t) return;
  rvSectionSave(t.closest('.rv-sec'));
});
