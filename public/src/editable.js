/* Shared helpers for contenteditable fields. */
export function validateEditableValue(raw, type, opts){
  opts=opts||{};
  if(type==='number'){
    const s=String(raw==null?'':raw).trim();
    if(s==='') return {ok:false,msg:opts.emptyMsg||'KPI 目标值不能为空'};
    if(!/^\d+(\.\d+)?$/.test(s)) return {ok:false,msg:'请输入有效数字'};
    const value=Number(s);
    if(!Number.isFinite(value)) return {ok:false,msg:'请输入有效数字'};
    if(opts.min!=null&&value<opts.min) return {ok:false,msg:opts.minMsg||'KPI 目标值不能为负数'};
    return {ok:true,value};
  }
  const value=String(raw==null?'':raw).trim();
  if(opts.nonempty&&value==='') return {ok:false,msg:opts.emptyMsg||'内容不能为空'};
  return {ok:true,value};
}

export function setSavingState(el,state){
  if(!el)return;
  el.classList.remove('kpi-saving','kpi-ok','kpi-error');
  if(state==='saving')el.classList.add('kpi-saving');
  else if(state==='ok'){
    el.classList.add('kpi-ok');
    setTimeout(()=>el.classList.remove('kpi-ok'),1200);
  }else if(state==='error'){
    el.classList.add('kpi-error');
    setTimeout(()=>el.classList.remove('kpi-error'),2000);
  }
}

export function rollbackEditable(el,oldValue){
  if(el)el.textContent=oldValue==null?'':String(oldValue);
}

export function showSaveError(el,msg){
  setSavingState(el,'error');
  toast(msg);
}

export function placeCaretEnd(el){
  try{
    const range=document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection=getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }catch(e){}
}
