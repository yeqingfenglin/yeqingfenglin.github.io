import {PEOPLE,EXERCISES,THEMES,validateOperation,materialize,occurs,personalBests,normalizeBackup,trainingType,sameTrainingType,matchingTraining,catalogue} from './core.mjs?v=20260915-8';
const $=id=>document.getElementById(id), local=window.FITNESS_LOCAL===true;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateString=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today=dateString(new Date());
let date=today,month=new Date(new Date().getFullYear(),new Date().getMonth(),1),viewer='dengjie';
let operations=new Map(),records=[],known=new Set(),client,user,busy=false,syncing=false,active=true,editing=null,historyLimit=60;
let preferenceTimer,preferenceDirty=false,preferenceSerial=0,preferenceSaving=false,localDB;
let detailContext=null;
const status=(message,error=false)=>{$('status').textContent=message;$('status').classList.toggle('error',error);};
const currentRecords=kind=>records.filter(r=>!r.current.deleted&&!r.conflict&&r.current.kind===kind);
const getRecord=id=>records.find(r=>r.id===id);
const settingsId=p=>p==='dengjie'?'00000000-0000-4000-8000-000000000001':'00000000-0000-4000-8000-000000000002';
const PERSON_PALETTES=[['#50765a','#a7617b'],['#487da0','#966892'],['#a85c40','#698052'],['#8664a3','#538783'],['#af627c','#678462'],['#927637','#a16672'],['#3f8774','#92719d'],['#637e95','#977257'],['#94bcec','#d6a9cc'],['#ddbd76','#9bc6b1']];
const FONTS={round:'JournalChinese, "YouYuan", "幼圆", "STYuanti", "Yuanti SC", "Microsoft YaHei", sans-serif',hand:'"KaiTi", "STKaiti", "楷体", cursive',sans:'"Microsoft YaHei", "PingFang SC", sans-serif',serif:'"Songti SC", "SimSun", serif'};
function applyPreferences(theme,font,fontFamily='sans',fontColor='ink'){
 const palette=THEMES[theme]||THEMES[0],pair=PERSON_PALETTES[theme]||PERSON_PALETTES[0],style=document.documentElement.style;
 ['--bg','--paper','--ink','--accent'].forEach((key,i)=>style.setProperty(key,palette[i+1]));
 pair.forEach((color,i)=>style.setProperty('--person-'+(i+1),color));
 const accents=[['#17241f','#cce86d'],['#192d40','#b4daf5'],['#35251f','#f1c78c'],['#292239','#d6c2f3'],['#35212c','#f1bad0'],['#30291e','#e9d294'],['#17352d','#ade6c6'],['#202b36','#bfd1e3'],['#101823','#a9caf5'],['#171612','#e5c780']];
 style.setProperty('--nav',accents[theme]?.[0]||accents[0][0]);style.setProperty('--highlight',accents[theme]?.[1]||accents[0][1]);style.setProperty('--on-accent',theme>=8?'#17211d':'#fff');
 style.setProperty('--font-family',FONTS[fontFamily]||FONTS.round);
 style.setProperty('--text',fontColor==='primary'?'color-mix(in srgb,var(--ink) 72%,var(--person-1))':fontColor==='secondary'?'color-mix(in srgb,var(--ink) 72%,var(--person-2))':'var(--ink)');
 style.fontSize='16px';style.setProperty('--reading-size',font+'px');style.colorScheme=theme>=8?'dark':'light';
 $('theme').value=theme;$('font').value=font;$('font-value').value=font;$('font-family').value=fontFamily;$('font-color').value=fontColor;
}
function personBadge(p){return `<span class="person-badge" data-person="${p}">${p==='dengjie'?'●':'◆'} ${PEOPLE[p]}</span>`;}
function allBests(){return Object.keys(PEOPLE).flatMap(p=>personalBests(records,p));}
function rebuild(){records=materialize([...operations.values()]);if(!preferenceDirty){const setting=getRecord(settingsId(viewer));if(setting&&!setting.current.deleted)applyPreferences(setting.current.value.theme,setting.current.value.font,setting.current.value.appearanceVersion===2?setting.current.value.fontFamily:(setting.current.value.fontFamily==='round'?'sans':setting.current.value.fontFamily||'sans'),setting.current.value.fontColor);}render();}
async function gateway(action,payload={}) {
 const {data:{session}}=await client.auth.getSession();
 if(!session) {lock('登录已失效，请返回内板重新登录。');throw Error('登录已失效');}
 const {data,error}=await client.functions.invoke(window.SITE_CONTENT_CONFIG?.gatewayFunction||'cos-content',{body:{action,...payload},headers:{Authorization:'Bearer '+session.access_token}});
 if(error){let message=error.message;try{message=(await error.context.json()).error||message;}catch{}throw Error(message);}
 if(data?.error)throw Error(data.error);return data;
}
function lock(message){active=false;operations.clear();records=[];$('app').hidden=true;$('gate').hidden=false;$('gate').textContent=message;document.querySelectorAll('#logs,#best-list,#history-list,#plans,#conflicts,#fields').forEach(x=>x.replaceChildren());if($('editor').open)$('editor').close();if($('training-detail').open)$('training-detail').close();detailContext=null;$('detail-content').replaceChildren();}
async function checkAdmin(){const {data,error}=await client.from('profiles').select('username,role,status').eq('id',user.id).single();if(error||data?.role!=='admin'||data?.status!=='approved'){lock('仅已获准的管理员可查看。请返回内板登录。');throw Error('管理员身份验证失败');}return data;}
async function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('training-journal-local',1);req.onupgradeneeded=()=>req.result.createObjectStore('operations',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('无法打开本地储存，请检查浏览器设置'));});}
async function dbRead(){return new Promise((resolve,reject)=>{const req=localDB.transaction('operations').objectStore('operations').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function dbWrite(items){return new Promise((resolve,reject)=>{const tx=localDB.transaction('operations','readwrite');for(const item of items)tx.objectStore('operations').put(item);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('本地储存失败'));});}
async function sync(){
 if(syncing||!active)return;syncing=true;
 try{
  if(local){for(const op of await dbRead())operations.set(op.id,op);}
  else{
   await checkAdmin();let marker='';
   do{const page=await gateway('fitness-list',{marker});if(!active)return;const missing=page.keys.filter(key=>!known.has(key));for(let i=0;i<missing.length;i+=50){const keys=missing.slice(i,i+50),data=await gateway('fitness-read',{keys});if(!active)return;for(const op of data.operations)operations.set(op.id,op);keys.forEach(key=>known.add(key));}marker=page.marker;}while(marker);
  }
  rebuild();status(preferenceDirty?'配色或字号尚未保存，请点击同步重试':`${local?'已储存到本机':'COS 已同步'} · ${new Date().toLocaleTimeString('zh-CN')}`);
 }catch(error){status('同步失败：'+error.message+'。未保存的编辑仍保留，请重试。',true);}finally{syncing=false;}
}
async function append(kind,value,entity=crypto.randomUUID(),parents=[],deleted=false,id=crypto.randomUUID()){
 const operation=validateOperation({id,entity,kind,parents,deleted,value});let saved;
 if(local){saved={...operation,actor:PEOPLE[viewer],at:new Date().toISOString()};await dbWrite([saved]);}
 else {const result=await gateway('fitness-append',{operation});saved=result.operation;known.add(result.key);}
 if(!active)throw Error('登录已失效');operations.set(saved.id,saved);rebuild();status(local?'已保存到本机':'已保存到 COS');return saved;
}
function switchTab(id){const meta={calendar:['TRAINING CALENDAR','训练日历'],daily:['DAILY WORKOUT','每日训练'],bests:['PERSONAL BESTS','最佳成绩'],history:['REVISION HISTORY','修改历史']}[id];$('page-eyebrow').textContent=meta[0];$('page-title').textContent=meta[1];document.querySelectorAll('.panel').forEach(x=>x.hidden=x.id!==id);document.querySelectorAll('[data-tab]').forEach(x=>x.setAttribute('aria-selected',String(x.dataset.tab===id)));}
function selectDate(value){date=value;$('day').value=date;render();}
function description(op){const v=op.value;return `${PEOPLE[v.person]} · ${v.title||v.exercise||v.name||(op.kind==='settings'?'显示设置':'记录')}${v.date?' · '+v.date:''}${op.deleted?' · 已删除':''}`;}
function actionButton(text,action,id){return `<button data-action="${action}" data-id="${id}">${text}</button>`;}
function render(){
 $('month-title').textContent=`${month.getFullYear()}年 ${month.getMonth()+1}月`;$('selected-label').textContent=date+' · 训练计划';
 const plans=currentRecords('plan'),logs=currentRecords('log');
 const chosen=new Date(date+'T12:00:00'),dailyStats=logs.filter(r=>r.current.value.date===date),monthPrefix=dateString(month).slice(0,7),monthLogs=logs.filter(r=>r.current.value.date.startsWith(monthPrefix));
 const monthDays=new Set(monthLogs.map(r=>r.current.value.date)).size;
 $('today-stamp').textContent=new Date(today+'T12:00:00').toLocaleDateString('zh-CN',{month:'long',day:'numeric'});
 $('selected-month').textContent=(chosen.getMonth()+1)+'月';$('selected-day').textContent=chosen.getDate();$('selected-weekday').textContent=chosen.toLocaleDateString('zh-CN',{weekday:'long'});
 $('month-days').innerHTML=monthDays+' <small>天</small>';$('month-progress').style.width=(monthDays/new Date(month.getFullYear(),month.getMonth()+1,0).getDate()*100)+'%';$('month-summary').textContent=`${month.getMonth()+1}月 · 两人共 ${monthLogs.length} 条动作记录`;
 $('stat-actions').textContent=dailyStats.length;$('stat-sets').textContent=dailyStats.reduce((n,r)=>n+r.current.value.sets,0);
 $('stat-volume').innerHTML=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:1}).format(dailyStats.reduce((n,r)=>{const v=r.current.value;return n+v.sets*v.reps*v.weight*(v.unit==='lb'?.45359237:1);},0))+' <small>kg</small>';
 $('stat-people').textContent=new Set(dailyStats.map(r=>r.current.value.person)).size;
 const offset=(new Date(month.getFullYear(),month.getMonth(),1).getDay()+6)%7,total=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
 let html='<div class="day-blank" aria-hidden="true"></div>'.repeat(offset);
 for(let d=1;d<=total;d++){
  const key=dateString(new Date(month.getFullYear(),month.getMonth(),d)),items=plans.filter(r=>occurs(r.current.value,key)),daily=logs.filter(r=>r.current.value.date===key);
  const strips=Object.keys(PEOPLE).map(p=>{
   const pp=items.filter(r=>r.current.value.person===p),ll=daily.filter(r=>r.current.value.person===p),symbol=p==='dengjie'?'●':'◆';
   const chip=(type,completed=false)=>`<button class="plan-chip ${completed?'completed':''}" data-person="${p}" data-detail-type="${esc(type)}" data-detail-date="${key}" title="${esc(PEOPLE[p]+' · '+type+' · 点击查看动作')}" aria-label="${esc(PEOPLE[p]+'，'+key+'，'+type+'，查看动作')}"><b>${symbol}</b> ${completed?'✓ ':''}${esc(type)}</button>`;
   const planned=[...new Set(pp.map(r=>r.current.value.title))];
   const completed=[...new Set(ll.map(r=>trainingType(r.current.value)))].filter(type=>!planned.some(title=>sameTrainingType(title,type)));
   return planned.map(type=>chip(type)).join('')+completed.map(type=>chip(type,true)).join('');
  }).join('');
  html+=`<div class="day-cell ${key===date?'selected':''} ${key===today?'is-today':''}" data-date="${key}"><button class="day-number" data-select-date="${key}" aria-label="${key}，${items.length}项计划，${daily.length}项训练" aria-pressed="${key===date}">${d}${key===today?'<small>今天</small>':''}</button><div class="day-strips">${strips}</div></div>`;
 }
 html+='<div class="day-blank" aria-hidden="true"></div>'.repeat((7-(offset+total)%7)%7);
 $('month-grid').innerHTML=html;
 $('plans').innerHTML=plans.filter(r=>occurs(r.current.value,date)).map(r=>`<div class="record plan-record" data-person="${r.current.value.person}"><div>${personBadge(r.current.value.person)}<strong>${esc(r.current.value.title)}</strong><small>${r.current.value.interval?'每隔 '+r.current.value.interval+' 天 · 从 '+r.current.value.date+' 至 '+(r.current.value.end||'长期'):'仅当天'}</small></div><div class="row">${actionButton('编辑','edit',r.id)}${actionButton('删除'+(r.current.value.interval?'整个系列':''),'delete',r.id)}</div></div>`).join('')||'<div class="empty">给今天安排一点运动吧。</div>';
 $('logs').innerHTML=logs.filter(r=>r.current.value.date===date).map(r=>{const v=r.current.value;return `<tr data-person="${v.person}"><td>${personBadge(v.person)}</td><td>${esc(trainingType(v))}</td><td>${esc(v.category)}</td><td><strong>${esc(v.exercise)}</strong></td><td>${v.sets}</td><td>${v.reps}</td><td>${v.weight} ${v.unit}</td><td>${actionButton('编辑','edit',r.id)} ${actionButton('删除','delete',r.id)}</td></tr>`;}).join('')||'<tr><td colspan="8" class="empty">还没有训练记录。完成一组，就是新的开始。</td></tr>';
 $('best-list').innerHTML=allBests().map(v=>`<article class="best-card" data-person="${v.person}">${personBadge(v.person)}<small>${esc(v.category)} · ${v.manual?'手动修正':'自动记录'}</small><h3>${esc(v.exercise)}</h3><div class="best-number">${v.weight} <small>${v.unit}</small></div><p>${v.reps} 次 · ${v.date}</p><button data-best-person="${v.person}" data-best="${esc(v.category+' / '+v.exercise)}">修正成绩</button>${v.manual?' '+actionButton('恢复自动','delete',v.entity):''}</article>`).join('')||'<div class="empty">添加训练后，你的个人最佳会出现在这里。</div>';
 const conflicts=records.filter(r=>r.conflict);$('conflicts').hidden=!conflicts.length;
 $('conflicts').innerHTML=conflicts.length?`<strong>${conflicts.length} 条记录有同时编辑的版本</strong><p>两个版本都已保留。核对后选择采用的版本；也可先导出备份。</p>`+conflicts.map(r=>`<div class="conflict-item">${r.heads.map(op=>`<div><strong>${esc(op.actor)} · ${esc(description(op))}</strong><pre>${esc(JSON.stringify(op.value,null,2))}</pre><button data-resolve="${op.id}" data-entity="${r.id}">采用此版本${op.deleted?'（删除）':''}</button></div>`).join('')}</div>`).join(''):'';
 const history=[...operations.values()].sort((a,b)=>(b.at||'').localeCompare(a.at||'')||b.id.localeCompare(a.id));
 $('history-list').innerHTML=history.slice(0,historyLimit).map(op=>`<div class="record"><div><strong>${esc(description(op))}</strong><small>${esc(op.actor)} · ${esc(op.at?new Date(op.at).toLocaleString('zh-CN'):'导入记录')}</small><details><summary>查看内容</summary><pre>${esc(JSON.stringify(op.value,null,2))}</pre></details></div>${actionButton('恢复此内容','restore',op.id)}</div>`).join('')||'<div class="empty">还没有修改历史。</div>';
 $('more-history').hidden=history.length<=historyLimit;
 if($('training-detail').open)renderDetail();
 if($('editor').open)refreshPickers();
}
function renderDetail(){
 if(!detailContext)return;const {person:who,date:when,type}=detailContext;
 const matches=matchingTraining(records,who,when,type);
 $('detail-person').innerHTML=personBadge(who);$('detail-title').textContent=type;$('detail-date').textContent=when;
 $('detail-content').innerHTML=matches.length?`<div class="detail-summary"><strong>${matches.length} 个动作记录</strong><span>共 ${matches.reduce((n,r)=>n+r.current.value.sets,0)} 组</span></div><div class="table-wrap"><table><thead><tr><th>动作</th><th>身体部位</th><th>组数</th><th>每组次数</th><th>重量</th><th>操作</th></tr></thead><tbody>${matches.map(r=>{const v=r.current.value;return `<tr data-person="${who}"><td>${esc(v.exercise)}</td><td>${esc(v.category)}</td><td>${v.sets}</td><td>${v.reps}</td><td>${v.weight} ${v.unit}</td><td><button data-detail-edit="${r.id}">编辑</button></td></tr>`;}).join('')}</tbody></table></div>`:'<div class="empty">这一天还没有登记此类型的动作。<br>点击下方“登记动作”，或在每日训练中把动作的训练类型设为上方名称。</div>';
}
function openDetail(who,when,type){detailContext={person:who,date:when,type};selectDate(when);renderDetail();$('training-detail').showModal();}
function typeSuggestions(){const form=$('edit-form'),who=form.elements.person.value||editing.person,when=form.elements.date?.value||date;
 const titles=records.filter(r=>!r.conflict&&!r.current.deleted&&r.current.kind==='plan'&&r.current.value.person===who&&occurs(r.current.value,when)).map(r=>r.current.value.title);
 $('training-types').innerHTML=[...new Set([...titles,...catalogue(records).categories.map(c=>c+'训练')])].map(title=>`<option value="${esc(title)}"></option>`).join('');
}
function field(name,label,type,value,extra=''){return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
function choices(name,label,values,value){return `<label>${label}<select name="${name}">${values.map(x=>`<option value="${esc(x)}" ${x===value?'selected':''}>${esc(x)}</option>`).join('')}</select></label>`;}
function picker(name,label,value){return `<div class="catalog-picker" data-picker="${name}"><span id="${name}-label">${label}</span><input type="hidden" name="${name}" value="${esc(value)}"><button type="button" class="catalog-trigger" aria-labelledby="${name}-label ${name}-chosen" aria-expanded="false" aria-controls="${name}-menu"><span id="${name}-chosen"></span><span>⌄</span></button><div id="${name}-menu" class="catalog-menu" hidden><div class="catalog-options"></div><div class="catalog-create" hidden><label>自定义${label}<input class="catalog-name" maxlength="100" placeholder="输入名称"></label><div class="row"><button type="button" data-catalog-save>添加</button><button type="button" data-catalog-cancel>取消</button></div></div></div></div>`;}
function refreshPickers(){
 const cat=catalogue(records),form=$('edit-form');
 form.querySelectorAll('[data-picker]').forEach(box=>{
  const key=box.dataset.picker,options=key==='category'?cat.categories:cat.exercises(form.elements.category.value),selected=form.elements[key].value;
  box.querySelector('.catalog-trigger span').textContent=selected||'请选择';
  box.querySelector('.catalog-options').innerHTML=options.map(name=>`<div class="catalog-option"><button type="button" data-catalog-select="${esc(name)}" aria-pressed="${name===selected}">${esc(name)}</button><button type="button" class="catalog-delete" data-catalog-delete="${esc(name)}" aria-label="永久删除${esc(name)}选项" title="永久移除此选项">×</button></div>`).join('')+'<button type="button" class="catalog-custom" data-catalog-custom>＋ 自定义</button>';
 });
}
async function catalogEntity(role,category,name){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['catalogue',role,category,name]))),hex=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;}
async function saveOption(role,category,name,deleted=false){
 const entity=await catalogEntity(role,category,name),r=getRecord(entity);
 await append('exercise',{person:viewer,category,name,catalogRole:role},entity,r?.heads.map(x=>x.id)||[],deleted);
}
function selectOption(key,name){
 const form=$('edit-form');form.elements[key].value=name;
 if(key==='category'&&form.elements.exercise)form.elements.exercise.value=catalogue(records).exercises(name)[0]||'';
 refreshPickers();if(editing.kind==='log')typeSuggestions();
}
$('fields').addEventListener('click',async event=>{
 const button=event.target.closest('button'),box=button?.closest('[data-picker]');if(!box||busy)return;
 const key=box.dataset.picker,menu=box.querySelector('.catalog-menu'),trigger=box.querySelector('.catalog-trigger'),form=$('edit-form');
 if(button===trigger||button.closest('.catalog-trigger')){menu.hidden=!menu.hidden;trigger.setAttribute('aria-expanded',String(!menu.hidden));return;}
 if(button.hasAttribute('data-catalog-select')){selectOption(key,button.dataset.catalogSelect);menu.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus();return;}
 if(button.hasAttribute('data-catalog-custom')){box.querySelector('.catalog-create').hidden=false;box.querySelector('.catalog-name').focus();return;}
 if(button.hasAttribute('data-catalog-cancel')){box.querySelector('.catalog-create').hidden=true;return;}
 const deleting=button.hasAttribute('data-catalog-delete');if(!deleting&&!button.hasAttribute('data-catalog-save'))return;
 const name=(deleting?button.dataset.catalogDelete:box.querySelector('.catalog-name').value).trim(),category=key==='category'?name:form.elements.category.value;
 if(!name||!category){$('form-error').textContent='请先填写名称并选择身体部位。';return;}
 if(deleting&&!confirm(`永久从两人的选项中移除“${name}”？已有训练记录会保留。`))return;
 busy=true;$('save').disabled=true;$('form-error').textContent='';
 try{await saveOption(key,category,name,deleting);if(!deleting){selectOption(key,name);box.querySelector('.catalog-name').value='';box.querySelector('.catalog-create').hidden=true;menu.hidden=true;trigger.setAttribute('aria-expanded','false');}else if(form.elements[key].value===name){selectOption(key,'');}await sync();}
 catch(error){$('form-error').textContent=error.message+'；选项未确认保存，请重试。';}
 finally{busy=false;$('save').disabled=false;}
});
$('fields').addEventListener('keydown',event=>{const box=event.target.closest('[data-picker]');if(!box)return;if(event.key==='Escape'&&!box.querySelector('.catalog-menu').hidden){event.preventDefault();event.stopPropagation();box.querySelector('.catalog-menu').hidden=true;box.querySelector('.catalog-trigger').setAttribute('aria-expanded','false');box.querySelector('.catalog-trigger').focus();}if(event.key==='Enter'&&event.target.matches('.catalog-name')){event.preventDefault();box.querySelector('[data-catalog-save]').click();}});
function openEditor(kind,record=null,initial=null){
 const cat=catalogue(records),defaultCategory=cat.categories[0]||'';
 const value=initial||record?.current.value||{person:viewer,date,title:'',interval:0,end:'',category:defaultCategory,exercise:cat.exercises(defaultCategory)[0]||'',sets:3,reps:10,weight:0,unit:'kg',name:''};
 editing={kind,entity:record?.id||crypto.randomUUID(),parents:record?.heads.map(x=>x.id)||[],person:value.person,id:crypto.randomUUID(),bases:new Map(records.map(r=>[r.id,r.heads.map(x=>x.id)]))};
 $('dialog-title').textContent=({plan:'训练计划',log:'训练动作',exercise:'自定义动作',best:'修正个人最佳',settings:'显示设置'})[kind];
 let html=kind==='settings'?`<p class="wide muted">${PEOPLE[value.person]} 的显示设置</p>`:`<fieldset class="wide person-picker"><legend>谁的训练</legend>${Object.keys(PEOPLE).map(p=>`<label data-person="${p}"><input type="radio" name="person" value="${p}" ${p===value.person?'checked':''} ${record&&kind==='best'?'disabled':''}>${personBadge(p)}</label>`).join('')}</fieldset>`;
 if(kind==='plan')html+=field('title','训练项目','text',value.title,'required maxlength="200"')+field('date','开始日期','date',value.date,'required')+field('interval','每隔多少天一次（0 = 仅当天）','number',value.interval,'min="0" max="3650" step="1" required')+field('end','结束日期（可不填）','date',value.end||'')+'<p class="wide muted">例如每隔 2 天：9 月 1 日、3 日、5 日。编辑会修改整个重复系列。</p>';
 else if(kind==='settings')html+=field('font','字号','number',value.font,'min="14" max="22" required')+field('theme','配色编号 0–9','number',value.theme,'min="0" max="9" required');
 else {
  html+=picker('category','身体部位',value.category);
  if(kind==='exercise')html+=field('name','新动作名称','text',value.name,'required maxlength="100"');
  else {html+=picker('exercise','动作名称',value.exercise)+field('date','日期','date',value.date,'required');if(kind==='log')html+=field('sets','组数','number',value.sets,'min="1" max="1000" step="1" required');html+=field('reps','每组次数','number',value.reps,'min="1" max="10000" step="1" required')+field('weight','重量','number',value.weight,'min="0" max="5000" step="0.01" required')+choices('unit','重量单位',['kg','lb'],value.unit);}
 }
 if(kind==='log')html+=field('trainingType','训练类型（可选择当天计划或自填）','text',value.trainingType||'', 'list="training-types" maxlength="200" placeholder="留空按身体部位匹配，如背部训练"')+'<datalist id="training-types"></datalist>';
 $('fields').innerHTML=html;$('form-error').textContent='';$('editor').showModal();
 if(kind==='log'){typeSuggestions();$('edit-form').elements.date.onchange=typeSuggestions;$('edit-form').querySelectorAll('[name=person]').forEach(input=>input.onchange=typeSuggestions);}
 refreshPickers();const category=$('edit-form').elements.category;if(category)category.onchange=()=>selectOption('category',category.value);
}
async function submit(event){event.preventDefault();if(busy)return;busy=true;$('save').disabled=true;$('form-error').textContent='';
 try{const values=Object.fromEntries(new FormData($('edit-form')));values.person=values.person||editing.person;for(const key of ['interval','sets','reps','weight','font','theme'])if(key in values)values[key]=Number(values[key]);
  if(editing.kind==='best'){
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([values.person,values.category,values.exercise])));
   const hex=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
   editing.entity=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
   editing.parents=editing.bases.get(editing.entity)||[];
  }
  const payload=JSON.stringify(values);if(editing.lastPayload&&editing.lastPayload!==payload)editing.id=crypto.randomUUID();editing.lastPayload=payload;
  if(editing.kind==='exercise')await saveOption('exercise',values.category,values.name.trim());else await append(editing.kind,values,editing.entity,editing.parents,false,editing.id);$('editor').close();await sync();
 }catch(error){$('form-error').textContent=error.message+'；内容仍保留，可重试。';}finally{busy=false;$('save').disabled=false;}
}
async function mutateButton(button,task){if(busy)return;busy=true;button.disabled=true;try{await task();await sync();}catch(error){status(error.message,true);}finally{busy=false;button.disabled=false;}}
async function savePreferences(){
 if(!preferenceDirty||!active||preferenceSaving)return;const serial=preferenceSerial;preferenceSaving=true;
 const value={person:viewer,theme:Number($('theme').value),font:Number($('font').value),fontFamily:$('font-family').value,fontColor:$('font-color').value,cnFontVersion:1,appearanceVersion:2};const record=getRecord(settingsId(viewer));
 try{await append('settings',value,settingsId(viewer),record?.heads.map(x=>x.id)||[]);if(serial===preferenceSerial)preferenceDirty=false;}catch(error){status('显示设置尚未保存：'+error.message+'；点击同步重试。',true);}finally{preferenceSaving=false;if(serial!==preferenceSerial)savePreferences();}
}
function exportBackup(){const blob=new Blob([JSON.stringify({format:'training-journal',version:1,operations:[...operations.values()]},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='training-journal-'+today+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function initialize(){
 try{
  $('theme').innerHTML=THEMES.map((t,i)=>`<option value="${i}">${t[0]}</option>`).join('');$('day').value=date;
  if(local){localDB=await openDB();$('gate').textContent='正在读取本地记录…';$('back').textContent='运动记录本 · 本地版';$('back').removeAttribute('href');$('mode-label').textContent='数据保存在当前浏览器 · 请定期导出备份';$('import-label').hidden=false;}
  else {if(!window.supabase||!window.SITE_SUPABASE_CONFIG)throw Error('登录组件未加载，请检查网络并刷新');const cfg=window.SITE_SUPABASE_CONFIG;client=window.supabase.createClient(cfg.url,cfg.publishableKey);const {data:{session}}=await client.auth.getSession();if(!session)throw Error('请先返回内板登录管理员账号');user=session.user;const profile=await checkAdmin();viewer=profile.username.normalize('NFKC').trim().toLowerCase()==='lena11'?'wangboning':'dengjie';client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')lock('你已退出登录。请返回内板重新登录。');});}
  applyPreferences(0,16);$('gate').hidden=true;$('app').hidden=false;render();await sync();setInterval(()=>{if(!document.hidden)sync();},10000);
 }catch(error){lock(error.message);const link=document.createElement('a');link.href='../';link.textContent=' 返回内板';$('gate').appendChild(link);}
}
document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>switchTab(button.dataset.tab));
$('prev').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);render();};$('next').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);render();};$('today').onclick=()=>{month=new Date(new Date().getFullYear(),new Date().getMonth(),1);selectDate(today);};
$('day').onchange=()=>{if($('day').value)selectDate($('day').value);};
$('open-daily').onclick=()=>switchTab('daily');$('add-plan').onclick=()=>openEditor('plan');$('add-log').onclick=()=>openEditor('log');$('add-exercise').onclick=()=>openEditor('exercise');$('add-best').onclick=()=>openEditor('best');
$('close-dialog').onclick=$('cancel').onclick=()=>{if(!busy)$('editor').close();};$('editor').addEventListener('cancel',event=>{if(busy)event.preventDefault();});$('edit-form').onsubmit=submit;
$('refresh').onclick=async()=>{await savePreferences();await sync();};$('export').onclick=exportBackup;
for(const id of ['theme','font','font-family','font-color'])$(id).oninput=()=>{preferenceDirty=true;preferenceSerial++;applyPreferences(Number($('theme').value),Number($('font').value),$('font-family').value,$('font-color').value);clearTimeout(preferenceTimer);preferenceTimer=setTimeout(savePreferences,700);};
$('close-detail').onclick=()=>$('training-detail').close();
$('detail-daily').onclick=()=>{$('training-detail').close();selectDate(detailContext.date);switchTab('daily');};
$('detail-add').onclick=()=>{const v=detailContext,cat=catalogue(records),category=cat.categories.find(c=>sameTrainingType(c,v.type))||cat.categories[0]||'';$('training-detail').close();openEditor('log',null,{person:v.person,date:v.date,trainingType:v.type,category,exercise:cat.exercises(category)[0]||'',sets:3,reps:10,weight:0,unit:'kg'});};
$('more-history').onclick=()=>{historyLimit+=60;render();};
document.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.dataset.selectDate)selectDate(button.dataset.selectDate);
 if(button.dataset.detailType){openDetail(button.dataset.person,button.dataset.detailDate,button.dataset.detailType);return;}
 if(button.dataset.detailEdit){const r=getRecord(button.dataset.detailEdit);$('training-detail').close();openEditor('log',r);return;}
 if(button.dataset.best){const v=personalBests(records,button.dataset.bestPerson).find(v=>v.category+' / '+v.exercise===button.dataset.best);openEditor('best',v.entity?getRecord(v.entity):null,v);}
 if(button.dataset.action){const action=button.dataset.action;
  if(action==='edit')openEditor(getRecord(button.dataset.id).current.kind,getRecord(button.dataset.id));
  if(action==='delete'){const r=getRecord(button.dataset.id);if(confirm(r.current.kind==='best'?'取消手动修正，恢复自动计算？':'删除此记录？重复计划将删除整个系列，历史仍保留。'))mutateButton(button,()=>append(r.current.kind,r.current.value,r.id,r.heads.map(x=>x.id),true));}
  if(action==='restore'){const op=operations.get(button.dataset.id);if(confirm('将此历史内容恢复为新版本？')){const r=getRecord(op.entity);mutateButton(button,()=>append(op.kind,op.value,op.entity,r.heads.map(x=>x.id),false));}}
 }
 if(button.dataset.resolve){const r=getRecord(button.dataset.entity),op=operations.get(button.dataset.resolve);mutateButton(button,()=>append(op.kind,op.value,r.id,r.heads.map(x=>x.id),op.deleted));}
});
$('import').onchange=async()=>{const file=$('import').files[0];if(!file)return;try{if(file.size>20*1024*1024)throw Error('备份不能超过 20 MB');const data=JSON.parse(await file.text());const items=normalizeBackup(data,[...operations.values()]);await dbWrite(items);await sync();status('备份已合并导入');}catch(error){status('导入失败：'+error.message,true);}finally{$('import').value='';}};
window.addEventListener('beforeunload',event=>{if(busy||preferenceDirty||$('editor').open){event.preventDefault();event.returnValue='';}});
initialize();
