/* Settings page: persisted KPI targets and account password changes. */
import { TOTAL, SEO, SEM, applyKpiServer } from './kpi.js';
import { renderKPI } from './kpi-view.js';
import { withRange } from './timerange.js';
import { validateEditableValue, setSavingState, rollbackEditable, showSaveError } from './editable.js';

export function bindSettings(){
  document.querySelectorAll('#panel-settings [data-kpi]').forEach(el=>{
    if(el.dataset.settingsBound==='1')return;
    el.dataset.settingsBound='1';
    el.addEventListener('focusin',()=>{ el.dataset.kpiOld=el.textContent; });
    const commit=async()=>{
      if(!can('kpiTarget')){
        rollbackEditable(el,el.dataset.kpiOld!=null?el.dataset.kpiOld:el.textContent);
        toast('仅老板/主管可改 KPI 目标');
        return;
      }
      const parts=el.dataset.kpi.split(':');
      const values=({TOTAL,SEO,SEM})[parts[0]];
      const item=values&&values[Number(parts[1])];
      if(!item)return;
      const oldValue=el.dataset.kpiOld!=null?el.dataset.kpiOld:String(item.t);
      const result=validateEditableValue(el.textContent,'number',{min:0});
      if(!result.ok){
        rollbackEditable(el,oldValue);
        showSaveError(el,result.msg);
        return;
      }
      if(result.value===item.t){
        el.textContent=String(result.value);
        setSavingState(el,null);
        return;
      }
      setSavingState(el,'saving');
      try{
        const {rows}=await API.put(withRange('/api/kpi-targets'),{updates:[{id:item.id,target:result.value}]});
        applyKpiServer(rows);
        renderKPI();
        el.textContent=String(item.t);
        el.dataset.kpiOld=String(item.t);
        setSavingState(el,'ok');
        toast('已更新「'+item.n+'」目标 → '+item.t+' · 已入库, 评分已重算');
      }catch(error){
        rollbackEditable(el,oldValue);
        showSaveError(el,error.status===403?'仅老板可改 KPI 目标':'保存失败，已恢复旧值');
      }
    };
    el.addEventListener('blur',commit);
    el.addEventListener('keydown',event=>{
      if(event.key==='Enter'){
        event.preventDefault();
        el.blur();
      }
    });
  });
}

export function openPwd(){
  ['pwd-old','pwd-new','pwd-new2'].forEach(id=>{
    const input=document.getElementById(id);
    if(input)input.value='';
  });
  openModal('pwdMask');
}

export async function submitPwd(){
  const oldPassword=document.getElementById('pwd-old').value;
  const newPassword=document.getElementById('pwd-new').value;
  const confirmation=document.getElementById('pwd-new2').value;
  if(!oldPassword||!newPassword){ toast('请填写当前密码与新密码'); return; }
  if(newPassword.length<6){ toast('新密码至少 6 位'); return; }
  if(newPassword!==confirmation){ toast('两次输入的新密码不一致'); return; }
  try{
    await API.post('/api/change-password',{oldPassword,newPassword});
    closeModal('pwdMask');
    toast('密码已修改，下次登录用新密码');
  }catch(error){
    toast(error.status===401?'当前密码不正确':'修改失败：'+error.message);
  }
}
