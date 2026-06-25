/* 否词库 / 广告创意库 录入（拆分自 index.html · 阶段4-A）
   经典 script + window 全局兼容。依赖（运行时解析）：esc()、prepend()、placeCaretEnd()、toast()、window.API（index.html 内联）。
   negRowHtml/adRowHtml 也被 hydrate() 在运行时调用。 */

/* ================= 否词库 / 广告创意库 录入 ================= */
const NEG_KEY='ferr:negs', AD_KEY='ferr:ads';
const NEGMATCH_BADGE={'精确':'b-green','词组':'b-blue','广泛':'b-amber'};
const NEGSTATUS_BADGE={'生效':'b-green','观察':'b-amber','已移除':'b-gray'};
const ADSTATUS_BADGE={'采用中':'b-green','测试中':'b-amber','已弃用':'b-gray'};
function negRowHtml(r){return `<td class="editable" contenteditable data-field="word">${esc(r.word)}</td><td class="ctr"><span class="tagselect ${NEGMATCH_BADGE[r.match_type]||'b-blue'}" data-kind="negmatch">${esc(r.match_type||'词组')}<i class="ti ti-chevron-down"></i></span></td><td class="editable" contenteditable data-field="added_date">${esc(r.added_date||'')}</td><td class="editable" contenteditable data-field="reason" style="font-size:11px">${esc(r.reason||'')}</td><td class="editable" contenteditable data-field="source_campaign">${esc(r.source_campaign||'')}</td><td class="ctr"><span class="tagselect ${NEGSTATUS_BADGE[r.status]||'b-green'}" data-kind="negstatus">${esc(r.status||'生效')}<i class="ti ti-chevron-down"></i></span></td>`;}
function adRowHtml(r){return `<td class="editable" contenteditable data-field="title">${esc(r.title)}</td><td class="editable dim" contenteditable data-field="description" style="font-size:11px">${esc(r.description||'')}</td><td class="editable" contenteditable data-field="ctr">${esc(r.ctr||'')}</td><td class="editable dim" contenteditable data-field="ab_conclusion" style="font-size:11px">${esc(r.ab_conclusion||'')}</td><td class="ctr"><span class="tagselect ${ADSTATUS_BADGE[r.status]||'b-amber'}" data-kind="adstatus">${esc(r.status||'测试中')}<i class="ti ti-chevron-down"></i></span></td>`;}
// 去弹窗化：直接新增可编辑空行（POST 默认值后原地编辑）
async function addNeg(){
  try{
    const {item}=await API.post('/api/neg-keywords',{word:'新否词',reason:''});
    prepend('tb-neg',negRowHtml(item)); const tr=document.getElementById('tb-neg').firstChild; tr.dataset.id=item.id; tr.dataset.ep='/api/neg-keywords';
    const c=tr.querySelector('[data-field="word"]'); if(c){c.focus();placeCaretEnd(c);}
    toast('已加一行 · 直接在表格里改');
  }catch(e){ toast(e.status===403?'无权操作':'保存失败：'+e.message); }
}
async function addAd(){
  try{
    const {item}=await API.post('/api/ad-creatives',{title:'新创意',description:''});
    prepend('tb-ad',adRowHtml(item)); const tr=document.getElementById('tb-ad').firstChild; tr.dataset.id=item.id; tr.dataset.ep='/api/ad-creatives';
    const c=tr.querySelector('[data-field="title"]'); if(c){c.focus();placeCaretEnd(c);}
    toast('已加一行 · 直接在表格里改');
  }catch(e){ toast(e.status===403?'无权操作':'保存失败：'+e.message); }
}
