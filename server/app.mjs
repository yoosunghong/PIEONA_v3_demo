import {communityDefinitions,communityPlacements,objectClearance} from '../shared/communityObjects.mjs';
import {arrivalQuestions,chooseArrivalQuestion} from '../shared/arrivalQuestions.mjs';
import {petTypes,petColors} from '../shared/pets.mjs';
import {dragonMountColor} from '../shared/dragonMount.mjs';
import {SURVEY_REWARD,DRAGON_PET,DRAGON_NEST} from '../shared/surveyRewards.mjs';
import {isLifeScenery,validLifePlacement} from '../shared/lifeLayout.mjs';
import {WALK_RADIUS,SCENERY_RADIUS} from '../shared/villageSize.mjs';
import {sceneryDefinitions,villageScenery,validSceneryPlacement,sceneryClearance,suppressedScenery} from '../shared/scenery.mjs';
import {villageBenches,BENCH_REACH} from '../shared/benches.mjs';
import {installLife} from './life.mjs';
import {installPersonaScripts} from './personaScripts.mjs';
import {installExploration} from './exploration.mjs';
import {createActionLogger} from './actionLog.mjs';
import {generateTopic} from './topic.mjs';
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
import { openStore, id, now, day, settingsOf, publicUser, isBlocked, visibleMemories, stageOf, experienceOf, defaultSettings } from './store.mjs';
import { assembleContext, generateAnswer, aiMode } from './ai.mjs';
import { decorations, hats, accessories, rides, colors, validPlacement, villageThemes, characters, characterLooks } from '../shared/world.mjs';
import { RUN_DURATION, RUN_EXPIRY, createRunnerNotes, newRun, advanceRun, runAction, runScore } from '../shared/runner.mjs';
import {installCrabGames} from './crabGames.mjs';
import {crabSeconds} from '../shared/crab.mjs';
import {installVolleyGames} from './volleyGames.mjs';
import {MAX_PARTY_PLAYERS,maxGamePlayers} from '../shared/multiplayer.mjs';
import {surveyQuestions,surveyVersion} from '../shared/survey.mjs';
import {surveyDefinitions,combinedSurveyVersion,statisticsQuestions} from '../shared/surveyHistory.mjs';
import {canReadSurvey,surveyStatistics,surveyComments} from './surveyStatistics.mjs';
import {villageSign,isSignColor,MAX_CUSTOM_SIGN_COLORS,signShapes,MAX_SIGN_STROKES,MAX_SIGN_POINTS,signPointCount} from '../shared/sign.mjs';
import {villageGuestbook,GUESTBOOK_PAGE_SIZE,GUESTBOOK_MAX_LENGTH,guestbookLength} from '../shared/guestbook.mjs';
import {balanceQuestions as questions,scenarioQuestions} from '../shared/onboarding.mjs';
import {preferenceQuestions} from '../shared/avatarCards.mjs';
import {installAvatarCards} from './avatarCards.mjs';
import {installWordGames} from './wordGames.mjs';
import {installVillagePolls} from './villagePolls.mjs';

const scrypt = promisify(scryptCallback);
const hashToken = value => createHash('sha256').update(value).digest('hex');
const cookieToken = header => (header || '').split(';').map(s => s.trim()).find(s => s.startsWith('pieona_session='))?.slice(15);
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
const nickname = z.string().trim().min(1).max(20);
const visibility = z.enum(['private','close','public']);
const categories = z.enum(['취향','가치관','경험','말투','일상']);
export {questions};

