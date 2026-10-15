import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { openStore, id, now, day, settingsOf, publicUser, isBlocked, visibleMemories, stageOf, defaultSettings } from './store.mjs';
import { assembleContext, generateAnswer, aiMode } from './ai.mjs';
import { decorations, hats, accessories, colors, validPlacement, villageThemes } from '../shared/world.mjs';
import { RUN_DURATION, newRun, advanceRun, runAction, runScore } from '../shared/runner.mjs';

const scrypt = promisify(scryptCallback);
const hashToken = value => createHash('sha256').update(value).digest('hex');
const cookieToken = header => (header || '').split(';').map(s => s.trim()).find(s => s.startsWith('pieona_session='))?.slice(15);
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
const nickname = z.string().trim().min(1).max(20);
const visibility = z.enum(['private','close','public']);
const categories = z.enum(['취향','가치관','경험','말투','일상']);
export const questions = [
  { id: 'weekend', title: '나만의 완벽한 주말은?', a: '포근한 집에서 충전', b: '새로운 곳으로 모험', category: '취향' },
  { id: 'friend', title: '친구가 힘든 하루를 보냈다면?', a: '먼저 마음을 들어주기', b: '함께 해결책 찾아보기', category: '가치관' },
  { id: 'cafe', title: '작은 카페에서 고르고 싶은 자리는?', a: '햇살 드는 조용한 창가', b: '사람들이 모이는 큰 테이블', category: '취향' },
  { id: 'gift', title: '더 마음이 가는 선물은?', a: '진심이 담긴 손편지', b: '취향에 꼭 맞는 작은 물건', category: '가치관' },
  { id: 'talk', title: '우리의 대화는 어떤 느낌이면 좋을까?', a: '다정하고 차분한 대화', b: '장난스럽고 활기찬 대화', category: '말투' }
];

