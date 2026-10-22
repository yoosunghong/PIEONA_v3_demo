import {DEFAULT_AUTONOMY} from '../shared/autonomy.mjs';
import {createAutonomy,autonomySettingsSchema} from './autonomy.mjs';
import {createLifeMemories} from './lifeMemories.mjs';
import {awardLifeFish} from './lifeRewards.mjs';
import {randomInt} from 'node:crypto';
import {id} from './store.mjs';
import {FISHING_ANCHORS,FISHING_PERIOD,INTERACTION_REACH,ALL_ITEMS} from '../shared/life.mjs';
import {createGardening} from './gardening.mjs';
import {z} from 'zod';
import {lifeActionSchema,catchText,koreanDayStart} from './lifeActions.mjs';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function installLife({app,io,store,auth,sessionUser,villageVisitors,emitVillage,busy,logAction=()=>{},clock=Date.now,random=()=>randomInt(0,0x100000000)/0x100000000}){
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS life_sessions (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), actor_id TEXT NOT NULL REFERENCES users(id),
      anchor_id TEXT NOT NULL, started_at INTEGER NOT NULL, settled_at INTEGER NOT NULL, stopped_at INTEGER, status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, caught INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS inventory_entries (owner_id TEXT NOT NULL REFERENCES users(id), item_id TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>=0), PRIMARY KEY(owner_id,item_id));
    CREATE TABLE IF NOT EXISTS acquisition_events (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), item_id TEXT NOT NULL, quantity INTEGER NOT NULL, acquired_by TEXT NOT NULL REFERENCES users(id), source TEXT NOT NULL, timestamp INTEGER NOT NULL, session_id TEXT NOT NULL REFERENCES life_sessions(id), cycle INTEGER NOT NULL, UNIQUE(session_id,cycle));
    CREATE INDEX IF NOT EXISTS acquisitions_owner ON acquisition_events(owner_id,timestamp);
    CREATE TABLE IF NOT EXISTS fish_discoveries (owner_id TEXT NOT NULL REFERENCES users(id), item_id TEXT NOT NULL, discovered_at INTEGER NOT NULL, acquired_by TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(owner_id,item_id));
  `);
  // Additive migration: existing Phase 1 catches remain PLAYER records.
  const columns=new Set(store.all('PRAGMA table_info(life_sessions)').map(c=>c.name));
  store.transaction(()=>{
    for(const [name,definition] of [['actor_kind',"TEXT NOT NULL DEFAULT 'PLAYER'"],['actor_name',"TEXT NOT NULL DEFAULT ''"],['avatar_slot','TEXT'],['task_limit','INTEGER']])if(!columns.has(name))store.db.exec(`ALTER TABLE life_sessions ADD COLUMN ${name} ${definition}`);
    store.db.exec(`DROP INDEX IF EXISTS life_active_actor; DROP INDEX IF EXISTS life_active_anchor;
      CREATE UNIQUE INDEX life_active_actor ON life_sessions(actor_id,actor_kind) WHERE status IN ('moving','active');
      CREATE UNIQUE INDEX life_active_anchor ON life_sessions(owner_id,anchor_id) WHERE status IN ('moving','active');`);
    store.run("UPDATE life_sessions SET status='stopped',stopped_at=settled_at WHERE status IN ('moving','active')");
  });
  const companions=new Map(),routes=new Map(),epochs=new Map(),jobs=new Map(),automatic=new Set(),rests=new Map(),greetings=new Map(),wanderNext=new Set();
  const memories=createLifeMemories(store),autonomy=createAutonomy({store,clock,random,memories,logAction});
  const gardening=createGardening(store,clock,{onComplete:memories.operation}),jobKey=(uid,kind)=>`${uid}:${kind}`;
  const task=(uid,kind)=>{const job=jobs.get(jobKey(uid,kind));return job?{id:job.op.id,actor:kind,intent:job.op.intent,state:memberFor(uid,kind)?.activityState,label:job.label}:null;};
  const epoch=uid=>epochs.get(uid)||0;
  const active=(uid,kind='PLAYER')=>store.one("SELECT * FROM life_sessions WHERE actor_id=? AND actor_kind=? AND status IN ('moving','active')",uid,kind);
  const itemsFor=sid=>store.all('SELECT item_id AS itemId,SUM(quantity) AS quantity FROM acquisition_events WHERE session_id=? GROUP BY item_id ORDER BY item_id',sid);
  const memberFor=(uid,kind)=>kind==='COMPANION'?companions.get(uid):villageVisitors.get(uid)?.get(uid);
  const owner=uid=>store.one('SELECT * FROM users WHERE id=?',uid);
  function viewSession(s){return s?{id:s.id,state:s.status==='moving'?'Moving':'Fishing',actor:s.actor_kind,anchorId:s.anchor_id,startedAt:s.started_at,nextAt:s.status==='active'?s.settled_at+FISHING_PERIOD:null,attempts:s.attempts,caught:s.caught,taskLimit:s.task_limit,items:itemsFor(s.id)}:null;}
  function snapshot(uid){
    const last=store.one("SELECT * FROM life_sessions WHERE owner_id=? AND actor_kind='COMPANION' AND status='stopped' ORDER BY rowid DESC LIMIT 1",uid);
    return {serverTime:clock(),autonomy:autonomy.snapshot(uid),relationshipMemories:memories.list(uid,owner(uid).active_slot),session:viewSession(active(uid)),task:task(uid,'PLAYER'),garden:gardening.snapshot(uid),companion:{state:companions.get(uid)?.activityState||'Idle',task:task(uid,'COMPANION'),session:viewSession(active(uid,'COMPANION')),lastReport:last?{endedAt:last.stopped_at,attempts:last.attempts,caught:last.caught,items:itemsFor(last.id)}:null}};
  }
  function publish(uid,results=[],notice){io.to(`user:${uid}`).emit('life:state',{...snapshot(uid),results,...(notice?{notice}:{})});}
  function companionMembers(uid){const member=companions.get(uid);return member?[{...member,nickname:`${owner(uid).nickname} · AI`,runnerBusy:true}]:[];}
  function ensureCompanion(uid){if(!companions.has(uid))companions.set(uid,{userId:`companion:${uid}`,ownerId:uid,actorKind:'COMPANION',x:1.1,z:0,rotation:0,moving:false,seatId:null,activityState:'Idle'});return companions.get(uid);}
  function settle(uid,kind='PLAYER'){
    const s=active(uid,kind);if(!s||s.status!=='active')return [];
    const elapsed=Math.floor((clock()-s.settled_at)/FISHING_PERIOD),count=Math.min(elapsed,s.task_limit?s.task_limit-s.attempts:elapsed);if(count<=0)return [];
    const results=[];
    store.transaction(()=>{
      for(let i=1;i<=count;i++){
        const timestamp=s.settled_at+i*FISHING_PERIOD,cycle=s.attempts+i;
        const joint=!!store.one("SELECT 1 FROM life_sessions WHERE owner_id=? AND actor_kind=? AND status IN ('active','stopped') AND started_at<=? AND (stopped_at IS NULL OR stopped_at>=?) LIMIT 1",uid,kind==='PLAYER'?'COMPANION':'PLAYER',timestamp,timestamp);
        const fish=awardLifeFish(store,s,cycle,timestamp,random,memories,joint);
        results.push({cycle,actor:kind,itemId:fish?.itemId||null});
      }
      store.run('UPDATE life_sessions SET settled_at=?,attempts=attempts+?,caught=caught+? WHERE id=?',s.settled_at+count*FISHING_PERIOD,count,results.filter(r=>r.itemId).length,s.id);
    });
    for(const result of results)logAction(uid,'fishing_result',{actor:kind,sessionId:s.id,itemId:result.itemId,quantity:result.itemId?1:0});
    return results;
  }
  function finish(uid,kind,s){
    logAction(uid,'fishing_stop',{actor:kind,sessionId:s.id});
    routes.delete(s.id);store.run("UPDATE life_sessions SET status='stopped',stopped_at=? WHERE id=?",clock(),s.id);
    const member=memberFor(uid,kind);
    if(member){if(member.seatId||member.z>5.5)member.z=5.3;Object.assign(member,{seatId:null,moving:false,jumpStarted:0,activityState:'Idle'});}
  }
  function stop(uid,kind='PLAYER',pause=true){
    if(pause)logAction(uid,'life_stop',{actor:kind});
    if(kind!=='PLAYER'){if(pause)autonomy.disable(uid);automatic.delete(uid);rests.delete(uid);wanderNext.delete(uid);}
    epochs.set(uid,epoch(uid)+1);const kinds=kind==='BOTH'?['PLAYER','COMPANION']:[kind],results=[],items=[];
    for(const actor of kinds){const s=active(uid,actor);if(!s)continue;results.push(...settle(uid,actor));items.push(...itemsFor(s.id));finish(uid,actor,s);}
    for(const actor of kinds){const key=jobKey(uid,actor),job=jobs.get(key);if(job){gardening.cancel(job.op);jobs.delete(key);const member=memberFor(uid,actor);if(member)Object.assign(member,{moving:false,activityState:'Idle'});}}
    publish(uid,results);emitVillage(uid);return items;
  }
  function leave(uid){const state=companions.get(uid)?.activityState||'Idle';stop(uid,'BOTH',false);autonomy.depart(uid,state);companions.delete(uid);emitVillage(uid);}
  function arrive(uid){const report=autonomy.arrive(uid);if(report)publish(uid,[],report.reply);}
  function switchAvatar(uid){autonomy.settle(uid);stop(uid,'BOTH');autonomy.configure(uid,DEFAULT_AUTONOMY);companions.delete(uid);}
  function preempt(uid){if(automatic.has(uid))stop(uid,'COMPANION',false);autonomy.pause(uid);}
  function occupied(uid){return new Set([...store.all("SELECT anchor_id FROM life_sessions WHERE owner_id=? AND status IN ('moving','active')",uid).map(s=>s.anchor_id),...[...(villageVisitors.get(uid)?.values()||[])].map(m=>m.seatId).filter(Boolean)]);}
  function insertSession(uid,kind,anchor,moving,report=false){
    const user=owner(uid),time=clock();
    store.run('INSERT INTO life_sessions(id,owner_id,actor_id,actor_kind,actor_name,avatar_slot,anchor_id,started_at,settled_at,status,task_limit) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id(),uid,uid,kind,`${user.nickname}${kind==='COMPANION'?' · AI':''}`,user.active_slot,anchor.id,time,time,moving?'moving':'active',report?3:null);
    const session=active(uid,kind);logAction(uid,'fishing_start',{actor:kind,sessionId:session.id});return session;
  }
  function start(uid,anchorId,villageId){
    if(villageId!==uid)fail(403,'지금은 내 마을에서만 낚시할 수 있어요.');
    if(active(uid))return snapshot(uid);
    const member=memberFor(uid,'PLAYER'),anchor=FISHING_ANCHORS.find(a=>a.id===anchorId);
    if(!member||!anchor)fail(400,'낚시 자리 가까이에서 다시 시도해 주세요.');
    if(busy(uid)||member.seatId||member.jumpStarted&&clock()-member.jumpStarted<720)fail(409,'진행 중인 활동을 마친 뒤 낚시해 주세요.');
    if(Math.hypot(member.x-anchor.x,member.z-anchor.z)>INTERACTION_REACH)fail(409,'낚시 자리 가까이로 이동해 주세요.');
    if(occupied(uid).has(anchor.id))fail(409,'이미 사용 중인 자리예요.');
    insertSession(uid,'PLAYER',anchor,false);
    Object.assign(member,{x:anchor.x,z:anchor.z,rotation:anchor.rotation,seatId:anchor.id,moving:false,jumpStarted:0,activityState:'Fishing'});
    publish(uid);emitVillage(uid);return snapshot(uid);
  }
  function walk(uid,kind,s){
    const member=kind==='COMPANION'?ensureCompanion(uid):memberFor(uid,kind),anchor=FISHING_ANCHORS.find(a=>a.id===s.anchor_id);
    const points=[{x:member.x,z:member.z},{x:anchor.x,z:5.1},{x:anchor.x,z:anchor.z}];
    const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.z-points[i].z));
    routes.set(s.id,{uid,kind,points,lengths,started:clock()});
    Object.assign(member,{seatId:null,jumpStarted:0,moving:true,activityState:'Moving'});
  }
  function startCompanion(uid,join,report){
    const player=memberFor(uid,'PLAYER');if(!player)fail(409,'내 마을에 접속한 상태에서 부탁해 주세요.');
    if(jobs.has(jobKey(uid,'COMPANION'))||join&&jobs.has(jobKey(uid,'PLAYER')))fail(409,'진행 중인 텃밭·요리 작업을 마치거나 중단해 줘.');
    const ps=active(uid);let cs=active(uid,'COMPANION');
    if(!ps&&(busy(uid)||player.seatId||player.jumpStarted&&clock()-player.jumpStarted<720))fail(409,'진행 중인 활동을 마친 뒤 부탁해 주세요.');
    const adjacent=ps&&cs&&Math.abs(FISHING_ANCHORS.findIndex(a=>a.id===ps.anchor_id)-FISHING_ANCHORS.findIndex(a=>a.id===cs.anchor_id))===1;
    if(cs&&(!join||adjacent))return '이미 낚시를 준비하거나 진행 중이야. 기존 낚시를 계속할게.';
    const used=occupied(uid);let pa=ps&&FISHING_ANCHORS.find(a=>a.id===ps.anchor_id),ca=cs&&FISHING_ANCHORS.find(a=>a.id===cs.anchor_id);
    const relocating=join&&ps&&cs&&!adjacent;
    if(relocating){used.delete(ca.id);ca=null;}
    if(join){
      const pair=FISHING_ANCHORS.slice(0,-1).map((a,i)=>[a,FISHING_ANCHORS[i+1]]).flatMap(pair=>[pair,[...pair].reverse()]).find(([p,c])=>(pa?p.id===pa.id:!used.has(p.id))&&(ca?c.id===ca.id:!used.has(c.id)));
      if(!pair)fail(409,'나란히 앉을 빈 낚시 자리가 없어요.');[pa,ca]=pair;
    }else ca=FISHING_ANCHORS.filter(a=>!used.has(a.id)).sort((a,b)=>Math.hypot(a.x-1.1,a.z)-Math.hypot(b.x-1.1,b.z))[0];
    if(!ca)fail(409,'빈 낚시 자리가 없어요.');
    if(relocating){stop(uid,'COMPANION',false);cs=null;}
    const created=[];
    store.transaction(()=>{if(join&&!ps)created.push(insertSession(uid,'PLAYER',pa,true));if(!cs)created.push(insertSession(uid,'COMPANION',ca,true,report));});
    for(const s of created)walk(uid,s.actor_kind,s);
    publish(uid);emitVillage(uid);
    return join?'좋아! 나란히 앉을 자리를 예약했어. 같이 바다로 이동해서 낚시하자.':report?'바다로 가서 3번 낚시해 볼게. 끝나면 실제로 잡은 물고기를 알려줄게.':'먼저 바다로 가서 낚시할게. 잡은 물고기는 우리 보관함에 넣어 둘게.';
  }
  function query(uid,action){
    if(action.scope==='STORAGE'){
      const items=store.all('SELECT item_id AS itemId,quantity FROM inventory_entries WHERE owner_id=? AND (? IS NULL OR item_id=?) AND quantity>0 ORDER BY item_id',uid,action.item||null,action.item||null);
      return {items,reply:`현재 우리 보관함에는 ${catchText(items)}가 있어.`};
    }
    if(action.source!=='FISHING'){
      const intent=action.source==='HARVEST'?'HARVEST_CROP':'COOK_FOOD',actor=action.actor==='BOTH'?null:action.actor;
      const latest=action.scope==='SESSION'?store.one("SELECT id FROM life_operations WHERE owner_id=? AND intent=? AND status='completed' AND (? IS NULL OR actor=?) ORDER BY completed_at DESC,rowid DESC LIMIT 1",uid,intent,actor,actor)?.id:null;
      const items=action.scope==='SESSION'&&!latest?[]:store.all(`SELECT c.item_id AS itemId,SUM(c.quantity) AS quantity FROM inventory_changes c JOIN life_operations o ON o.id=c.operation_id WHERE c.owner_id=? AND c.quantity>0 AND o.intent=? AND (? IS NULL OR o.actor=?) AND c.timestamp>=? AND c.timestamp<=? AND (? IS NULL OR c.item_id=?) AND (? IS NULL OR o.id=?) GROUP BY c.item_id`,uid,intent,actor,actor,action.scope==='TODAY'?koreanDayStart(clock()):0,clock(),action.item||null,action.item||null,latest,latest);
      return {items,reply:`${action.scope==='TODAY'?'오늘(한국 시간)':action.scope==='SESSION'?'최근 작업에서':'지금까지'} ${action.actor==='PLAYER'?'네가':action.actor==='BOTH'?'우리가':'내가'} ${action.source==='HARVEST'?'수확한':'만든'} 기록은 ${items.length?catchText(items):'0개'}야.`};
    }
    const kinds=action.actor==='BOTH'?['PLAYER','COMPANION']:[action.actor],items=[];
    for(const kind of kinds){
      const latest=action.scope==='SESSION'?store.one('SELECT id FROM life_sessions WHERE owner_id=? AND actor_kind=? ORDER BY rowid DESC LIMIT 1',uid,kind)?.id:null;
      if(action.scope==='SESSION'&&!latest)continue;
      items.push(...store.all(`SELECT e.item_id AS itemId,SUM(e.quantity) AS quantity,s.actor_kind AS actor FROM acquisition_events e JOIN life_sessions s ON s.id=e.session_id
        WHERE e.owner_id=? AND s.actor_kind=? AND e.timestamp>=? AND e.timestamp<=? AND (? IS NULL OR e.item_id=?) AND (? IS NULL OR s.id=?) GROUP BY e.item_id,s.actor_kind ORDER BY e.item_id`,uid,kind,action.scope==='TODAY'?koreanDayStart(clock()):0,clock(),action.item||null,action.item||null,latest,latest));
    }
    const who=action.actor==='BOTH'?'우리가':action.actor==='PLAYER'?'네가':'내가',when=action.scope==='TODAY'?'오늘(한국 시간)':action.scope==='SESSION'?'최근 낚시에서':'지금까지';
    return {items,reply:`${when} ${who} 잡은 기록은 ${catchText(items)}야.${items.length?' 보관함에 저장했어.':' 아직 해당 획득 기록이 없어.'}`};
  }
  function startGardenJob(uid,action,kind,requestId){
    const duplicate=gardening.existing(uid,requestId,action,kind);
    if(duplicate)return {ok:duplicate.status==='pending'||duplicate.status==='completed',intent:action.intent,operationId:duplicate.id,...(duplicate.result?JSON.parse(duplicate.result):{reply:'이미 이동하거나 작업 중이야. 같은 요청은 한 번만 실행할게.'}),...snapshot(uid)};
    const player=memberFor(uid,'PLAYER');if(!player)fail(409,'내 마을에 접속한 상태에서 부탁해 줘.');
    if(jobs.has(jobKey(uid,kind))||!active(uid)&&!jobs.has(jobKey(uid,'PLAYER'))&&(busy(uid)||player.seatId||player.jumpStarted&&clock()-player.jumpStarted<720))fail(409,'진행 중인 활동을 마치거나 중단해 줘.');
    const op=gardening.prepare(uid,requestId,action,kind),plan=JSON.parse(op.plan);
    try{
      if(active(uid,kind))stop(uid,kind,false);
      const member=kind==='COMPANION'?ensureCompanion(uid):player;
      const start={x:member.x,z:member.z},distance=Math.hypot(plan.target.x-start.x,plan.target.z-start.z),arrived=clock()+Math.ceil(distance/2.4*1000);
      const label=action.intent==='COOK_FOOD'?'요리':action.intent==='PLANT_SEED'?'씨앗 심기':'작물 수확';
      jobs.set(jobKey(uid,kind),{op,plan,start,started:clock(),arrived,ends:arrived+2000,label});
      logAction(uid,'life_work_start',{actor:kind,intent:action.intent,operationId:op.id});
      Object.assign(member,{moving:true,seatId:null,jumpStarted:0,activityState:'Moving'});
      publish(uid);emitVillage(uid);return {ok:true,intent:action.intent,operationId:op.id,reply:`${action.intent==='COOK_FOOD'?'조리대':'텃밭'}로 가서 ${label} 작업을 할게. 끝나면 실제 결과를 알려줄게.`,...snapshot(uid)};
    }catch(e){gardening.cancel(op);throw e;}
  }
  function execute(uid,targetId,raw,expectedEpoch=epoch(uid),requestId=id(),forcedActor){
    const parsed=lifeActionSchema.safeParse(raw);
    if(!parsed.success)return {ok:false,intent:'UNSUPPORTED',reply:'이 행동 요청은 처리할 수 없어. 낚시 시작, 같이 낚시하기, 중단, 획득 기록 조회를 부탁해 줘.'};
    const action=parsed.data;
    try{
      if(targetId!==uid)fail(403,'생활 행동과 보관함 조회는 내 AI 아바타에게만 부탁할 수 있어요.');
      autonomy.settle(uid);
      if(action.intent==='QUERY_AUTONOMY'){return {ok:true,intent:action.intent,reply:autonomy.snapshot(uid).reports[0]?.result.reply||'아직 오프라인 활동 정산 기록이 없어.',autonomy:autonomy.snapshot(uid)};}
      if(action.intent==='QUERY_RELATIONSHIP'){const events=memories.list(uid,owner(uid).active_slot);return {ok:true,intent:action.intent,reply:events.length?events.slice(0,5).map(e=>e.summary).join(' '):'아직 기록된 특별한 생활 추억은 없어. 같이 만들어 보자.',events};}
      if(action.intent==='UNSUPPORTED')fail(400,'그 행동은 아직 지원하지 않아. 낚시, 텃밭 심기·수확, 기본 요리와 보관함 조회를 부탁해 줘.');
      if(action.intent==='STOP_ACTIVITY'){const items=stop(uid,action.actor);return {ok:true,intent:action.intent,items,reply:`${action.actor==='BOTH'?'우리 둘의':action.actor==='PLAYER'?'네':'내'} 생활 작업과 이동을 멈췄어. 이번 활동에서 잡은 기록은 ${catchText(items)}야.`,...snapshot(uid)};}
      if(action.intent==='QUERY_GARDEN'){const plots=gardening.plots(uid).filter(p=>(!action.crop||p.cropId===action.crop)&&(!action.plot||p.id===action.plot));return {ok:true,intent:action.intent,reply:plots.length?plots.map(p=>`${Number(p.id.split(':')[1])+1}번 텃밭: ${p.state==='Empty'?'비어 있어':`${ALL_ITEMS.find(i=>i.itemId===p.cropId).name} ${p.state==='Ready'?'수확 가능':`${Math.ceil((p.readyAt-clock())/1000)}초 뒤 수확 가능`}`}`).join('. '):'그 작물은 아직 심지 않았어.',plots};}
      if(action.intent==='OPEN_GARDEN')return {ok:true,intent:action.intent,reply:'텃밭을 열었어. 씨앗은 무료이고, 다 자란 작물은 시들지 않아.'};
      if(action.intent==='QUERY_INVENTORY'){tick();return {ok:true,intent:action.intent,...query(uid,action)};}
      if(action.intent==='OPEN_STORAGE')return {ok:true,intent:action.intent,reply:'우리 보관함을 열었어. 실제 보유 수량과 도감을 확인해 봐.'};
      if(expectedEpoch!==epoch(uid))fail(409,'중단 또는 마을 이동 이후 도착한 요청이라 실행하지 않았어. 다시 부탁해 줘.');
      if(action.intent==='SET_AUTONOMY'){preempt(uid);const settings=autonomy.configure(uid,action.autonomy||{});if(!settings.enabled)stop(uid,'COMPANION');publish(uid);return {ok:true,intent:action.intent,reply:settings.enabled?`자율 활동을 켰어. ${settings.offline?'접속 종료 후 최대 2시간 동안 허용한 활동을 정산할게.':'접속 중에만 활동할게.'} ${settings.replant?'빈 밭에는 '+ALL_ITEMS.find(i=>i.itemId===settings.crop).name+'를 심을게.':''} ${settings.recipe?'허용한 요리만 재료를 사용해 만들게.':'요리 재료는 자동으로 사용하지 않아.'}`:'자율 활동과 오프라인 작업을 껐어.',...snapshot(uid)};}
      if(!forcedActor)preempt(uid);
      if(['PLANT_SEED','HARVEST_CROP','COOK_FOOD'].includes(action.intent))return startGardenJob(uid,action,forcedActor||'COMPANION',requestId);
      if(action.intent==='START_FISHING'&&action.actor==='PLAYER')fail(400,'혼자 낚시하려면 바닷가 자리에서 E 키를 눌러 줘. 함께 가려면 같이 낚시하자고 말해 줘.');
      const reply=startCompanion(uid,action.intent==='JOIN_FISHING',action.report);
      return {ok:true,intent:action.intent,reply,...snapshot(uid)};
    }catch(e){if(!e.status)throw e;return {ok:false,intent:action.intent,reply:e.message};}
  }
  function tick(){
    const changed=new Set();
    for(const [key,job] of jobs){
      const uid=job.op.owner_id,kind=job.op.actor,member=memberFor(uid,kind);if(!member){stop(uid,kind);continue;}
      const fraction=Math.min(1,Math.max(0,(clock()-job.started)/Math.max(1,job.arrived-job.started)));
      Object.assign(member,{x:job.start.x+(job.plan.target.x-job.start.x)*fraction,z:job.start.z+(job.plan.target.z-job.start.z)*fraction,rotation:Math.atan2(job.plan.target.x-job.start.x,job.plan.target.z-job.start.z)});
      if(clock()>=job.arrived&&member.activityState==='Moving'){Object.assign(member,{moving:false,activityState:job.op.intent==='COOK_FOOD'?'Cooking':'Gardening'});publish(uid);changed.add(uid);}
      if(clock()>=job.ends){
        let result;
        try{result=gardening.complete(job.op);}catch(e){gardening.cancel(job.op,'작업 저장에 실패했어. 재료와 작물은 그대로야. 다시 부탁해 줘.');result={ok:false,reply:'작업 저장에 실패했어. 재료와 작물은 그대로야. 다시 부탁해 줘.'};console.error('[life] garden operation failed',e.message);}
        if(kind==='COMPANION'&&automatic.has(uid)){automatic.delete(uid);autonomy.completed(uid,job.op.intent);}
        logAction(uid,'life_work_complete',{actor:kind,intent:job.op.intent,operationId:job.op.id,ok:result.ok});
        for(const item of result.items||[])logAction(uid,'inventory_gain',{actor:kind,operationId:job.op.id,...item});
        for(const item of result.consumed||[])logAction(uid,'inventory_spend',{actor:kind,operationId:job.op.id,...item});
        jobs.delete(key);Object.assign(member,{moving:false,activityState:'Idle'});publish(uid,[],result.reply);changed.add(uid);
      }else if(member.moving){const {sockets,lastMove,...pose}=member;io.to(`village:${uid}`).emit('village:move',{villageId:uid,...pose});}
    }
    for(const [sid,route] of routes){
      const member=memberFor(route.uid,route.kind);if(!member){stop(route.uid,route.kind);continue;}
      let distance=Math.max(0,(clock()-route.started)/1000)*2.4,index=0;
      while(index<route.lengths.length&&distance>=route.lengths[index])distance-=route.lengths[index++];
      if(index===route.lengths.length){
        const s=active(route.uid,route.kind),anchor=FISHING_ANCHORS.find(a=>a.id===s.anchor_id),arrived=route.started+Math.ceil(route.lengths.reduce((a,b)=>a+b,0)/2.4*1000);
        store.run("UPDATE life_sessions SET status='active',started_at=?,settled_at=? WHERE id=?",arrived,arrived,sid);
        Object.assign(member,{x:anchor.x,z:anchor.z,rotation:anchor.rotation,moving:false,seatId:anchor.id,activityState:'Fishing'});routes.delete(sid);publish(route.uid);changed.add(route.uid);
      }else{
        const a=route.points[index],b=route.points[index+1],fraction=distance/route.lengths[index];
        Object.assign(member,{x:a.x+(b.x-a.x)*fraction,z:a.z+(b.z-a.z)*fraction,rotation:Math.atan2(b.x-a.x,b.z-a.z)});
        const {sockets,lastMove,...pose}=member;
        io.to(`village:${route.uid}`).emit('village:move',{villageId:route.uid,...pose});
      }
    }
    for(const s of store.all("SELECT * FROM life_sessions WHERE status='active'")){
      const results=settle(s.actor_id,s.actor_kind),current=active(s.actor_id,s.actor_kind);
      if(current?.task_limit&&current.attempts>=current.task_limit){const items=itemsFor(current.id);finish(current.actor_id,current.actor_kind,current);if(current.actor_kind==='COMPANION'&&automatic.has(current.actor_id)){automatic.delete(current.actor_id);autonomy.completed(current.actor_id,'START_FISHING');wanderNext.add(current.actor_id);}publish(current.actor_id,results,`낚시를 마쳤어! ${catchText(items)}${items.length?'를 보관함에 넣었어.':'야. 이번에는 물고기를 잡지 못했어.'}`);changed.add(current.owner_id);}
      else if(results.length)publish(s.actor_id,results);
    }
    for(const [uid,members] of villageVisitors){
      const player=members.get(uid);if(!player)continue;
      autonomy.heartbeat(uid,companions.get(uid)?.activityState||'Idle');
      const nearby=companions.get(uid);if(nearby&&autonomy.settings(uid).enabled&&Math.hypot(player.x-nearby.x,player.z-nearby.z)<2&&clock()-(greetings.get(uid)||0)>300000){greetings.set(uid,clock());publish(uid,[],'옆에 왔네! 오늘도 우리 마을에서 같이 지내자.');}
      const rest=rests.get(uid);
      if(rest){const member=ensureCompanion(uid),fraction=Math.min(1,Math.max(0,(clock()-rest.start)/2000)),justRested=fraction===1&&member.activityState!=='Resting';Object.assign(member,{x:rest.x+(rest.target.x-rest.x)*fraction,z:rest.z+(rest.target.z-rest.z)*fraction,moving:fraction<1,activityState:fraction<1?'Moving':'Resting',rotation:Math.atan2(rest.target.x-rest.x,rest.target.z-rest.z)});if(justRested)publish(uid);io.to(`village:${uid}`).emit('village:move',{villageId:uid,...member});if(clock()>=rest.end){rests.delete(uid);automatic.delete(uid);member.activityState='Idle';autonomy.completed(uid,'REST');publish(uid);changed.add(uid);}continue;}
      if(active(uid,'COMPANION')||jobs.has(jobKey(uid,'COMPANION')))continue;
      let action=autonomy.plan(uid,gardening);if(!action)continue;if(action.intent==='START_FISHING'&&wanderNext.has(uid)){action={intent:'REST'};wanderNext.delete(uid);}
      try{
        if(action.intent==='REST'){const member=ensureCompanion(uid);rests.set(uid,{start:clock(),end:clock()+22000,x:member.x,z:member.z,target:{x:member.x>=0?-1.8:1.8,z:1}});member.activityState='Moving';member.moving=true;}
        else if(action.intent==='START_FISHING')startCompanion(uid,false,true);
        else startGardenJob(uid,lifeActionSchema.parse(action),'COMPANION',id());
        automatic.add(uid);publish(uid);changed.add(uid);
      }catch(e){if(!e.status)throw e;autonomy.pause(uid);}

    }
    for(const uid of changed)emitVillage(uid);
  }
  app.put('/api/me/life/autonomy',auth,(req,res)=>{const settings=autonomySettingsSchema.parse(req.body);epochs.set(req.user.id,epoch(req.user.id)+1);preempt(req.user.id);autonomy.configure(req.user.id,settings);if(!settings.enabled)stop(req.user.id,'COMPANION');publish(req.user.id);res.json(snapshot(req.user.id));});
  app.post('/api/me/life/reports/:id/ack',auth,(req,res)=>{if(!autonomy.acknowledge(req.user.id,req.params.id))fail(404,'정산 기록을 찾을 수 없어요.');res.json({ok:true});});
  app.delete('/api/me/life/memories/:id',auth,(req,res)=>{if(!memories.forget(req.user.id,req.params.id))fail(404,'추억을 찾을 수 없어요.');res.json({ok:true});});
  app.post('/api/me/life/actions',auth,(req,res)=>{const body=z.object({requestId:z.string().uuid(),action:lifeActionSchema}).strict().parse(req.body);if(!['PLANT_SEED','HARVEST_CROP','COOK_FOOD'].includes(body.action.intent))fail(400,'잘못된 생활 작업 요청이에요.');const result=execute(req.user.id,req.user.id,body.action,epoch(req.user.id),body.requestId,'PLAYER');res.status(result.ok?200:409).json({...result,...(!result.ok?{error:result.reply}:{})});});
  app.get('/api/me/life',auth,(req,res)=>{autonomy.settle(req.user.id);res.json({...snapshot(req.user.id),catalog:ALL_ITEMS,inventory:store.all('SELECT item_id AS itemId,quantity FROM inventory_entries WHERE owner_id=?',req.user.id),discoveries:store.all(`SELECT d.item_id AS itemId,d.discovered_at AS discoveredAt,d.acquired_by AS acquiredBy,
    COALESCE(NULLIF(s.actor_name,''),u.nickname) AS acquiredByName,COALESCE(s.actor_kind,'PLAYER') AS actor
    FROM fish_discoveries d JOIN users u ON u.id=d.acquired_by LEFT JOIN acquisition_events e ON e.rowid=(SELECT e2.rowid FROM acquisition_events e2 WHERE e2.owner_id=d.owner_id AND e2.item_id=d.item_id ORDER BY e2.timestamp,e2.rowid LIMIT 1) LEFT JOIN life_sessions s ON s.id=e.session_id WHERE d.owner_id=?`,req.user.id)});});
  io.on('connection',socket=>{
    socket.on('life:start',(data,ack)=>{
      try{const user=sessionUser(socket.request.headers);if(!user)fail(401,'로그인이 필요해요.');
        if(!data||Object.keys(data).some(key=>key!=='anchorId'))fail(400,'잘못된 낚시 요청이에요.');
        const result=start(user.id,data.anchorId,socket.data.village?.villageId);if(typeof ack==='function')ack({ok:true,...result});
      }catch(e){if(typeof ack==='function')ack({ok:false,error:e.status?e.message:'낚시를 시작하지 못했어요.'});}
    });
    socket.on('life:stop',(data,ack)=>{try{const user=sessionUser(socket.request.headers);if(!user)fail(401,'로그인이 필요해요.');const kind=data?.actor||'PLAYER';if(!['PLAYER','COMPANION','BOTH'].includes(kind))fail(400,'잘못된 중단 요청이에요.');stop(user.id,kind);if(typeof ack==='function')ack({ok:true,...snapshot(user.id)});}catch(e){if(typeof ack==='function')ack({ok:false,error:e.status?e.message:'낚시를 종료하지 못했어요.'});}});
  });
  const timer=setInterval(()=>{try{tick();}catch(e){console.error('[life] tick failed',e.message);}},100);timer.unref();
  return {arrive,switchAvatar,autonomy,memories,active,busy:uid=>active(uid)||jobs.has(jobKey(uid,'PLAYER')),stop,leave,settle,snapshot,companionMembers,execute,epoch,tick,gardenSnapshot:uid=>({serverTime:clock(),plots:gardening.plots(uid)}),close(){clearInterval(timer);}};
}