export function createApp(options = {}) {
  const logAction=createActionLogger(options.logWriter||(options.testing?()=>{}:undefined));
  const store = options.store || openStore(process.env.DATABASE_PATH);
  const app = express(); const server = createServer(app);
  const origins = new Set([options.publicOrigin || process.env.PUBLIC_ORIGIN || 'https://play.illova.app', 'http://127.0.0.1:3000', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://localhost:5173']);
  const io = new Server(server, { maxHttpBufferSize: 16384, allowRequest: (req, done) => done(null, !req.headers.origin || origins.has(req.headers.origin)) });
  const invites=new Map(), races=new Map(), raceByGame=new Map();
  const online = new Map(); const locks = new Set(); const villageVisitors = new Map();
  app.set('trust proxy', 'loopback');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'blob:', 'data:'], connectSrc: ["'self'", 'ws:', 'wss:'], workerSrc: ["'self'", 'blob:'], upgradeInsecureRequests: null } }, crossOriginEmbedderPolicy: false }));
  app.use('/api/me/world',express.json({limit:'1mb'}));
  app.use(express.json({ limit: '20kb' }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control','no-store'); if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin && !origins.has(req.headers.origin)) return res.status(403).json({ error: '허용되지 않은 요청 출처입니다.' }); next(); });
  app.use('/api', rateLimit({ windowMs: 60_000, limit: options.testing ? 5000 : 240, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '요청이 많아요. 잠시 후 다시 시도해 주세요.' } }));
  const authLimiter = rateLimit({ windowMs: 15*60_000, limit: options.testing ? 500 : 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '로그인 시도가 많아요. 15분 후 다시 시도해 주세요.' } });
  const aiLimiter = rateLimit({ windowMs: 30*60_000, limit: options.testing ? 500 : 30, keyGenerator: req => req.user.id, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'AI 호출 한도에 도달했어요. 30분 후 다시 시도해 주세요.' } });
  function userById(userId) { const user = store.one('SELECT * FROM users WHERE id=?', userId); if (!user) fail(404, '아바타를 찾을 수 없어요.'); return user; }
  function sessionUser(headers) { const token = cookieToken(headers.cookie); if (!token) return null; return store.one('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?', hashToken(token), Date.now()); }
  function auth(req, res, next) { req.user = sessionUser(req.headers); if (!req.user) return res.status(401).json({ error: '로그인이 필요해요.' }); next(); }
  const profile = (user, viewer) => publicUser(store, user, viewer, new Set(online.keys()));
  function emitUpdate(userId) { io.to(`user:${userId}`).emit('refresh'); }
  function emitWorld() { io.emit('world:changed'); }
  function emitSurveyChange(name='survey:changed') {
    for(const socket of io.sockets.sockets.values()){
      const user=sessionUser(socket.request.headers);
      if(canReadSurvey(user)&&(name!=='survey:managers-changed'||user.survey_role==='admin'))socket.emit(name);
    }
  }
  function villageMembers(villageId) {
    return Array.from(villageVisitors.get(villageId)?.values() || []).map(({sockets,lastMove,...member})=>{
      const user=userById(member.userId);
      return {...member,runnerBusy:!!busy(member.userId),nickname:user.nickname,appearance:profile(user,user.id).appearance};
    }).concat(life.petMembers(villageId).map(member=>{const user=profile(userById(member.ownerId),member.ownerId);return {...member,appearance:member.actorKind==='MOUNT'?{petType:DRAGON_PET,petColor:dragonMountColor(user.appearance,user.avatarAppearance)}:user.avatarAppearance};}));
  }
  function emitVillage(villageId) {
    io.to(`village:${villageId}`).emit('village:members',{villageId,members:villageMembers(villageId),garden:life.gardenSnapshot(villageId)});
  }
  function leaveVillage(socket) {
    const current=socket.data.village;
    if(!current)return;
    socket.leave(`village:${current.villageId}`);
    const members=villageVisitors.get(current.villageId),member=members?.get(current.userId);
    member?.sockets.delete(socket.id);
    if(member)member.moving=false;
    if(member&&!member.sockets.size){life.cancelDuel(current.userId);if(current.userId===current.villageId)life.leave(current.userId);else if(life.active(current.userId)?.village_id===current.villageId)life.stop(current.userId);members.delete(current.userId);wordGames.leave(current.userId,current.villageId);}
    if(members&&!members.size)villageVisitors.delete(current.villageId);
    socket.data.village=null;
    logAction(current.userId,'village_leave',{villageId:current.villageId});
    leaveRace(socket);
    emitVillage(current.villageId);
  }
  function activity(ownerId, actorId, type, detail='', anonymous=false) { store.run('INSERT INTO activities VALUES(?,?,?,?,?,?,?)', id(), ownerId, actorId, type, detail, Number(anonymous), now()); emitUpdate(ownerId); }
  function event(userId, name, detail={}) { store.run('INSERT INTO events VALUES(?,?,?,?,?)', id(), userId, name, JSON.stringify(detail), now()); logAction(userId,name,detail); }
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

  app.get('/api/health', (req,res) => res.json({ ok:true, app:'pieona', ai: aiMode(), version:'1.0.0', revision:process.env.APP_REVISION||'local' }));
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
  const hasDragonReward=userId=>!!store.one('SELECT 1 FROM account_rewards WHERE user_id=? AND reward_id=?',userId,SURVEY_REWARD);
  app.post('/api/me/mount',auth,(req,res)=>{
    const {riding,villageId}=z.object({riding:z.boolean(),villageId:z.string().uuid()}).strict().parse(req.body);
    if(!hasDragonReward(req.user.id))fail(403,'설문을 완료하면 아기용 탈것을 받을 수 있어요.');
    const player=villageVisitors.get(villageId)?.get(req.user.id);
    if(!player)fail(409,'마을에 입장한 뒤 탑승해 주세요.');
    if(player.seatId||busy(req.user.id))fail(409,'현재 활동을 마친 뒤 탑승해 주세요.');
    const user=userById(req.user.id),look=profile(user,user.id).appearance;
    if(riding&&look.ride!==DRAGON_PET){
      const dragon=life.petMembers(villageId).find(m=>m.actorKind==='MOUNT'&&m.ownerId===user.id);
      if(!dragon||Math.hypot(dragon.x-player.x,dragon.z-player.z)>2.6)fail(409,'내 아기용 가까이로 이동해 주세요.');
    }
    const appearance={...look,petColor:dragonMountColor(look,profile(user,user.id).avatarAppearance),ride:riding?DRAGON_PET:'none'};
    const saved=characterLooks(appearance,JSON.parse(user.character_looks));
    store.run('UPDATE users SET appearance=?,character_looks=? WHERE id=?',JSON.stringify(appearance),JSON.stringify(saved),user.id);
    player.jumpStarted=0;
    life.tick();emitWorld();for(const room of villageVisitors.keys())emitVillage(room);
    res.json({user:profile(userById(user.id),user.id)});
  });
  function checkRewardPet(userId,look){if((look?.petType===DRAGON_PET||look?.ride===DRAGON_PET)&&!hasDragonReward(userId))fail(403,'설문을 완료하면 아기용 탈것을 받을 수 있어요.');}
  app.patch('/api/me/pet/appearance',auth,(req,res)=>{
    const data=z.object({petType:z.enum(petTypes.map(p=>p.id)),petColor:z.enum(petColors.map(p=>p.id)),petName:z.string().trim().max(20).optional()}).strict().parse(req.body);
    checkRewardPet(req.user.id,data);
    const user=userById(req.user.id),look={...profile(user,user.id).avatarAppearance,...data};
    store.run('UPDATE users SET avatar_appearance=? WHERE id=?',JSON.stringify(look),user.id);
    emitWorld();for(const room of villageVisitors.keys())emitVillage(room);
    res.json({user:profile(userById(user.id),user.id)});
  });
  app.patch('/api/me/world',auth,(req,res)=>{
    const item=z.object({hidden:z.boolean().optional(),id:z.string().uuid(),type:z.enum(decorations.map(d=>d.id)),x:z.number().finite(),z:z.number().finite(),rotation:z.number().int().min(0).max(3)}).strict();
    const sceneryItem=z.object({hidden:z.boolean().optional(),id:z.enum(sceneryDefinitions.map(item=>item.id)),x:z.number().finite(),z:z.number().finite(),rotation:z.number().int().min(0).max(3)}).strict().refine(item=>Math.hypot(item.x,item.z)<=SCENERY_RADIUS,'마을 안에 놓아주세요.');
    const lookSchema=z.object({petType:z.enum(petTypes.map(p=>p.id)).optional(),petColor:z.enum(petColors.map(p=>p.id)).optional(),petName:z.string().trim().max(20).optional(),character:z.enum(characters.map(c=>c.id)).optional(),ride:z.enum(rides.map(r=>r.id)).optional(),hat:z.enum(hats.map(h=>h.id)),accessory:z.enum(accessories.map(a=>a.id)),color:z.enum(colors)}).strict();
    const point=z.tuple([z.number().finite().min(0).max(1),z.number().finite().min(0).max(1)]);
    const stroke=z.object({tool:z.enum(['draw','erase']),color:z.string().max(9).refine(isSignColor),size:z.number().finite().min(2).max(40),points:z.array(point).min(1).max(2000)}).strict();
    const signSchema=z.object({customColors:z.array(z.string().max(9).refine(isSignColor)).max(MAX_CUSTOM_SIGN_COLORS).optional(),hidden:z.boolean().optional(),x:z.number().finite().optional(),z:z.number().finite().optional(),rotation:z.number().int().min(0).max(3).optional(),shape:z.enum(signShapes).optional(),strokes:z.array(stroke).max(MAX_SIGN_STROKES).refine(strokes=>signPointCount(strokes)<=MAX_SIGN_POINTS).optional()}).strict();
    const guestbookSchema=z.object({hidden:z.boolean().optional(),x:z.number().finite().optional(),z:z.number().finite().optional(),rotation:z.number().int().min(0).max(3).optional()}).strict();
    const data=z.object({avatarAppearance:lookSchema.optional(),avatarCharacterLooks:z.object(Object.fromEntries(characters.map(c=>[c.id,lookSchema.optional()]))).strict().optional(),characterLooks:z.object(Object.fromEntries(characters.map(c=>[c.id,lookSchema.optional()]))).strict().optional(),village:z.object({scenery:z.array(sceneryItem).max(sceneryDefinitions.length).refine(items=>new Set(items.map(item=>item.id)).size===items.length).optional(),items:z.array(item).max(256).refine(items=>items.filter(item=>!item.hidden).length<=24).optional(),theme:z.enum(villageThemes.map(t=>t.id)).optional(),sign:signSchema.optional(),guestbook:guestbookSchema.optional(),pollbox:guestbookSchema.optional(),chalkboard:guestbookSchema.optional()}).strict().optional(),appearance:lookSchema.optional()}).strict().parse(req.body);
    const user=userById(req.user.id);
    const oldVillage=JSON.parse(user.village),nextVillage={...oldVillage,...data.village};
    // Resolve legacy colors before persisting a mount selected in the wardrobe.
    if(data.appearance?.ride===DRAGON_PET&&!data.appearance.petColor){const current=profile(user,user.id);data.appearance.petColor=dragonMountColor(current.appearance,current.avatarAppearance);}
    for(const look of [data.appearance,data.avatarAppearance,...Object.values(data.characterLooks||{}),...Object.values(data.avatarCharacterLooks||{})])checkRewardPet(user.id,look);
    const nests=data.village?.items?.filter(item=>item.type===DRAGON_NEST)||[];
    if(nests.length&&!hasDragonReward(user.id))fail(403,'설문을 완료하면 아기용 전용 둥지를 받을 수 있어요.');
    if(nests.length>1)fail(400,'아기용 전용 둥지는 한 개만 보유할 수 있어요.');
    // Keep legacy/default placements, including overlaps, until an object is moved or restored.
    // Browser and Node trigonometry can differ by a few ULPs for default scenery.
    const placementChanged=(before,after)=>!before||before.hidden&&!after.hidden||Math.abs(before.x-after.x)>1e-6||Math.abs(before.z-after.z)>1e-6;
    const sceneryMoved=(before,after)=>placementChanged(before,after)||!!before?.hidden!==!!after.hidden||isLifeScenery(after.id)&&after.id!=='scenery:life-storage'&&before.rotation!==after.rotation;
    const itemMoved=item=>placementChanged(oldVillage.items?.find(old=>old.id===item.id),item);
    if(data.village?.items){const savedItems=data.village.items,items=savedItems.filter(item=>!item.hidden);if(decorations.some(entry=>Number.isFinite(entry.quantity)&&items.filter(item=>item.type===entry.id).length>entry.quantity))fail(400,'소품별 보유 수량을 초과해 배치할 수 없어요.');if(new Set(savedItems.map(i=>i.id)).size!==savedItems.length||items.some(i=>itemMoved(i)&&!validPlacement(i.x,i.z,nextVillage.scenery))||items.some((a,i)=>items.some((b,j)=>j>i&&(itemMoved(a)||itemMoved(b))&&Math.hypot(a.x-b.x,a.z-b.z)<.4)))fail(400,'소품은 중앙 광장과 산책로를 피해 서로 간격을 두고 배치해주세요.');}
    if(data.village?.sign)nextVillage.sign={...villageSign(oldVillage),...data.village.sign};
    if(data.village?.guestbook)nextVillage.guestbook={...villageGuestbook(oldVillage),...data.village.guestbook};
    if(data.village?.sign||data.village?.items||data.village?.guestbook){
      const sign=villageSign(nextVillage);
      const signMoved=placementChanged(villageSign(oldVillage),sign);
      if(!sign.hidden&&((signMoved&&!validPlacement(sign.x,sign.z,nextVillage.scenery))||(nextVillage.items||[]).some(item=>!item.hidden&&(signMoved||itemMoved(item))&&Math.hypot(item.x-sign.x,item.z-sign.z)<.4)))fail(400,'팻말은 광장·시설·다른 소품을 피해 배치해주세요.');
      const book=villageGuestbook(nextVillage);
      const bookMoved=placementChanged(villageGuestbook(oldVillage),book);
      if(!book.hidden&&((bookMoved&&!validPlacement(book.x,book.z,nextVillage.scenery))||(nextVillage.items||[]).some(item=>!item.hidden&&(bookMoved||itemMoved(item))&&Math.hypot(item.x-book.x,item.z-book.z)<.4)||(!sign.hidden&&(bookMoved||signMoved)&&Math.hypot(sign.x-book.x,sign.z-book.z)<.4)))fail(400,'방명록은 광장·시설·팻말·다른 소품을 피해 배치해주세요.');
    }
    if(data.village){
      const before=communityPlacements(oldVillage);
      for(const def of communityDefinitions)if(data.village[def.key])nextVillage[def.key]={...before.find(item=>item.id===def.id),...data.village[def.key]};
      const after=communityPlacements(nextVillage);
      const objects=[...villageScenery(nextVillage),...(nextVillage.items||[]),{...villageSign(nextVillage),id:'village-sign'},{...villageGuestbook(nextVillage),id:'village-guestbook'},...after].filter(item=>!item.hidden&&!suppressedScenery(item,nextVillage));
      const oldObjects=[...villageScenery(oldVillage),...(oldVillage.items||[]),{...villageSign(oldVillage),id:'village-sign'},{...villageGuestbook(oldVillage),id:'village-guestbook'},...before];
      for(const object of after){
        const def=communityDefinitions.find(def=>def.id===object.id);
        if(object.hidden||!oldVillage[def.key]&&!data.village[def.key])continue;
        const moved=placementChanged(before.find(item=>item.id===object.id),object);
        if(moved&&!validPlacement(object.x,object.z,nextVillage.scenery))fail(400,'투표함과 칠판은 마을의 빈 공간에 배치해주세요.');
        if(objects.some(other=>other.id!==object.id&&(moved||placementChanged(oldObjects.find(item=>item.id===other.id),other))&&Math.hypot(object.x-other.x,object.z-other.z)<objectClearance(object.id,other.id)))fail(400,'투표함·칠판과 다른 소품 사이에 간격을 두어주세요.');
      }
      for(const def of communityDefinitions){if(!data.village[def.key])continue;const {x,z,rotation,hidden}=after.find(item=>item.id===def.id);nextVillage[def.key]={x,z,rotation,hidden};}
    }
    if(data.village?.scenery){
      const before=villageScenery(oldVillage),after=villageScenery(nextVillage);
      const movedFacilities=after.filter(object=>isLifeScenery(object.id)&&sceneryMoved(before.find(item=>item.id===object.id),object));
      if(movedFacilities.length){
        if(store.one("SELECT 1 FROM life_sessions WHERE COALESCE(village_id,owner_id)=? AND status IN ('moving','active')",user.id)||store.one("SELECT 1 FROM life_operations WHERE owner_id=? AND status='pending'",user.id))fail(409,'진행 중인 낚시·텃밭·요리 활동을 마친 뒤 시설을 옮겨주세요.');

      }
      const objects=[...after,...(nextVillage.items||[]),villageSign(nextVillage),villageGuestbook(nextVillage),...communityPlacements(nextVillage)].filter(item=>!item.hidden);
      for(const object of after){
        const old=before.find(item=>item.id===object.id);
        if(object.hidden||!sceneryMoved(old,object))continue;
        if(isLifeScenery(object.id)&&!validLifePlacement(nextVillage,object.id,objects.filter(item=>!/^scenery:(central-stage|stage-stone-|path-stone-)/.test(item.id)&&!suppressedScenery(item,oldVillage))))fail(400,'시설과 작업 자리는 광장·다른 소품을 피해 걸어갈 수 있는 마을 안에 배치해주세요.');
        if(!validSceneryPlacement(object.x,object.z,nextVillage,object.id)||objects.some(other=>other!==object&&!(isLifeScenery(object.id)&&suppressedScenery(other,oldVillage))&&Math.hypot(other.x-object.x,other.z-object.z)<sceneryClearance(object.id,other.id)))fail(400,'광장·산책로·다른 오브젝트를 피해 배치해주세요.');
      }
    }
    const saved=characterLooks(JSON.parse(user.appearance),JSON.parse(user.character_looks));
    for(const [character,look] of Object.entries(data.characterLooks||{}))if(look)saved[character]={...look,character};
    if(data.appearance)saved[data.appearance.character||'pio']={...data.appearance};
    store.run('UPDATE users SET village=?,appearance=?,character_looks=? WHERE id=?',data.village?JSON.stringify(nextVillage):user.village,data.appearance?JSON.stringify(data.appearance):user.appearance,JSON.stringify(saved),user.id);
    const avatarSaved=characterLooks(profile(user,user.id).avatarAppearance,JSON.parse(user.avatar_character_looks));
    for(const [character,look] of Object.entries(data.avatarCharacterLooks||{}))if(look)avatarSaved[character]={...look,character};
    if(data.avatarAppearance)avatarSaved[data.avatarAppearance.character||'pio']={...data.avatarAppearance};
    store.run('UPDATE users SET avatar_appearance=?,avatar_character_looks=? WHERE id=?',JSON.stringify(data.avatarAppearance||profile(user,user.id).avatarAppearance),JSON.stringify(avatarSaved),user.id);
    if(data.village?.items?.some(i=>!i.hidden))event(user.id,'village_decorated');
    if(data.village?.scenery?.some(i=>i.id.startsWith('scenery:life-garden')&&sceneryMoved(villageScenery(oldVillage).find(before=>before.id===i.id),i)))event(user.id,'garden_decorated');
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
  // Entry contents and author identities never travel through village profiles or socket events.
  const guestbookLimiter=rateLimit({windowMs:60_000,limit:options.testing?500:20,keyGenerator:req=>req.user.id,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'글을 너무 빠르게 남기고 있어요. 잠시 후 다시 시도해 주세요.'}});
  const guestbookChanged=villageId=>io.to([`village:${villageId}`,`user:${villageId}`]).emit('guestbook:changed',{villageId});
  const chalkStroke=z.object({tool:z.literal('draw'),color:z.string().max(9).refine(isSignColor),size:z.number().finite().min(2).max(40),points:z.array(z.tuple([z.number().finite().min(0).max(1),z.number().finite().min(0).max(1)])).min(1).max(2000)}).strict();
  const readChalkboard=ownerId=>{const row=store.one('SELECT strokes,revision FROM chalkboards WHERE owner_id=?',ownerId);return row?{strokes:JSON.parse(row.strokes),revision:row.revision}:{strokes:[],revision:0};};
  app.get('/api/villages/:id/chalkboard',auth,(req,res)=>{const target=checkTarget(req,req.params.id);res.json(readChalkboard(target.id));});
  app.post('/api/villages/:id/chalkboard',auth,guestbookLimiter,(req,res)=>{
    const target=checkTarget(req,req.params.id),data=z.object({strokes:z.array(chalkStroke).min(1).max(100),revision:z.number().int().min(0),requestId:z.string().uuid()}).strict().parse(req.body);
    const previous=store.one('SELECT 1 FROM chalkboard_requests WHERE owner_id=? AND request_id=? AND author_id=?',target.id,data.requestId,req.user.id);
    if(previous)return res.json(readChalkboard(target.id));
    const board=readChalkboard(target.id);
    if(data.revision!==board.revision)fail(409,'칠판이 새로 지워졌어요. 새 칠판을 확인한 뒤 다시 남겨주세요.');
    const strokes=[...board.strokes,...data.strokes];
    if(strokes.length>MAX_SIGN_STROKES||signPointCount(strokes)>MAX_SIGN_POINTS)fail(400,'칠판이 가득 찼어요. 마을 주인이 칠판을 지운 뒤 다시 그려주세요.');
    store.run('INSERT INTO chalkboards(owner_id,strokes,revision) VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET strokes=excluded.strokes',target.id,JSON.stringify(strokes),board.revision);
    store.run('INSERT INTO chalkboard_requests(owner_id,request_id,author_id) VALUES(?,?,?)',target.id,data.requestId,req.user.id);
    io.to([`village:${target.id}`,`user:${target.id}`]).emit('chalkboard:changed',{villageId:target.id});res.json({strokes,revision:board.revision});
  });
  app.delete('/api/villages/:id/chalkboard',auth,guestbookLimiter,(req,res)=>{
    const target=checkTarget(req,req.params.id);if(target.id!==req.user.id)fail(403,'마을 주인만 칠판 전체를 지울 수 있어요.');
    const {revision}=z.object({revision:z.number().int().min(0)}).strict().parse(req.body),board=readChalkboard(target.id);
    if(revision!==board.revision)fail(409,'칠판이 변경됐어요. 새로 확인해주세요.');
    store.run("INSERT INTO chalkboards(owner_id,strokes,revision) VALUES(?,'[]',?) ON CONFLICT(owner_id) DO UPDATE SET strokes='[]',revision=excluded.revision",target.id,revision+1);
    io.to([`village:${target.id}`,`user:${target.id}`]).emit('chalkboard:changed',{villageId:target.id});res.json({strokes:[],revision:revision+1});
  });
  app.get('/api/villages/:id/guestbook',auth,(req,res)=>{
    const target=checkTarget(req,req.params.id),own=target.id===req.user.id;
    const requested=z.coerce.number().int().min(1).max(1000000).default(1).parse(req.query.page);
    const where=own?'e.owner_id=?':`e.owner_id=? AND e.visibility='public' AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.owner_id=? AND b.blocked_id=e.author_id) OR (b.blocked_id=? AND b.owner_id=e.author_id))`;
    const args=own?[target.id]:[target.id,req.user.id,req.user.id];
    const total=store.one(`SELECT COUNT(*) total FROM guestbook_entries e WHERE ${where}`,...args).total;
    const pages=Math.max(1,Math.ceil(total/GUESTBOOK_PAGE_SIZE)),page=Math.min(requested,pages);
    const entries=store.all(`SELECT e.*,u.nickname FROM guestbook_entries e JOIN users u ON u.id=e.author_id WHERE ${where} ORDER BY e.created_at DESC,e.rowid DESC LIMIT ? OFFSET ?`,...args,GUESTBOOK_PAGE_SIZE,(page-1)*GUESTBOOK_PAGE_SIZE).map(e=>({id:e.id,content:e.content,anonymous:!!e.anonymous,visibility:e.visibility,createdAt:e.created_at,authorName:e.anonymous?'익명':e.nickname||'이름을 기다리는 새싹',isOwner:!e.anonymous&&e.author_id===target.id}));
    res.json({entries,page,pages,total,pageSize:GUESTBOOK_PAGE_SIZE});
  });
  app.post('/api/villages/:id/guestbook',auth,guestbookLimiter,(req,res)=>{
    const target=checkTarget(req,req.params.id);
    const data=z.object({content:z.string().max(GUESTBOOK_MAX_LENGTH*2).trim().min(1).refine(text=>guestbookLength(text)<=GUESTBOOK_MAX_LENGTH,'방명록은 최대 200자까지 남길 수 있어요.'),anonymous:z.boolean().default(false),visibility:z.enum(['public','private']).default('public')}).strict().parse(req.body);
    const entryId=id();
    store.run('INSERT INTO guestbook_entries(id,owner_id,author_id,content,anonymous,visibility,created_at) VALUES(?,?,?,?,?,?,?)',entryId,target.id,req.user.id,data.content,Number(data.anonymous),data.visibility,now());
    if(target.id!==req.user.id)activity(target.id,req.user.id,'guestbook','방명록에 새 글을 남겼어요',data.anonymous);
    guestbookChanged(target.id);res.status(201).json({ok:true});
  });
  app.delete('/api/villages/:id/guestbook/:entryId',auth,(req,res)=>{
    if(req.params.id!==req.user.id)fail(403,'마을 주인만 방명록 글을 삭제할 수 있어요.');
    const deleted=store.run('DELETE FROM guestbook_entries WHERE id=? AND owner_id=?',req.params.entryId,req.user.id);
    if(!deleted.changes)fail(404,'이미 삭제되었거나 찾을 수 없는 글이에요.');
    guestbookChanged(req.user.id);res.json({ok:true});
  });
  app.get('/api/questions', auth, (req,res) => {
    const s=settingsOf(req.user); const date=day(); const seed=[...date].reduce((a,c)=>a+c.charCodeAt(0),0);
    const prompts=[`오늘 너에게 작은 행복을 준 순간이 있었어?`, `${s.questionTopic} 이야기를 들려줄래? 요즘 가장 마음이 가는 건 뭐야?`, '요즘 너만의 충전 방법은 뭐야?', '절대 잃고 싶지 않은 너만의 가치는 뭐야?', '일 년 뒤의 너에게 한마디를 남긴다면?'];
    const period=s.questionFrequency==='often'?Math.floor(Date.now()/(4*3600000)):date;
    const answered=store.one("SELECT 1 FROM events WHERE user_id=? AND name='question_answered' AND detail=?", req.user.id,JSON.stringify({period}));
    const skipped=store.one("SELECT 1 FROM events WHERE user_id=? AND name='question_skipped' AND detail=?", req.user.id,JSON.stringify({period}));
    res.json({balance:questions,scenarios:scenarioQuestions,preferences:preferenceQuestions,daily:s.questionFrequency==='off'||answered||skipped?null:prompts[seed%prompts.length],period});
  });
  app.post('/api/questions/status', auth, (req,res) => { const data=z.object({action:z.enum(['answered','skipped','reset'])}).parse(req.body); const s=settingsOf(req.user); const period=s.questionFrequency==='often'?Math.floor(Date.now()/(4*3600000)):day(); if(data.action==='reset') store.run("DELETE FROM events WHERE user_id=? AND name IN ('question_answered','question_skipped') AND detail=?",req.user.id,JSON.stringify({period})); else event(req.user.id,`question_${data.action}`,{period}); res.json({ok:true}); });
  app.post('/api/balance', auth, (req,res) => {
    const answers=z.array(z.object({id:z.string(),choice:z.enum(['a','b'])})).length(5).parse(req.body.answers);
    if(new Set(answers.map(a=>a.id)).size!==5||answers.some(a=>!questions.find(q=>q.id===a.id))) fail(400,'다섯 질문에 모두 답해주세요.');
    const responses=req.body.responses===undefined?null:z.array(z.object({id:z.enum(scenarioQuestions.map(q=>q.id)),text:z.string().trim().min(1).max(240)}).strict()).length(scenarioQuestions.length).parse(req.body.responses);
    if(responses&&new Set(responses.map(r=>r.id)).size!==scenarioQuestions.length)fail(400,'두 상황에 모두 답해주세요.');
    const preferences=req.body.preferences===undefined?null:z.array(z.object({id:z.enum(preferenceQuestions.map(q=>q.id)),value:z.string().max(30)}).strict()).length(preferenceQuestions.length).parse(req.body.preferences);
    const publishPreferences=z.boolean().default(false).parse(req.body.publishPreferences);
    if(preferences&&(new Set(preferences.map(p=>p.id)).size!==preferenceQuestions.length||preferences.some(p=>!preferenceQuestions.find(q=>q.id===p.id).options.includes(p.value))))fail(400,'취향 질문에 모두 답해주세요.');
    store.transaction(()=>{
      store.run("DELETE FROM memories WHERE owner_id=? AND source='balance'",req.user.id);
      for(const answer of answers){const q=questions.find(q=>q.id===answer.id); const time=now(); store.run('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?)',id(),req.user.id,`${q.title} → ${q[answer.choice]}`,q.category,'private',1,'balance',time,time);}
      if(responses){
        store.run("DELETE FROM memories WHERE owner_id=? AND source='onboarding'",req.user.id);
        for(const response of responses){const q=scenarioQuestions.find(q=>q.id===response.id),time=now();store.run('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?)',id(),req.user.id,`${q.title} 내가 실제로 할 말: “${response.text}”`,q.category,'private',1,'onboarding',time,time);}
      }
      if(preferences){store.run("DELETE FROM memories WHERE owner_id=? AND source='preferences'",req.user.id);for(const p of preferences){const time=now();store.run('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?)',id(),req.user.id,`${preferenceQuestions.find(q=>q.id===p.id).title} → ${p.value}`,'취향',publishPreferences?'public':'private',1,'preferences',time,time);}}
      store.run('UPDATE users SET balance=?,revision=revision+1 WHERE id=?',JSON.stringify(answers),req.user.id); event(req.user.id,'balance_completed');
    }); ensureSlot(userById(req.user.id));emitWorld();res.json({user:profile(userById(req.user.id),req.user.id)});
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
  function ensureSlot(user){if(user.active_slot)return user;const sid=id();store.transaction(()=>{store.run('INSERT INTO avatar_slots VALUES(?,?,?,?)',sid,user.id,JSON.stringify(slotSnapshot(user)),now());store.run('UPDATE users SET active_slot=? WHERE id=?',sid,user.id);store.run("UPDATE conversations SET avatar_slot=? WHERE target_id=? AND avatar_slot=''",sid,user.id);store.run("UPDATE avatar_experience SET avatar_slot=? WHERE owner_id=? AND avatar_slot=''",sid,user.id);store.run("UPDATE avatar_legacy_experience SET avatar_slot=? WHERE owner_id=? AND avatar_slot=''",sid,user.id);for(const table of ['life_sessions','life_operations'])store.run(`UPDATE ${table} SET avatar_slot=? WHERE owner_id=? AND avatar_slot=''`,sid,user.id);});return userById(user.id);}
  app.get('/api/slots',auth,(req,res)=>{const user=ensureSlot(userById(req.user.id));res.json({active:user.active_slot,slots:store.all('SELECT * FROM avatar_slots WHERE owner_id=? ORDER BY created_at',user.id).map(s=>{const snap=s.id===user.active_slot?slotSnapshot(user):JSON.parse(s.snapshot);return{id:s.id,nickname:snap.nickname,theme:snap.theme,memoryCount:snap.memories.length,balanceComplete:!!snap.balance.length,active:s.id===user.active_slot};})});});
  app.post('/api/slots',auth,(req,res)=>{const data=z.object({nickname,theme:z.enum(['sage','rose','ocean','sunset']).default('sage')}).parse(req.body);ensureSlot(userById(req.user.id));if(store.one('SELECT COUNT(*) n FROM avatar_slots WHERE owner_id=?',req.user.id).n>=8)fail(400,'프로토타입에서는 최대 8개의 자아를 키울 수 있어요.');const sid=id();store.transaction(()=>{avatars.unlock(req.user.id,sid);store.run('INSERT INTO avatar_slots VALUES(?,?,?,?)',sid,req.user.id,JSON.stringify({nickname:data.nickname,intro:'',theme:data.theme,settings:{...defaultSettings},balance:[],memories:[]}),now());event(req.user.id,'slot_created');});res.status(201).json({id:sid});});
  app.post('/api/slots/:id/activate',auth,(req,res)=>{const user=ensureSlot(userById(req.user.id));if(locks.has(`owner:${user.id}`))fail(409,'내 아바타의 답변이 끝난 뒤 자아를 전환해주세요.');const slot=store.one('SELECT * FROM avatar_slots WHERE id=? AND owner_id=?',req.params.id,user.id);if(!slot)fail(404,'나의 자아 슬롯을 찾을 수 없어요.');if(slot.id!==user.active_slot){life.switchAvatar(user.id);const snapshot=JSON.parse(slot.snapshot);store.transaction(()=>{store.run('UPDATE avatar_slots SET snapshot=? WHERE id=?',JSON.stringify(slotSnapshot(user)),user.active_slot);store.run('DELETE FROM memories WHERE owner_id=?',user.id);for(const m of snapshot.memories)store.run('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?)',m.id,user.id,m.content,m.category,m.visibility,m.confirmed,m.source,m.created_at,m.updated_at);store.run('UPDATE users SET nickname=?,intro=?,theme=?,settings=?,balance=?,active_slot=?,revision=revision+1 WHERE id=?',snapshot.nickname,snapshot.intro,snapshot.theme,JSON.stringify(snapshot.settings),JSON.stringify(snapshot.balance),slot.id,user.id);event(user.id,'slot_activated');});emitWorld();}res.json({user:profile(userById(user.id),user.id)});});

  app.post('/api/visits',auth,(req,res)=>{const data=z.object({targetId:z.string().uuid(),anonymous:z.boolean().default(false)}).parse(req.body);checkTarget(req,data.targetId);if(data.targetId!==req.user.id){const recent=store.one("SELECT 1 FROM activities WHERE owner_id=? AND actor_id=? AND type='visit' AND created_at>?",data.targetId,req.user.id,new Date(Date.now()-60000).toISOString());if(!recent)activity(data.targetId,req.user.id,'visit','마을에 놀러 왔어요',data.anonymous);event(req.user.id,'visit',{targetId:data.targetId});}res.json({ok:true});});
  app.post('/api/cheer',auth,(req,res)=>{const data=z.object({targetId:z.string().uuid(),message:z.string().trim().max(100).default('오늘도 너답게 피어나길!'),anonymous:z.boolean().default(false)}).parse(req.body);checkTarget(req,data.targetId);if(data.targetId===req.user.id)fail(400,'이웃에게 응원을 보내보세요.');const prior=store.one("SELECT 1 FROM activities WHERE owner_id=? AND actor_id=? AND type='cheer' AND created_at>=?",data.targetId,req.user.id,new Date(Date.now()-86400000).toISOString());if(prior)fail(409,'오늘의 응원은 이미 전달했어요.');activity(data.targetId,req.user.id,'cheer',data.message,data.anonymous);rewardVisit(data.targetId,req.user.id,data.anonymous);event(req.user.id,'cheer');res.json({ok:true});});
  app.get('/api/activities',auth,(req,res)=>res.json({activities:store.all('SELECT a.*,u.nickname,EXISTS(SELECT 1 FROM notification_reads r WHERE r.activity_id=a.id) AS is_read FROM activities a JOIN users u ON u.id=a.actor_id WHERE a.owner_id=? ORDER BY a.created_at DESC LIMIT 100',req.user.id).map(a=>({...a,actor_id:a.anonymous?null:a.actor_id,nickname:a.anonymous?'익명의 이웃':a.nickname}))}));
  app.post('/api/activities/read',auth,(req,res)=>{const {ids}=z.object({ids:z.array(z.string()).max(100)}).parse(req.body);store.transaction(()=>{for(const aid of ids)store.run('INSERT OR IGNORE INTO notification_reads(activity_id) SELECT id FROM activities WHERE id=? AND owner_id=?',aid,req.user.id);});emitUpdate(req.user.id);res.json({ok:true});});

  app.post('/api/me/questions/arrival',auth,(req,res)=>{
    const seen=new Set(store.all("SELECT detail FROM events WHERE user_id=? AND name='arrival_question'",req.user.id).map(row=>JSON.parse(row.detail).id));
    const question=chooseArrivalQuestion(seen,options.questionRandom||Math.random);
    if(question)event(req.user.id,'arrival_question',{id:question.id});
    res.json({question});
  });

  app.get('/api/me/conversation',auth,(req,res)=>{
    const user=userById(req.user.id);
    const conversation=store.one('SELECT id FROM conversations WHERE viewer_id=? AND target_id=? AND avatar_slot=? ORDER BY rowid DESC LIMIT 1',user.id,user.id,user.active_slot);
    res.json({conversation:conversation?{id:conversation.id,messages:store.all('SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at,rowid',conversation.id)}:null});
  });

  app.post('/api/conversations',auth,(req,res)=>{
    const data=z.object({targetId:z.string().uuid(),share:z.boolean().default(false),anonymous:z.boolean().default(false),opening:z.enum(arrivalQuestions.map(question=>question.id)).optional(),scene:z.enum(['garden','cafe','campfire']).default('garden')}).parse(req.body);const target=checkTarget(req,data.targetId);
    if(data.opening&&target.id!==req.user.id)fail(400,'내 아바타에게만 시작 질문을 설정할 수 있어요.');
    const cid=id();store.run('INSERT INTO conversations(id,viewer_id,target_id,share,anonymous,context_key,created_at,avatar_slot) VALUES(?,?,?,?,?,?,?,?)',cid,req.user.id,target.id,Number(data.share),Number(data.anonymous),'',now(),target.active_slot);
    if(data.opening){
      const opening=arrivalQuestions.find(question=>question.id===data.opening);
      const context=assembleContext(store,target,req.user.id,'',data.scene);
      store.run('UPDATE conversations SET context_key=? WHERE id=?',context.contextKey,cid);
      store.run('INSERT INTO messages VALUES(?,?,?,?,?,?)',id(),cid,'assistant',opening.text,'curious',now());
    }
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
    res.json({conversations:records.filter(c=>!isBlocked(store,c.viewer_id,c.target_id)).map(c=>{const ownerView=c.viewer_id!==req.user.id;const canRead=!ownerView||!!(c.share&&settingsOf(userById(c.target_id)).receiveTranscripts);return{id:c.id,target_id:c.target_id,viewer_id:ownerView&&c.anonymous?null:c.viewer_id,viewer_name:ownerView&&c.anonymous?'익명의 이웃':c.viewer_name,target_name:c.target_name,viewer_profile:ownerView&&c.anonymous?null:{appearance:profile(userById(c.viewer_id),req.user.id).appearance},target_profile:{appearance:profile(userById(c.target_id),req.user.id).appearance},share:!!c.share,anonymous:!!c.anonymous,created_at:c.created_at,updated_at:c.updated_at,title:canRead?Array.from(c.first_message||'새 대화').slice(0,60).join(''):'비공개 대화',activeAvatar:c.avatar_slot===c.active_slot,canRead,count:canRead?c.message_count:null};})});
  });
  app.get('/api/conversations/:id',auth,(req,res)=>{const c=conversationFor(req,req.params.id);res.json({conversation:{id:c.id,share:!!c.share,anonymous:!!c.anonymous,activeAvatar:c.avatar_slot===userById(c.target_id).active_slot},messages:store.all('SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at,rowid',c.id)});});
  app.patch('/api/conversations/:id',auth,(req,res)=>{const c=conversationFor(req,req.params.id,true);const data=z.object({share:z.boolean()}).parse(req.body);store.run('UPDATE conversations SET share=? WHERE id=?',Number(data.share),c.id);emitUpdate(c.target_id);res.json({ok:true});});
  app.delete('/api/conversations/:id',auth,(req,res)=>{const c=conversationFor(req,req.params.id,true);store.run('DELETE FROM conversations WHERE id=?',c.id);emitUpdate(c.target_id);res.json({ok:true});});
  app.post('/api/conversations/:id/messages',auth,aiLimiter,async(req,res)=>{
    const {text,scene,villageId}=z.object({villageId:z.string().uuid().optional(),text:z.string().trim().min(1).max(1600),scene:z.enum(['garden','cafe','campfire']).default('garden')}).parse(req.body);
    let c=conversationFor(req,req.params.id,true);let target=checkTarget(req,c.target_id);
    if(c.avatar_slot!==target.active_slot)fail(409,'다른 자아와 나눈 대화예요. 해당 자아로 전환하거나 새 대화를 시작해주세요.');
    if(villageId&&(villageId!==target.id||!villageVisitors.get(villageId)?.get(req.user.id)?.sockets.size))fail(409,'마을에 다시 연결한 뒤 전송해 주세요.');
    const publishSpeech=(role,content)=>{
      if(!villageId||!villageVisitors.get(villageId)?.get(req.user.id)?.sockets.size)return;
      io.to(`village:${villageId}`).emit('village:speech',{id:id(),villageId,userId:role==='user'?req.user.id:target.id,role,speaker:role==='user'?req.user.nickname:target.nickname,text:content,expiresAt:Date.now()+45000});
    };
    const lockKey=c.target_id===req.user.id?`owner:${req.user.id}`:c.id,ownsLock=!locks.has(lockKey);
    if(!ownsLock)fail(409,'이전 답변을 기다려 주세요.');
    if(ownsLock)locks.add(lockKey);
    try{
      const context=assembleContext(store,target,req.user.id,text,scene);
      const history=c.context_key===context.contextKey?store.all('SELECT role,content FROM messages WHERE conversation_id=? ORDER BY rowid DESC LIMIT 12',c.id).reverse():[];
      publishSpeech('user',text);
      const result=await (options.generateAnswer||generateAnswer)(context,text,history);
      // Recheck after the network wait: privacy edits, friendship changes, logout and deletion revoke in-flight work.
      c=conversationFor(req,c.id,true);target=checkTarget(req,c.target_id);
      if(c.avatar_slot!==target.active_slot)fail(409,'아바타가 변경됐어요. 새 대화를 시작해주세요.');
      if(!sessionUser(req.headers))fail(401,'로그인이 만료되었어요.');
      if(assembleContext(store,target,req.user.id,text,scene).contextKey!==context.contextKey)fail(409,'기억 또는 공개 설정이 변경됐어요. 다시 전송해 주세요.');
      const added=[];const timestamp=now();
      store.transaction(()=>{
        store.run('INSERT INTO messages VALUES(?,?,?,?,?,?)',id(),c.id,'user',text,'calm',timestamp);
        const replyId=id();
        store.run('INSERT INTO messages VALUES(?,?,?,?,?,?)',replyId,c.id,'assistant',result.reply,result.emotion,now());
        // Chat creates memories; first-hand exploration creates level experience.
        if(context.own){for(const m of result.memories.slice(0,3)){if(store.one('SELECT 1 FROM memories WHERE owner_id=? AND content=?',req.user.id,m.content))continue;const mid=id();store.run('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?)',mid,req.user.id,m.content,m.category,'public',1,'conversation',timestamp,timestamp);added.push({id:mid,...m});}if(added.length)store.run('UPDATE users SET revision=revision+1 WHERE id=?',req.user.id);}
        else {rewardVisit(target.id,req.user.id,!!c.anonymous);if(!history.length)activity(target.id,req.user.id,'conversation',c.share&&settingsOf(target).receiveTranscripts?'공유된 아바타 대화가 도착했어요':'아바타와 대화했어요 · 내용 비공개',!!c.anonymous);}
        // An owner request may add public memories itself; keep that turn's history current.
        store.run('UPDATE conversations SET context_key=? WHERE id=?',assembleContext(store,userById(target.id),req.user.id,text,scene).contextKey,c.id);
        event(req.user.id,'message_sent',{owner:context.own,provider:result.provider,memories:added.length});
      });
      avatars.quests(req.user.id);
      publishSpeech('assistant',result.reply);
      emitWorld();emitUpdate(target.id);
      res.json({reply:result.reply,emotion:result.emotion,memories:added,provider:result.provider,warning:result.warning,stage:stageOf(store,userById(req.user.id)),...experienceOf(store,userById(req.user.id))});
    }finally{if(ownsLock)locks.delete(lockKey);}
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

  const runnerNotes=()=>createRunnerNotes(()=>randomBytes(1)[0]%3);
  const crabs=installCrabGames({app,io,store,auth,sessionUser,checkTarget,busy:userId=>busy(userId),emitVillage,emitUpdate,event,activity,rewardVisit,clock:options.crabClock});
  const volleys=installVolleyGames({app,io,store,auth,sessionUser,checkTarget,busy:userId=>busy(userId),emitVillage,emitUpdate,event,activity,rewardVisit,clock:options.volleyClock});
  const busy=(userId,exceptInvite)=>wordGames.busy(userId)||life.busy(userId)||crabs.busy(userId)||volleys.busy(userId)||store.one("SELECT id FROM games WHERE user_id=? AND finished=0 AND ((kind='runner' AND started>?) OR (kind!='runner' AND started>?))",userId,Date.now()-RUN_EXPIRY,Date.now()-120000)||[...races.values()].some(r=>r.players.some(p=>p.userId===userId)&&!r.started)||[...invites.values()].some(i=>i.id!==exceptInvite&&invitePlayers(i).some(p=>p.userId===userId));
  const personaScripts=installPersonaScripts({app,store,auth,limiter:aiLimiter,io,provider:options.personaProvider,testing:!!options.testing,forceVariant:options.pssForceVariant});
  const life=installLife({app,io,store,auth,sessionUser,villageVisitors,emitVillage,busy,logAction,personaScripts,clock:options.lifeClock,random:options.lifeRandom});
  installExploration({app,store,auth,personaScripts,logAction,clock:options.explorationClock,random:options.explorationRandom});
  const avatars=installAvatarCards({app,store,auth,checkTarget,userById,ensureSlot,profile,emitUpdate,options});
  const wordGames=installWordGames({app,io,store,auth,checkTarget,userById,playerAppearance:user=>profile(user,user.id).appearance,villageVisitors,emitWorld,emitVillage,isBusy:busy,clock:options.socialClock});
  const polls=installVillagePolls({app,io,store,auth,limiter:aiLimiter,checkTarget,userById,ensureSlot,villageVisitors,emitWorld,avatars,personaScripts,generate:options.generatePollAnswer,clock:options.socialClock});
  function raceEmit(r,name,data){for(const player of r.players)io.to(player.socketId).emit(name,data);}
  const invitePlayers=invite=>[{userId:invite.from,socketId:invite.fromSocket,anonymous:invite.anonymous},...invite.guests];
  function cancelInvite(invite,reason){invites.delete(invite.id);for(const p of invitePlayers(invite))io.to(p.socketId).emit('runner:invite-ended',{id:invite.id,reason});}
  function checkParty(players,villageId){
    for(const p of players){checkTarget({user:userById(p.userId)},villageId);if(io.sockets.sockets.get(p.socketId)?.data.village?.villageId!==villageId)fail(409,'같은 마을에 있어야 해요.');}
    for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++)if(isBlocked(store,players[i].userId,players[j].userId))fail(403,'함께할 수 없는 이웃이 있어요.');
  }
  function inviteProgress(invite){const data={id:invite.id,accepted:1+invite.guests.filter(p=>p.accepted).length,total:1+invite.guests.length};for(const p of invitePlayers(invite))io.to(p.socketId).emit('runner:invite-progress',data);}
  const rematchEvent=race=>race.kind==='crab'?'crab:rematch':'game:rematch';
  function startRace(race){
    const started=Date.now()+1000,roomId=race.started?undefined:race.id;
    const round=(race.round||0)+1;
    if(['crab','volley'].includes(race.kind)){
      const engine=race.kind==='volley'?volleys:crabs,room=engine.start(race.players,race.villageId,roomId,started);
      for(const p of race.players){const participant=room.players.find(v=>v.userId===p.userId);p.gameId=participant.gameId;io.to(p.socketId).emit('runner:started',{id:race.id,game:{...engine.info(room,participant),round}});}
    }else{
      if(race.started)race.notes=runnerNotes();
      store.transaction(()=>{for(const p of race.players){raceByGame.delete(p.gameId);p.gameId=id();store.run('INSERT INTO games(id,user_id,target_id,notes,hits,started,finished,anonymous,kind) VALUES(?,?,?,?,?,?,0,?,?)',p.gameId,p.userId,race.villageId,JSON.stringify(race.notes),JSON.stringify(newRun()),started,Number(p.anonymous),'runner');raceByGame.set(p.gameId,race.id);}});
      for(const p of race.players)io.to(p.socketId).emit('runner:started',{id:race.id,game:{id:p.gameId,kind:'runner',round,notes:race.notes,duration:RUN_DURATION,started,serverTime:Date.now()}});
    }
    Object.assign(race,{started,round,settledAt:null,rematch:null});
  }
  function leaveRace(socket){
    for(const invite of invites.values())if(invitePlayers(invite).some(p=>p.socketId===socket.id))cancelInvite(invite,'초대한 친구가 마을을 떠났어요.');
    for(const race of races.values()){
      const player=race.players.find(p=>p.socketId===socket.id);if(!player||player.left)continue;
      player.left=true;
      if(race.kind==='volley')volleys.abandon(player.gameId,player.userId);
      if(race.kind==='crab')crabs.abandon(player.gameId,player.userId);
      race.rematch=null;
      raceEmit(race,rematchEvent(race),{id:race.id,gameId:player.gameId,status:'unavailable'});
      if(player.gameId)store.run('UPDATE games SET finished=2 WHERE id=? AND finished=0',player.gameId);
      if(!race.started){raceEmit(race,'runner:cancelled',{id:race.id,reason:'상대가 준비 중에 나갔어요.'});races.delete(race.id);emitVillage(race.villageId);}
      else if(!['crab','volley'].includes(race.kind))for(const other of race.players)if(other!==player)io.to(other.socketId).emit('runner:opponent-left',{id:race.id,userId:player.userId});
    }
  }
  function publishRace(race){
    if(['crab','volley'].includes(race.kind)||race.settledAt)return;
    const elapsed=Math.max(0,Date.now()-race.started);
    const players=race.players.map(player=>{
      const g=store.one('SELECT * FROM games WHERE id=?',player.gameId);
      const state=g.finished?JSON.parse(g.hits):advanceRun(JSON.parse(g.hits),JSON.parse(g.notes),elapsed);
      if(!g.finished)store.run('UPDATE games SET hits=? WHERE id=?',JSON.stringify(state),g.id);
      return {userId:player.userId,nickname:player.nickname,state,score:runScore(state),left:player.left,finished:!!g.finished||!state.lives||elapsed>=RUN_DURATION};
    });
    raceEmit(race,'runner:snapshot',{id:race.id,round:race.round,elapsed,players});
  }
  app.post('/api/games',auth,(req,res)=>{
    const {targetId,anonymous,kind}=z.object({targetId:z.string().uuid(),anonymous:z.boolean().default(false),kind:z.literal('runner').default('runner')}).parse(req.body);checkTarget(req,targetId);
    const unfinished=busy(req.user.id);if(unfinished)fail(409,'진행 중인 미니게임이 있어요. 게임을 마치거나 나간 뒤 다시 시작해주세요.');
    const notes=runnerNotes();
    const gid=id();const started=Date.now();store.run('INSERT INTO games(id,user_id,target_id,notes,hits,started,finished,anonymous,kind) VALUES(?,?,?,?,?,?,0,?,?)',gid,req.user.id,targetId,JSON.stringify(notes),JSON.stringify(newRun()),started,Number(anonymous),kind);event(req.user.id,'game_started',{kind});for(const villageId of villageVisitors.keys())if(villageVisitors.get(villageId).has(req.user.id))emitVillage(villageId);res.status(201).json({id:gid,kind,notes,duration:RUN_DURATION,serverTime:started});
  });
  function running(req){const g=store.one("SELECT * FROM games WHERE id=? AND user_id=? AND kind='runner' AND finished=0",req.params.id,req.user.id);if(!g)fail(404,'진행 중인 달리기가 아니에요.');checkTarget(req,g.target_id);if(Date.now()-g.started>RUN_EXPIRY)fail(400,'게임 시간이 만료됐어요.');return g;}
  const runnerInput=z.object({action:z.enum(['left','right','jump']),seq:z.number().int().positive().max(10000).optional()}).strict();
  function actOnRun(g,data){
    const {action,seq}=runnerInput.parse(data),previous=JSON.parse(g.hits);
    const elapsed=Math.max(0,Date.now()-g.started);
    if(seq&&seq<=(previous.inputSeq||0))return {state:previous,elapsed};
    const state=runAction(previous,JSON.parse(g.notes),elapsed,action);
    if(seq)state.inputSeq=seq;
    store.run('UPDATE games SET hits=? WHERE id=?',JSON.stringify(state),g.id);
    return {state,elapsed};
  }
  app.post('/api/games/:id/action',auth,(req,res)=>{const g=running(req);res.json(actOnRun(g,req.body));const race=races.get(raceByGame.get(g.id));if(race)publishRace(race);});
  app.get('/api/games/:id/state',auth,(req,res)=>{const g=running(req);const state=advanceRun(JSON.parse(g.hits),JSON.parse(g.notes),Date.now()-g.started);store.run('UPDATE games SET hits=? WHERE id=?',JSON.stringify(state),g.id);res.json({state,elapsed:Date.now()-g.started});});
  app.post('/api/games/:id/abandon',auth,(req,res)=>{crabs.abandon(req.params.id,req.user.id);volleys.abandon(req.params.id,req.user.id);store.run('UPDATE games SET finished=2 WHERE id=? AND user_id=? AND finished=0',req.params.id,req.user.id);for(const villageId of villageVisitors.keys())if(villageVisitors.get(villageId).has(req.user.id))emitVillage(villageId);res.json({ok:true});});
  app.post('/api/games/:id/finish',auth,(req,res)=>{
    const g=store.one('SELECT * FROM games WHERE id=? AND user_id=?',req.params.id,req.user.id);if(!g)fail(404,'게임을 찾을 수 없어요.');if(g.kind!=='runner')fail(400,'해당 게임 화면에서 기록을 저장해주세요.');if(g.finished)fail(409,'이미 정산된 게임이에요.');if(Date.now()-g.started>RUN_EXPIRY)fail(400,'게임 시간이 만료됐어요.');checkTarget(req,g.target_id);
    const state=advanceRun(JSON.parse(g.hits),JSON.parse(g.notes),Date.now()-g.started);
    if(state.lives>0&&state.elapsed<RUN_DURATION)fail(400,'게임이 끝나면 정산할 수 있어요.');
    const hits=state.dodged;const score=runScore(state);let gold=0;
    store.transaction(()=>{
      store.run('UPDATE games SET finished=1,score=?,hits=? WHERE id=?',score,JSON.stringify(state),g.id);
      const total=store.one("SELECT COALESCE(SUM(amount),0) n FROM rewards WHERE user_id=? AND type='game' AND day=?",req.user.id,day()).n;
      const place=store.one("SELECT COUNT(*) n FROM rewards WHERE user_id=? AND actor_id LIKE ? AND type='game' AND day=?",req.user.id,`${g.target_id}:%`,day()).n;
      if(hits>=8&&total<300&&place<3){gold=Math.min(300-total,30+Math.floor(score/100));store.run("INSERT INTO rewards VALUES(?,?,'game',?,?)",req.user.id,`${g.target_id}:${g.id}`,day(),gold);store.run('UPDATE users SET gold=gold+? WHERE id=?',gold,req.user.id);rewardVisit(g.target_id,req.user.id,!!g.anonymous);}
      activity(g.target_id,req.user.id,'minigame',`구름 달리기 ${score}점`,!!g.anonymous);
      event(req.user.id,'game_finished',{kind:g.kind,score,gold});
    });emitUpdate(req.user.id);emitVillage(g.target_id);io.to([`village:${g.target_id}`,`user:${g.target_id}`]).emit('games:changed',{villageId:g.target_id});res.json({score,gold,hits,total:JSON.parse(g.notes).filter(n=>n.kind!=='seed').length,lives:state?.lives,collectedSeeds:state?.collectedSeeds||0});
  });
  app.get('/api/villages/:id/records',auth,(req,res)=>{
    checkTarget(req,req.params.id);const kind=z.enum(['runner','crab','volley']).parse(req.query.kind||'runner');
    // Filter before ranking/limiting; anonymous records never expose a user or game ID.
    const records=store.all(`SELECT g.user_id,g.anonymous,g.score,g.started,g.hits,u.nickname FROM games g JOIN users u ON u.id=g.user_id WHERE g.target_id=? AND g.kind=? AND g.finished=1 AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.owner_id=? AND b.blocked_id=g.user_id) OR (b.blocked_id=? AND b.owner_id=g.user_id)) ORDER BY g.score DESC,g.started DESC LIMIT 30`,req.params.id,kind,req.user.id,req.user.id);
    res.json({records:records.map((r,i)=>({rank:i+1,nickname:r.anonymous?'익명의 이웃':r.nickname||'새싹',score:r.score,playedAt:new Date(r.started).toISOString(),isMe:r.user_id===req.user.id,...(kind==='crab'?{seconds:crabSeconds({elapsed:JSON.parse(r.hits).survived||0})}:{})}))});
  });

  app.post('/api/topics',auth,aiLimiter,async(req,res)=>{
    const data=z.object({targetId:z.string().uuid(),topic:z.string().trim().min(1).max(120)}).parse(req.body);const target=checkTarget(req,data.targetId,'topic');const me=userById(req.user.id);if(!settingsOf(me).allowTopics)fail(403,'내 아바타의 토픽 허용을 먼저 켜주세요.');if(target.id===me.id)fail(400,'함께할 이웃 아바타를 골라주세요.');
    // A synthetic viewer receives public-only snapshots of BOTH characters, even for the owner.
    const a=assembleContext(store,me,'public-topic-viewer',data.topic);const b=assembleContext(store,target,'public-topic-viewer',data.topic);
    const transcript=await generateTopic([a,b],[me,target],data.topic,options.generateAnswer||generateAnswer);
    const latestTarget=checkTarget(req,target.id,'topic');const latestMe=userById(me.id);if(!settingsOf(latestMe).allowTopics||!sessionUser(req.headers)||assembleContext(store,latestMe,'public-topic-viewer',data.topic).contextKey!==a.contextKey||assembleContext(store,latestTarget,'public-topic-viewer',data.topic).contextKey!==b.contextKey)fail(409,'공개 설정이 변경됐어요. 다시 시도해주세요.');
    const tid=id();store.run('INSERT INTO topic_sessions VALUES(?,?,?,?,?,?)',tid,me.id,target.id,data.topic,JSON.stringify(transcript),now());event(req.user.id,'topic_completed');res.json({id:tid,transcript});
  });
  app.get('/api/survey/status',auth,(req,res)=>{
    const participation=store.one('SELECT * FROM survey_participation WHERE user_id=?',req.user.id);
    const counts=store.one(`SELECT SUM(CASE WHEN name='game_finished' THEN 1 ELSE 0 END) games,
      SUM(CASE WHEN name='message_sent' AND json_extract(detail,'$.owner')=1 THEN 1 ELSE 0 END) ownChats,
      SUM(CASE WHEN name='message_sent' AND json_extract(detail,'$.owner')=0 THEN 1 ELSE 0 END) otherChats FROM events WHERE user_id=?`,req.user.id);
    const current=participation?.version===surveyVersion;
    const completed=current&&!!participation.completed,deferred=current&&!completed&&participation.deferred_until>Date.now();
    res.json({completed,deferred,eligible:!completed&&!deferred&&(counts.games>=1||counts.ownChats>=10||counts.otherChats>=5)});
  });
  function surveyReader(req,res,next){if(!canReadSurvey(req.user))return res.status(403).json({error:'설문 통계를 볼 권한이 없어요.'});next();}
  function surveyAdmin(req,res,next){if(req.user.survey_role!=='admin')return res.status(403).json({error:'관리자만 매니저 권한을 변경할 수 있어요.'});next();}
  function statisticsVersion(query){
    if(query.version===combinedSurveyVersion)return combinedSurveyVersion;
    const version=z.coerce.number().int().min(1).default(surveyVersion).parse(query.version);
    if(!surveyDefinitions[version]&&!store.one('SELECT 1 FROM survey_responses WHERE version=?',version))fail(400,'존재하지 않는 설문 버전이에요.');
    return version;
  }
  app.get('/api/survey/statistics',auth,surveyReader,(req,res)=>res.json(surveyStatistics(store,statisticsVersion(req.query))));
  app.get('/api/survey/statistics/comments',auth,surveyReader,(req,res)=>{
    const version=statisticsVersion(req.query);
    const definitions=statisticsQuestions(version);
    const {question,page}=z.object({question:z.string().refine(id=>definitions.some(q=>q.id===id&&q.type!=='rating')),page:z.coerce.number().int().min(1).max(1000000).default(1)}).parse(req.query);
    res.json(surveyComments(store,question,page,10,version));
  });
  app.get('/api/survey/managers',auth,surveyAdmin,(req,res)=>{
    const {q,page}=z.object({q:z.string().trim().max(64).default(''),page:z.coerce.number().int().min(1).max(1000000).default(1)}).parse(req.query);
    const where='instr(lower(username),lower(?))>0 OR instr(lower(nickname),lower(?))>0';
    const total=store.one(`SELECT COUNT(*) n FROM users WHERE ${where}`,q,q).n,pages=Math.max(1,Math.ceil(total/20)),current=Math.min(page,pages);
    const users=store.all(`SELECT id,username,nickname,survey_role AS role FROM users WHERE ${where} ORDER BY CASE survey_role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,username LIMIT 20 OFFSET ?`,q,q,(current-1)*20);
    res.json({users,total,page:current,pages});
  });
  app.patch('/api/survey/managers/:id',auth,surveyAdmin,(req,res)=>{
    const {role}=z.object({role:z.enum(['user','manager'])}).strict().parse(req.body);
    const target=userById(z.string().uuid().parse(req.params.id));
    if(target.survey_role==='admin')fail(403,'관리자의 권한은 이 화면에서 변경할 수 없어요.');
    if(target.survey_role!==role){
      store.transaction(()=>{
        store.run('UPDATE users SET survey_role=? WHERE id=?',role,target.id);
        event(req.user.id,'survey_role_changed',{targetId:target.id,role});
      });
      io.to(`user:${target.id}`).emit('survey:access',{role});
      emitUpdate(target.id);emitSurveyChange('survey:managers-changed');
    }
    res.json({ok:true});
  });
  app.post('/api/survey/defer',auth,(req,res)=>{
    store.run('INSERT INTO survey_participation(user_id,deferred_until,version) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET deferred_until=excluded.deferred_until,completed=CASE WHEN survey_participation.version=excluded.version THEN survey_participation.completed ELSE 0 END,version=excluded.version',req.user.id,Date.now()+86400000,surveyVersion);
    emitUpdate(req.user.id);res.json({ok:true});
  });
  const answerShape=Object.fromEntries(surveyQuestions.map(q=>{
    if(q.type==='text')return[q.id,z.string().trim().max(2000).optional()];
    if(q.type==='rating')return[q.id,q.unexperienced?z.union([z.number().int().min(1).max(5),z.literal('unexperienced')]):z.number().int().min(1).max(5)];
    return[q.id,z.object({selected:z.array(z.number().int().min(0).max(q.options.length-1)).min(1).max(q.type==='single'?1:q.max||q.options.length),other:z.string().trim().max(500).default('')}).strict().superRefine((a,ctx)=>{
      if(new Set(a.selected).size!==a.selected.length||a.selected.includes(q.exclusive)&&a.selected.length>1)ctx.addIssue({code:'custom',message:'선택지를 확인해 주세요.'});
      const other=a.selected.includes(q.options.length-1);if(other&&!a.other||!other&&a.other)ctx.addIssue({code:'custom',message:'기타 응답을 확인해 주세요.'});
    })];
  }));
  app.post('/api/feedback',auth,(req,res)=>{
    const payload=z.object({version:z.number().int().optional(),answers:z.unknown()}).strict().parse(req.body);
    if(payload.version!==surveyVersion)fail(409,'설문 문항이 업데이트됐어요. 새로고침한 뒤 새 설문에 참여해 주세요.');
    const answers=z.object(answerShape).strict().parse(payload.answers);
    store.transaction(()=>{
      if(store.one('SELECT completed FROM survey_participation WHERE user_id=? AND version=?',req.user.id,surveyVersion)?.completed)fail(409,'이미 설문에 참여했어요. 고마워요!');
      // No account IDs, timestamps, event records or response IDs link answers to an account.
      store.run('INSERT INTO survey_responses VALUES(?,?,?)',id(),surveyVersion,JSON.stringify(answers));
      store.run('INSERT INTO survey_participation(user_id,completed,version) VALUES(?,1,?) ON CONFLICT(user_id) DO UPDATE SET completed=1,deferred_until=0,version=excluded.version',req.user.id,surveyVersion);
      store.run('INSERT OR IGNORE INTO account_rewards(user_id,reward_id) VALUES(?,?)',req.user.id,SURVEY_REWARD);
    });emitUpdate(req.user.id);emitSurveyChange();res.status(201).json({ok:true});
  });
  app.get('/api/stats',auth,(req,res)=>{const counts=store.all('SELECT name,COUNT(*) count FROM events WHERE user_id=? GROUP BY name',req.user.id);res.json({events:counts,memories:store.one('SELECT COUNT(*) count FROM memories WHERE owner_id=?',req.user.id).count,visitors:store.one("SELECT COUNT(DISTINCT actor_id) count FROM activities WHERE owner_id=? AND actor_id<>?",req.user.id,req.user.id).count,stage:stageOf(store,req.user)});});
  app.get('/api/export',auth,(req,res)=>{const user=userById(req.user.id);res.set('Content-Disposition','attachment; filename="pieona-my-data.json"');res.json({exportedAt:now(),profile:profile(user,user.id),avatarSlots:store.all('SELECT * FROM avatar_slots WHERE owner_id=?',user.id).map(s=>({id:s.id,snapshot:s.id===user.active_slot?slotSnapshot(user):JSON.parse(s.snapshot)})),memories:store.all('SELECT * FROM memories WHERE owner_id=?',user.id),conversations:store.all('SELECT c.id,c.target_id,c.share,c.created_at,m.role,m.content,m.created_at message_at FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id WHERE c.viewer_id=?',user.id),events:store.all('SELECT name,detail,created_at FROM events WHERE user_id=?',user.id)});});

  io.use((socket,next)=>{const user=sessionUser(socket.request.headers);if(!user)return next(new Error('로그인이 필요해요.'));socket.data.userId=user.id;socket.data.token=hashToken(cookieToken(socket.request.headers.cookie));next();});
  io.on('connection',socket=>{
    const uid=socket.data.userId;socket.join(`user:${uid}`);online.set(uid,(online.get(uid)||0)+1);io.emit('presence',Array.from(online.keys()));
    const runnerRequest=(name,handler)=>socket.on(name,(data,ack)=>{try{if(!sessionUser(socket.request.headers))fail(401,'로그인이 필요해요.');handler(data,typeof ack==='function'?ack:()=>{});}catch(e){if(typeof ack==='function')ack({ok:false,error:e instanceof z.ZodError?'요청 형식을 확인해주세요.':e.message});}});
    runnerRequest('runner:action',(data,ack)=>{
      const {id:gameId,...input}=z.object({id:z.string().uuid(),action:z.enum(['left','right','jump']),seq:z.number().int().positive().max(10000)}).strict().parse(data);
      const g=running({params:{id:gameId},user:userById(uid)});
      const race=races.get(raceByGame.get(g.id));
      if(!race||!race.players.some(p=>p.socketId===socket.id&&p.gameId===g.id&&!p.left))fail(403,'참여 중인 달리기가 아니에요.');
      ack({ok:true,...actOnRun(g,input)});
      publishRace(race);
    });
    runnerRequest('runner:invite',(data,ack)=>{
      const {userId,userIds,anonymous,kind}=z.object({userId:z.string().uuid().optional(),userIds:z.array(z.string().uuid()).min(1).max(MAX_PARTY_PLAYERS-1).optional(),anonymous:z.boolean().default(false),kind:z.enum(['runner','crab','volley']).default('runner')}).strict().refine(v=>!!v.userId!==!!v.userIds).parse(data);
      const ids=userIds||[userId],villageId=socket.data.village?.villageId;
      if(!villageId||ids.includes(uid)||new Set(ids).size!==ids.length)fail(400,'같은 마을의 서로 다른 이웃을 선택해주세요.');
      if(ids.length+1>maxGamePlayers(kind))fail(400,`이 게임은 최대 ${maxGamePlayers(kind)}명까지 함께할 수 있어요.`);
      const guests=ids.map(userId=>{const member=villageVisitors.get(villageId)?.get(userId),socketId=member&&[...member.sockets][0];if(!socketId)fail(409,'초대할 친구가 마을을 떠났어요.');return {userId,socketId,accepted:false};});
      const players=[{userId:uid,socketId:socket.id},...guests];checkParty(players,villageId);
      if(players.some(p=>busy(p.userId)||[...invites.values()].some(i=>invitePlayers(i).some(v=>v.userId===p.userId))))fail(409,'이미 게임이나 초대를 진행 중이에요.');
      const invite={id:id(),kind,villageId,from:uid,fromSocket:socket.id,guests,anonymous,expires:Date.now()+30000};invites.set(invite.id,invite);
      for(const p of guests)io.to(p.socketId).emit('runner:invited',{id:invite.id,kind,villageId,nickname:userById(uid).nickname,expires:invite.expires,total:players.length});
      inviteProgress(invite);ack({ok:true,id:invite.id,total:players.length});
    });
    runnerRequest('runner:respond',(data,ack)=>{
      const {inviteId,accept,anonymous}=z.object({inviteId:z.string().uuid(),accept:z.boolean(),anonymous:z.boolean().default(false)}).strict().parse(data);
      const invite=invites.get(inviteId),guest=invite?.guests.find(p=>p.socketId===socket.id);if(!guest)fail(404,'초대가 만료됐어요.');
      if(!accept){cancelInvite(invite,'초대를 거절했어요.');ack({ok:true});return;}
      if(invite.expires<Date.now()){cancelInvite(invite,'초대 시간이 만료됐어요.');fail(409,'초대 시간이 만료됐어요.');}
      const players=invitePlayers(invite);
      try{checkParty(players,invite.villageId);if(players.some(p=>busy(p.userId,invite.id)))fail(409,'지금은 함께 시작할 수 없어요.');}catch(e){cancelInvite(invite,e.message);throw e;}
      guest.accepted=true;guest.anonymous=anonymous;inviteProgress(invite);
      if(!invite.guests.every(p=>p.accepted)){ack({ok:true,waiting:true});return;}
      invites.delete(invite.id);
      const race={id:id(),kind:invite.kind,villageId:invite.villageId,notes:runnerNotes(),created:Date.now(),players:invitePlayers(invite).map(({accepted,...p})=>({...p,nickname:userById(p.userId).nickname,appearance:profile(userById(p.userId),p.userId).appearance}))};races.set(race.id,race);emitVillage(race.villageId);
      raceEmit(race,'runner:matched',{id:race.id,kind:race.kind,villageId:race.villageId,players:race.players.map(({socketId,anonymous,...p})=>p)});ack({ok:true});
    });
    runnerRequest('runner:cancel-invite',(data,ack)=>{const invite=invites.get(data?.id);if(invite&&invite.fromSocket===socket.id)cancelInvite(invite,'초대가 취소됐어요.');ack({ok:true});});
    runnerRequest('runner:leave',(_,ack)=>{leaveRace(socket);if(socket.data.village)emitVillage(socket.data.village.villageId);ack({ok:true});});
    const rematchRequest=(data,ack,kind)=>{
      const {id:raceId,gameId,action}=z.object({id:z.string().uuid(),gameId:z.string().uuid(),action:z.enum(['request','accept','decline','cancel'])}).strict().parse(data);
      const race=races.get(raceId),player=race?.players.find(p=>p.socketId===socket.id&&!p.left);
      if(!player||(kind&&race.kind!==kind)||player.gameId!==gameId)fail(404,'재대결할 게임을 찾을 수 없어요.');
      if(race.players.some(p=>p.left||!io.sockets.sockets.has(p.socketId)))fail(409,'함께한 친구가 게임을 떠났어요.');
      const broadcast=(status)=>raceEmit(race,rematchEvent(race),{id:race.id,status,from:race.rematch?.from,accepted:race.rematch?.accepted,total:race.players.length});
      if(action==='cancel'||action==='decline'){
        if(!race.rematch)fail(409,'대기 중인 재대결 요청이 없어요.');
        if((action==='cancel')!==(race.rematch.from===uid))fail(403,'재대결 요청에 응답할 수 없어요.');
        broadcast(action==='cancel'?'cancelled':'declined');race.rematch=null;ack({ok:true});return;
      }
      if(!race.players.every(p=>store.one('SELECT finished FROM games WHERE id=?',p.gameId)?.finished===1))fail(409,'모두의 기록 저장이 끝나면 다시 도전해주세요.');
      for(const p of race.players){checkTarget({user:userById(p.userId)},race.villageId);if(io.sockets.sockets.get(p.socketId)?.data.village?.villageId!==race.villageId)fail(409,'같은 마을에 있어야 해요.');if(busy(p.userId))fail(409,'상대가 다른 게임을 진행 중이에요.');}
      checkParty(race.players,race.villageId);
      if(race.rematch&&race.rematch.expires<Date.now()){broadcast('expired');race.rematch=null;}
      if(action==='request'){
        if(race.rematch)fail(409,'이미 재대결 응답을 기다리고 있어요.');
        race.rematch={from:uid,accepted:[uid],expires:Date.now()+30000};broadcast('pending');ack({ok:true});return;
      }
      if(!race.rematch||race.rematch.from===uid)fail(409,'상대의 재대결 요청이 없어요.');
      if(race.rematch.accepted.includes(uid))fail(409,'이미 재대결에 동의했어요.');
      race.rematch.accepted.push(uid);
      if(race.rematch.accepted.length<race.players.length){broadcast('pending');ack({ok:true});return;}
      startRace(race);
      ack({ok:true});
    };
    runnerRequest('crab:rematch',(data,ack)=>rematchRequest(data,ack,'crab'));
    runnerRequest('game:rematch',(data,ack)=>rematchRequest(data,ack));
    runnerRequest('runner:ready',(data,ack)=>{
      const race=races.get(data?.id),player=race?.players.find(p=>p.socketId===socket.id&&!p.left);
      if(!player)fail(404,'함께할 달리기를 찾을 수 없어요.');player.ready=true;
      if(!race.started&&race.players.every(p=>p.ready)){
        checkParty(race.players,race.villageId);
        startRace(race);
      }ack({ok:true});
    });
    socket.on('village:join',(data,ack)=>{
      try {
        if(!sessionUser(socket.request.headers))throw new Error('로그인이 필요해요.');
        const villageId=z.string().uuid().parse(data?.villageId),target=userById(villageId);
        if(villageId!==uid&&(!settingsOf(target).allowVisitors||isBlocked(store,uid,villageId)))throw new Error('이 마을에 들어갈 수 없어요.');
        if(socket.data.village?.villageId===villageId){
          ack?.({ok:true,villageId,members:villageMembers(villageId),garden:life.gardenSnapshot(villageId)});return;
        }
        leaveVillage(socket);
        const members=villageVisitors.get(villageId)||new Map();
        // One avatar per account, retained until its final tab leaves the room.
        const member=members.get(uid)||{userId:uid,x:uid===villageId?-1:1,z:3,rotation:0,moving:false,sockets:new Set(),lastMove:0};
        const firstHome=uid===villageId&&!member.sockets.size;if(firstHome)life.arrive(uid);
        member.sockets.add(socket.id);members.set(uid,member);villageVisitors.set(villageId,members);
        socket.data.village={villageId,userId:uid};socket.join(`village:${villageId}`);
        logAction(uid,'village_join',{villageId});
        const greeting=uid!==villageId?{id:id(),villageId,userId:villageId,role:'assistant',speaker:target.nickname,text:members.has(villageId)?avatars.greeting(target,uid).replace('주인 대신 내가 반겨줄게. ',''):avatars.greeting(target,uid),expiresAt:Date.now()+45000}:null;
        emitVillage(villageId);ack?.({ok:true,villageId,members:villageMembers(villageId),garden:life.gardenSnapshot(villageId),greeting});
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
      if(life.busy(uid)&&(!life.active(uid)||(life.active(uid).village_id||uid)===current.villageId)){
        // The server owns a fishing pose; movement is an explicit cancellation.
        if(['Moving','Gardening','Cooking'].includes(member.activityState)&&!moving&&!data.jumpStarted)return;
        if(!moving&&!data.jumpStarted&&data.seatId===member.seatId)return;
        life.stop(uid);
      }
      if(data.seatId!==undefined){
        if(data.seatId!==null&&typeof data.seatId!=='string')return;
        if(data.seatId){
          const bench=villageBenches(JSON.parse(target.village)).find(bench=>bench.id===data.seatId);
          if(life.seatOccupied(current.villageId,data.seatId,uid))return;
          if(!bench||moving||data.jumpStarted||Math.hypot(x-bench.x,z-bench.z)>.15||Math.hypot(member.x-bench.x,member.z-bench.z)>BENCH_REACH+.2)return;
          member.seatId=bench.id;
        }else member.seatId=null;
      }else if(member.seatId!==undefined)member.seatId=null;
      const time=Date.now();if(moving&&time-member.lastMove<60&&data.jumpStarted===member.jumpStarted)return;
      member.lastMove=time;
      const radius=Math.hypot(x,z),factor=!member.seatId&&radius>WALK_RADIUS?WALK_RADIUS/radius:1;
      member.x=x*factor;member.z=z*factor;member.rotation=Math.atan2(Math.sin(rotation),Math.cos(rotation));member.moving=moving;
      if(data.jumpStarted!==undefined)member.jumpStarted=data.jumpStarted;
      const update={villageId:current.villageId,userId:uid,x:member.x,z:member.z,rotation:member.rotation,moving,...(member.jumpStarted!==undefined?{jumpStarted:member.jumpStarted}:{}),...(member.seatId!==undefined?{seatId:member.seatId}:{})};
      const room=socket.to(`village:${current.villageId}`);
      // Moving samples can be dropped; the final pose must be delivered reliably.
      if(moving)room.volatile.emit('village:move',update);else room.emit('village:move',update);
    });
    socket.on('disconnect',()=>{if(![...io.sockets.sockets.values()].some(other=>other.data.userId===uid)){crabs.leave(uid);volleys.leave(uid);}leaveVillage(socket);const count=(online.get(uid)||1)-1;if(count)online.set(uid,count);else online.delete(uid);io.emit('presence',Array.from(online.keys()));});
  });
  const raceTimer=setInterval(()=>{for(const i of invites.values())if(i.expires<Date.now())cancelInvite(i,'초대 시간이 만료됐어요.');for(const r of races.values()){if(!r.started&&Date.now()-r.created>45000){raceEmit(r,'runner:cancelled',{id:r.id,reason:'게임 준비 시간이 만료됐어요.'});races.delete(r.id);emitVillage(r.villageId);}else if(r.started){publishRace(r);if(r.rematch&&r.rematch.expires<Date.now()){raceEmit(r,rematchEvent(r),{id:r.id,status:'expired'});r.rematch=null;}const settled=r.players.every(p=>p.left||store.one('SELECT finished FROM games WHERE id=?',p.gameId)?.finished);if(settled&&!r.settledAt)r.settledAt=Date.now();if(Date.now()-r.started>(r.kind==='crab'?3600000:RUN_EXPIRY+300000)||(settled&&(r.players.every(p=>p.left)||Date.now()-r.settledAt>300000))){for(const p of r.players)raceByGame.delete(p.gameId);races.delete(r.id);}}}},100);raceTimer.unref();
  const maintenance=setInterval(()=>{store.run('DELETE FROM sessions WHERE expires<?',Date.now());for(const socket of io.sockets.sockets.values())if(!sessionUser(socket.request.headers))socket.disconnect(true);},60000);maintenance.unref();
  app.use('/resource',express.static(resolve('resource'),{maxAge:'7d',immutable:true}));
  const dist=resolve('dist');if(existsSync(dist)){app.use(express.static(dist,{maxAge:'1h',setHeaders(res,path){if(path.endsWith('.html'))res.set('Cache-Control','no-store');}}));app.get('/{*splat}',(req,res,next)=>req.path.startsWith('/api/')?next():res.set('Cache-Control','no-store').sendFile(resolve(dist,'index.html')));}
  app.use('/api',(req,res)=>res.status(404).json({error:'요청한 기능을 찾을 수 없어요.'}));
  app.use((error,req,res,next)=>{
    if(res.headersSent)return next(error);
    if(error.message?.startsWith('PSS_'))return res.status(error.message.startsWith('PSS_LLM_')?502:422).json({error:`아바타 업데이트 실패 (${error.message}). 기존 버전은 유지됩니다. 다시 분석해 주세요.`});
    const messages={AI_RATE_LIMIT:'Gemini 사용 한도에 도달했어요. 잠시 후 다시 시도해주세요.',AI_UNAVAILABLE:'Gemini 연결에 실패했어요. 서버의 키와 모델 설정을 확인해주세요.',AI_EMPTY:'응답을 만들지 못했어요. 다른 표현으로 다시 이야기해주세요.'};
    const status=error instanceof z.ZodError?400:error.status&&error.status<500?error.status:error.message?.startsWith('AI_')?502:500;
    if(status===500)console.error('[server]',error.name,error.message?.slice(0,160));
    res.status(status).json({error:error instanceof z.ZodError?'입력 형식 또는 길이를 확인해 주세요.':messages[error.message]||(status===500?'처리 중 오류가 발생했어요. 다시 시도해 주세요.':error.message)});
  });
  return {app,server,io,store,life,personaScripts,avatars,wordGames,polls,close:async()=>{clearInterval(maintenance);clearInterval(raceTimer);wordGames.close();polls.close();life.close();crabs.close();volleys.close();await new Promise(r=>io.close(r));if(server.listening)await new Promise(r=>server.close(r));store.close();}};
}
