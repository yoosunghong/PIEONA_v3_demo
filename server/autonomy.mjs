import {z} from 'zod';
import {id} from './store.mjs';
import {AUTONOMY_LIMITS as LIMITS,DEFAULT_AUTONOMY} from '../shared/autonomy.mjs';
import {CROPS,RECIPES} from '../shared/garden.mjs';
import {FISHING_PERIOD} from '../shared/life.mjs';
import {createGardening} from './gardening.mjs';
import {awardLifeFish} from './lifeRewards.mjs';
import {catchText} from './lifeActions.mjs';

export const autonomySettingsSchema=z.object({enabled:z.boolean(),offline:z.boolean(),fishing:z.boolean(),gardening:z.boolean(),replant:z.boolean(),crop:z.enum(CROPS.map(c=>c.id)),recipe:z.enum(RECIPES.map(r=>r.id)).nullable()}).strict();
export function createAutonomy({store,clock,random,memories,logAction=()=>{}}){
  store.db.exec(`CREATE TABLE IF NOT EXISTS life_autonomy(owner_id TEXT PRIMARY KEY REFERENCES users(id),avatar_slot TEXT NOT NULL,settings TEXT NOT NULL,online INTEGER NOT NULL DEFAULT 0,last_seen INTEGER NOT NULL,offline_since INTEGER,offline_plan TEXT,last_state TEXT NOT NULL DEFAULT 'Idle',pause_until INTEGER NOT NULL DEFAULT 0,next_cook INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS life_offline_reports(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),avatar_slot TEXT NOT NULL,started_at INTEGER NOT NULL,ended_at INTEGER NOT NULL,settled_at INTEGER NOT NULL,result TEXT NOT NULL,acknowledged INTEGER NOT NULL DEFAULT 0,UNIQUE(owner_id,started_at));`);
  let simulated=0;const offlineGarden=createGardening(store,()=>simulated,{recover:false});
  // Never credit time already covered by an online award after the last heartbeat.
  store.run(`UPDATE life_autonomy SET online=0,offline_since=MAX(last_seen,
    COALESCE((SELECT MAX(settled_at) FROM life_sessions WHERE owner_id=life_autonomy.owner_id AND actor_kind='COMPANION' AND COALESCE(avatar_slot,'')=life_autonomy.avatar_slot),0),
    COALESCE((SELECT MAX(completed_at) FROM life_operations WHERE owner_id=life_autonomy.owner_id AND actor='COMPANION' AND status='completed' AND COALESCE(avatar_slot,'')=life_autonomy.avatar_slot),0)),offline_plan=settings WHERE online=1`);
  const owner=uid=>store.one('SELECT nickname,active_slot FROM users WHERE id=?',uid);
  function ensure(uid){let row=store.one('SELECT * FROM life_autonomy WHERE owner_id=?',uid);if(!row){store.run('INSERT INTO life_autonomy(owner_id,avatar_slot,settings,last_seen) VALUES(?,?,?,?)',uid,owner(uid).active_slot||'',JSON.stringify(DEFAULT_AUTONOMY),clock());row=store.one('SELECT * FROM life_autonomy WHERE owner_id=?',uid);}return row;}
  const settings=uid=>JSON.parse(ensure(uid).settings);
  function settle(uid){
    const initial=ensure(uid);if(initial.offline_since===null)return null;
    let report;
    store.transaction(()=>{
      const row=ensure(uid);if(row.offline_since===null)return;
      const policy=JSON.parse(row.offline_plan||row.settings),from=row.offline_since,end=Math.max(from,Math.min(clock(),from+LIMITS.offlineMs)),counts={fishAttempts:0,harvests:0,cooks:0,planted:0},earned=[],consumed=[];
      const allowed=policy.enabled&&policy.offline&&row.avatar_slot===(owner(uid).active_slot||'');
      let time=from,sid=null,cycle=0;const replants=[];
      if(allowed)for(let steps=0;steps<600&&time<end;steps++){
        simulated=time;const plots=offlineGarden.plots(uid);let action=null,duration=LIMITS.workMs;
        const ready=policy.gardening&&counts.harvests<LIMITS.harvests&&plots.find(p=>p.state==='Ready'&&!p.reserved);
        const empty=policy.gardening&&policy.replant&&counts.harvests<LIMITS.harvests&&plots.find(p=>p.state==='Empty'&&!p.reserved);
        if(ready)action={intent:'HARVEST_CROP',plot:ready.id,plantingId:ready.plantingId};
        else if(empty)action={intent:'PLANT_SEED',plot:empty.id,crop:replants.find(p=>p.id===empty.id)?.crop||policy.crop};
        else if(policy.recipe&&counts.cooks<LIMITS.cooks){try{offlineGarden.plan(uid,{intent:'COOK_FOOD',recipe:policy.recipe});action={intent:'COOK_FOOD',recipe:policy.recipe};}catch(e){if(!e.status)throw e;}}
        if(action){
          if(time+duration>end)break;time+=duration;simulated=time;
          const op=offlineGarden.prepare(uid,id(),action,'COMPANION'),result=offlineGarden.complete(op);if(!result.ok)throw new Error(result.reply);
          memories.operation(op,result,time);earned.push(...(result.items||[]));consumed.push(...(result.consumed||[]));
          if(action.intent==='HARVEST_CROP'){counts.harvests++;replants.push({id:ready.id,crop:ready.cropId});}
          else if(action.intent==='COOK_FOOD')counts.cooks++;else counts.planted++;
        }else if(policy.fishing&&counts.fishAttempts<LIMITS.fishAttempts){
          if(time+FISHING_PERIOD>end)break;time+=FISHING_PERIOD;counts.fishAttempts++;
          if(!sid){sid=id();const user=owner(uid);store.run("INSERT INTO life_sessions(id,owner_id,actor_id,actor_kind,actor_name,avatar_slot,anchor_id,started_at,settled_at,stopped_at,status) VALUES(?,?,?,'COMPANION',?,?,'offline',?,?,?,'stopped')",sid,uid,uid,user.nickname+' · AI',row.avatar_slot,from,from,end);}
          const session=store.one('SELECT * FROM life_sessions WHERE id=?',sid),fish=awardLifeFish(store,session,++cycle,time,random,memories,false,'offline_fishing');if(fish)earned.push({itemId:fish.itemId,quantity:1});
          store.run('UPDATE life_sessions SET settled_at=?,attempts=attempts+1,caught=caught+? WHERE id=?',time,fish?1:0,sid);
        }else{
          const next=policy.gardening&&counts.harvests<LIMITS.harvests?Math.min(...plots.filter(p=>p.state==='Growing').map(p=>p.readyAt)):Infinity;
          if(!Number.isFinite(next)||next<=time||next>=end)break;time=next;
        }
      }
      const result={...counts,items:earned,consumed,elapsedMs:Math.max(0,clock()-from),creditedMs:allowed?Math.max(0,end-from):0,capped:clock()-from>LIMITS.offlineMs,reply:allowed?`네가 없는 동안 ${earned.length?catchText(earned)+'를 획득했어.':'획득한 아이템은 없어.'}${consumed.length?' 요리에 '+catchText(consumed)+'를 사용했어.':''} 씨앗 ${counts.planted}칸을 심었어. 현재 수량은 보관함에서 확인해 줘.`:'오프라인 활동이 꺼져 있어서 추가 작업을 하지 않았어. 작물의 성장은 계속됐어.'};
      // Receipt, all rewards, consumed ingredients, crops and checkpoint commit together.
      if(allowed&&clock()>from){const rid=id();store.run('INSERT INTO life_offline_reports(id,owner_id,avatar_slot,started_at,ended_at,settled_at,result) VALUES(?,?,?,?,?,?,?)',rid,uid,row.avatar_slot,from,end,clock(),JSON.stringify(result));report={id:rid,...result};}
      store.run('UPDATE life_autonomy SET offline_since=NULL,offline_plan=NULL,last_seen=? WHERE owner_id=?',Math.max(from,clock()),uid);
    });
    if(report){logAction(uid,'offline_settled',{reportId:report.id,fishAttempts:report.fishAttempts,harvests:report.harvests,cooks:report.cooks});for(const item of report.items)logAction(uid,'offline_inventory_gain',{actor:'COMPANION',reportId:report.id,...item});for(const item of report.consumed)logAction(uid,'offline_inventory_spend',{actor:'COMPANION',reportId:report.id,...item});}
    return report;
  }
  function arrive(uid){const report=settle(uid);ensure(uid);store.run('UPDATE life_autonomy SET online=1,last_seen=?,pause_until=? WHERE owner_id=?',clock(),clock()+1000,uid);return report;}
  function depart(uid,state){const row=ensure(uid);if(!row.online)return;store.run('UPDATE life_autonomy SET online=0,last_seen=?,offline_since=?,offline_plan=settings,last_state=? WHERE owner_id=?',clock(),clock(),state||'Idle',uid);}
  function configure(uid,patch){settle(uid);const value=autonomySettingsSchema.parse({...settings(uid),...patch});store.run('UPDATE life_autonomy SET settings=?,avatar_slot=?,pause_until=? WHERE owner_id=?',JSON.stringify(value),owner(uid).active_slot||'',clock()+1000,uid);logAction(uid,'autonomy_settings',value);return value;}
  function pause(uid){ensure(uid);store.run('UPDATE life_autonomy SET pause_until=? WHERE owner_id=?',clock()+LIMITS.onlinePauseMs,uid);}
  function disable(uid){settle(uid);const row=ensure(uid),value={...JSON.parse(row.settings),enabled:false,offline:false};store.run('UPDATE life_autonomy SET settings=? WHERE owner_id=?',JSON.stringify(value),uid);}
  function heartbeat(uid,state){const row=ensure(uid);if(row.online&&clock()-row.last_seen>=5000)store.run('UPDATE life_autonomy SET last_seen=?,last_state=? WHERE owner_id=?',clock(),state,uid);}
  function plan(uid,garden){const row=ensure(uid),policy=JSON.parse(row.settings);if(!row.online||!policy.enabled||row.pause_until>clock())return null;
    const plots=garden.plots(uid),ready=policy.gardening&&plots.find(p=>p.state==='Ready'&&!p.reserved),empty=policy.gardening&&policy.replant&&plots.find(p=>p.state==='Empty'&&!p.reserved);
    if(ready)return {intent:'HARVEST_CROP',plot:ready.id,plantingId:ready.plantingId};
    if(empty)return {intent:'PLANT_SEED',plot:empty.id,crop:policy.crop};
    if(policy.recipe&&row.next_cook<=clock()){try{garden.plan(uid,{intent:'COOK_FOOD',recipe:policy.recipe});return {intent:'COOK_FOOD',recipe:policy.recipe};}catch(e){if(!e.status)throw e;}}
    return policy.fishing?{intent:'START_FISHING',report:true}:{intent:'REST'};
  }
  function completed(uid,intent){pause(uid);if(intent==='COOK_FOOD')store.run('UPDATE life_autonomy SET next_cook=? WHERE owner_id=?',clock()+600000,uid);}
  function snapshot(uid){const row=ensure(uid);return {settings:JSON.parse(row.settings),limits:LIMITS,lastSeen:row.last_seen,lastState:row.last_state,offlineSince:row.offline_since,reports:store.all('SELECT id,started_at AS startedAt,ended_at AS endedAt,result,acknowledged FROM life_offline_reports WHERE owner_id=? AND avatar_slot=? ORDER BY rowid DESC LIMIT 5',uid,owner(uid).active_slot||'').map(r=>({...r,result:JSON.parse(r.result)}))};}
  return {settings,settle,arrive,depart,configure,pause,disable,heartbeat,plan,completed,snapshot,acknowledge(uid,rid){return store.run('UPDATE life_offline_reports SET acknowledged=1 WHERE id=? AND owner_id=?',rid,uid).changes;}};
}
