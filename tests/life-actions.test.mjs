import test from 'node:test';
import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {generateAnswer} from '../server/ai.mjs';
import {localLifeAction,lifeActionSchema,koreanDayStart} from '../server/lifeActions.mjs';
import {FISHING_PERIOD,FISHING_ANCHORS} from '../shared/life.mjs';

const emit=(socket,event,data={})=>new Promise((resolve,reject)=>{const ack=(err,result)=>err?reject(err):resolve(result);if(event==='village:leave')socket.timeout(3000).emit(event,ack);else socket.timeout(3000).emit(event,data,ack);});
async function harness(answer=async()=>({reply:'그냥 수다야.',emotion:'calm',memories:[],provider:'local'})){
  let time=Date.parse('2026-10-22T14:59:00Z');
  const runtime=createApp({store:openStore(':memory:'),testing:true,lifeClock:()=>time,lifeRandom:()=>0,generateAnswer:answer});
  await new Promise(resolve=>runtime.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${runtime.server.address().port}/api`,sockets=[];
  async function request(path,user,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  async function register(name){const r=await request('/auth/register',null,{username:name,password:'test-fishing-password'});assert.equal(r.status,201);return {...r.body.user,cookie:r.cookie};}
  async function connect(user,villageId=user.id){const socket=io(base.slice(0,-4),{transports:['websocket'],extraHeaders:{Cookie:user.cookie},forceNew:true});sockets.push(socket);await new Promise((r,j)=>{socket.once('connect',r);socket.once('connect_error',j);});assert.equal((await emit(socket,'village:join',{villageId})).ok,true);return socket;}
  async function conversation(user,target=user){const r=await request('/conversations',user,{targetId:target.id,share:false,anonymous:false});assert.equal(r.status,201);return r.body.id;}
  async function say(user,cid,text){const r=await request(`/conversations/${cid}/messages`,user,{text});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
  function advance(ms){time+=ms;runtime.life.tick();}
  return {runtime,register,connect,conversation,say,request,advance,time:()=>time,close:async()=>{sockets.forEach(s=>s.disconnect());await runtime.close();}};
}

test('offline intent mapping is conservative and supports spec commands and Korean date scopes',()=>{
  for(const [text,intent] of [['우리 낚시하러 갈까?','JOIN_FISHING'],['너 먼저 낚시하고 있어','START_FISHING'],['물고기 좀 잡아와','START_FISHING'],['이제 그만하자','STOP_ACTIVITY'],['오늘 고등어 몇 마리 잡았어?','QUERY_INVENTORY'],['보관함 열어줘','OPEN_STORAGE'],['도미 잡으면 알려줘','UNSUPPORTED']])assert.equal(localLifeAction(text)?.intent,intent,text);
  for(const text of ['나는 낚시를 좋아해','낚시하지 마','"같이 낚시하자"를 번역해줘','만약 같이 낚시하자고 하면?','아까 낚시했어'])assert.equal(localLifeAction(text),null,text);
  assert.equal(localLifeAction('오늘 황금도미 몇 마리 잡았어?').item,'GOLDEN_BREAM');
  assert.equal(localLifeAction('물고기 좀 잡아와').report,true);
  assert.equal(lifeActionSchema.safeParse({intent:'START_FISHING',ownerId:'other'}).success,false);
  assert.equal(koreanDayStart(Date.parse('2026-10-22T15:00:00Z')),Date.parse('2026-10-22T15:00:00Z'));
});

test('conversation starts real companion movement, reserves a seat, settles shared inventory exactly once',async()=>{
  const h=await harness();try{
    const user=await h.register('ai_fisher'),socket=await h.connect(user),cid=await h.conversation(user);
    const r=await h.say(user,cid,'너 먼저 낚시하고 있어');assert.equal(r.action.ok,true);assert.equal(r.action.companion.state,'Moving');assert.equal(r.action.session,null);assert.deepEqual(r.memories,[]);
    const sid=h.runtime.life.active(user.id,'COMPANION').id;
    await h.say(user,cid,'너 먼저 낚시하고 있어');assert.equal(h.runtime.life.active(user.id,'COMPANION').id,sid);
    const initial=h.runtime.life.companionMembers(user.id)[0];h.advance(500);const walking=h.runtime.life.companionMembers(user.id)[0];assert.ok(walking.z>initial.z&&walking.z<6.3);assert.equal(h.runtime.life.settle(user.id,'COMPANION').length,0);
    h.advance(5000);assert.equal(h.runtime.life.snapshot(user.id).companion.state,'Fishing');
    h.advance(FISHING_PERIOD);h.runtime.life.tick();
    const data=(await h.request('/me/life',user)).body;assert.equal(data.inventory[0].quantity,1);assert.equal(data.discoveries[0].actor,'COMPANION');assert.match(data.discoveries[0].acquiredByName,/AI/);
    const members=(await emit(socket,'village:join',{villageId:user.id})).members;assert.equal(members.filter(m=>m.actorKind==='COMPANION').length,1);
    const query=await h.say(user,cid,'오늘 뭐 잡았어?');assert.match(query.reply,/정어리 1마리/);assert.equal(query.action.items[0].actor,'COMPANION');
    await h.say(user,cid,'그냥 수다');assert.equal(h.runtime.life.active(user.id,'COMPANION').id,sid);
  }finally{await h.close();}
});

test('join reserves adjacent seats atomically, keeps two actors separate and stop scopes work',async()=>{
  const h=await harness();try{
    const user=await h.register('ai_joiner');await h.connect(user);const cid=await h.conversation(user);
    await h.say(user,cid,'우리 같이 낚시하자');
    const ps=h.runtime.life.active(user.id),cs=h.runtime.life.active(user.id,'COMPANION');assert.notEqual(ps.anchor_id,cs.anchor_id);
    assert.equal(Math.abs(FISHING_ANCHORS.findIndex(a=>a.id===ps.anchor_id)-FISHING_ANCHORS.findIndex(a=>a.id===cs.anchor_id)),1);
    h.advance(5000);h.advance(FISHING_PERIOD);
    assert.equal((await h.request('/me/life',user)).body.inventory[0].quantity,2);
    assert.match((await h.say(user,cid,'오늘 내가 뭐 잡았어?')).reply,/정어리 1마리/);
    assert.match((await h.say(user,cid,'오늘 우리 뭐 잡았어?')).reply,/정어리 2마리/);
    assert.match((await h.say(user,cid,'보관함에 물고기 몇 마리 있어?')).reply,/정어리 2마리/);
    await h.say(user,cid,'너만 중단해');assert.ok(h.runtime.life.active(user.id));assert.equal(h.runtime.life.active(user.id,'COMPANION'),undefined);
    await h.say(user,cid,'같이 낚시하자');assert.equal(h.runtime.life.active(user.id).id,ps.id);
    const stopped=await h.say(user,cid,'이제 그만하자');assert.equal(stopped.action.ok,true);
    h.advance(FISHING_PERIOD*20);assert.equal((await h.request('/me/life',user)).body.inventory[0].quantity,2);
    assert.equal(h.runtime.life.active(user.id),undefined);assert.equal(h.runtime.life.active(user.id,'COMPANION'),undefined);
  }finally{await h.close();}
});

test('fetch task automatically stops after three judgments and reports only earned catches',async()=>{
  const h=await harness();try{
    const user=await h.register('ai_reporter'),socket=await h.connect(user),cid=await h.conversation(user);
    await h.say(user,cid,'물고기 좀 잡아와');
    const report=new Promise(resolve=>{const listener=data=>{if(data.notice){socket.off('life:state',listener);resolve(data);}};socket.on('life:state',listener);});
    h.advance(5000);h.advance(FISHING_PERIOD*20);
    const event=await report;assert.match(event.notice,/정어리 3마리/);assert.equal(event.companion.state,'Idle');assert.equal(event.companion.lastReport.attempts,3);
    assert.equal(h.runtime.life.active(user.id,'COMPANION'),undefined);assert.equal((await h.request('/me/life',user)).body.inventory[0].quantity,3);
    assert.match((await h.say(user,cid,'최근 낚시 결과 알려줘')).reply,/정어리 3마리/);
  }finally{await h.close();}
});

test('visitor commands, forged model actions, missing presence and busy players cannot mutate owner state',async()=>{
  const h=await harness(async()=>({reply:'황금도미 999마리 성공!',emotion:'happy',memories:[{content:'fake',category:'일상'}],provider:'gemini',action:{intent:'START_FISHING',quantity:999}}));try{
    const owner=await h.register('protected_owner'),guest=await h.register('protected_guest');
    const cid=await h.conversation(owner);assert.equal((await h.say(owner,cid,'낚시해줘')).action.ok,false);
    await h.connect(owner);await h.connect(guest,owner.id);
    const visit=await h.conversation(guest,owner);for(const text of ['같이 낚시하자','오늘 뭐 잡았어?','이제 그만하자'])assert.equal((await h.say(guest,visit,text)).action.ok,false);
    const forged=await h.say(owner,cid,'바다에서 시간을 보내 볼래?');assert.equal(forged.action.ok,false);assert.doesNotMatch(forged.reply,/999|성공/);assert.equal(forged.memories.length,0);
    assert.equal((await h.request('/games',owner,{targetId:owner.id,kind:'runner'})).status,201);
    assert.equal((await h.say(owner,cid,'같이 낚시하자')).action.ok,false);
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM life_sessions').n,0);
  }finally{await h.close();}
});

test('immediate stop overtakes a pending model reply; late actions cannot restart activity',async()=>{
  let release,entered;const started=new Promise(r=>entered=r);
  const h=await harness(async()=>{entered();return new Promise(r=>release=()=>r({reply:'성공!',emotion:'happy',memories:[],provider:'gemini',action:{intent:'JOIN_FISHING'}}));});try{
    const user=await h.register('interrupt_ai');await h.connect(user);const cid=await h.conversation(user);
    const pending=h.say(user,cid,'바다에서 함께 시간을 보내 볼래?');await started;
    assert.equal((await h.say(user,cid,'이제 그만하자')).action.ok,true);release();
    const response=await pending;assert.equal(response.action.ok,false);assert.match(response.reply,/중단/);
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM life_sessions').n,0);
  }finally{if(release)release();await h.close();}
});

test('last home tab departure cancels both movement and fishing, other tabs preserve activity',async()=>{
  const h=await harness();try{
    const user=await h.register('offline_ai'),a=await h.connect(user),b=await h.connect(user),cid=await h.conversation(user);
    await h.say(user,cid,'같이 낚시하자');await emit(a,'village:leave');assert.ok(h.runtime.life.active(user.id,'COMPANION'));
    await emit(b,'village:leave');h.advance(FISHING_PERIOD*20);
    assert.equal(h.runtime.life.active(user.id),undefined);assert.equal(h.runtime.life.active(user.id,'COMPANION'),undefined);assert.deepEqual(h.runtime.life.companionMembers(user.id),[]);assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM acquisition_events').n,0);
    await emit(a,'village:join',{villageId:user.id});await h.say(user,cid,'너 먼저 낚시하고 있어');h.advance(5000);h.advance(FISHING_PERIOD);await emit(a,'village:leave');h.advance(FISHING_PERIOD*20);assert.equal(h.runtime.store.one('SELECT SUM(quantity) n FROM acquisition_events').n,1);
  }finally{await h.close();}
});

test('Gemini receives the allowlist schema and its action output survives parsing without trusting reply claims',async()=>{
  let sent;
  const result=await generateAnswer({own:true,lifeActions:true,system:'test'},'함께 바다로 가볼래?',[],{apiKey:'test-key',fetch:async(url,init)=>{sent=JSON.parse(init.body);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({reply:'준비됐어',emotion:'happy',memories:[],action:{intent:'JOIN_FISHING',actor:'BOTH',scope:'ALL',report:false}})}]}}]})};}});
  assert.equal(result.action.intent,'JOIN_FISHING');assert.ok(sent.generationConfig.responseSchema.properties.action.properties.intent.enum.includes('STOP_ACTIVITY'));assert.match(sent.systemInstruction.parts[0].text,/미리 주장하지/);
});

test('TODAY uses the Korean midnight boundary while ALL and STORAGE retain earlier catches',async()=>{
  const h=await harness();try{
    const user=await h.register('midnight_ai');await h.connect(user);const cid=await h.conversation(user);
    await h.say(user,cid,'너 먼저 낚시하고 있어');h.advance(5000);h.advance(FISHING_PERIOD);h.advance(FISHING_PERIOD);
    assert.match((await h.say(user,cid,'오늘 뭐 잡았어?')).reply,/정어리 1마리/);
    assert.match((await h.say(user,cid,'지금까지 뭐 잡았어?')).reply,/정어리 2마리/);
    assert.match((await h.say(user,cid,'보관함에 몇 마리 있어?')).reply,/정어리 2마리/);
  }finally{await h.close();}
});

test('Phase 1 schema migrates without losing old inventory or granting offline rewards',async()=>{
  const store=openStore(':memory:'),uid='00000000-0000-4000-8000-000000000001';
  store.run('INSERT INTO users(id,username,password,created_at) VALUES(?,?,?,?)',uid,'legacy_fisher','unused',new Date().toISOString());
  store.db.exec(`CREATE TABLE life_sessions(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),actor_id TEXT NOT NULL REFERENCES users(id),anchor_id TEXT NOT NULL,started_at INTEGER NOT NULL,settled_at INTEGER NOT NULL,stopped_at INTEGER,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,caught INTEGER NOT NULL DEFAULT 0);
    CREATE UNIQUE INDEX life_active_actor ON life_sessions(actor_id) WHERE status='active';
    CREATE UNIQUE INDEX life_active_anchor ON life_sessions(owner_id,anchor_id) WHERE status='active';
    CREATE TABLE inventory_entries(owner_id TEXT NOT NULL REFERENCES users(id),item_id TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>=0),PRIMARY KEY(owner_id,item_id));`);
  store.run("INSERT INTO life_sessions VALUES(?,?,?,'fishing:0',0,45000,NULL,'active',1,1)",'legacy-session',uid,uid);
  store.run("INSERT INTO inventory_entries VALUES(?,'SARDINE',1)",uid);
  const runtime=createApp({store,testing:true});try{
    const session=store.one("SELECT * FROM life_sessions WHERE id='legacy-session'");assert.equal(session.actor_kind,'PLAYER');assert.equal(session.status,'stopped');assert.equal(session.caught,1);assert.equal(runtime.life.active(uid),undefined);runtime.life.tick();assert.equal(store.one('SELECT quantity FROM inventory_entries').quantity,1);
  }finally{await runtime.close();}
});
