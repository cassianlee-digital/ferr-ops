/* Shared persistence and keyboard behavior for data-field table cells. */
import { toast } from './ui-kit.js';
import { rollbackEditable, placeCaretEnd, setSavingState } from './editable.js';

const EDITABLE_CELL='td[contenteditable][data-field]';
const DATE_INPUT='input.cell-date[data-field]';
let tableEditorBound=false;

function closest(target,selector){
  return target&&target.closest?target.closest(selector):null;
}

// 单元格存盘状态复用 KPI 那套已有样式（saving 黄 / ok 绿 / error 红）。
// classList 守卫是必需的：node --test 里 cell 是纯对象，没有 DOM。
function markCell(cell,state){
  if(cell&&cell.classList)setSavingState(cell,state);
}

/* 存盘成功后广播 cellsaved：列表模块据此同步自己的行缓存。
   不广播的后果就是「填了又不见」——列表用缓存整表重画（筛选/翻页/加跟进反馈）时，
   刚敲进去、库里其实已经存下的值会被旧缓存覆盖回空白。detail.item 是服务端回的整行（若接口返回）。
   失败时也发一条（ok:false + 回滚后的旧值）：这一格可能已经被重画替换掉，
   光把 DOM 滚回去不够，缓存里那个没存成的值也得跟着滚回去。 */
function announceCellSaved(detail){
  if(typeof document==='undefined'||!document.dispatchEvent||typeof CustomEvent!=='function')return;
  try{ document.dispatchEvent(new CustomEvent('cellsaved',{detail})); }catch(error){}
}

/* 重画表格前调用：把「正在编辑、还没失焦」的单元格先提交掉。
   tbody 一旦被 innerHTML='' 换掉，浏览器不会给已移除的节点补发 focusout，
   用户刚敲的字连一次保存机会都没有。blur() 是同步的，会立刻走下面那条保存链路。 */
export function commitPendingCellEdit(root){
  if(typeof document==='undefined')return;
  const active=document.activeElement;
  if(!active||!root||!root.contains||!root.contains(active))return;
  if(!closest(active,EDITABLE_CELL))return;
  active.blur();
}

function setCellBusy(cell,busy,previousEditable){
  if(busy){
    cell.setAttribute('contenteditable','false');
    cell.setAttribute('aria-busy','true');
    return;
  }
  if(previousEditable==null)cell.removeAttribute('contenteditable');
  else cell.setAttribute('contenteditable',previousEditable);
  cell.removeAttribute('aria-busy');
}

function setDateInputsBusy(inputs,busy){
  inputs.forEach(input=>{
    if(busy){
      input._tableEditorWasDisabled=input.disabled;
      input.disabled=true;
      input.setAttribute('aria-busy','true');
    }else{
      input.disabled=Boolean(input._tableEditorWasDisabled);
      delete input._tableEditorWasDisabled;
      input.removeAttribute('aria-busy');
    }
  });
}

function dateFieldValue(inputs){
  return inputs.length===2
    ? (inputs[0].value||'')+'~'+(inputs[1].value||'')
    : inputs[0].value;
}

function handleFocusIn(event){
  const cell=closest(event.target,EDITABLE_CELL);
  if(cell){ cell._old=cell.innerText; return; }
  const input=closest(event.target,DATE_INPUT);
  if(input)input._oldValue=input.value;
}

async function handleDateChange(event){
  const input=closest(event.target,DATE_INPUT);
  if(!input)return;
  const row=input.closest('tr');
  const endpoint=row&&row.dataset.ep;
  const id=row&&row.dataset.id;
  if(!endpoint||!id)return;
  const container=input.closest('td');
  const inputs=[...container.querySelectorAll('input.cell-date')];
  const oldValue=input._oldValue!=null?input._oldValue:input.defaultValue;
  setDateInputsBusy(inputs,true);
  try{
    await API.patch(endpoint+'/'+id,{[input.dataset.field]:dateFieldValue(inputs)});
    inputs.forEach(item=>{
      item._oldValue=item.value;
      item.defaultValue=item.value;
    });
    toast('已保存 · 已入库');
  }catch(error){
    input.value=oldValue||'';
    toast(error&&error.status===403?'无权修改，已恢复旧值':'保存失败，已恢复旧值');
  }finally{
    setDateInputsBusy(inputs,false);
  }
}

async function handleFocusOut(event){
  const cell=closest(event.target,EDITABLE_CELL);
  if(!cell)return;
  const row=cell.closest('tr');
  const id=row&&row.dataset.id;
  const endpoint=row&&row.dataset.ep;
  if(!id||!endpoint)return;
  const value=cell.innerText.trim();
  const oldValue=cell._old!=null?cell._old:cell.innerText;
  if(value===String(oldValue).trim())return;
  const previousEditable=cell.getAttribute('contenteditable');
  setCellBusy(cell,true,previousEditable);
  markCell(cell,'saving');
  try{
    const response=await API.patch(endpoint+'/'+id,{[cell.dataset.field]:value});
    cell._old=value;
    markCell(cell,'ok'); // 之前存盘完全没回执，用户没法判断到底存没存
    announceCellSaved({ok:true,endpoint,id,field:cell.dataset.field,value,item:response&&response.item});
  }catch(error){
    rollbackEditable(cell,oldValue);
    markCell(cell,'error');
    announceCellSaved({ok:false,endpoint,id,field:cell.dataset.field,value:String(oldValue==null?'':oldValue).trim()});
    toast(error&&error.status===403?'无权修改，已恢复旧值':'保存失败，已恢复旧值');
  }finally{
    setCellBusy(cell,false,previousEditable);
  }
}

function handleKeyDown(event){
  const cell=closest(event.target,'td[contenteditable]');
  if(!cell)return;
  const table=cell.closest('table');
  if(!table)return;
  if(event.key==='Tab'){
    event.preventDefault();
    const cells=[...table.querySelectorAll('td[contenteditable]')];
    const current=cells.indexOf(cell);
    const next=cells[current+(event.shiftKey?-1:1)];
    if(next){ cell.blur(); next.focus(); placeCaretEnd(next); }
    return;
  }
  if(cell.classList.contains('mkt-ans'))return;
  if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
  const direction=event.key==='ArrowDown'?'nextElementSibling':'previousElementSibling';
  const column=cell.cellIndex;
  let row=cell.parentElement[direction];
  while(row){
    const next=row.cells&&row.cells[column];
    if(next&&next.isContentEditable){
      event.preventDefault();
      cell.blur();
      next.focus();
      placeCaretEnd(next);
      return;
    }
    row=row[direction];
  }
}

export function bindTableEditor(){
  if(tableEditorBound)return;
  tableEditorBound=true;
  document.addEventListener('focusin',handleFocusIn);
  document.addEventListener('change',handleDateChange);
  document.addEventListener('focusout',handleFocusOut);
  document.addEventListener('keydown',handleKeyDown);
}
