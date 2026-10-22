import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {io} from 'socket.io-client';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {createGardening} from '../server/gardening.mjs';
import {localLifeAction,lifeActionSchema} from '../server/lifeActions.mjs';
import {assembleContext} from '../server/ai.mjs';
import {DEFAULT_AUTONOMY} from '../shared/autonomy.mjs';
import {CROPS} from '../shared/garden.mjs';

const emit=(s,event,data={})=>new Promise((resolve,reject)=>{const ack=(e,r)=>e?reject(e):resolve(r);if(event==='village:leave')s.timeout(3000).emit(event,ack);else s.timeout(3000).emit(event,data,ack);});
async function harness(answer=async()=>({reply:'대화',emotion:'calm',memories:[],provider:'local'}),random=()=>0){
  let time=Date.parse('2026-10-23T01:00:00Z');const runtime=createApp({store:openStore(':memory:'),testing:true,lifeClock:()=>time,lifeRandom:random,generateAnswer:answer});
  await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${runtime.server.address().port}`,sockets=[];
  async function request(path,user,body,method){const r=await fetch(url+'/api'+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  async function register(name){const r=await request('/auth/register',null,{username:name,password:'test-garden-password'});assert.equal(r.status,201);return {...r.body.user,cookie:r.cookie};}
  async function connect(user,villageId=user.id){const s=io(url,{transports:['websocket'],extraHeaders:{Cookie:user.cookie},forceNew:true});sockets.push(s);await new Promise((r,j)=>{s.once('connect',r);s.once('connect_error',j);});assert.equal((await emit(s,'village:join',{villageId})).ok,true);return s;}
  async function conversation(user,target=user){return (await request('/conversations',user,{targetId:target.id,share:false,anonymous:false})).body.id;}
  const say=async(user,cid,text,requestId=randomUUID())=>(await request(`/conversations/${cid}/messages`,user,{text,requestId})).body;
  const action=(user,action,requestId=randomUUID())=>request('/me/life/actions',user,{requestId,action});
  const data=async user=>(await request('/me/life',user)).body;
  const seed=(user,item,quantity)=>runtime.store.run('INSERT INTO inventory_entries VALUES(?,?,?) ON CONFLICT(owner_id,item_id) DO UPDATE SET quantity=excluded.quantity',user.id,item,quantity);
  return {runtime,register,connect,request,conversation,say,action,data,seed,time:()=>time,advance:ms=>{time+=ms;runtime.life.tick();},close:async()=>{sockets.forEach(s=>s.disconnect());await runtime.close();}};
}

const configure=(h,user,patch)=>h.request('/me/life/autonomy',user,{...DEFAULT_AUTONOMY,...patch},'PUT');
test('crash recovery starts after the last online award checkpoint, not an older heartbeat',async()=>{
  const path=join(tmpdir(),`pieona-checkpoint-${randomUUID()}.sqlite`),uid=randomUUID();let runtime,time=Date.now();const start=time;
  try{
    runtime=createApp({store:openStore(path),testing:true,lifeClock:()=>time,lifeRandom:()=>0});runtime.store.run('INSERT INTO users(id,username,password,created_at) VALUES(?,?,?,?)',uid,'auto_checkpoint','unused',new Date().toISOString());runtime.life.autonomy.arrive(uid);runtime.life.autonomy.configure(uid,{enabled:true,offline:true,gardening:false});
    time+=40000;runtime.store.run("INSERT INTO life_sessions(id,owner_id,actor_id,actor_kind,avatar_slot,anchor_id,started_at,settled_at,status) VALUES(?,?,?,'COMPANION','','fishing:0',?,?,'active')",randomUUID(),uid,uid,start,time);await runtime.close();runtime=null;time+=30000;
    runtime=createApp({store:openStore(path),testing:true,lifeClock:()=>time,lifeRandom:()=>0});runtime.life.autonomy.settle(uid);const report=runtime.life.autonomy.snapshot(uid).reports[0];assert.equal(report.startedAt,start+40000);assert.equal(report.result.fishAttempts,0);assert.equal(runtime.store.one('SELECT COUNT(*) n FROM acquisition_events').n,0);
  }finally{if(runtime)await runtime.close();for(const suffix of ['','-wal','-shm'])rmSync(path+suffix,{force:true});}
});
test('autonomous fishing alternates with an actual walk and rest while conversational requests stay available',async()=>{
  const h=await harness();try{const u=await h.register('auto_rest');await h.connect(u);const cid=await h.conversation(u);await configure(h,u,{enabled:true,gardening:false});h.advance(1001);h.advance(5000);h.advance(135000);assert.equal(h.runtime.life.active(u.id,'COMPANION'),undefined);h.advance(30000);assert.equal(h.runtime.life.companionMembers(u.id)[0].activityState,'Moving');h.advance(2000);assert.equal(h.runtime.life.companionMembers(u.id)[0].activityState,'Resting');assert.equal((await h.say(u,cid,'안녕')).reply,'대화');assert.equal(h.runtime.life.companionMembers(u.id)[0].activityState,'Resting');await h.say(u,cid,'그만하자');assert.equal((await h.data(u)).autonomy.settings.enabled,false);}finally{await h.close();}
});
test('first rare discovery remembers actual joint participants and does not fabricate repeat first discoveries',async()=>{
  const rolls=[0,0,0,0,.95,0],h=await harness(undefined,()=>rolls.shift()??0);try{const u=await h.register('auto_rare');await h.connect(u);const cid=await h.conversation(u);await h.say(u,cid,'같이 낚시하자');h.advance(5000);h.advance(45000);let events=(await h.data(u)).relationshipMemories;const rare=events.find(e=>e.type==='RARE_FISH');assert.ok(rare);assert.deepEqual(rare.participants,['PLAYER','COMPANION']);assert.match(rare.summary,/함께.*AI 아바타.*황금도미/);rolls.push(0,.95,0,0,.95,0);h.advance(45000);events=(await h.data(u)).relationshipMemories;assert.equal(events.filter(e=>e.type==='RARE_FISH').length,1);}finally{await h.close();}
});
test('stopping from outside the home village settles only until stop, with no future offline accrual',async()=>{
  const h=await harness();try{const u=await h.register('auto_stop_away'),s=await h.connect(u),cid=await h.conversation(u);await configure(h,u,{enabled:true,offline:true,gardening:false});await emit(s,'village:leave');h.advance(90000);await h.say(u,cid,'그만하자');h.advance(7200000);const data=await h.data(u);assert.equal(data.inventory[0].quantity,2);assert.equal(data.autonomy.settings.offline,false);assert.equal(data.autonomy.reports.length,1);}finally{await h.close();}
});
test('autonomy requires opt-in and recognizes mode requests without stealing ordinary conversation',async()=>{
  const h=await harness();try{const u=await h.register('auto_default');await h.connect(u);h.advance(3600000);assert.equal((await h.data(u)).autonomy.settings.enabled,false);assert.equal(h.runtime.life.companionMembers(u.id).length,0);
    for(const text of ['이전 대화를 반복해줘','나는 자율 활동을 좋아해','"자율 활동 시작"이라고 말해'])assert.equal(localLifeAction(text),null);
    assert.equal(localLifeAction('내가 없는 동안 텃밭 관리해줘').intent,'SET_AUTONOMY');assert.equal(localLifeAction('자동 낚시 그만해줘').intent,'STOP_ACTIVITY');assert.equal(localLifeAction('없는 동안 뭐 했어?').intent,'QUERY_AUTONOMY');
    assert.equal(localLifeAction('자동으로 생선구이 2개 만들어줘').intent,'UNSUPPORTED');assert.equal(localLifeAction('자율 활동 10분만 시작해줘').intent,'UNSUPPORTED');
    assert.deepEqual(localLifeAction('자동 요리 하지 마').autonomy,{recipe:null});assert.deepEqual(localLifeAction('오프라인 활동 꺼줘').autonomy,{offline:false});assert.equal(localLifeAction('"자동 요리 하지 마"라고 말해'),null);
    assert.equal((await configure(h,u,{enabled:true,fishAttempts:999})).status,400);
  }finally{await h.close();}
});

test('online scheduler uses real jobs, explicit commands preempt it and stop keeps it disabled',async()=>{
  const h=await harness();try{const u=await h.register('auto_online');await h.connect(u);const cid=await h.conversation(u);
    await configure(h,u,{enabled:true,fishing:false,replant:true});h.advance(1001);assert.equal((await h.data(u)).companion.task.intent,'PLANT_SEED');h.advance(10000);assert.equal((await h.data(u)).garden.plots[0].cropId,'HERB');
    await configure(h,u,{enabled:true,fishing:true,gardening:false});h.advance(1001);assert.ok(h.runtime.life.active(u.id,'COMPANION'));
    const answer=await h.say(u,cid,'토마토 심어줘');assert.equal(answer.action.ok,true);assert.equal(h.runtime.life.active(u.id,'COMPANION'),undefined);assert.equal((await h.data(u)).companion.task.intent,'PLANT_SEED');
    await h.say(u,cid,'그만하자');h.advance(1000000);assert.equal((await h.data(u)).autonomy.settings.enabled,false);assert.equal((await h.data(u)).companion.task,null);assert.equal(h.runtime.life.active(u.id,'COMPANION'),undefined);
  }finally{await h.close();}
});

test('bounded offline fishing settles only at return and concurrent requests apply one receipt',async()=>{
  const h=await harness();try{const u=await h.register('auto_offline'),s=await h.connect(u);await configure(h,u,{enabled:true,offline:true,gardening:false});await emit(s,'village:leave');h.advance(3*3600000);assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM acquisition_events').n,0);
    const [a,b]=await Promise.all([h.data(u),h.data(u)]);assert.equal(a.inventory[0].quantity,80);assert.equal(b.inventory[0].quantity,80);assert.equal(a.autonomy.reports.length,1);assert.equal(a.autonomy.reports[0].result.fishAttempts,80);assert.equal(a.autonomy.reports[0].result.creditedMs,7200000);assert.equal(a.autonomy.reports[0].result.capped,true);
    h.advance(86400000);assert.equal((await h.data(u)).inventory[0].quantity,80);await emit(s,'village:join',{villageId:u.id});assert.equal((await h.data(u)).inventory[0].quantity,80);
    const cid=await h.conversation(u);assert.match((await h.say(u,cid,'없는 동안 뭐 했어?')).reply,/정어리 80마리/);const rid=a.autonomy.reports[0].id;assert.equal((await h.request(`/me/life/reports/${rid}/ack`,u,{})).status,200);assert.equal((await h.data(u)).autonomy.reports[0].acknowledged,1);
  }finally{await h.close();}
});

test('offline gardening grows, harvests, replants and cooks only allowed recipes without rare fish',async()=>{
  const h=await harness();try{const u=await h.register('auto_garden'),s=await h.connect(u);h.seed(u,'SARDINE',3);h.seed(u,'GOLDEN_BREAM',10);
    await configure(h,u,{enabled:true,offline:true,fishing:false,gardening:true,replant:true,recipe:'HERB_GRILLED_FISH'});await emit(s,'village:leave');h.advance(7200000);const d=await h.data(u),bag=new Map(d.inventory.map(i=>[i.itemId,i.quantity])),report=d.autonomy.reports[0].result;
    assert.equal(report.harvests,18);assert.equal(report.cooks,3);assert.equal(bag.get('HERB'),15);assert.equal(bag.get('HERB_GRILLED_FISH'),3);assert.equal(bag.get('GOLDEN_BREAM'),10);assert.equal(report.fishAttempts,0);assert.equal(d.relationshipMemories.length,2);assert.ok(d.relationshipMemories.every(e=>!e.summary.includes('함께')));
  }finally{await h.close();}
});

test('offline settlement rolls back the entire batch on failure, preserving checkpoint for retry',async()=>{
  const h=await harness();try{const u=await h.register('auto_rollback'),s=await h.connect(u);h.seed(u,'SARDINE',3);await configure(h,u,{enabled:true,offline:true,fishing:false,replant:true,recipe:'HERB_GRILLED_FISH'});await emit(s,'village:leave');h.advance(3600000);
    h.runtime.store.db.exec("CREATE TRIGGER reject_auto_food BEFORE INSERT ON inventory_entries WHEN NEW.item_id='HERB_GRILLED_FISH' BEGIN SELECT RAISE(ABORT,'offline output failure'); END;");assert.equal((await h.request('/me/life',u)).status,500);
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM garden_plots').n,0);assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM life_operations').n,0);assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM life_offline_reports').n,0);assert.notEqual(h.runtime.store.one('SELECT offline_since FROM life_autonomy').offline_since,null);assert.equal(h.runtime.store.one('SELECT quantity FROM inventory_entries').quantity,3);
    h.runtime.store.db.exec('DROP TRIGGER reject_auto_food');assert.equal((await h.data(u)).autonomy.reports[0].result.cooks,3);assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM life_offline_reports').n,1);
  }finally{await h.close();}
});

test('cooking cap and disabled permissions apply offline, and later opt-in never grants past rewards',async()=>{
  const h=await harness();try{const u=await h.register('auto_permissions'),s=await h.connect(u);h.seed(u,'TOMATO',50);await configure(h,u,{enabled:true,offline:true,fishing:false,gardening:false,recipe:'TOMATO_SALAD'});await emit(s,'village:leave');h.advance(7200000);let d=await h.data(u);assert.equal(d.autonomy.reports[0].result.cooks,6);assert.equal(d.inventory.find(i=>i.itemId==='TOMATO').quantity,44);
    await emit(s,'village:join',{villageId:u.id});await configure(h,u,{enabled:false,offline:false});await emit(s,'village:leave');h.advance(7200000);await configure(h,u,{enabled:true,offline:true});d=await h.data(u);assert.equal(d.autonomy.reports.length,1);assert.equal(d.inventory.find(i=>i.itemId==='TOMATO').quantity,44);assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM acquisition_events').n,0);
  }finally{await h.close();}
});

test('multiple tabs share one presence and manual tasks never resume as offline work without consent',async()=>{
  const h=await harness();try{const u=await h.register('auto_tabs'),a=await h.connect(u),b=await h.connect(u);await configure(h,u,{enabled:true,offline:true,gardening:false});await emit(a,'village:leave');assert.equal(h.runtime.store.one('SELECT offline_since FROM life_autonomy').offline_since,null);await emit(b,'village:leave');h.advance(45000);assert.equal((await h.data(u)).inventory[0].quantity,1);
    await emit(a,'village:join',{villageId:u.id});const cid=await h.conversation(u);await h.say(u,cid,'그만하자');await h.say(u,cid,'너 먼저 낚시하고 있어');await emit(a,'village:leave');h.advance(7200000);assert.equal((await h.data(u)).inventory[0].quantity,1);
  }finally{await h.close();}
});

test('real shared catches create private factual memories, forget tombstones prevent recreation',async()=>{
  const h=await harness();try{const u=await h.register('auto_memories'),guest=await h.register('memory_guest');await h.connect(u);const cid=await h.conversation(u);await h.say(u,cid,'같이 낚시하자');h.advance(5000);h.advance(45000);let d=await h.data(u);assert.equal(d.relationshipMemories.length,1);assert.equal(d.relationshipMemories[0].type,'JOINT_FISHING');
    const user=h.runtime.store.one('SELECT * FROM users WHERE id=?',u.id);assert.ok(assembleContext(h.runtime.store,user,u.id,'낚시').system.includes('나란히 낚시'));assert.ok(!assembleContext(h.runtime.store,user,guest.id,'낚시').system.includes('나란히 낚시'));
    assert.match((await h.say(u,cid,'우리 함께한 추억 알려줘')).reply,/나란히 낚시/);const mid=d.relationshipMemories[0].id;assert.equal((await h.request(`/me/life/memories/${mid}`,guest,undefined,'DELETE')).status,404);assert.equal((await h.request(`/me/life/memories/${mid}`,u,undefined,'DELETE')).status,200);h.advance(45000);d=await h.data(u);assert.equal(d.relationshipMemories.length,0);assert.ok(!assembleContext(h.runtime.store,user,u.id,'낚시').system.includes('나란히 낚시'));
  }finally{await h.close();}
});

test('avatar switching keeps facts scoped to their original avatar and disables autonomy',async()=>{
  const h=await harness();try{const u=await h.register('auto_slots');await h.connect(u);const cid=await h.conversation(u);await h.say(u,cid,'같이 낚시하자');h.advance(5000);h.advance(45000);
    const original=(await h.request('/slots',u)).body.active;assert.equal((await h.data(u)).relationshipMemories.length,1);const next=(await h.request('/slots',u,{nickname:'새 자아'})).body.id;await configure(h,u,{enabled:true,offline:true});assert.equal((await h.request(`/slots/${next}/activate`,u,{})).status,200);assert.equal((await h.data(u)).relationshipMemories.length,0);assert.equal((await h.data(u)).autonomy.settings.enabled,false);
    await h.request(`/slots/${original}/activate`,u,{});assert.equal((await h.data(u)).relationshipMemories.length,1);
  }finally{await h.close();}
});

test('server restart uses last heartbeat and preserves once-only offline settlement receipts',async()=>{
  const path=join(tmpdir(),`pieona-autonomy-${randomUUID()}.sqlite`),uid=randomUUID();let runtime,time=Date.now();try{
    runtime=createApp({store:openStore(path),testing:true,lifeClock:()=>time,lifeRandom:()=>0});runtime.store.run('INSERT INTO users(id,username,password,created_at) VALUES(?,?,?,?)',uid,'auto_restart','unused',new Date().toISOString());runtime.life.autonomy.arrive(uid);runtime.life.autonomy.configure(uid,{enabled:true,offline:true,gardening:false});await runtime.close();runtime=null;time+=7200000;
    runtime=createApp({store:openStore(path),testing:true,lifeClock:()=>time,lifeRandom:()=>0});runtime.life.autonomy.settle(uid);assert.equal(runtime.store.one('SELECT quantity FROM inventory_entries').quantity,80);await runtime.close();runtime=null;time+=7200000;
    runtime=createApp({store:openStore(path),testing:true,lifeClock:()=>time,lifeRandom:()=>0});runtime.life.autonomy.settle(uid);assert.equal(runtime.store.one('SELECT quantity FROM inventory_entries').quantity,80);assert.equal(runtime.store.one('SELECT COUNT(*) n FROM life_offline_reports').n,1);
  }finally{if(runtime)await runtime.close();for(const suffix of ['','-wal','-shm'])rmSync(path+suffix,{force:true});}
});
