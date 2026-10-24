import {mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {generateAnswer} from '../server/ai.mjs';
import {lifeActionSchema} from '../server/lifeActions.mjs';

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

test('chat requests and unsolicited model actions cannot start, stop or inspect village work',async()=>{
  const contexts=[];
  const h=await harness(async context=>{contexts.push(context);return {reply:'마을의 시설에서 직접 이용해 주세요.',emotion:'calm',memories:[],provider:'test',action:{intent:'PLANT_SEED',crop:'HERB'}};});
  try{
    const user=await h.register('chat_without_jobs');await h.connect(user);const cid=await h.conversation(user);
    for(const text of ['허브 심어줘','텃밭 수확해줘','요리해줘','같이 낚시하자','보관함 열어줘','자율 활동 켜줘']){
      const result=await h.say(user,cid,text);assert.equal(result.action,undefined);
    }
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM life_operations').n,0);
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM life_sessions').n,0);
    assert.ok(contexts.every(context=>context.lifeActions===undefined&&context.avatarTools===undefined));
    assert.ok(contexts.every(context=>/실행하거나 예약할 수 없다/.test(context.system)));
    const started=await h.request('/me/life/actions',user,{requestId:crypto.randomUUID(),action:{intent:'PLANT_SEED',crop:'HERB'}});
    assert.equal(started.status,200);const task=h.runtime.life.snapshot(user.id).task.id;
    await h.say(user,cid,'그만하자');assert.equal(h.runtime.life.snapshot(user.id).task.id,task);
    h.advance(10000);assert.equal(h.runtime.life.snapshot(user.id).garden.plots[0].cropId,'HERB');
  }finally{await h.close();}
});

test('Gemini exposes only conversation fields and discards unsolicited action output',async()=>{
  let sent;
  const result=await generateAnswer({own:true,system:'test'},'허브 심어줘',[],{apiKey:'test-key',fetch:async(url,init)=>{
    sent=JSON.parse(init.body);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({reply:'직접 텃밭을 이용해 주세요.',emotion:'calm',memories:[],action:{intent:'PLANT_SEED',crop:'HERB'}})}]}}]})};
  }});
  assert.equal(sent.tools,undefined);assert.equal(sent.toolConfig,undefined);
  assert.deepEqual(Object.keys(sent.generationConfig.responseSchema.properties),['reply','emotion','memories']);
  assert.equal(result.action,undefined);
});

test('direct controls reject foreign owners, companion actors and retired intents',async()=>{
  const h=await harness();try{
    const owner=await h.register('direct_owner'),guest=await h.register('direct_guest');
    await h.connect(owner);await h.connect(guest,owner.id);
    assert.equal((await h.request('/me/life/actions',guest,{requestId:crypto.randomUUID(),action:{intent:'PLANT_SEED',crop:'HERB'}})).status,409);
    for(const action of [{intent:'PLANT_SEED',crop:'HERB',ownerId:guest.id},{intent:'COOK_FOOD',actor:'COMPANION'},{intent:'SET_AUTONOMY'},{intent:'TAKE_FROM_STORAGE'},{intent:'QUERY_RELATIONSHIP'}]){
      assert.equal(lifeActionSchema.safeParse(action).success,false);
      assert.equal((await h.request('/me/life/actions',owner,{requestId:crypto.randomUUID(),action})).status,400);
    }
  }finally{await h.close();}
});
