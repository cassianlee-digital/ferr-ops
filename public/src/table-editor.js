/* Shared persistence and keyboard behavior for data-field table cells. */
import { rollbackEditable, placeCaretEnd } from './editable.js';

const EDITABLE_CELL='td[contenteditable][data-field]';
const DATE_INPUT='input.cell-date[data-field]';
let tableEditorBound=false;

function closest(target,selector){
  return target&&target.closest?target.closest(selector):null;
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
  try{
    await API.patch(endpoint+'/'+id,{[cell.dataset.field]:value});
    cell._old=value;
  }catch(error){
    rollbackEditable(cell,oldValue);
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
