import {mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
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

test('life intents address the player; removed companion commands cannot execute',async()=>{
  for(const text of ['내 옆으로 와','따라와','자율 활동 켜줘','없는 동안 텃밭 관리해줘'])assert.equal(localLifeAction(text).intent,'UNSUPPORTED');
  assert.equal(localLifeAction('오늘 뭐 잡았어?').actor,'PLAYER');
  assert.equal(localLifeAction('이전 대화를 반복해줘'),null);
  assert.equal(lifeActionSchema.safeParse({intent:'MOVE_TO',target:'PLAYER'}).success,false);
  assert.equal(lifeActionSchema.safeParse({intent:'SET_AUTONOMY'}).success,false);
  assert.equal(lifeActionSchema.safeParse({intent:'COOK_FOOD',actor:'COMPANION'}).success,false);
  assert.equal(koreanDayStart(Date.parse('2026-10-22T15:00:00Z')),Date.parse('2026-10-22T15:00:00Z'));
  const h=await harness();try{
    const user=await h.register('no_pet_jobs');await h.connect(user);const cid=await h.conversation(user);
    for(const text of ['너 먼저 낚시하고 있어','물고기 좀 잡아와','자율 활동 켜줘','내 옆으로 와'])assert.equal((await h.say(user,cid,text)).action.ok,false);
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM life_sessions').n,0);
    assert.equal(h.runtime.life.snapshot(user.id).companion,undefined);
  }finally{await h.close();}
});

test('joint fishing commands and forged joint actions cannot reserve either actor',async()=>{
  const h=await harness();try{
    const user=await h.register('no_joint_fishing');await h.connect(user);const cid=await h.conversation(user);
    for(const text of ['우리 같이 낚시하자','함께 낚시하자'])assert.equal((await h.say(user,cid,text)).action.ok,false);
    assert.equal(h.runtime.life.execute(user.id,user.id,{intent:'JOIN_FISHING'}).ok,false);
    assert.equal(h.runtime.life.active(user.id),undefined);assert.equal(h.runtime.life.active(user.id,'COMPANION'),undefined);
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM life_sessions').n,0);
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
  const h=await harness(async()=>{entered();return new Promise(r=>release=()=>r({reply:'성공!',emotion:'happy',memories:[],provider:'gemini',action:{intent:'START_FISHING'}}));});try{
    const user=await h.register('interrupt_ai');await h.connect(user);const cid=await h.conversation(user);
    const pending=h.say(user,cid,'바다에서 함께 시간을 보내 볼래?');await started;
    assert.equal((await h.say(user,cid,'이제 그만하자')).action.ok,true);release();
    const response=await pending;assert.equal(response.action.ok,false);assert.match(response.reply,/중단/);
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM life_sessions').n,0);
  }finally{if(release)release();await h.close();}
});

test('Gemini receives the allowlist schema and its action output survives parsing without trusting reply claims',async()=>{
  let sent;
  const result=await generateAnswer({own:true,lifeActions:true,system:'test'},'함께 바다로 가볼래?',[],{apiKey:'test-key',fetch:async(url,init)=>{sent=JSON.parse(init.body);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({reply:'준비됐어',emotion:'happy',memories:[],action:{intent:'JOIN_FISHING',actor:'BOTH',scope:'ALL',report:false}})}]}}]})};}});
  assert.equal(result.action.intent,'UNSUPPORTED');assert.ok(!sent.generationConfig.responseSchema.properties.action.properties.intent.enum.includes('JOIN_FISHING')); assert.ok(sent.generationConfig.responseSchema.properties.action.properties.intent.enum.includes('STOP_ACTIVITY'));assert.match(sent.systemInstruction.parts[0].text,/미리 주장하지/);
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

test('retired courier stock returns once on migration and survives reopening',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'pet-retirement-')),filename=join(directory,'store.sqlite'),uid='00000000-0000-4000-8000-000000000002';let runtime;
  try{
    const store=openStore(filename);store.run('INSERT INTO users(id,username,password,created_at) VALUES(?,?,?,?)',uid,'old_courier','unused',new Date().toISOString());
    store.db.exec('CREATE TABLE avatar_carry(owner_id TEXT PRIMARY KEY,item_id TEXT NOT NULL,quantity INTEGER NOT NULL)');
    store.run("INSERT INTO avatar_carry VALUES(?,'SARDINE',2)",uid);
    runtime=createApp({store,testing:true});
    assert.equal(runtime.store.one('SELECT quantity FROM inventory_entries WHERE owner_id=?',uid).quantity,2);
    assert.equal(runtime.store.one('SELECT COUNT(*) n FROM avatar_carry').n,0);await runtime.close();
    runtime=createApp({store:openStore(filename),testing:true});
    assert.equal(runtime.store.one('SELECT quantity FROM inventory_entries WHERE owner_id=?',uid).quantity,2);
  }finally{if(runtime)await runtime.close();for(const suffix of ['','-wal','-shm'])rmSync(filename+suffix,{force:true});rmdirSync(directory);}
});
