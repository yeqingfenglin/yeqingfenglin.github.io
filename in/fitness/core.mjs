export const PEOPLE = { dengjie: 'Jie Deng', wangboning: 'Boning Wang' };
export const EXERCISES = { 胸部: ['杠铃卧推','哑铃卧推','上斜卧推','俯卧撑','绳索夹胸'], 背部: ['引体向上','高位下拉','杠铃划船','坐姿划船','硬拉'], 肩部: ['推举','侧平举','面拉'], 手臂: ['哑铃弯举','锤式弯举','绳索下压'], 腿部: ['深蹲','腿举','保加利亚分腿蹲','腿弯举','提踵'], 核心: ['卷腹','悬垂举腿','健腹轮'], 全身: ['波比跳','壶铃摆动'] };
export const THEMES = [
 ['苔绿','#eef2e9','#ffffff','#193b30','#496c43'],['海盐蓝','#edf3f8','#ffffff','#203849','#306d96'],
 ['赤陶','#f8eee6','#fffcf8','#4f342b','#ad5337'],['薰衣草','#f2eef8','#ffffff','#403253','#7961a5'],
 ['玫瑰','#faedf1','#fffafb','#54323e','#a94c70'],['暖沙','#f6f1e4','#fffdf7','#443e29','#866b28'],
 ['薄荷','#eaf7f2','#ffffff','#22483e','#277b63'],['石墨','#eceff2','#ffffff','#303940','#526372'],
 ['午夜','#141f2c','#203043','#eef5ff','#90bff1'],['黑金','#211f1a','#302d26','#fff3d5','#e2bd64']
];
export function dayNumber(date) { return Date.parse(date+'T00:00:00Z')/86400000; }
export function validDate(date) { return typeof date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(dayNumber(date)) && new Date(dayNumber(date)*86400000).toISOString().slice(0,10)===date; }
const uuid = value => typeof value==='string' && /^[a-f0-9-]{36}$/.test(value);
export function validateOperation(input) {
 if (!input || !uuid(input.id) || !uuid(input.entity) || !['plan','log','exercise','best','settings'].includes(input.kind)) throw Error('记录格式不正确');
 if (!Array.isArray(input.parents) || input.parents.length>100 || input.parents.some(x=>!uuid(x))) throw Error('版本格式不正确');
 if (typeof input.deleted!=='boolean') throw Error('删除标记不正确');
 const v=input.value;
 if (!v || typeof v!=='object' || Array.isArray(v)) throw Error('内容不正确');
 const text=(key,max=100)=>{if(typeof v[key]!=='string'||!v[key].trim()||v[key].length>max)throw Error('请填写有效的'+key);};
 const num=(key,min,max,integer=false)=>{if(typeof v[key]!=='number'||!Number.isFinite(v[key])||v[key]<min||v[key]>max||(integer&&!Number.isInteger(v[key])))throw Error(key+' 数值不正确');};
 if (!PEOPLE[v.person]) throw Error('请选择记录所属人');
 if (input.kind==='plan') { text('title',200); if(!validDate(v.date)|| (v.end && (!validDate(v.end)||v.end<v.date)))throw Error('日期不正确');num('interval',0,3650,true); }
 if (input.kind==='log'||input.kind==='best') {text('exercise');text('category');num('weight',0,5000);num('reps',1,10000,true);if(!['kg','lb'].includes(v.unit))throw Error('重量单位不正确');if(!validDate(v.date))throw Error('日期不正确'); if(input.kind==='log')num('sets',1,1000,true);}
 if(input.kind==='log'&&v.trainingType!==undefined&&(typeof v.trainingType!=='string'||v.trainingType.length>200))throw Error('训练类型不正确');
 if (input.kind==='exercise') { text('name');text('category'); }
 if (input.kind==='settings') { num('theme',0,9,true);num('font',14,22,true);if(v.fontFamily!==undefined&&!['round','hand','sans','serif'].includes(v.fontFamily))throw Error('字体选项不正确');if(v.fontColor!==undefined&&!['ink','primary','secondary'].includes(v.fontColor))throw Error('字色选项不正确'); }
 if (JSON.stringify(input).length>12000)throw Error('记录过大');
 return {id:input.id,entity:input.entity,kind:input.kind,parents:[...new Set(input.parents)],deleted:input.deleted,value:JSON.parse(JSON.stringify(v))};
}
// Immutable revisions form a DAG. Concurrent heads remain visible until explicitly resolved.
export function materialize(operations) {
 const groups=new Map();
 for(const op of operations) { if(!groups.has(op.entity))groups.set(op.entity,[]);groups.get(op.entity).push(op); }
 return [...groups].map(([id,versions])=>{
   const superseded=new Set(versions.flatMap(x=>x.parents));
   const heads=versions.filter(x=>!superseded.has(x.id)).sort((a,b)=>(a.at||'').localeCompare(b.at||'')||a.id.localeCompare(b.id));
   return {id,versions,heads,current:heads.at(-1),conflict:heads.length>1};
 }).filter(x=>x.current);
}
export function occurs(plan,date) {
 const delta=dayNumber(date)-dayNumber(plan.date);
 return delta>=0 && (!plan.end||date<=plan.end) && (plan.interval===0?delta===0:delta%plan.interval===0);
}
export function kilograms(value) {return value.unit==='lb'?value.weight*0.45359237:value.weight;}
export function trainingType(value){return String(value.trainingType||'').trim()||value.category+'训练';}
export function sameTrainingType(a,b){
 const normalize=x=>String(x||'').normalize('NFKC').replace(/\s+/g,'').replace(/训练$/,'');
 return normalize(a)===normalize(b);
}
export function matchingTraining(records,person,date,type){
 return records.filter(r=>!r.conflict&&!r.current.deleted&&r.current.kind==='log'&&r.current.value.person===person&&r.current.value.date===date&&sameTrainingType(trainingType(r.current.value),type));
}
export function normalizeBackup(data,existing=[]) {
 if(data?.format!=='training-journal'||data.version!==1||!Array.isArray(data.operations)||data.operations.length>50000)throw Error('不是有效的运动记录备份');
 const all=new Map(existing.map(op=>[op.id,op])),result=[];
 for(const op of data.operations){
  const clean={...validateOperation(op),actor:String(op.actor||'导入').slice(0,100),at:typeof op.at==='string'&&Number.isFinite(Date.parse(op.at))?op.at:new Date().toISOString()};
  const old=all.get(clean.id);
  if(old){if(JSON.stringify(validateOperation(old))!==JSON.stringify(validateOperation(clean)))throw Error('备份存在重复编号但内容不同的记录');continue;}
  all.set(clean.id,clean);result.push(clean);
 }
 for(const op of all.values())for(const parent of op.parents){const prior=all.get(parent);if(!prior||prior.entity!==op.entity||prior.kind!==op.kind||prior.id===op.id)throw Error('备份版本关系不完整或不正确');}
 const visiting=new Set(),done=new Set();
 function visit(id){if(done.has(id))return;if(visiting.has(id))throw Error('备份版本关系存在循环');visiting.add(id);for(const parent of all.get(id).parents)visit(parent);visiting.delete(id);done.add(id);}
 for(const id of all.keys())visit(id);
 return result;
}
export function personalBests(records,person) {
 const result=new Map();
 for(const r of records.filter(x=>!x.conflict&&!x.current.deleted&&x.current.value.person===person&&x.current.kind==='log')) {
  const v=r.current.value,key=v.category+' / '+v.exercise,previous=result.get(key);
  if(!previous||kilograms(v)>kilograms(previous)||kilograms(v)===kilograms(previous)&&v.reps>previous.reps)result.set(key,{...v,manual:false});
 }
 for(const r of records.filter(x=>!x.conflict&&!x.current.deleted&&x.current.value.person===person&&x.current.kind==='best'))result.set(r.current.value.category+' / '+r.current.value.exercise,{...r.current.value,manual:true,entity:r.id});
 return [...result.values()];
}
