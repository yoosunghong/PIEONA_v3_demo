import {settingsOf,isBlocked,publicUser} from './store.mjs';
import {companionReply} from '../shared/companionScripts.mjs';
import {randomInt,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {validPlacement} from '../shared/world.mjs';
import {DECOR_RADIUS} from '../shared/villageSize.mjs';
import {villageScenery} from '../shared/scenery.mjs';
import {communityPlacements,objectClearance} from '../shared/communityObjects.mjs';
import {installExplorationParty} from './explorationParty.mjs';
import {readOutdoorProfile} from './outdoorTraits.mjs';
import {createExploration,upgradeExploration,tickExploration,moveExploration,interactExploration,commandExploration,parseLocalCommand,craftExploration,returnExploration,enterExploration,RECIPES} from '../shared/exploration.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const requestSchema=z.object({requestId:z.string().min(8).max(100),position:z.object({x:z.number().finite(),z:z.number().finite()}).optional(),targetId:z.string().max(50).optional(),recipeId:z.string().max(40).optional(),text:z.string().trim().min(1).max(300).optional(),enabled:z.boolean().optional(),companionId:z.string().max(100).nullable().optional()});
export function installExploration({app,store,auth,io,sessionUser,clock=Date.now,personaScripts,random=()=>randomInt(0,0x100000000)/0x100000000,logAction=()=>{}}){
 store.db.exec(`CREATE TABLE IF NOT EXISTS exploration_progress(owner_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,state TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS exploration_requests(owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,request_id TEXT NOT NULL,result TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(owner_id,request_id));
 CREATE TABLE IF NOT EXISTS outdoor_profiles(owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,slot TEXT NOT NULL,profile TEXT NOT NULL,PRIMARY KEY(owner_id,slot));`);
 let party;
 const eligible=(uid,id)=>{const u=store.one('SELECT * FROM users WHERE id=?',id);return u&&uid!==id&&!isBlocked(store,uid,id)&&settingsOf(u).allowVisitors&&store.one("SELECT 1 FROM friendships WHERE owner_id=? AND friend_id=? AND status='accepted'",uid,id)?u:null;};
 const profile=(u,viewer)=>{const p=publicUser(store,u,viewer);return {id:p.id,nickname:p.nickname,appearance:p.appearance,slot:u.active_slot};};
 const read=uid=>{const row=store.one('SELECT state FROM exploration_progress WHERE owner_id=?',uid),s=upgradeExploration(row?JSON.parse(row.state):createExploration(clock()));
  if(s.companion.profile){const u=eligible(uid,s.companion.profile.id);if(!u||u.active_slot!==s.companion.profile.slot){Object.assign(s.companion,{enabled:false,profile:null,mode:'IDLE',targetId:null,path:null});s.reply='동행할 수 없는 아바타예요. 다음 출발 때 친구를 다시 선택해 주세요.';}else{s.companion.profile=profile(u,uid);}}
  if(!s.outdoorSlot||s.area==='village')s.outdoorSlot=store.one('SELECT active_slot FROM users WHERE id=?',uid).active_slot||'';s.outdoorProfile=readOutdoorProfile(store,uid,s.outdoorSlot);return party?party.hydrate(uid,s):s;
 };
 app.get('/api/exploration/companions',auth,(req,res)=>res.json({companions:store.all("SELECT u.* FROM users u JOIN friendships f ON f.friend_id=u.id WHERE f.owner_id=? AND f.status='accepted' ORDER BY u.nickname",req.user.id).filter(u=>eligible(req.user.id,u.id)).map(u=>profile(u,req.user.id))}));
 const save=(uid,s)=>{party?.persist(uid,s);store.run('INSERT INTO exploration_progress VALUES(?,?) ON CONFLICT(owner_id) DO UPDATE SET state=excluded.state',uid,JSON.stringify(s));if(s.outdoorProfile)store.run('INSERT INTO outdoor_profiles VALUES(?,?,?) ON CONFLICT(owner_id,slot) DO UPDATE SET profile=excluded.profile',uid,s.outdoorSlot||'',JSON.stringify(s.outdoorProfile));};
 party=installExplorationParty({app,store,auth,io,clock,eligible,profile,read,save,canShare:(uid,id)=>{const u=store.one('SELECT * FROM users WHERE id=?',id);return !!u&&!isBlocked(store,uid,id)&&settingsOf(u).allowVisitors;}});
 app.get('/api/me/outdoor-traits',auth,(req,res)=>res.json({profile:readOutdoorProfile(store,req.user.id,req.user.active_slot)}));
 app.get('/api/exploration',auth,(req,res)=>store.transaction(()=>{const state=tickExploration(read(req.user.id),clock(),random);save(req.user.id,state);res.json({state});}));
 const execute=(req,res,kind,fn)=>{
  const data=requestSchema.parse(req.body);
  store.transaction(()=>{
   const previous=store.one('SELECT result FROM exploration_requests WHERE owner_id=? AND request_id=?',req.user.id,data.requestId);if(previous)return res.json(JSON.parse(previous.result));
   const state=tickExploration(read(req.user.id),clock(),random);fn(state,data);save(req.user.id,state);const result={state};
   store.run('INSERT INTO exploration_requests VALUES(?,?,?,?)',req.user.id,data.requestId,JSON.stringify(result),clock());
   store.run('DELETE FROM exploration_requests WHERE owner_id=? AND created_at<?',req.user.id,clock()-86400000);
   if(kind!=='move')logAction(req.user.id,`exploration_${kind}`,{requestId:data.requestId,targetId:data.targetId,recipeId:data.recipeId});res.json(result);
  });
 };
 // Frequent snapshots and movement use the authenticated socket transport.
 // Per-socket pacing keeps them outside the ordinary HTTP request budget.
 io?.on('connection',socket=>{let lastSync=0,lastMove=0;
  for(const kind of ['sync','move'])socket.on(`exploration:${kind}`,(data,ack)=>{
   if(typeof ack!=='function')return;
   try{const user=sessionUser(socket.request.headers);if(!user)fail('로그인이 만료되었어요.',401);
    const now=Date.now(),last=kind==='sync'?lastSync:lastMove;if(now-last<100){if(kind==='sync')return ack({ok:true,skipped:true});fail('잠시 후 다시 시도해 주세요.',429);}if(kind==='sync')lastSync=now;else lastMove=now;
    if(kind==='sync')store.transaction(()=>{const state=tickExploration(read(user.id),clock(),random);save(user.id,state);ack({ok:true,state});});
    else execute({user,body:data},{json:result=>ack({ok:true,...result})},'move',(s,d)=>{if(!d.position)fail('이동 위치가 필요해요.');moveExploration(s,d.position,clock());});
   }catch(e){ack({ok:false,status:e.status||400,error:e instanceof z.ZodError?'이동 정보를 확인해 주세요.':e.message});}
  });
 });
 app.post('/api/exploration/move',auth,(req,res)=>execute(req,res,'move',(s,d)=>{if(!d.position)fail('이동 위치가 필요해요.');moveExploration(s,d.position,clock());}));
 app.post('/api/exploration/interact',auth,(req,res)=>execute(req,res,'interact',(s,d)=>{s.cooperativeAction=party.cooperative(req.user.id,s);interactExploration(s,d.targetId,'PLAYER',clock(),random);delete s.cooperativeAction;}));
 // Structured, allowlisted actions are interpreted locally. No user text leaves this server.
 app.post('/api/exploration/command',auth,(req,res)=>execute(req,res,'command',(s,d)=>{
  if(!d.text)fail('친구에게 부탁할 내용을 적어 주세요.');const action=parseLocalCommand(d.text);if(!action)fail('무엇을 도와줄까? 나무, 돌, 버섯 또는 따라오기를 부탁해 줘.');
  s.commandProvider='persona-script';commandExploration(s,action,d.targetId,clock());
  const c=s.companion,active=personaScripts?.current(c.profile.id,c.profile.slot);const line=companionReply(action,active,c.dialogueHistory?.[action]);c.dialogueHistory||={};c.dialogueHistory[action]=line.history;delete line.history;s.dialogue={...line,id:randomUUID(),speaker:c.profile.nickname};s.reply=line.text;
 }));
 app.post('/api/exploration/companion',auth,(req,res)=>execute(req,res,'companion',(s,d)=>{if(d.enabled!==false)fail('친구는 숲 출발 전에 선택해 주세요.');Object.assign(s.companion,{enabled:false,profile:null,mode:'IDLE',targetId:null,path:null});}));
 app.post('/api/exploration/return',auth,(req,res)=>execute(req,res,'return',s=>{
  if(s.area!=='forest'){s.hp=100;s.fatigue=100;return;}returnExploration(s,clock());
  const activity=s.events.filter(e=>e.kind==='loot'&&e.actor==='PLAYER'&&e.time>=s.sessionStart);
  if(s.companion.enabled&&activity.length)store.run('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?)',randomUUID(),req.user.id,`숲 탐험에서 직접 ${activity.length}번 재료를 모았다. ${s.reply}`,'경험','private',0,'exploration',new Date(clock()).toISOString(),new Date(clock()).toISOString());
 }));
 app.post('/api/exploration/enter',auth,(req,res)=>execute(req,res,'enter',(s,d)=>{
  if(s.area==='forest'){if(d.companionId!==undefined)fail('마을에서 동행 친구를 선택해 주세요.');return;}
  const u=d.companionId?eligible(req.user.id,d.companionId):null;if(d.companionId&&!u)fail('서로 수락한 친구의 공개 아바타만 동행할 수 있어요.',403);
  Object.assign(s.companion,{enabled:!!u,profile:u?profile(u,req.user.id):null,dialogueHistory:{}});s.dialogue=null;s.outdoorSlot=req.user.active_slot||'';s.outdoorProfile=readOutdoorProfile(store,req.user.id,s.outdoorSlot);enterExploration(s,clock());
 }));
 app.post('/api/exploration/craft',auth,(req,res)=>execute(req,res,'craft',(s,d)=>craftExploration(s,d.recipeId,clock())));
 app.post('/api/exploration/place',auth,(req,res)=>execute(req,res,'place',(s,d)=>{
  if(s.area!=='village')fail('마을에서 배치해 주세요.');if(!(s.crafted[d.recipeId]>0))fail('먼저 소품을 제작해 주세요.');
  const r=RECIPES.find(r=>r.id===d.recipeId);if(!r)fail('소품을 찾을 수 없어요.');
  const user=store.one('SELECT village FROM users WHERE id=?',req.user.id),village=JSON.parse(user.village||'{}');village.items||=[];
  if(village.items.length>=60)fail('마을의 소품을 정리한 뒤 배치해 주세요.');
  const occupied=[...village.items,...villageScenery(village),...communityPlacements(village)].filter(item=>!item.hidden);let position=null;
  for(let i=0;i<240;i++){const angle=i*2.399963,radius=3.1+(i%9)*.4,x=Math.round(Math.cos(angle)*radius*4)/4,z=Math.round(Math.sin(angle)*radius*4)/4;if(validPlacement(x,z,village.scenery)&&!occupied.some(o=>Math.hypot(o.x-x,o.z-z)<Math.max(1.05,objectClearance(r.id,o.id)))){position={x,z};break;}}
  // Dense scenery can leave usable gaps between the spiral samples.
  for(let x=-DECOR_RADIUS;!position&&x<=DECOR_RADIUS;x+=.25){
   for(let z=-DECOR_RADIUS;z<=DECOR_RADIUS;z+=.25){
    if(validPlacement(x,z,village.scenery)&&!occupied.some(o=>Math.hypot(o.x-x,o.z-z)<Math.max(1.05,objectClearance(r.id,o.id)))){position={x,z};break;}
   }
  }
  if(!position)fail('빈 공간이 부족해요. 마을 소품을 정리한 뒤 배치해 주세요.');
  village.items.push({id:randomUUID(),type:r.id,...position,rotation:0});store.run('UPDATE users SET village=?,revision=revision+1 WHERE id=?',JSON.stringify(village),req.user.id);s.crafted[r.id]--;s.placed.push(r.id);
 }));
 return {read};
}
