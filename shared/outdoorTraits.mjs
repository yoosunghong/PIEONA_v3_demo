// Content-independent, evidence-based learning. Forest and future sea expeditions
// use the same vocabulary; only authoritative gameplay may record observations.
export const OUTDOOR_TRAITS={curiosity:{name:'호기심',effect:'새 장소와 다양한 활동에 관심'},persistence:{name:'꾸준함',effect:'시작한 일을 마무리하는 경향'},courage:{name:'도전성',effect:'새로운 도전에 다가가는 경향'},cooperation:{name:'협동성',effect:'함께 활동하는 경향'}};
export const emptyOutdoorProfile=()=>({values:Object.fromEntries(Object.keys(OUTDOOR_TRAITS).map(k=>[k,50])),day:'',daily:{}});
export function startOutdoorTrip(s,time,content='forest'){
 s.outdoorTrip={id:`${content}:${time}:${(s.tripSequence=(s.tripSequence||0)+1)}`,content,startedAt:time,inventory:{...s.inventory},blueprints:[...s.blueprints],cells:[],completed:{},cooperative:[]};
 return s.outdoorTrip;
}
export function observeOutdoorMove(s){const t=s.outdoorTrip;if(!t)return;const cell=`${Math.floor(s.position.x/6)},${Math.floor(s.position.z/6)}`;if(!t.cells.includes(cell)&&t.cells.length<100)t.cells.push(cell);}
export function observeOutdoorCompletion(s,node,cooperative=false){const t=s.outdoorTrip;if(!t)return;t.completed[node.id]=node.type;if(cooperative&&!t.cooperative.includes(node.id))t.cooperative.push(node.id);}
export function finishOutdoorTrip(s,time,fainted=false){
 const t=s.outdoorTrip;if(!t||s.lastExpedition?.id===t.id)return s.lastExpedition;
 const profile=s.outdoorProfile||=emptyOutdoorProfile(),day=new Date(time+9*3600000).toISOString().slice(0,10);if(profile.day!==day){profile.day=day;profile.daily={};}
 const types=Object.values(t.completed),variety=new Set(types.filter(v=>v!=='slime')).size;
 const evidence={curiosity:{points:Math.floor(t.cells.length/4)+Math.floor(variety/2),reason:`새 구역 ${t.cells.length}곳 · 활동 ${variety}종`},persistence:{points:types.filter(v=>['wood','stone'].includes(v)).length,reason:`벌목·채광 ${types.filter(v=>['wood','stone'].includes(v)).length}곳 완료`},courage:{points:types.filter(v=>v==='slime').length,reason:`도전 대상 ${types.filter(v=>v==='slime').length}곳 완료`},cooperation:{points:t.cooperative.length,reason:`실제 친구 가까이에서 활동 ${t.cooperative.length}곳 완료`}};
 const traits=Object.entries(OUTDOOR_TRAITS).map(([key,meta])=>{const before=profile.values[key],e=evidence[key],delta=Math.max(0,Math.min(3,e.points,3-(profile.daily[key]||0),100-before));profile.values[key]=before+delta;profile.daily[key]=(profile.daily[key]||0)+delta;return {key,...meta,before,after:before+delta,delta,evidence:e.reason,capped:e.points>delta};});
 return s.lastExpedition={id:t.id,content:t.content,startedAt:t.startedAt,endedAt:time,fainted,items:Object.fromEntries(Object.keys(s.inventory).map(k=>[k,Math.max(0,s.inventory[k]-(t.inventory[k]||0))])),blueprints:s.blueprints.filter(k=>!t.blueprints.includes(k)),traits};
}
// Outdoor observations gently bias existing avatar dimensions (at most 10%).
// The approved speech style and saved script versions remain intact.
export function outdoorPersona(persona,profile){if(!profile)return persona;const v=profile.values||{};return {...persona,curiosity:Math.max(0,Math.min(1,persona.curiosity+((v.curiosity??50)-50)/500)),activity:Math.max(0,Math.min(1,persona.activity+((v.courage??50)+(v.persistence??50)-100)/1000)),sociability:Math.max(0,Math.min(1,persona.sociability+((v.cooperation??50)-50)/500))};}