export function createApp(options = {}) {
  const store = options.store || openStore(process.env.DATABASE_PATH);
  const app = express(); const server = createServer(app);
  const origins = new Set([process.env.PUBLIC_ORIGIN || 'https://pieona.yoosung.dev', 'http://127.0.0.1:3000', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://localhost:5173']);
  const io = new Server(server, { maxHttpBufferSize: 16384, allowRequest: (req, done) => done(null, !req.headers.origin || origins.has(req.headers.origin)) });
  const invites=new Map(), races=new Map(), raceByGame=new Map();
  const online = new Map(); const locks = new Set(); const villageVisitors = new Map();
  app.set('trust proxy', 'loopback');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'blob:', 'data:'], connectSrc: ["'self'", 'ws:', 'wss:'], workerSrc: ["'self'", 'blob:'], upgradeInsecureRequests: null } }, crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: '20kb' }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control','no-store'); if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin && !origins.has(req.headers.origin)) return res.status(403).json({ error: '허용되지 않은 요청 출처입니다.' }); next(); });
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '요청이 많아요. 잠시 후 다시 시도해 주세요.' } }));
  const authLimiter = rateLimit({ windowMs: 15*60_000, limit: options.testing ? 500 : 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '로그인 시도가 많아요. 15분 후 다시 시도해 주세요.' } });
  const aiLimiter = rateLimit({ windowMs: 60_000, limit: options.testing ? 500 : 15, keyGenerator: req => req.user.id, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '잠시 숨을 고르고 다시 이야기해 주세요.' } });
  function userById(userId) { const user = store.one('SELECT * FROM users WHERE id=?', userId); if (!user) fail(404, '아바타를 찾을 수 없어요.'); return user; }
  function sessionUser(headers) { const token = cookieToken(headers.cookie); if (!token) return null; return store.one('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?', hashToken(token), Date.now()); }
  function auth(req, res, next) { req.user = sessionUser(req.headers); if (!req.user) return res.status(401).json({ error: '로그인이 필요해요.' }); next(); }
  const profile = (user, viewer) => publicUser(store, user, viewer, new Set(online.keys()));
  function emitUpdate(userId) { io.to(`user:${userId}`).emit('refresh'); }
  function emitWorld() { io.emit('world:changed'); }
  function villageMembers(villageId) {
    return Array.from(villageVisitors.get(villageId)?.values() || []).map(({sockets,lastMove,...member})=>{
      const user=userById(member.userId);
      return {...member,runnerBusy:!!busy(member.userId),nickname:user.nickname,appearance:profile(user,user.id).appearance};
    });
  }
  function emitVillage(villageId) {
    io.to(`village:${villageId}`).emit('village:members',{villageId,members:villageMembers(villageId)});
  }
  function leaveVillage(socket) {
    const current=socket.data.village;
    if(!current)return;
    socket.leave(`village:${current.villageId}`);
    const members=villageVisitors.get(current.villageId),member=members?.get(current.userId);
    member?.sockets.delete(socket.id);
    if(member)member.moving=false;
    if(member&&!member.sockets.size)members.delete(current.userId);
    if(members&&!members.size)villageVisitors.delete(current.villageId);
    socket.data.village=null;
    leaveRace(socket);
    emitVillage(current.villageId);
  }
  function activity(ownerId, actorId, type, detail='', anonymous=false) { store.run('INSERT INTO activities VALUES(?,?,?,?,?,?,?)', id(), ownerId, actorId, type, detail, Number(anonymous), now()); emitUpdate(ownerId); }
  function event(userId, name, detail={}) { store.run('INSERT INTO events VALUES(?,?,?,?,?)', id(), userId, name, JSON.stringify(detail), now()); }
  function checkTarget(req, targetId, kind='visit') {
    const target = userById(targetId); if (isBlocked(store, req.user.id, targetId)) fail(403, '차단된 사용자와 교류할 수 없어요.');
    if (targetId !== req.user.id && !settingsOf(target).allowVisitors) fail(403, '지금은 방문을 쉬고 있는 마을이에요.');
    if (kind==='topic' && !settingsOf(target).allowTopics) fail(403, '스페셜 토픽을 허용하지 않은 아바타예요.');
    return target;
  }
  function rewardVisit(ownerId, actorId, anonymous) {
    if (ownerId===actorId) return;
    const total = store.one("SELECT COALESCE(SUM(amount),0) total FROM rewards WHERE user_id=? AND type='visit' AND day=?", ownerId, day()).total;
    if (total >= 200) return;
    const change = store.run("INSERT OR IGNORE INTO rewards VALUES(?,?,'visit',?,10)", ownerId, actorId, day());
    if (change.changes) { store.run('UPDATE users SET gold=gold+10 WHERE id=?', ownerId); activity(ownerId, actorId, 'greeting', '아바타에게 인사를 남겼어요', anonymous); }
  }
  function newSession(res, req, user) {
    const token = randomBytes(32).toString('hex');
    store.run('INSERT INTO sessions VALUES(?,?,?)', hashToken(token), user.id, Date.now()+30*86400000);
    const secure = process.env.COOKIE_SECURE==='true' || (process.env.COOKIE_SECURE!=='false' && req.secure);
    res.cookie('pieona_session', token, { httpOnly: true, sameSite: 'lax', secure, maxAge: 30*86400000, path: '/' });
  }

  app.get('/api/health', (req,res) => res.json({ ok:true, app:'pieona', ai: aiMode(), version:'1.0.0' }));
  app.post('/api/auth/register', authLimiter, async (req,res) => {
    const data = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/), password: z.string().min(8).max(128) }).parse(req.body);
    if (store.one('SELECT id FROM users WHERE username=?', data.username)) fail(409, '이미 사용 중인 아이디예요.');
    const salt = randomBytes(16).toString('hex'); const digest = await scrypt(data.password, salt, 64);
    const userId = id();
    try { store.run('INSERT INTO users(id,username,password,created_at) VALUES(?,?,?,?)', userId, data.username, `${salt}:${digest.toString('hex')}`, now()); } catch (e) { if (String(e).includes('UNIQUE')) fail(409, '이미 사용 중인 아이디예요.'); throw e; }
    const user = userById(userId); newSession(res,req,user); event(user.id,'register'); emitWorld(); res.status(201).json({ user: profile(user,user.id) });
  });
  app.post('/api/auth/login', authLimiter, async (req,res) => {
    const data = z.object({ username:z.string().trim().toLowerCase().max(24), password:z.string().max(128) }).parse(req.body);
    const user = store.one('SELECT * FROM users WHERE username=?', data.username);
    const [salt, digest] = (user?.password || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
    const candidate = await scrypt(data.password,salt,64);
    if (!user || !timingSafeEqual(candidate,Buffer.from(digest,'hex'))) fail(401,'아이디 또는 비밀번호를 확인해 주세요.');
    newSession(res,req,user); event(user.id,'login'); res.json({ user: profile(user,user.id) });
  });
  app.post('/api/auth/logout', auth, (req,res) => {
    const token = cookieToken(req.headers.cookie); if (token) store.run('DELETE FROM sessions WHERE token=?', hashToken(token));
    // Logout closes every socket authenticated by this particular session, including other tabs.
    for (const socket of io.sockets.sockets.values()) if (socket.data.token === hashToken(token || '')) socket.disconnect(true);
    res.clearCookie('pieona_session',{path:'/'}); res.json({ok:true});
  });
  app.get('/api/me', auth, (req,res) => res.json({ user: profile(userById(req.user.id),req.user.id), ai: aiMode() }));
  app.patch('/api/me/world',auth,(req,res)=>{
    const item=z.object({id:z.string().uuid(),type:z.enum(decorations.map(d=>d.id)),x:z.number().finite(),z:z.number().finite(),rotation:z.number().int().min(0).max(3)}).strict();
    const data=z.object({village:z.object({items:z.array(item).max(24),theme:z.enum(villageThemes.map(t=>t.id)).optional()}).strict().optional(),appearance:z.object({hat:z.enum(hats.map(h=>h.id)),accessory:z.enum(accessories.map(a=>a.id)),color:z.enum(colors)}).strict().optional()}).strict().parse(req.body);
    if(data.village){const items=data.village.items;if(new Set(items.map(i=>i.id)).size!==items.length||items.some(i=>!validPlacement(i.x,i.z))||items.some((a,i)=>items.some((b,j)=>j>i&&Math.hypot(a.x-b.x,a.z-b.z)<.8)))fail(400,'소품은 중앙 광장과 산책로를 피해 서로 간격을 두고 배치해주세요.');}
    const user=userById(req.user.id);store.run('UPDATE users SET village=?,appearance=? WHERE id=?',data.village?JSON.stringify({...JSON.parse(user.village),...data.village}):user.village,data.appearance?JSON.stringify(data.appearance):user.appearance,user.id);
    emitWorld();for(const villageId of villageVisitors.keys())emitVillage(villageId);
    res.json({user:profile(userById(user.id),user.id)});
  });
  app.patch('/api/me', auth, (req,res) => {
    const schema = z.object({ nickname:nickname.optional(), intro:z.string().trim().max(180).optional(), theme:z.enum(['sage','rose','ocean','sunset']).optional(), settings:z.object({ allowVisitors:z.boolean().optional(),receiveTranscripts:z.boolean().optional(),allowTopics:z.boolean().optional(),stageVisible:z.boolean().optional(),questionFrequency:z.enum(['daily','often','off']).optional(),questionTopic:z.string().max(30).optional(),publicTags:z.array(z.string().trim().min(1).max(20)).max(6).optional(),speechStyle:z.string().max(80).optional(),scene:z.enum(['garden','cafe','campfire']).optional() }).optional() });
    const data = schema.parse(req.body); const user=userById(req.user.id);
    store.run('UPDATE users SET nickname=?,intro=?,theme=?,settings=?,revision=revision+1 WHERE id=?', data.nickname??user.nickname,data.intro??user.intro,data.theme??user.theme,JSON.stringify({...settingsOf(user),...data.settings}),user.id);
    emitWorld(); res.json({ user:profile(userById(user.id),user.id) });
  });
  app.get('/api/users', auth, (req,res) => { const users=store.all('SELECT * FROM users ORDER BY created_at'); res.json({ users:users.filter(u=>!isBlocked(store,req.user.id,u.id)).map(u=>profile(u,req.user.id)) }); });
  app.get('/api/users/:id', auth, (req,res) => { const target=checkTarget(req,req.params.id); res.json({user:profile(target,req.user.id), memories:visibleMemories(store,target.id,req.user.id).map(m=>({id:m.id,content:m.content,category:m.category,visibility:m.visibility}))}); });
  app.get('/api/questions', auth, (req,res) => {
    const s=settingsOf(req.user); const date=day(); const seed=[...date].reduce((a,c)=>a+c.charCodeAt(0),0);
    const prompts=[`오늘 너에게 작은 행복을 준 순간이 있었어?`, `${s.questionTopic} 이야기를 들려줄래? 요즘 가장 마음이 가는 건 뭐야?`, '요즘 너만의 충전 방법은 뭐야?', '절대 잃고 싶지 않은 너만의 가치는 뭐야?', '일 년 뒤의 너에게 한마디를 남긴다면?'];
    const period=s.questionFrequency==='often'?Math.floor(Date.now()/(4*3600000)):date;
    const answered=store.one("SELECT 1 FROM events WHERE user_id=? AND name='question_answered' AND detail=?", req.user.id,JSON.stringify({period}));
    const skipped=store.one("SELECT 1 FROM events WHERE user_id=? AND name='question_skipped' AND detail=?", req.user.id,JSON.stringify({period}));
    res.json({balance:questions,daily:s.questionFrequency==='off'||answered||skipped?null:prompts[seed%prompts.length],period});
  });
  app.post('/api/questions/status', auth, (req,res) => { const data=z.object({action:z.enum(['answered','skipped','reset'])}).parse(req.body); const s=settingsOf(req.user); const period=s.questionFrequency==='often'?Math.floor(Date.now()/(4*3600000)):day(); if(data.action==='reset') store.run("DELETE FROM events WHERE user_id=? AND name IN ('question_answered','question_skipped') AND detail=?",req.user.id,JSON.stringify({period})); else event(req.user.id,`question_${data.action}`,{period}); res.json({ok:true}); });
  app.post('/api/balance', auth, (req,res) => {
    const answers=z.array(z.object({id:z.string(),choice:z.enum(['a','b'])})).length(5).parse(req.body.answers);
    if(new Set(answers.map(a=>a.id)).size!==5||answers.some(a=>!questions.find(q=>q.id===a.id))) fail(400,'다섯 질문에 모두 답해주세요.');
    store.transaction(()=>{
      store.run("DELETE FROM memories WHERE owner_id=? AND source='balance'",req.user.id);
      for(const answer of answers){const q=questions.find(q=>q.id===answer.id); const time=now(); store.run('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?)',id(),req.user.id,`${q.title} → ${q[answer.choice]}`,q.category,'private',1,'balance',time,time);}
      store.run('UPDATE users SET balance=?,revision=revision+1 WHERE id=?',JSON.stringify(answers),req.user.id); event(req.user.id,'balance_completed');
    }); emitWorld(); res.json({user:profile(userById(req.user.id),req.user.id)});
  });
  app.get('/api/memories', auth, (req,res)=>res.json({memories:store.all('SELECT * FROM memories WHERE owner_id=? ORDER BY created_at DESC',req.user.id)}));
  app.post('/api/memories', auth, (req,res)=>{
    const data=z.object({content:z.string().trim().min(1).max(400),category:categories,visibility:visibility.default('private')}).parse(req.body);const time=now();const mid=id();
    store.run('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?)',mid,req.user.id,data.content,data.category,data.visibility,1,'owner',time,time);store.run('UPDATE users SET revision=revision+1 WHERE id=?',req.user.id);event(req.user.id,'memory_added');emitWorld();res.status(201).json({id:mid});
  });
  app.patch('/api/memories/:id', auth, (req,res)=>{
    const data=z.object({content:z.string().trim().min(1).max(400).optional(),category:categories.optional(),visibility:visibility.optional(),confirmed:z.boolean().optional()}).parse(req.body);
    const m=store.one('SELECT * FROM memories WHERE id=? AND owner_id=?',req.params.id,req.user.id);if(!m)fail(404,'기억을 찾을 수 없어요.');
    store.run('UPDATE memories SET content=?,category=?,visibility=?,confirmed=?,updated_at=? WHERE id=?',data.content??m.content,data.category??m.category,data.visibility??m.visibility,data.confirmed===undefined?m.confirmed:Number(data.confirmed),now(),m.id);
    store.run('UPDATE users SET revision=revision+1 WHERE id=?',req.user.id);event(req.user.id,'memory_edited');emitWorld();res.json({ok:true});
  });
  app.delete('/api/memories/:id',auth,(req,res)=>{const result=store.run('DELETE FROM memories WHERE id=? AND owner_id=?',req.params.id,req.user.id);if(!result.changes)fail(404,'기억을 찾을 수 없어요.');store.run('UPDATE users SET revision=revision+1 WHERE id=?',req.user.id);event(req.user.id,'memory_deleted');emitWorld();res.json({ok:true});});

  // The account has one publicly active avatar; independent persona slots can be switched for free.
  const slotSnapshot=user=>({nickname:user.nickname,intro:user.intro,theme:user.theme,settings:settingsOf(user),balance:JSON.parse(user.balance),memories:store.all('SELECT * FROM memories WHERE owner_id=?',user.id)});
  function ensureSlot(user){if(user.active_slot)return user;const sid=id();store.transaction(()=>{store.run('INSERT INTO avatar_slots VALUES(?,?,?,?)',sid,user.id,JSON.stringify(slotSnapshot(user)),now());store.run('UPDATE users SET active_slot=? WHERE id=?',sid,user.id);store.run("UPDATE conversations SET avatar_slot=? WHERE target_id=? AND avatar_slot=''",sid,user.id);});return userById(user.id);}
  app.get('/api/slots',auth,(req,res)=>{const user=ensureSlot(userById(req.user.id));res.json({active:user.active_slot,slots:store.all('SELECT * FROM avatar_slots WHERE owner_id=? ORDER BY created_at',user.id).map(s=>{const snap=s.id===user.active_slot?slotSnapshot(user):JSON.parse(s.snapshot);return{id:s.id,nickname:snap.nickname,theme:snap.theme,memoryCount:snap.memories.length,balanceComplete:!!snap.balance.length,active:s.id===user.active_slot};})});});
  app.post('/api/slots',auth,(req,res)=>{const data=z.object({nickname,theme:z.enum(['sage','rose','ocean','sunset']).default('sage')}).parse(req.body);ensureSlot(userById(req.user.id));if(store.one('SELECT COUNT(*) n FROM avatar_slots WHERE owner_id=?',req.user.id).n>=8)fail(400,'프로토타입에서는 최대 8개의 자아를 키울 수 있어요.');const sid=id();store.run('INSERT INTO avatar_slots VALUES(?,?,?,?)',sid,req.user.id,JSON.stringify({nickname:data.nickname,intro:'',theme:data.theme,settings:{...defaultSettings},balance:[],memories:[]}),now());event(req.user.id,'slot_created');res.status(201).json({id:sid});});
  app.post('/api/slots/:id/activate',auth,(req,res)=>{const user=ensureSlot(userById(req.user.id));if(locks.has(`owner:${user.id}`))fail(409,'내 아바타의 답변이 끝난 뒤 자아를 전환해주세요.');const slot=store.one('SELECT * FROM avatar_slots WHERE id=? AND owner_id=?',req.params.id,user.id);if(!slot)fail(404,'나의 자아 슬롯을 찾을 수 없어요.');if(slot.id!==user.active_slot){const snapshot=JSON.parse(slot.snapshot);store.transaction(()=>{store.run('UPDATE avatar_slots SET snapshot=? WHERE id=?',JSON.stringify(slotSnapshot(user)),user.active_slot);store.run('DELETE FROM memories WHERE owner_id=?',user.id);for(const m of snapshot.memories)store.run('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?)',m.id,user.id,m.content,m.category,m.visibility,m.confirmed,m.source,m.created_at,m.updated_at);store.run('UPDATE users SET nickname=?,intro=?,theme=?,settings=?,balance=?,active_slot=?,revision=revision+1 WHERE id=?',snapshot.nickname,snapshot.intro,snapshot.theme,JSON.stringify(snapshot.settings),JSON.stringify(snapshot.balance),slot.id,user.id);event(user.id,'slot_activated');});emitWorld();}res.json({user:profile(userById(user.id),user.id)});});

  app.post('/api/visits',auth,(req,res)=>{const data=z.object({targetId:z.string().uuid(),anonymous:z.boolean().default(false)}).parse(req.body);checkTarget(req,data.targetId);if(data.targetId!==req.user.id){const recent=store.one("SELECT 1 FROM activities WHERE owner_id=? AND actor_id=? AND type='visit' AND created_at>?",data.targetId,req.user.id,new Date(Date.now()-60000).toISOString());if(!recent)activity(data.targetId,req.user.id,'visit','마을에 놀러 왔어요',data.anonymous);event(req.user.id,'visit',{targetId:data.targetId});}res.json({ok:true});});
  app.post('/api/cheer',auth,(req,res)=>{const data=z.object({targetId:z.string().uuid(),message:z.string().trim().max(100).default('오늘도 너답게 피어나길!'),anonymous:z.boolean().default(false)}).parse(req.body);checkTarget(req,data.targetId);if(data.targetId===req.user.id)fail(400,'이웃에게 응원을 보내보세요.');const prior=store.one("SELECT 1 FROM activities WHERE owner_id=? AND actor_id=? AND type='cheer' AND created_at>=?",data.targetId,req.user.id,new Date(Date.now()-86400000).toISOString());if(prior)fail(409,'오늘의 응원은 이미 전달했어요.');activity(data.targetId,req.user.id,'cheer',data.message,data.anonymous);rewardVisit(data.targetId,req.user.id,data.anonymous);event(req.user.id,'cheer');res.json({ok:true});});
  app.get('/api/activities',auth,(req,res)=>res.json({activities:store.all('SELECT a.*,u.nickname FROM activities a JOIN users u ON u.id=a.actor_id WHERE a.owner_id=? ORDER BY a.created_at DESC LIMIT 100',req.user.id).map(a=>({...a,actor_id:a.anonymous?null:a.actor_id,nickname:a.anonymous?'익명의 이웃':a.nickname}))}));

  app.post('/api/conversations',auth,(req,res)=>{
    const data=z.object({targetId:z.string().uuid(),share:z.boolean().default(false),anonymous:z.boolean().default(false)}).parse(req.body);const target=checkTarget(req,data.targetId);
    const cid=id();store.run('INSERT INTO conversations(id,viewer_id,target_id,share,anonymous,context_key,created_at,avatar_slot) VALUES(?,?,?,?,?,?,?,?)',cid,req.user.id,target.id,Number(data.share),Number(data.anonymous),'',now(),target.active_slot);
    event(req.user.id,'conversation_started',{targetId:target.id,owner:target.id===req.user.id});res.status(201).json({id:cid,shared:!!(data.share&&settingsOf(target).receiveTranscripts)});
  });
  function conversationFor(req,cid,write=false){const c=store.one('SELECT * FROM conversations WHERE id=?',cid);if(!c)fail(404,'대화를 찾을 수 없어요.');const target=userById(c.target_id);if(isBlocked(store,c.viewer_id,c.target_id))fail(403,'차단된 대화예요.');if(c.viewer_id!==req.user.id&&(write||c.target_id!==req.user.id||!c.share||!settingsOf(target).receiveTranscripts))fail(403,'공유 동의가 없는 대화는 열람할 수 없어요.');return c;}
  app.get('/api/conversations',auth,(req,res)=>{
    const targetId=req.query.targetId===undefined?null:z.string().uuid().parse(req.query.targetId);
    const target=targetId?checkTarget(req,targetId):null;
    const records=store.all(`SELECT c.*,u.nickname viewer_name,t.nickname target_name,t.active_slot,
      COALESCE((SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id=c.id),c.created_at) updated_at,
      (SELECT content FROM messages m WHERE m.conversation_id=c.id AND m.role='user' ORDER BY m.rowid LIMIT 1) first_message,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id) message_count
      FROM conversations c JOIN users u ON u.id=c.viewer_id JOIN users t ON t.id=c.target_id
      WHERE ${target?'c.viewer_id=? AND c.target_id=? AND c.avatar_slot=?':'(c.viewer_id=? OR c.target_id=?)'}
      ORDER BY updated_at DESC,c.rowid DESC LIMIT 150`,...(target?[req.user.id,target.id,target.active_slot]:[req.user.id,req.user.id]));
    res.json({conversations:records.filter(c=>!isBlocked(store,c.viewer_id,c.target_id)).map(c=>{const ownerView=c.viewer_id!==req.user.id;const canRead=!ownerView||!!(c.share&&settingsOf(userById(c.target_id)).receiveTranscripts);return{id:c.id,target_id:c.target_id,viewer_id:ownerView&&c.anonymous?null:c.viewer_id,viewer_name:ownerView&&c.anonymous?'익명의 이웃':c.viewer_name,target_name:c.target_name,share:!!c.share,anonymous:!!c.anonymous,created_at:c.created_at,updated_at:c.updated_at,title:canRead?Array.from(c.first_message||'새 대화').slice(0,60).join(''):'비공개 대화',activeAvatar:c.avatar_slot===c.active_slot,canRead,count:canRead?c.message_count:null};})});
  });
  app.get('/api/conversations/:id',auth,(req,res)=>{const c=conversationFor(req,req.params.id);res.json({conversation:{id:c.id,share:!!c.share,anonymous:!!c.anonymous,activeAvatar:c.avatar_slot===userById(c.target_id).active_slot},messages:store.all('SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at,rowid',c.id)});});
  app.patch('/api/conversations/:id',auth,(req,res)=>{const c=conversationFor(req,req.params.id,true);const data=z.object({share:z.boolean()}).parse(req.body);store.run('UPDATE conversations SET share=? WHERE id=?',Number(data.share),c.id);emitUpdate(c.target_id);res.json({ok:true});});
  app.delete('/api/conversations/:id',auth,(req,res)=>{const c=conversationFor(req,req.params.id,true);store.run('DELETE FROM conversations WHERE id=?',c.id);emitUpdate(c.target_id);res.json({ok:true});});
  app.post('/api/conversations/:id/messages',auth,aiLimiter,async(req,res)=>{
    const {text,scene}=z.object({text:z.string().trim().min(1).max(1600),scene:z.enum(['garden','cafe','campfire']).default('garden')}).parse(req.body);
    let c=conversationFor(req,req.params.id,true);let target=checkTarget(req,c.target_id);
    if(c.avatar_slot!==target.active_slot)fail(409,'다른 자아와 나눈 대화예요. 해당 자아로 전환하거나 새 대화를 시작해주세요.');
    const lockKey=c.target_id===req.user.id?`owner:${req.user.id}`:c.id;if(locks.has(lockKey))fail(409,'이전 답변을 기다려 주세요.');locks.add(lockKey);
    try{
      const context=assembleContext(store,target,req.user.id,text,scene);
      const history=c.context_key===context.contextKey?store.all('SELECT role,content FROM messages WHERE conversation_id=? ORDER BY rowid DESC LIMIT 12',c.id).reverse():[];
      const result=await (options.generateAnswer||generateAnswer)(context,text,history);
      // Recheck after the network wait: privacy edits, friendship changes, logout and deletion revoke in-flight work.
      c=conversationFor(req,c.id,true);target=checkTarget(req,c.target_id);
      if(!sessionUser(req.headers))fail(401,'로그인이 만료되었어요.');
      if(assembleContext(store,target,req.user.id,text,scene).contextKey!==context.contextKey)fail(409,'기억 또는 공개 설정이 변경됐어요. 다시 전송해 주세요.');
      const added=[];const timestamp=now();
      store.transaction(()=>{
        store.run('INSERT INTO messages VALUES(?,?,?,?,?,?)',id(),c.id,'user',text,'calm',timestamp);
        store.run('INSERT INTO messages VALUES(?,?,?,?,?,?)',id(),c.id,'assistant',result.reply,result.emotion,now());
        if(context.own){for(const m of result.memories.slice(0,3)){if(store.one('SELECT 1 FROM memories WHERE owner_id=? AND content=?',req.user.id,m.content))continue;const mid=id();store.run('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?)',mid,req.user.id,m.content,m.category,'private',0,'conversation',timestamp,timestamp);added.push({id:mid,...m});}if(added.length)store.run('UPDATE users SET revision=revision+1 WHERE id=?',req.user.id);}
        else {rewardVisit(target.id,req.user.id,!!c.anonymous);if(!history.length)activity(target.id,req.user.id,'conversation',c.share&&settingsOf(target).receiveTranscripts?'공유된 아바타 대화가 도착했어요':'아바타와 대화했어요 · 내용 비공개',!!c.anonymous);}
        // An owner-approved request may add private drafts itself; keep that turn's history current.
        store.run('UPDATE conversations SET context_key=? WHERE id=?',assembleContext(store,userById(target.id),req.user.id,text,scene).contextKey,c.id);
        event(req.user.id,'message_sent',{owner:context.own,provider:result.provider,memories:added.length});
      });
      if(added.length)emitWorld();emitUpdate(target.id);
      res.json({reply:result.reply,emotion:result.emotion,memories:added,provider:result.provider,warning:result.warning,stage:stageOf(store,userById(req.user.id))});
    }finally{locks.delete(lockKey);}
  });

  app.post('/api/friends/:id',auth,(req,res)=>{
    const target=checkTarget(req,req.params.id);if(target.id===req.user.id)fail(400,'내 아바타예요.');
    const reverse=store.one("SELECT * FROM friendships WHERE owner_id=? AND friend_id=? AND status='pending'",target.id,req.user.id);
    if(reverse){store.run("UPDATE friendships SET status='accepted' WHERE owner_id=? AND friend_id=?",target.id,req.user.id);store.run("INSERT INTO friendships VALUES(?,?,'accepted',0) ON CONFLICT(owner_id,friend_id) DO UPDATE SET status='accepted'",req.user.id,target.id);}
    else store.run("INSERT OR IGNORE INTO friendships VALUES(?,?,'pending',0)",req.user.id,target.id);
    emitWorld();res.json({ok:true});
  });
  app.patch('/api/friends/:id',auth,(req,res)=>{const data=z.object({close:z.boolean()}).parse(req.body);const r=store.run("UPDATE friendships SET close=? WHERE owner_id=? AND friend_id=? AND status='accepted'",Number(data.close),req.user.id,req.params.id);if(!r.changes)fail(403,'서로 수락한 친구만 절친으로 지정할 수 있어요.');emitWorld();res.json({ok:true});});
  app.delete('/api/friends/:id',auth,(req,res)=>{store.run('DELETE FROM friendships WHERE (owner_id=? AND friend_id=?) OR (owner_id=? AND friend_id=?)',req.user.id,req.params.id,req.params.id,req.user.id);emitWorld();res.json({ok:true});});
  app.post('/api/blocks/:id',auth,(req,res)=>{userById(req.params.id);if(req.params.id===req.user.id)fail(400,'자신을 차단할 수 없어요.');store.run('INSERT OR IGNORE INTO blocks VALUES(?,?)',req.user.id,req.params.id);emitWorld();res.json({ok:true});});
  app.get('/api/blocks',auth,(req,res)=>res.json({blocks:store.all('SELECT b.blocked_id id,u.nickname FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.owner_id=?',req.user.id)}));
  app.delete('/api/blocks/:id',auth,(req,res)=>{store.run('DELETE FROM blocks WHERE owner_id=? AND blocked_id=?',req.user.id,req.params.id);emitWorld();res.json({ok:true});});
  app.post('/api/reports',auth,(req,res)=>{const data=z.object({targetId:z.string().uuid(),reason:z.string().trim().min(3).max(500)}).parse(req.body);userById(data.targetId);store.run('INSERT INTO reports VALUES(?,?,?,?,?)',id(),req.user.id,data.targetId,data.reason,now());res.status(201).json({ok:true});});

  const runnerNotes=()=>Array.from({length:20},(_,i)=>({time:5000+i*1950,lane:i%4===0?-1:randomBytes(1)[0]%3,height:i%4===0?.9:1.15}));
  const busy=userId=>store.one('SELECT id FROM games WHERE user_id=? AND finished=0 AND started>?',userId,Date.now()-120000)||[...races.values()].some(r=>r.players.some(p=>p.userId===userId)&&!r.started);
  function raceEmit(r,name,data){for(const player of r.players)io.to(player.socketId).emit(name,data);}
  function cancelInvite(invite,reason){invites.delete(invite.id);for(const sid of [invite.fromSocket,invite.toSocket])io.to(sid).emit('runner:invite-ended',{id:invite.id,reason});}
  function leaveRace(socket){
    for(const invite of invites.values())if([invite.fromSocket,invite.toSocket].includes(socket.id))cancelInvite(invite,'상대가 마을을 떠났어요.');
    for(const race of races.values()){
      const player=race.players.find(p=>p.socketId===socket.id);if(!player||player.left)continue;
      player.left=true;
      if(player.gameId)store.run('UPDATE games SET finished=2 WHERE id=? AND finished=0',player.gameId);
      if(!race.started){raceEmit(race,'runner:cancelled',{id:race.id,reason:'상대가 준비 중에 나갔어요.'});races.delete(race.id);emitVillage(race.villageId);}
      else for(const other of race.players)if(other!==player)io.to(other.socketId).emit('runner:opponent-left',{id:race.id,userId:player.userId});
    }
  }
  function publishRace(race){
    const elapsed=Math.max(0,Date.now()-race.started);
    const players=race.players.map(player=>{
      const g=store.one('SELECT * FROM games WHERE id=?',player.gameId);
      const state=g.finished?JSON.parse(g.hits):advanceRun(JSON.parse(g.hits),JSON.parse(g.notes),elapsed);
      if(!g.finished)store.run('UPDATE games SET hits=? WHERE id=?',JSON.stringify(state),g.id);
      return {userId:player.userId,nickname:player.nickname,state,score:runScore(state),left:player.left,finished:!!g.finished||!state.lives||elapsed>=RUN_DURATION};
    });
    raceEmit(race,'runner:snapshot',{id:race.id,elapsed,players});
  }
  app.post('/api/games',auth,(req,res)=>{
    const {targetId,anonymous,kind}=z.object({targetId:z.string().uuid(),anonymous:z.boolean().default(false),kind:z.enum(['rhythm','runner']).default('rhythm')}).parse(req.body);checkTarget(req,targetId);
    const unfinished=busy(req.user.id);if(unfinished)fail(409,'진행 중인 미니게임이 있어요. 게임을 마치거나 나간 뒤 다시 시작해주세요.');
    const notes=kind==='rhythm'?Array.from({length:40},(_,i)=>({time:2500+i*650,lane:randomBytes(1)[0]%4})):Array.from({length:20},(_,i)=>({time:5000+i*1950,lane:i%4===0?-1:randomBytes(1)[0]%3,height:i%4===0?.9:1.15}));
    const gid=id();const started=Date.now();store.run('INSERT INTO games(id,user_id,target_id,notes,hits,started,finished,anonymous,kind) VALUES(?,?,?,?,?,?,0,?,?)',gid,req.user.id,targetId,JSON.stringify(notes),JSON.stringify(kind==='runner'?newRun():[]),started,Number(anonymous),kind);event(req.user.id,'game_started',{kind});for(const villageId of villageVisitors.keys())if(villageVisitors.get(villageId).has(req.user.id))emitVillage(villageId);res.status(201).json({id:gid,kind,notes,duration:kind==='runner'?RUN_DURATION:30000,serverTime:started});
  });
  function running(req){const g=store.one("SELECT * FROM games WHERE id=? AND user_id=? AND kind='runner' AND finished=0",req.params.id,req.user.id);if(!g)fail(404,'진행 중인 달리기가 아니에요.');checkTarget(req,g.target_id);if(Date.now()-g.started>120000)fail(400,'게임 시간이 만료됐어요.');return g;}
  app.post('/api/games/:id/action',auth,(req,res)=>{const {action}=z.object({action:z.enum(['left','right','jump'])}).strict().parse(req.body);const g=running(req);const state=runAction(JSON.parse(g.hits),JSON.parse(g.notes),Date.now()-g.started,action);store.run('UPDATE games SET hits=? WHERE id=?',JSON.stringify(state),g.id);res.json({state,elapsed:Date.now()-g.started});const race=races.get(raceByGame.get(g.id));if(race)publishRace(race);});
  app.get('/api/games/:id/state',auth,(req,res)=>{const g=running(req);const state=advanceRun(JSON.parse(g.hits),JSON.parse(g.notes),Date.now()-g.started);store.run('UPDATE games SET hits=? WHERE id=?',JSON.stringify(state),g.id);res.json({state,elapsed:Date.now()-g.started});});
  app.post('/api/games/:id/abandon',auth,(req,res)=>{store.run('UPDATE games SET finished=2 WHERE id=? AND user_id=? AND finished=0',req.params.id,req.user.id);for(const villageId of villageVisitors.keys())if(villageVisitors.get(villageId).has(req.user.id))emitVillage(villageId);res.json({ok:true});});
  app.post('/api/games/:id/hit',auth,(req,res)=>{
    const {lane}=z.object({lane:z.number().int().min(0).max(3)}).parse(req.body);const g=store.one("SELECT * FROM games WHERE id=? AND user_id=? AND finished=0 AND kind='rhythm'",req.params.id,req.user.id);if(!g)fail(404,'진행 중인 게임이 아니에요.');
    const elapsed=Date.now()-g.started;const hits=JSON.parse(g.hits);const notes=JSON.parse(g.notes);const index=notes.findIndex((n,i)=>n.lane===lane&&!hits.some(h=>h.index===i)&&Math.abs(n.time-elapsed)<=300);
    let rating='miss';if(index>=0){rating=Math.abs(notes[index].time-elapsed)<130?'perfect':'good';hits.push({index,rating});store.run('UPDATE games SET hits=? WHERE id=?',JSON.stringify(hits),g.id);}res.json({rating,combo:hits.length});
  });
  app.post('/api/games/:id/finish',auth,(req,res)=>{
    const g=store.one('SELECT * FROM games WHERE id=? AND user_id=?',req.params.id,req.user.id);if(!g)fail(404,'게임을 찾을 수 없어요.');if(g.finished)fail(409,'이미 정산된 게임이에요.');if(Date.now()-g.started>120000)fail(400,'게임 시간이 만료됐어요.');checkTarget(req,g.target_id);
    const state=g.kind==='runner'?advanceRun(JSON.parse(g.hits),JSON.parse(g.notes),Date.now()-g.started):null;
    if(state?state.lives>0&&state.elapsed<RUN_DURATION:Date.now()-g.started<30000)fail(400,'게임이 끝나면 정산할 수 있어요.');
    const hits=state?state.dodged:JSON.parse(g.hits).length;const score=state?runScore(state):JSON.parse(g.hits).reduce((n,h)=>n+(h.rating==='perfect'?100:65),0);let gold=0;
    store.transaction(()=>{
      store.run('UPDATE games SET finished=1,score=?,hits=? WHERE id=?',score,state?JSON.stringify(state):g.hits,g.id);
      const total=store.one("SELECT COALESCE(SUM(amount),0) n FROM rewards WHERE user_id=? AND type='game' AND day=?",req.user.id,day()).n;
      const place=store.one("SELECT COUNT(*) n FROM rewards WHERE user_id=? AND actor_id LIKE ? AND type='game' AND day=?",req.user.id,`${g.target_id}:%`,day()).n;
      if(hits>=8&&total<300&&place<3){gold=Math.min(300-total,30+Math.floor(score/100));store.run("INSERT INTO rewards VALUES(?,?,'game',?,?)",req.user.id,`${g.target_id}:${g.id}`,day(),gold);store.run('UPDATE users SET gold=gold+? WHERE id=?',gold,req.user.id);rewardVisit(g.target_id,req.user.id,!!g.anonymous);}
      activity(g.target_id,req.user.id,'minigame',`${g.kind==='runner'?'구름 달리기':'별빛 리듬'} ${score}점`,!!g.anonymous);
      event(req.user.id,'game_finished',{kind:g.kind,score,gold});
    });emitUpdate(req.user.id);emitVillage(g.target_id);io.to([`village:${g.target_id}`,`user:${g.target_id}`]).emit('games:changed',{villageId:g.target_id});res.json({score,gold,hits,total:g.kind==='runner'?20:40,lives:state?.lives});
  });
  app.get('/api/villages/:id/records',auth,(req,res)=>{
    checkTarget(req,req.params.id);const kind=z.enum(['rhythm','runner']).parse(req.query.kind||'rhythm');
    // Filter before ranking/limiting; anonymous records never expose a user or game ID.
    const records=store.all(`SELECT g.user_id,g.anonymous,g.score,g.started,u.nickname FROM games g JOIN users u ON u.id=g.user_id WHERE g.target_id=? AND g.kind=? AND g.finished=1 AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.owner_id=? AND b.blocked_id=g.user_id) OR (b.blocked_id=? AND b.owner_id=g.user_id)) ORDER BY g.score DESC,g.started DESC LIMIT 30`,req.params.id,kind,req.user.id,req.user.id);
    res.json({records:records.map((r,i)=>({rank:i+1,nickname:r.anonymous?'익명의 이웃':r.nickname||'새싹',score:r.score,playedAt:new Date(r.started).toISOString(),isMe:r.user_id===req.user.id}))});
  });

  app.post('/api/topics',auth,aiLimiter,async(req,res)=>{
    const data=z.object({targetId:z.string().uuid(),topic:z.string().trim().min(1).max(120)}).parse(req.body);const target=checkTarget(req,data.targetId,'topic');const me=userById(req.user.id);if(!settingsOf(me).allowTopics)fail(403,'내 아바타의 토픽 허용을 먼저 켜주세요.');if(target.id===me.id)fail(400,'함께할 이웃 아바타를 골라주세요.');
    // A synthetic viewer receives public-only snapshots of BOTH characters, even for the owner.
    const a=assembleContext(store,me,'public-topic-viewer',data.topic);const b=assembleContext(store,target,'public-topic-viewer',data.topic);
    const transcript=[];for(let i=0;i<4;i++){const context=i%2===0?a:b;const text=i===0?`다른 AI 아바타와 ${data.topic} 주제로 대화해줘.`:`상대 아바타: ${transcript.at(-1).text}\n주제: ${data.topic}. 이어서 답해줘.`;const answer=await(options.generateAnswer||generateAnswer)(context,text,[]);transcript.push({speaker:i%2===0?me.nickname:target.nickname,text:answer.reply,emotion:answer.emotion,theme:i%2===0?me.theme:target.theme});}
    const latestTarget=checkTarget(req,target.id,'topic');const latestMe=userById(me.id);if(!settingsOf(latestMe).allowTopics||!sessionUser(req.headers)||assembleContext(store,latestMe,'public-topic-viewer',data.topic).contextKey!==a.contextKey||assembleContext(store,latestTarget,'public-topic-viewer',data.topic).contextKey!==b.contextKey)fail(409,'공개 설정이 변경됐어요. 다시 시도해주세요.');
    const tid=id();store.run('INSERT INTO topic_sessions VALUES(?,?,?,?,?,?)',tid,me.id,target.id,data.topic,JSON.stringify(transcript),now());event(req.user.id,'topic_completed');res.json({id:tid,transcript});
  });
  app.post('/api/feedback',auth,(req,res)=>{const data=z.object({rating:z.number().int().min(1).max(5),resemblance:z.number().int().min(1).max(5),returnIntent:z.number().int().min(1).max(5),note:z.string().max(1000).default('')}).parse(req.body);event(req.user.id,'playtest_feedback',data);res.status(201).json({ok:true});});
  app.get('/api/stats',auth,(req,res)=>{const counts=store.all('SELECT name,COUNT(*) count FROM events WHERE user_id=? GROUP BY name',req.user.id);res.json({events:counts,memories:store.one('SELECT COUNT(*) count FROM memories WHERE owner_id=?',req.user.id).count,visitors:store.one("SELECT COUNT(DISTINCT actor_id) count FROM activities WHERE owner_id=? AND actor_id<>?",req.user.id,req.user.id).count,stage:stageOf(store,req.user)});});
  app.get('/api/export',auth,(req,res)=>{const user=userById(req.user.id);res.set('Content-Disposition','attachment; filename="pieona-my-data.json"');res.json({exportedAt:now(),profile:profile(user,user.id),avatarSlots:store.all('SELECT * FROM avatar_slots WHERE owner_id=?',user.id).map(s=>({id:s.id,snapshot:s.id===user.active_slot?slotSnapshot(user):JSON.parse(s.snapshot)})),memories:store.all('SELECT * FROM memories WHERE owner_id=?',user.id),conversations:store.all('SELECT c.id,c.target_id,c.share,c.created_at,m.role,m.content,m.created_at message_at FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id WHERE c.viewer_id=?',user.id),events:store.all('SELECT name,detail,created_at FROM events WHERE user_id=?',user.id)});});

  io.use((socket,next)=>{const user=sessionUser(socket.request.headers);if(!user)return next(new Error('로그인이 필요해요.'));socket.data.userId=user.id;socket.data.token=hashToken(cookieToken(socket.request.headers.cookie));next();});
  io.on('connection',socket=>{
    const uid=socket.data.userId;socket.join(`user:${uid}`);online.set(uid,(online.get(uid)||0)+1);io.emit('presence',Array.from(online.keys()));
    const runnerRequest=(name,handler)=>socket.on(name,(data,ack)=>{try{if(!sessionUser(socket.request.headers))fail(401,'로그인이 필요해요.');handler(data,typeof ack==='function'?ack:()=>{});}catch(e){if(typeof ack==='function')ack({ok:false,error:e instanceof z.ZodError?'요청 형식을 확인해주세요.':e.message});}});
    runnerRequest('runner:invite',(data,ack)=>{
      const {userId,anonymous}=z.object({userId:z.string().uuid(),anonymous:z.boolean().default(false)}).strict().parse(data);
      const villageId=socket.data.village?.villageId;if(!villageId||userId===uid)fail(400,'같은 마을의 이웃을 선택해주세요.');
      checkTarget({user:userById(uid)},villageId);checkTarget({user:userById(userId)},villageId);
      if(isBlocked(store,uid,userId))fail(403,'초대할 수 없는 이웃이에요.');
      const member=villageVisitors.get(villageId)?.get(userId),toSocket=member&&[...member.sockets][0];
      if(!toSocket)fail(409,'상대가 마을을 떠났어요.');
      if(busy(uid)||busy(userId)||[...invites.values()].some(i=>[i.from,i.to].some(u=>u===uid||u===userId)))fail(409,'이미 게임이나 초대를 진행 중이에요.');
      const invite={id:id(),villageId,from:uid,to:userId,fromSocket:socket.id,toSocket,anonymous,expires:Date.now()+30000};invites.set(invite.id,invite);
      io.to(toSocket).emit('runner:invited',{id:invite.id,villageId,nickname:userById(uid).nickname,expires:invite.expires});ack({ok:true,id:invite.id});
    });
    runnerRequest('runner:respond',(data,ack)=>{
      const {inviteId,accept,anonymous}=z.object({inviteId:z.string().uuid(),accept:z.boolean(),anonymous:z.boolean().default(false)}).strict().parse(data);
      const invite=invites.get(inviteId);if(!invite||invite.toSocket!==socket.id)fail(404,'초대가 만료됐어요.');
      if(!accept){cancelInvite(invite,'초대를 거절했어요.');ack({ok:true});return;}
      if(invite.expires<Date.now()){cancelInvite(invite,'초대 시간이 만료됐어요.');fail(409,'초대 시간이 만료됐어요.');}
      const sender=io.sockets.sockets.get(invite.fromSocket);
      if(socket.data.village?.villageId!==invite.villageId||sender?.data.village?.villageId!==invite.villageId)fail(409,'같은 마을에 있어야 해요.');
      checkTarget({user:userById(uid)},invite.villageId);checkTarget({user:userById(invite.from)},invite.villageId);
      if(isBlocked(store,uid,invite.from)||busy(uid)||busy(invite.from))fail(409,'지금은 함께 시작할 수 없어요.');
      invites.delete(invite.id);
      const race={id:id(),villageId:invite.villageId,notes:runnerNotes(),created:Date.now(),players:[{userId:invite.from,socketId:invite.fromSocket,anonymous:invite.anonymous},{userId:uid,socketId:socket.id,anonymous}].map(p=>({...p,nickname:userById(p.userId).nickname,appearance:profile(userById(p.userId),p.userId).appearance}))};races.set(race.id,race);emitVillage(race.villageId);
      raceEmit(race,'runner:matched',{id:race.id,villageId:race.villageId,players:race.players.map(({socketId,anonymous,...p})=>p)});ack({ok:true});
    });
    runnerRequest('runner:cancel-invite',(data,ack)=>{const invite=invites.get(data?.id);if(invite&&invite.fromSocket===socket.id)cancelInvite(invite,'초대가 취소됐어요.');ack({ok:true});});
    runnerRequest('runner:leave',(_,ack)=>{leaveRace(socket);if(socket.data.village)emitVillage(socket.data.village.villageId);ack({ok:true});});
    runnerRequest('runner:ready',(data,ack)=>{
      const race=races.get(data?.id),player=race?.players.find(p=>p.socketId===socket.id);
      if(!player)fail(404,'함께할 달리기를 찾을 수 없어요.');player.ready=true;
      if(!race.started&&race.players.every(p=>p.ready)){
        for(const p of race.players){checkTarget({user:userById(p.userId)},race.villageId);if(io.sockets.sockets.get(p.socketId)?.data.village?.villageId!==race.villageId)fail(409,'같은 마을에서 준비해주세요.');}
        if(isBlocked(store,race.players[0].userId,race.players[1].userId))fail(403,'함께 달릴 수 없는 이웃이에요.');
        race.started=Date.now()+1000;
        store.transaction(()=>{for(const p of race.players){p.gameId=id();store.run('INSERT INTO games(id,user_id,target_id,notes,hits,started,finished,anonymous,kind) VALUES(?,?,?,?,?,?,0,?,?)',p.gameId,p.userId,race.villageId,JSON.stringify(race.notes),JSON.stringify(newRun()),race.started,Number(p.anonymous),'runner');raceByGame.set(p.gameId,race.id);}});
        for(const p of race.players)io.to(p.socketId).emit('runner:started',{id:race.id,game:{id:p.gameId,notes:race.notes,duration:RUN_DURATION,started:race.started,serverTime:Date.now()}});
      }ack({ok:true});
    });
    socket.on('village:join',(data,ack)=>{
      try {
        if(!sessionUser(socket.request.headers))throw new Error('로그인이 필요해요.');
        const villageId=z.string().uuid().parse(data?.villageId),target=userById(villageId);
        if(villageId!==uid&&(!settingsOf(target).allowVisitors||isBlocked(store,uid,villageId)))throw new Error('이 마을에 들어갈 수 없어요.');
        if(socket.data.village?.villageId===villageId){
          ack?.({ok:true,villageId,members:villageMembers(villageId)});return;
        }
        leaveVillage(socket);
        const members=villageVisitors.get(villageId)||new Map();
        // One avatar per account, retained until its final tab leaves the room.
        const member=members.get(uid)||{userId:uid,x:uid===villageId?-1:1,z:3,rotation:0,moving:false,sockets:new Set(),lastMove:0};
        member.sockets.add(socket.id);members.set(uid,member);villageVisitors.set(villageId,members);
        socket.data.village={villageId,userId:uid};socket.join(`village:${villageId}`);
        emitVillage(villageId);ack?.({ok:true,villageId,members:villageMembers(villageId)});
      }catch{ack?.({ok:false});}
    });
    socket.on('village:leave',ack=>{leaveVillage(socket);if(typeof ack==='function')ack({ok:true});});
    socket.on('village:move',data=>{
      const current=socket.data.village;if(!current||data?.villageId!==current.villageId)return;
      const target=userById(current.villageId);
      if(!sessionUser(socket.request.headers)||uid!==target.id&&(!settingsOf(target).allowVisitors||isBlocked(store,uid,target.id))){leaveVillage(socket);return;}
      const {x,z,rotation,moving}=data;
      if(data.jumpStarted!==undefined&&(!Number.isFinite(data.jumpStarted)||data.jumpStarted<0||data.jumpStarted>Date.now()+5000))return;
      if(![x,z,rotation].every(value=>typeof value==='number'&&Number.isFinite(value))||typeof moving!=='boolean')return;
      const member=villageVisitors.get(current.villageId)?.get(uid);if(!member)return;
      const time=Date.now();if(moving&&time-member.lastMove<60&&data.jumpStarted===member.jumpStarted)return;
      member.lastMove=time;
      const radius=Math.hypot(x,z),factor=radius>5.8?5.8/radius:1;
      member.x=x*factor;member.z=z*factor;member.rotation=Math.atan2(Math.sin(rotation),Math.cos(rotation));member.moving=moving;
      if(data.jumpStarted!==undefined)member.jumpStarted=data.jumpStarted;
      const update={villageId:current.villageId,userId:uid,x:member.x,z:member.z,rotation:member.rotation,moving,...(member.jumpStarted!==undefined?{jumpStarted:member.jumpStarted}:{})};
      const room=socket.to(`village:${current.villageId}`);
      // Moving samples can be dropped; the final pose must be delivered reliably.
      if(moving)room.volatile.emit('village:move',update);else room.emit('village:move',update);
    });
    socket.on('disconnect',()=>{leaveVillage(socket);const count=(online.get(uid)||1)-1;if(count)online.set(uid,count);else online.delete(uid);io.emit('presence',Array.from(online.keys()));});
  });
  const raceTimer=setInterval(()=>{for(const i of invites.values())if(i.expires<Date.now())cancelInvite(i,'초대 시간이 만료됐어요.');for(const r of races.values()){if(!r.started&&Date.now()-r.created>45000){raceEmit(r,'runner:cancelled',{id:r.id,reason:'게임 준비 시간이 만료됐어요.'});races.delete(r.id);emitVillage(r.villageId);}else if(r.started){publishRace(r);if(Date.now()-r.started>120000||r.players.every(p=>p.left||store.one('SELECT finished FROM games WHERE id=?',p.gameId)?.finished)){for(const p of r.players)raceByGame.delete(p.gameId);races.delete(r.id);}}}},100);raceTimer.unref();
  const maintenance=setInterval(()=>{store.run('DELETE FROM sessions WHERE expires<?',Date.now());for(const socket of io.sockets.sockets.values())if(!sessionUser(socket.request.headers))socket.disconnect(true);},60000);maintenance.unref();
  app.use('/resource',express.static(resolve('resource'),{maxAge:'7d',immutable:true}));
  const dist=resolve('dist');if(existsSync(dist)){app.use(express.static(dist,{maxAge:'1h'}));app.get('/{*splat}',(req,res,next)=>req.path.startsWith('/api/')?next():res.sendFile(resolve(dist,'index.html')));}
  app.use('/api',(req,res)=>res.status(404).json({error:'요청한 기능을 찾을 수 없어요.'}));
  app.use((error,req,res,next)=>{
    if(res.headersSent)return next(error);
    const messages={AI_RATE_LIMIT:'Gemini 사용 한도에 도달했어요. 잠시 후 다시 시도해주세요.',AI_UNAVAILABLE:'Gemini 연결에 실패했어요. 서버의 키와 모델 설정을 확인해주세요.',AI_EMPTY:'응답을 만들지 못했어요. 다른 표현으로 다시 이야기해주세요.'};
    const status=error instanceof z.ZodError?400:error.status&&error.status<500?error.status:error.message?.startsWith('AI_')?502:500;
    if(status===500)console.error('[server]',error.name,error.message?.slice(0,160));
    res.status(status).json({error:error instanceof z.ZodError?'입력 형식 또는 길이를 확인해 주세요.':messages[error.message]||(status===500?'처리 중 오류가 발생했어요. 다시 시도해 주세요.':error.message)});
  });
  return {app,server,io,store,close:async()=>{clearInterval(maintenance);clearInterval(raceTimer);await new Promise(r=>io.close(r));if(server.listening)await new Promise(r=>server.close(r));store.close();}};
}
