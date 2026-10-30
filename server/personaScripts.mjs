import {effectiveOutdoorPersona,readOutdoorProfile} from './outdoorTraits.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {settingsOf} from './store.mjs';
import {EVENT_REGISTRY,ACTIVE_EVENTS,TRAITS,proposalSchema,validateScripts,renderVariant,selectVariant} from '../shared/personaScripts.mjs';
import {createPersonaProvider} from './pssProvider.mjs';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function installPersonaScripts({app,store,auth,limiter,io,provider=createPersonaProvider(),testing=false,forceVariant}){
 store.db.exec(`CREATE TABLE IF NOT EXISTS pss_active(owner_id TEXT NOT NULL REFERENCES users(id),slot TEXT NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(owner_id,slot));
 CREATE TABLE IF NOT EXISTS pss_versions(owner_id TEXT NOT NULL REFERENCES users(id),slot TEXT NOT NULL,version INTEGER NOT NULL,persona TEXT NOT NULL,scripts TEXT NOT NULL,provider TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(owner_id,slot,version));
 CREATE TABLE IF NOT EXISTS pss_proposals(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),slot TEXT NOT NULL,base INTEGER NOT NULL,fingerprint TEXT NOT NULL,proposal TEXT NOT NULL,scripts TEXT,status TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS pss_selector(owner_id TEXT NOT NULL REFERENCES users(id),slot TEXT NOT NULL,version INTEGER NOT NULL,event_id TEXT NOT NULL,state TEXT NOT NULL,PRIMARY KEY(owner_id,slot,version,event_id));
 CREATE TABLE IF NOT EXISTS pss_runtime(owner_id TEXT NOT NULL REFERENCES users(id),slot TEXT NOT NULL,state TEXT NOT NULL,PRIMARY KEY(owner_id,slot));
 CREATE TABLE IF NOT EXISTS pss_executions(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),slot TEXT NOT NULL,version INTEGER NOT NULL,event_id TEXT NOT NULL,variant_id TEXT NOT NULL,source_id TEXT NOT NULL,line TEXT NOT NULL,displayed_at TEXT,created_at TEXT NOT NULL,UNIQUE(owner_id,slot,event_id,source_id));`);
 const cache=new Map(),locks=new Set();
 const user=uid=>store.one('SELECT * FROM users WHERE id=?',uid);
 const key=(uid,slot)=>JSON.stringify([uid,slot]);
 function current(uid,slot=user(uid).active_slot){
  const k=key(uid,slot);if(cache.has(k)){const base=cache.get(k);return {...base,persona:effectiveOutdoorPersona(store,uid,slot,base.persona)};}
  const row=store.one('SELECT v.* FROM pss_active a JOIN pss_versions v ON v.owner_id=a.owner_id AND v.slot=a.slot AND v.version=a.version WHERE a.owner_id=? AND a.slot=?',uid,slot);
  const u=user(uid),settings=settingsOf(u);
  const value=row?{version:row.version,persona:JSON.parse(row.persona),scripts:validateScripts(JSON.parse(row.scripts)),provider:row.provider}:{version:0,persona:{...Object.fromEntries(TRAITS.map(t=>[t,.5])),speechStyle:settings.speechStyle||'차분하고 다정한 말투',preferences:(settings.publicTags||[]).slice(0,8)},scripts:{events:[]},provider:null};
  if(row)cache.set(k,value);return {...value,persona:effectiveOutdoorPersona(store,uid,slot,value.persona)};
 }
 function evidence(uid,slot){
  const messages=store.all("SELECT m.id,m.content FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.viewer_id=? AND c.target_id=? AND c.avatar_slot=? AND m.role='user' ORDER BY m.created_at DESC,m.rowid DESC LIMIT 40",uid,uid,slot).reverse();
  const memories=store.all('SELECT id,content,category FROM memories WHERE owner_id=? ORDER BY updated_at DESC LIMIT 30',uid);
  return {messages,memories,outdoor:readOutdoorProfile(store,uid,slot)};
 }
 const fingerprint=(uid,slot)=>hash({slot,revision:user(uid).revision,evidence:evidence(uid,slot)});
 function proposal(uid,pid){const p=store.one('SELECT * FROM pss_proposals WHERE id=? AND owner_id=? AND slot=?',pid,uid,user(uid).active_slot);if(!p)fail(404,'업데이트 제안을 찾을 수 없어요.');return p;}
 function fresh(p){if(current(p.owner_id,p.slot).version!==p.base||fingerprint(p.owner_id,p.slot)!==p.fingerprint||user(p.owner_id).active_slot!==p.slot)fail(409,'대화·기억·성향이 변경되었어요. 다시 분석해 주세요.');}
 const pid=req=>z.object({proposalId:z.string().uuid()}).strict().parse(req.body).proposalId;
 app.get('/api/me/pss',auth,(req,res)=>{
  const uid=req.user.id,slot=req.user.active_slot;
  res.json({...current(uid,slot),registry:EVENT_REGISTRY,versions:store.all('SELECT version,provider,created_at FROM pss_versions WHERE owner_id=? AND slot=? ORDER BY version DESC',uid,slot)});
 });
 app.post('/api/me/pss/propose',auth,limiter,async(req,res)=>{
  z.object({consent:z.literal(true)}).strict().parse(req.body);
  const uid=req.user.id,slot=req.user.active_slot,base=current(uid,slot),source=evidence(uid,slot),fp=fingerprint(uid,slot),k=key(uid,slot);
  if(locks.has(k))fail(409,'이미 업데이트 중이에요.');
  if(!source.messages.length)fail(409,'먼저 내 아바타와 대화를 나눠 주세요.');locks.add(k);
  try{
   const result=proposalSchema.parse(await provider.analyze({current:base.persona,evidence:source}));
   const allowed=new Set([...source.messages,...source.memories].map(e=>e.id));if(result.evidenceIds.some(id=>!allowed.has(id)))fail(422,'성향 변경 근거가 유효하지 않아요.');
   const p={owner_id:uid,slot,base:base.version,fingerprint:fp};fresh(p);
   const id=randomUUID();store.run('INSERT INTO pss_proposals VALUES(?,?,?,?,?,?,NULL,?)',id,uid,slot,base.version,fp,JSON.stringify(result),'proposed');
   res.json({proposalId:id,before:base.persona,...result});
  }finally{locks.delete(k);}
 });
 app.post('/api/me/pss/generate',auth,limiter,async(req,res)=>{
  const uid=req.user.id,p=proposal(uid,pid(req)),k=key(uid,p.slot);fresh(p);
  if(p.status!=='proposed')fail(409,'새로운 제안을 승인해 주세요.');if(locks.has(k))fail(409,'이미 생성 중이에요.');locks.add(k);
  try{
   const raw=await provider.generate(JSON.parse(p.proposal).persona);fresh(p);
   store.run('UPDATE pss_proposals SET scripts=? WHERE id=?',JSON.stringify(raw),p.id);
   const scripts=validateScripts(raw,{requireAll:true});
   store.run("UPDATE pss_proposals SET scripts=?,status='validated' WHERE id=?",JSON.stringify(scripts),p.id);
   res.json({proposalId:p.id,before:current(uid,p.slot).scripts,after:scripts,provider:provider.name});
  }catch(e){store.run("UPDATE pss_proposals SET status='failed' WHERE id=?",p.id);throw e;}finally{locks.delete(k);}
 });
 app.post('/api/me/pss/apply',auth,(req,res)=>store.transaction(()=>{
  const p=proposal(req.user.id,pid(req));fresh(p);if(p.status!=='validated')fail(409,'대사 검증을 먼저 완료해 주세요.');
  const scripts=validateScripts(JSON.parse(p.scripts)),persona=JSON.parse(p.proposal).persona;
  const version=store.one('SELECT COALESCE(MAX(version),0)+1 n FROM pss_versions WHERE owner_id=? AND slot=?',p.owner_id,p.slot).n;
  store.run('INSERT INTO pss_versions VALUES(?,?,?,?,?,?,?)',p.owner_id,p.slot,version,JSON.stringify(persona),JSON.stringify(scripts),provider.name,new Date().toISOString());
  store.run('INSERT INTO pss_active VALUES(?,?,?) ON CONFLICT(owner_id,slot) DO UPDATE SET version=excluded.version',p.owner_id,p.slot,version);
  store.run("UPDATE pss_proposals SET status='applied' WHERE id=?",p.id);store.run('UPDATE users SET revision=revision+1 WHERE id=?',p.owner_id);cache.delete(key(p.owner_id,p.slot));io.to(`user:${p.owner_id}`).emit('pss:changed',{slot:p.slot,version});res.json(current(p.owner_id,p.slot));
 }));
 app.post('/api/me/pss/cancel',auth,(req,res)=>{const p=proposal(req.user.id,pid(req));if(p.status==='applied')fail(409,'적용된 버전은 복구 기능을 이용해 주세요.');if(locks.has(key(p.owner_id,p.slot)))fail(409,'생성이 끝난 뒤 취소해 주세요.');store.run("UPDATE pss_proposals SET status='cancelled' WHERE id=?",p.id);res.json({ok:true});});
 app.post('/api/me/pss/rollback',auth,(req,res)=>store.transaction(()=>{
  const {version}=z.object({version:z.number().int().positive()}).strict().parse(req.body),uid=req.user.id,slot=req.user.active_slot;
  const old=store.one('SELECT * FROM pss_versions WHERE owner_id=? AND slot=? AND version=?',uid,slot,version);if(!old)fail(404,'복구할 버전이 없어요.');validateScripts(JSON.parse(old.scripts));
  store.run('INSERT INTO pss_active VALUES(?,?,?) ON CONFLICT(owner_id,slot) DO UPDATE SET version=excluded.version',uid,slot,version);store.run('UPDATE users SET revision=revision+1 WHERE id=?',uid);cache.delete(key(uid,slot));io.to(`user:${uid}`).emit('pss:changed',{slot,version});res.json(current(uid,slot));
 }));
 app.get('/api/me/pss/dialogues',auth,(req,res)=>{res.json({lines:store.all('SELECT line FROM pss_executions WHERE owner_id=? AND slot=? AND displayed_at IS NULL ORDER BY rowid LIMIT 100',req.user.id,req.user.active_slot).map(r=>JSON.parse(r.line)).filter(l=>l.version===current(req.user.id).version)});});
 app.get('/api/me/pss/coverage',auth,(req,res)=>{
  const uid=req.user.id,slot=req.user.active_slot,versions=store.all('SELECT version,scripts FROM pss_versions WHERE owner_id=? AND slot=?',uid,slot),executions=store.all('SELECT variant_id,displayed_at,line FROM pss_executions WHERE owner_id=? AND slot=?',uid,slot);
  const rows=versions.flatMap(v=>JSON.parse(v.scripts).events.flatMap(e=>e.variants.map(variant=>{const id=`${uid}:${slot}:${v.version}:${variant.id}`,runs=executions.filter(x=>x.variant_id===id);return {eventId:e.eventId,variantId:id,version:v.version,runtimeExecuted:runs.length>0,clientAcknowledged:runs.some(x=>x.displayed_at),naturalSelection:runs.some(x=>!JSON.parse(x.line).forced)};})));
  res.json({scope:'Current avatar slot, all applied versions. Client acknowledgments are not independent browser proof. Run npm run test:pss:ui for static and UI evidence.',registeredEvents:EVENT_REGISTRY.length,activeEvents:ACTIVE_EVENTS.length,unsupportedEvents:EVENT_REGISTRY.filter(e=>!e.active),generatedScriptVariants:rows.length,runtimeExecutedVariants:rows.filter(r=>r.runtimeExecuted).length,clientAcknowledgedVariants:rows.filter(r=>r.clientAcknowledged).length,rejectedGenerationCandidates:store.all("SELECT id,status,scripts FROM pss_proposals WHERE owner_id=? AND slot=? AND status='failed'",uid,slot).map(p=>({proposalId:p.id,status:p.status,outputRetained:p.scripts!==null})),rows});
 });
 app.post('/api/me/pss/display',auth,(req,res)=>{
  const {executionId}=z.object({executionId:z.string().uuid()}).strict().parse(req.body);
  const r=store.one('SELECT * FROM pss_executions WHERE id=? AND owner_id=? AND slot=?',executionId,req.user.id,req.user.active_slot);if(!r||r.version!==current(req.user.id).version)fail(409,'현재 아바타의 대사가 아니에요.');
  store.run('UPDATE pss_executions SET displayed_at=COALESCE(displayed_at,?) WHERE id=?',new Date().toISOString(),executionId);res.json({ok:true});
 });
 function notify(line){io.to(`user:${line.ownerId}`).emit('pss:dialogue',line);}
 function emit(uid,eventId,context,sourceId,publish=true){
  const u=user(uid);if(!u)return;const slot=u.active_slot,active=current(uid,slot);if(!active.version)return;
  const event=ACTIVE_EVENTS.find(e=>e.id===eventId);if(!event)throw new Error('PSS_EVENT_UNBOUND');
  const duplicate=store.one('SELECT id FROM pss_executions WHERE owner_id=? AND slot=? AND event_id=? AND source_id=?',uid,slot,eventId,sourceId);if(duplicate)return;
  const variants=active.scripts.events.find(e=>e.eventId===eventId).variants;
  const runtime=JSON.parse(store.one('SELECT state FROM pss_runtime WHERE owner_id=? AND slot=?',uid,slot)?.state||'{"emotion":"neutral","relationships":{"player":{"familiarity":0,"affection":0,"trust":0,"sharedExperience":0}}}');
  runtime.emotion=event.outcome==='failure'?'sad':event.outcome==='rare'?'excited':'happy';
  const relation=runtime.relationships.player;relation.sharedExperience++;relation.familiarity=Math.min(1,relation.sharedExperience/100);relation.trust=Math.min(1,relation.sharedExperience/200);
  const saved=store.one('SELECT state FROM pss_selector WHERE owner_id=? AND slot=? AND version=? AND event_id=?',uid,slot,active.version,eventId);
  const pick=selectVariant(variants,saved?JSON.parse(saved.state):undefined,runtime.emotion,relation);
  const forced=testing&&forceVariant?.({uid,eventId,variants});
  const variant=forced?variants.find(v=>v.id===forced):pick.selected;if(!variant)throw new Error('PSS_FORCED_VARIANT_INVALID');
  const text=renderVariant(variant,event,context),id=randomUUID(),createdAt=new Date().toISOString();
  const line={id,ownerId:uid,slot,version:active.version,personaVersion:active.version,eventId,variantId:`${uid}:${slot}:${active.version}:${variant.id}`,localVariantId:variant.id,text,expression:variant.expression,emotion:runtime.emotion,sourceId,forced:!!forced};
  store.transaction(()=>{
   store.run('INSERT INTO pss_executions VALUES(?,?,?,?,?,?,?,?,NULL,?)',id,uid,slot,active.version,eventId,line.variantId,sourceId,JSON.stringify(line),createdAt);
   store.run('INSERT INTO pss_selector VALUES(?,?,?,?,?) ON CONFLICT(owner_id,slot,version,event_id) DO UPDATE SET state=excluded.state',uid,slot,active.version,eventId,JSON.stringify(pick.history));
   store.run('INSERT INTO pss_runtime VALUES(?,?,?) ON CONFLICT(owner_id,slot) DO UPDATE SET state=excluded.state',uid,slot,JSON.stringify(runtime));
  });
  if(publish)notify(line);return line;
 }
 return {emit,notify,current};
}
