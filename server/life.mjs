import {createPetRuntime} from './petRuntime.mjs';
import {SURVEY_REWARD} from '../shared/surveyRewards.mjs';
import {createLifeMemories} from './lifeMemories.mjs';
import {awardLifeFish} from './lifeRewards.mjs';
import {randomInt} from 'node:crypto';
import {id} from './store.mjs';
import {villageLife} from '../shared/lifeLayout.mjs';
import {FISHING_PERIOD,INTERACTION_REACH,ALL_ITEMS} from '../shared/life.mjs';
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
    for(const [name,definition] of [['actor_kind',"TEXT NOT NULL DEFAULT 'PLAYER'"],['actor_name',"TEXT NOT NULL DEFAULT ''"],['avatar_slot','TEXT'],['task_limit','INTEGER'],['village_id','TEXT']])if(!columns.has(name))store.db.exec(`ALTER TABLE life_sessions ADD COLUMN ${name} ${definition}`);
    store.db.exec(`DROP INDEX IF EXISTS life_active_actor; DROP INDEX IF EXISTS life_active_anchor;
      CREATE UNIQUE INDEX life_active_actor ON life_sessions(actor_id,actor_kind) WHERE status IN ('moving','active');
      CREATE UNIQUE INDEX life_active_anchor ON life_sessions(COALESCE(village_id,owner_id),anchor_id) WHERE status IN ('moving','active');`);
    store.run("UPDATE life_sessions SET status='stopped',stopped_at=settled_at WHERE status IN ('moving','active')");
  });
  // Return inventory left in transit by the removed courier, without running old AI jobs.
  if(store.one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='avatar_carry'"))store.transaction(()=>{
    for(const row of store.all('SELECT * FROM avatar_carry'))store.run('INSERT INTO inventory_entries(owner_id,item_id,quantity) VALUES(?,?,?) ON CONFLICT(owner_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity',row.owner_id,row.item_id,row.quantity);
    store.run('DELETE FROM avatar_carry');
  });
  const pets=new Map(),epochs=new Map(),jobs=new Map();
  const memories=createLifeMemories(store);
  const gardening=createGardening(store,clock,{onComplete:memories.operation}),jobKey=(uid,kind)=>`${uid}:${kind}`;
  const task=(uid,kind)=>{const job=jobs.get(jobKey(uid,kind));return job?{id:job.op.id,actor:kind,intent:job.op.intent,state:memberFor(uid,kind)?.activityState,label:job.label}:null;};
  const epoch=uid=>epochs.get(uid)||0;
  const active=(uid,kind='PLAYER')=>store.one("SELECT * FROM life_sessions WHERE actor_id=? AND actor_kind=? AND status IN ('moving','active')",uid,kind);
  const itemsFor=sid=>store.all('SELECT item_id AS itemId,SUM(quantity) AS quantity FROM acquisition_events WHERE session_id=? GROUP BY item_id ORDER BY item_id',sid);
  const playerVillage=uid=>active(uid)?.village_id||uid;
  const memberFor=uid=>villageVisitors.get(playerVillage(uid))?.get(uid);
  const owner=uid=>store.one('SELECT * FROM users WHERE id=?',uid);
  const anchors=uid=>villageLife(JSON.parse(owner(uid).village)).anchors;
  function viewSession(s){return s?{id:s.id,state:s.status==='moving'?'Moving':'Fishing',actor:s.actor_kind,anchorId:s.anchor_id,startedAt:s.started_at,nextAt:s.status==='active'?s.settled_at+FISHING_PERIOD:null,attempts:s.attempts,caught:s.caught,taskLimit:s.task_limit,items:itemsFor(s.id)}:null;}
  function snapshot(uid){return {serverTime:clock(),relationshipMemories:memories.list(uid,owner(uid).active_slot),session:viewSession(active(uid)),task:task(uid,'PLAYER'),garden:gardening.snapshot(uid)};}
  function publish(uid,results=[],notice){io.to(`user:${uid}`).emit('life:state',{...snapshot(uid),results,...(notice?{notice}:{})});}
  function petMembers(room){
    if(villageVisitors.get(room)?.size)ensurePet(room,`resident:${room}`,room);
    return [...pets.values()].filter(m=>m.villageId===room&&(m.actorKind!=='MOUNT'||JSON.parse(owner(m.ownerId).appearance).ride!=='babyDragon')).map(m=>({...m,nickname:`${owner(m.ownerId).nickname} · ${m.actorKind==='MOUNT'?'아기용 탈것':'펫'}`,runnerBusy:true}));
  }
  function ensurePet(uid,key=uid,room=uid){if(!pets.has(key))pets.set(key,{userId:`pet:${uid}`,ownerId:uid,villageId:room,actorKind:'PET',x:1.1,z:0,rotation:0,moving:false,seatId:null,activityState:'Idle'});return pets.get(key);}
  function settle(uid,kind='PLAYER'){
    const s=active(uid,kind);if(!s||s.status!=='active')return [];
    const elapsed=Math.floor((clock()-s.settled_at)/FISHING_PERIOD),count=Math.min(elapsed,s.task_limit?s.task_limit-s.attempts:elapsed);if(count<=0)return [];
    const results=[];
    store.transaction(()=>{
      for(let i=1;i<=count;i++){
        const timestamp=s.settled_at+i*FISHING_PERIOD,cycle=s.attempts+i;
        const fish=awardLifeFish(store,s,cycle,timestamp,random,memories);
        results.push({cycle,actor:kind,itemId:fish?.itemId||null});
      }
      store.run('UPDATE life_sessions SET settled_at=?,attempts=attempts+?,caught=caught+? WHERE id=?',s.settled_at+count*FISHING_PERIOD,count,results.filter(r=>r.itemId).length,s.id);
    });
    for(const result of results)logAction(uid,'fishing_result',{actor:kind,sessionId:s.id,itemId:result.itemId,quantity:result.itemId?1:0});
    return results;
  }
  function finish(uid,kind,s){
    logAction(uid,'fishing_stop',{actor:kind,sessionId:s.id});
    store.run("UPDATE life_sessions SET status='stopped',stopped_at=? WHERE id=?",clock(),s.id);
    const member=villageVisitors.get(s.village_id||uid)?.get(uid);
    if(member){const approach=anchors(s.village_id||uid).find(a=>a.id===s.anchor_id)?.approach;if(approach)Object.assign(member,{x:approach.x,z:approach.z});Object.assign(member,{seatId:null,moving:false,jumpStarted:0,activityState:'Idle'});}
  }
  function stop(uid,kind='PLAYER',pause=true){
    if(pause)logAction(uid,'life_stop',{actor:kind});
    const room=playerVillage(uid);
    epochs.set(uid,epoch(uid)+1);const kinds=['PLAYER'],results=[],items=[];
    for(const actor of kinds){const s=active(uid,actor);if(!s)continue;results.push(...settle(uid,actor));items.push(...itemsFor(s.id));finish(uid,actor,s);}
    for(const actor of kinds){const key=jobKey(uid,actor),job=jobs.get(key);if(job){gardening.cancel(job.op);jobs.delete(key);const member=memberFor(uid,actor);if(member)Object.assign(member,{moving:false,activityState:'Idle'});}}
    publish(uid,results);emitVillage(uid);if(room!==uid)emitVillage(room);return items;
  }
  function leave(uid){stop(uid,'PLAYER',false);pets.delete(uid);emitVillage(uid);}
  function arrive(){}
  function switchAvatar(uid){stop(uid);pets.delete(uid);}
  function occupied(uid){return new Set([...store.all("SELECT anchor_id FROM life_sessions WHERE COALESCE(village_id,owner_id)=? AND status IN ('moving','active')",uid).map(s=>s.anchor_id),...[...(villageVisitors.get(uid)?.values()||[])].map(m=>m.seatId).filter(Boolean)]);}
  function insertSession(uid,kind,anchor,moving,report=false,villageId=uid){
    const user=owner(uid),time=clock();
    store.run('INSERT INTO life_sessions(id,owner_id,actor_id,actor_kind,actor_name,avatar_slot,anchor_id,started_at,settled_at,status,task_limit,village_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id(),uid,uid,kind,user.nickname,user.active_slot,anchor.id,time,time,moving?'moving':'active',report?3:null,villageId);
    const session=active(uid,kind);logAction(uid,'fishing_start',{actor:kind,sessionId:session.id});return session;
  }
  function start(uid,anchorId,villageId){
    if(!villageId||!villageVisitors.get(villageId)?.has(uid))fail(403,'마을에 입장한 뒤 낚시해 주세요.');
    if(active(uid)){if(playerVillage(uid)!==villageId)fail(409,'다른 마을에서 진행 중인 낚시를 먼저 중단해 주세요.');return snapshot(uid);}
    const member=villageVisitors.get(villageId)?.get(uid),anchor=anchors(villageId).find(a=>a.id===anchorId);
    if(!member||!anchor)fail(400,'낚시 자리 가까이에서 다시 시도해 주세요.');
    if(busy(uid)||member.seatId||member.jumpStarted&&clock()-member.jumpStarted<720)fail(409,'진행 중인 활동을 마친 뒤 낚시해 주세요.');
    if(Math.hypot(member.x-anchor.x,member.z-anchor.z)>INTERACTION_REACH)fail(409,'낚시 자리 가까이로 이동해 주세요.');
    if(occupied(villageId).has(anchor.id))fail(409,'이미 사용 중인 자리예요.');
    insertSession(uid,'PLAYER',anchor,false,false,villageId);
    Object.assign(member,{x:anchor.x,z:anchor.z,rotation:anchor.rotation,seatId:anchor.id,moving:false,jumpStarted:0,activityState:'Fishing'});
    publish(uid);emitVillage(villageId);return snapshot(uid);
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
    const kinds=['PLAYER'],items=[];
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
      const member=player;
      const start={x:member.x,z:member.z},distance=Math.hypot(plan.target.x-start.x,plan.target.z-start.z),arrived=clock()+Math.ceil(distance/2.4*1000);
      const label=action.intent==='COOK_FOOD'?'요리':action.intent==='PLANT_SEED'?'씨앗 심기':'작물 수확';
      jobs.set(jobKey(uid,kind),{op,plan,start,started:clock(),arrived,ends:arrived+(plan.durationMs||2000),label});
      logAction(uid,'life_work_start',{actor:kind,intent:action.intent,operationId:op.id});
      Object.assign(member,{moving:true,seatId:null,jumpStarted:0,activityState:'Moving'});
      publish(uid);emitVillage(uid);return {ok:true,intent:action.intent,operationId:op.id,reply:`${action.intent==='COOK_FOOD'?'조리대':'텃밭'}로 가서 ${label} 작업을 할게. 끝나면 실제 결과를 알려줄게.`,...snapshot(uid)};
    }catch(e){gardening.cancel(op);throw e;}
  }
  function execute(uid,targetId,raw,expectedEpoch=epoch(uid),requestId=id(),forcedActor){
    const parsed=lifeActionSchema.safeParse(raw);
    if(!parsed.success)return {ok:false,intent:'UNSUPPORTED',reply:'지원하지 않는 생활 행동이에요. 펫은 쓰다듬거나 부를 수 있어요.'};
    const action={...parsed.data,actor:'PLAYER'};
    try{
      if(targetId!==uid)fail(403,'생활 행동과 보관함 조회는 내 AI 아바타에게만 부탁할 수 있어요.');
      if(action.intent==='QUERY_RELATIONSHIP'){const events=memories.list(uid,owner(uid).active_slot);return {ok:true,intent:action.intent,reply:events.length?events.slice(0,5).map(e=>e.summary).join(' '):'아직 기록된 특별한 생활 추억은 없어. 같이 만들어 보자.',events};}
      if(action.intent==='UNSUPPORTED')fail(400,'그 행동은 아직 지원하지 않아. 낚시, 텃밭 심기·수확, 기본 요리와 보관함 조회를 부탁해 줘.');
      if(action.intent==='STOP_ACTIVITY'){const items=stop(uid,action.actor);return {ok:true,intent:action.intent,items,reply:`${action.actor==='BOTH'?'우리 둘의':action.actor==='PLAYER'?'네':'내'} 생활 작업과 이동을 멈췄어. 이번 활동에서 잡은 기록은 ${catchText(items)}야.`,...snapshot(uid)};}
      if(action.intent==='QUERY_GARDEN'){const plots=gardening.plots(uid).filter(p=>(!action.crop||p.cropId===action.crop)&&(!action.plot||p.id===action.plot));return {ok:true,intent:action.intent,reply:plots.length?plots.map(p=>`${Number(p.id.split(':')[1])+1}번 텃밭: ${p.state==='Empty'?'비어 있어':`${ALL_ITEMS.find(i=>i.itemId===p.cropId).name} ${p.state==='Ready'?'수확 가능':`${Math.ceil((p.readyAt-clock())/1000)}초 뒤 수확 가능`}`}`).join('. '):'그 작물은 아직 심지 않았어.',plots};}
      if(action.intent==='OPEN_GARDEN')return {ok:true,intent:action.intent,reply:'텃밭을 열었어. 씨앗은 무료이고, 다 자란 작물은 시들지 않아.'};
      if(action.intent==='QUERY_INVENTORY'){tick();return {ok:true,intent:action.intent,...query(uid,action)};}
      if(action.intent==='OPEN_STORAGE')return {ok:true,intent:action.intent,reply:'우리 보관함을 열었어. 실제 보유 수량과 도감을 확인해 봐.'};
      if(expectedEpoch!==epoch(uid))fail(409,'중단 또는 마을 이동 이후 도착한 요청이라 실행하지 않았어. 다시 부탁해 줘.');
      if(['PLANT_SEED','HARVEST_CROP','COOK_FOOD'].includes(action.intent))return startGardenJob(uid,action,'PLAYER',requestId);
      if(action.intent==='START_FISHING')fail(400,'바닷가의 빈 낚시 자리에서 E 키를 눌러 낚시할 수 있어.');
      fail(400,'펫은 마을을 산책하는 친구야. 가까이에서 E로 쓰다듬거나 R로 불러 줘.');
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
        logAction(uid,'life_work_complete',{actor:kind,intent:job.op.intent,operationId:job.op.id,ok:result.ok});
        for(const item of result.items||[])logAction(uid,'inventory_gain',{actor:kind,operationId:job.op.id,...item});
        for(const item of result.consumed||[])logAction(uid,'inventory_spend',{actor:kind,operationId:job.op.id,...item});
        jobs.delete(key);Object.assign(member,{moving:false,activityState:'Idle'});publish(uid,[],result.reply);changed.add(uid);
      }else if(member.moving){const {sockets,lastMove,...pose}=member;io.to(`village:${uid}`).emit('village:move',{villageId:uid,...pose});}
    }
    for(const s of store.all("SELECT * FROM life_sessions WHERE status='active'")){
      const results=settle(s.actor_id,s.actor_kind);
      if(results.length)publish(s.actor_id,results);
    }
    petRuntime.tick();
    for(const uid of changed)emitVillage(uid);
  }
  app.delete('/api/me/life/memories/:id',auth,(req,res)=>{if(!memories.forget(req.user.id,req.params.id))fail(404,'추억을 찾을 수 없어요.');res.json({ok:true});});
  app.post('/api/me/life/actions',auth,(req,res)=>{const body=z.object({requestId:z.string().uuid(),action:lifeActionSchema}).strict().parse(req.body);if(!['PLANT_SEED','HARVEST_CROP','COOK_FOOD'].includes(body.action.intent))fail(400,'잘못된 생활 작업 요청이에요.');const result=execute(req.user.id,req.user.id,body.action,epoch(req.user.id),body.requestId,'PLAYER');res.status(result.ok?200:409).json({...result,...(!result.ok?{error:result.reply}:{})});});
  app.get('/api/me/life',auth,(req,res)=>{res.json({...snapshot(req.user.id),catalog:ALL_ITEMS,inventory:store.all('SELECT item_id AS itemId,quantity FROM inventory_entries WHERE owner_id=?',req.user.id),inventoryAcquisitions:store.all(`SELECT i.item_id AS itemId,i.quantity,MAX(COALESCE((SELECT MAX(timestamp) FROM acquisition_events a WHERE a.owner_id=i.owner_id AND a.item_id=i.item_id),0),COALESCE((SELECT MAX(timestamp) FROM inventory_changes c WHERE c.owner_id=i.owner_id AND c.item_id=i.item_id AND c.quantity>0),0)) AS lastAcquiredAt FROM inventory_entries i WHERE i.owner_id=?`,req.user.id),discoveries:store.all(`SELECT d.item_id AS itemId,d.discovered_at AS discoveredAt,d.acquired_by AS acquiredBy,
    COALESCE(NULLIF(s.actor_name,''),u.nickname) AS acquiredByName,COALESCE(s.actor_kind,'PLAYER') AS actor
    FROM fish_discoveries d JOIN users u ON u.id=d.acquired_by LEFT JOIN acquisition_events e ON e.rowid=(SELECT e2.rowid FROM acquisition_events e2 WHERE e2.owner_id=d.owner_id AND e2.item_id=d.item_id ORDER BY e2.timestamp,e2.rowid LIMIT 1) LEFT JOIN life_sessions s ON s.id=e.session_id WHERE d.owner_id=?`,req.user.id)});});
  io.on('connection',socket=>{
    socket.on('life:start',(data,ack)=>{
      try{const user=sessionUser(socket.request.headers);if(!user)fail(401,'로그인이 필요해요.');
        if(!data||Object.keys(data).some(key=>key!=='anchorId'))fail(400,'잘못된 낚시 요청이에요.');
        const result=start(user.id,data.anchorId,socket.data.village?.villageId);if(typeof ack==='function')ack({ok:true,...result});
      }catch(e){if(typeof ack==='function')ack({ok:false,error:e.status?e.message:'낚시를 시작하지 못했어요.'});}
    });
    socket.on('life:stop',(data,ack)=>{try{const user=sessionUser(socket.request.headers);if(!user)fail(401,'로그인이 필요해요.');const kind=data?.actor||'PLAYER';if(!['PLAYER','BOTH'].includes(kind))fail(400,'잘못된 중단 요청이에요.');stop(user.id,kind);if(typeof ack==='function')ack({ok:true,...snapshot(user.id)});}catch(e){if(typeof ack==='function')ack({ok:false,error:e.status?e.message:'낚시를 종료하지 못했어요.'});}});
  });
  const petRuntime=createPetRuntime({app,auth,clock,villageVisitors,pets,ensurePet,emitVillage,dragonState:uid=>({available:!!store.one('SELECT 1 FROM account_rewards WHERE user_id=? AND reward_id=?',uid,SURVEY_REWARD),riding:JSON.parse(owner(uid).appearance).ride==='babyDragon'}),emitMove:(room,member)=>io.to(`village:${room}`).emit('village:move',{villageId:room,...member}),logAction});
  const timer=setInterval(()=>{try{tick();}catch(e){console.error('[life] tick failed',e.message);}},100);timer.unref();
  return {arrive,switchAvatar,memories,active,seatOccupied:(room,seatId,except)=>[...(villageVisitors.get(room)?.values()||[])].some(m=>m.userId!==except&&m.seatId===seatId),busy:uid=>active(uid)||jobs.has(jobKey(uid,'PLAYER')),stop,leave,settle,snapshot,petMembers,execute,epoch,tick,gardenSnapshot:uid=>({serverTime:clock(),plots:gardening.plots(uid)}),close(){clearInterval(timer);}};
}
