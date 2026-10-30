import {readOutdoorProfile} from './outdoorTraits.mjs';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {enterExploration,distance} from '../shared/exploration.mjs';

// Persistent parties survive navigation/restarts; rewards and fatigue stay personal.
export function installExplorationParty({app,store,auth,io,clock,eligible,profile,read,save,canShare}){
 store.db.exec(`CREATE TABLE IF NOT EXISTS exploration_rooms(id TEXT PRIMARY KEY,nodes TEXT NOT NULL,last_tick INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS exploration_members(owner_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,room_id TEXT NOT NULL,last_seen INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS exploration_invites(id TEXT PRIMARY KEY,from_id TEXT NOT NULL,to_id TEXT NOT NULL,room_id TEXT NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL);`);
 const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
 const member=uid=>store.one('SELECT * FROM exploration_members WHERE owner_id=?',uid);
 function leave(uid,reason='마을로 돌아갔어요.'){
  const m=member(uid);if(!m)return;
  store.run('DELETE FROM exploration_members WHERE owner_id=?',uid);
  store.run("UPDATE exploration_invites SET status='cancelled' WHERE from_id=? AND status='pending'",uid);
  const u=store.one('SELECT nickname FROM users WHERE id=?',uid);
  for(const peer of store.all('SELECT owner_id FROM exploration_members WHERE room_id=?',m.room_id))io?.to(`user:${peer.owner_id}`).emit('exploration:left',{id:randomUUID(),nickname:u.nickname,reason});
  if(!store.one('SELECT 1 FROM exploration_members WHERE room_id=?',m.room_id))store.run('DELETE FROM exploration_rooms WHERE id=?',m.room_id);
 }
 function peers(uid){const m=member(uid);if(!m)return [];
  for(const p of store.all('SELECT * FROM exploration_members WHERE room_id=? AND owner_id<>?',m.room_id,uid)){
   if(clock()-p.last_seen>15000)leave(p.owner_id,'연결이 끊겨 탐험을 떠났어요.');
   else if(!canShare(uid,p.owner_id)){leave(p.owner_id,'함께 탐험할 수 없어 퇴장했어요.');}
  }
  return store.all('SELECT u.*,p.state AS progress FROM exploration_members m JOIN users u ON u.id=m.owner_id JOIN exploration_progress p ON p.owner_id=u.id WHERE m.room_id=? AND m.owner_id<>?',m.room_id,uid).map(u=>{const s=JSON.parse(u.progress);return {...profile(u,uid),position:s.position};});
 }
 function hydrate(uid,s){const m=member(uid);if(m){store.run('UPDATE exploration_members SET last_seen=? WHERE owner_id=?',clock(),uid);const room=store.one('SELECT nodes,last_tick FROM exploration_rooms WHERE id=?',m.room_id);if(room){s.nodes=JSON.parse(room.nodes);s.lastTick=Math.max(s.lastTick,room.last_tick);}s.party={id:m.room_id,peers:peers(uid)};}else s.party=null;return s;}
 function persist(uid,s){const m=member(uid);if(m){if(s.area!=='forest'){leave(uid);s.party=null;}else store.run('UPDATE exploration_rooms SET nodes=?,last_tick=? WHERE id=?',JSON.stringify(s.nodes),s.lastTick,m.room_id);}}
 app.get('/api/exploration/invitations',auth,(req,res)=>res.json({invitations:store.all("SELECT i.*,u.nickname FROM exploration_invites i JOIN users u ON u.id=i.from_id WHERE i.to_id=? AND i.status='pending' AND i.expires>?",req.user.id,clock()).filter(i=>eligible(req.user.id,i.from_id)&&member(i.from_id)?.room_id===i.room_id&&clock()-member(i.from_id).last_seen<=15000).map(i=>({id:i.id,nickname:i.nickname,expires:i.expires}))}));
 app.post('/api/exploration/invite',auth,(req,res)=>{
  const {friendId}=z.object({friendId:z.string().min(1).max(100)}).parse(req.body),uid=req.user.id;
  store.transaction(()=>{
   if(!eligible(uid,friendId))fail('서로 수락한 공개 친구만 초대할 수 있어요.',403);
   const old=store.one("SELECT * FROM exploration_invites WHERE from_id=? AND to_id=? AND status='pending' AND expires>?",uid,friendId,clock());if(old)return res.json({id:old.id,state:read(uid)});
   let m=member(uid);const s=read(uid);if(!m){const room=randomUUID();if(s.area!=='forest')enterExploration(s,clock());Object.assign(s.companion,{enabled:false,profile:null,mode:'IDLE'});save(uid,s);store.run('INSERT INTO exploration_rooms VALUES(?,?,?)',room,JSON.stringify(s.nodes),clock());store.run('INSERT INTO exploration_members VALUES(?,?,?)',uid,room,clock());m=member(uid);}
   if(store.all('SELECT * FROM exploration_members WHERE room_id=?',m.room_id).length>=4)fail('최대 4명까지 함께 탐험할 수 있어요.');
   const id=randomUUID(),expires=clock()+60000;store.run('INSERT INTO exploration_invites VALUES(?,?,?,?,?,?)',id,uid,friendId,m.room_id,expires,'pending');io?.to(`user:${friendId}`).emit('exploration:invited',{id,nickname:req.user.nickname,expires});res.json({id,state:hydrate(uid,s)});
  });
 });
 app.post('/api/exploration/invitations/:id',auth,(req,res)=>{
  const {accept}=z.object({accept:z.boolean()}).parse(req.body),uid=req.user.id;
  store.transaction(()=>{
   const i=store.one('SELECT * FROM exploration_invites WHERE id=? AND to_id=?',req.params.id,uid);
   if(!i||i.status!=='pending'||i.expires<=clock())fail('초대가 만료되었어요.');
   if(!accept){store.run("UPDATE exploration_invites SET status='declined' WHERE id=?",i.id);return res.json({ok:true});}
   if(!eligible(uid,i.from_id)||member(i.from_id)?.room_id!==i.room_id||clock()-member(i.from_id).last_seen>15000)fail('친구가 탐험을 떠났어요.');
   if(member(uid))fail('현재 탐험에서 귀환한 뒤 초대를 받아 주세요.');
   if(store.all('SELECT * FROM exploration_members WHERE room_id=?',i.room_id).length>=4)fail('탐험 인원이 가득 찼어요.');
   const s=read(uid);if(s.area==='forest'&&Object.keys(s.outdoorTrip?.completed||{}).length)fail('현재 탐험에서 귀환한 뒤 초대를 받아 주세요.');
   s.outdoorSlot=req.user.active_slot||'';s.outdoorProfile=readOutdoorProfile(store,uid,s.outdoorSlot);enterExploration(s,clock());Object.assign(s.companion,{enabled:false,profile:null,mode:'IDLE'});s.nodes=JSON.parse(store.one('SELECT nodes,last_tick FROM exploration_rooms WHERE id=?',i.room_id).nodes);save(uid,s);store.run('INSERT INTO exploration_members VALUES(?,?,?)',uid,i.room_id,clock());store.run("UPDATE exploration_invites SET status='accepted' WHERE id=?",i.id);res.json({ok:true});
  });
 });
 return {hydrate,persist,leave,cooperative:(uid,s)=>peers(uid).some(p=>distance(p.position,s.position)<=6)};
}
