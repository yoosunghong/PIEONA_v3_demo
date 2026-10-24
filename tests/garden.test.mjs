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
import {lifeActionSchema} from '../server/lifeActions.mjs';
import {CROPS} from '../shared/garden.mjs';

const emit=(s,event,data={})=>new Promise((resolve,reject)=>{const ack=(e,r)=>e?reject(e):resolve(r);if(event==='village:leave')s.timeout(3000).emit(event,ack);else s.timeout(3000).emit(event,data,ack);});
async function harness(answer=async()=>({reply:'대화',emotion:'calm',memories:[],provider:'local'})){
  let time=Date.parse('2026-10-23T01:00:00Z');const runtime=createApp({store:openStore(':memory:'),testing:true,lifeClock:()=>time,generateAnswer:answer});
  await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${runtime.server.address().port}`,sockets=[];
  async function request(path,user,body){const r=await fetch(url+'/api'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  async function register(name){const r=await request('/auth/register',null,{username:name,password:'test-garden-password'});assert.equal(r.status,201);return {...r.body.user,cookie:r.cookie};}
  async function connect(user,villageId=user.id){const s=io(url,{transports:['websocket'],extraHeaders:{Cookie:user.cookie},forceNew:true});sockets.push(s);await new Promise((r,j)=>{s.once('connect',r);s.once('connect_error',j);});assert.equal((await emit(s,'village:join',{villageId})).ok,true);return s;}
  const action=(user,action,requestId=randomUUID())=>request('/me/life/actions',user,{requestId,action});
  const data=async user=>(await request('/me/life',user)).body;
  const seed=(user,item,quantity)=>runtime.store.run('INSERT INTO inventory_entries VALUES(?,?,?) ON CONFLICT(owner_id,item_id) DO UPDATE SET quantity=excluded.quantity',user.id,item,quantity);
  return {runtime,register,connect,request,action,data,seed,time:()=>time,advance:ms=>{time+=ms;runtime.life.tick();},close:async()=>{sockets.forEach(s=>s.disconnect());await runtime.close();}};
}

test('plant travels first, reserves one of three plots, and request retries cannot duplicate work',async()=>{
  const h=await harness();try{
    const user=await h.register('garden_plant'),s=await h.connect(user),key=randomUUID(),command={intent:'PLANT_SEED',crop:'HERB',plot:'garden:0'};
    const first=await h.action(user,command,key);assert.equal(first.status,200);assert.equal(first.body.task.state,'Moving');assert.equal(first.body.garden.plots[0].cropId,null);assert.equal(first.body.garden.plots[0].reserved,true);
    assert.equal((await h.action(user,command,key)).body.operationId,first.body.operationId);
    assert.equal((await h.action(user,{...command,crop:'FLOWER'},key)).status,409);
    assert.equal((await h.action(user,command)).status,409);
    assert.equal((await h.request('/games',user,{targetId:user.id,kind:'runner'})).status,409);
    h.advance(1000);const member=(await emit(s,'village:join',{villageId:user.id})).members.find(m=>m.userId===user.id);assert.ok(member.x<0);assert.equal(member.activityState,'Moving');
    h.advance(9000);let d=await h.data(user);assert.equal(d.task,null);assert.equal(d.garden.plots[0].cropId,'HERB');assert.equal(d.garden.plots[0].readyAt-h.time(),300000);
    assert.equal((await h.action(user,command,key)).body.operationId,first.body.operationId);assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM garden_plots').n,1);
    for(const crop of ['TOMATO','FLOWER']){assert.equal((await h.action(user,{intent:'PLANT_SEED',crop})).status,200);h.advance(10000);}
    assert.equal((await h.action(user,command)).status,409);d=await h.data(user);assert.equal(d.garden.plots.filter(p=>p.cropId).length,3);assert.deepEqual(d.inventory,[]);
  }finally{await h.close();}
});

test('growth uses server timestamps across departure and runtime recovery; harvest is versioned and exactly once',async()=>{
  const h=await harness();try{
    const user=await h.register('garden_growth'),s=await h.connect(user);
    await h.action(user,{intent:'PLANT_SEED',crop:'HERB'});h.advance(10000);let plot=(await h.data(user)).garden.plots[0];
    await emit(s,'village:leave');h.advance(299999);assert.equal((await h.data(user)).garden.plots[0].state,'Growing');
    h.advance(1);createGardening(h.runtime.store,h.time);assert.equal((await h.data(user)).garden.plots[0].state,'Ready');assert.deepEqual((await h.data(user)).inventory,[]);
    await emit(s,'village:join',{villageId:user.id});const key=randomUUID(),harvest={intent:'HARVEST_CROP',plot:plot.id,plantingId:plot.plantingId};
    assert.equal((await h.action(user,harvest,key)).status,200);h.advance(10000);assert.equal((await h.action(user,harvest,key)).status,200);
    assert.equal((await h.data(user)).inventory.find(i=>i.itemId==='HERB').quantity,1);assert.equal((await h.data(user)).garden.plots[0].state,'Empty');
    await h.action(user,{intent:'PLANT_SEED',crop:'HERB'});h.advance(10000);h.advance(300000);
    assert.equal((await h.action(user,harvest)).status,409);assert.equal((await h.data(user)).garden.plots[0].state,'Ready');
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM inventory_changes').n,1);
  }finally{await h.close();}
});

test('recipes require exact available ingredients, preserve rare fish by default, and support all four foods',async()=>{
  const h=await harness();try{
    const user=await h.register('garden_recipes');await h.connect(user);h.seed(user,'GOLDEN_BREAM',1);
    assert.equal((await h.action(user,{intent:'COOK_FOOD',recipe:'GRILLED_FISH'})).status,409);
    assert.equal((await h.action(user,{intent:'COOK_FOOD',recipe:'HERB_GRILLED_FISH',fish:['GOLDEN_BREAM']})).status,409);
    assert.equal((await h.action(user,{intent:'COOK_FOOD',recipe:'GRILLED_FISH',fish:['GOLDEN_BREAM']})).status,200);h.advance(10000);
    for(const id of ['SARDINE','MACKEREL','HORSE_MACKEREL'])h.seed(user,id,1);
    assert.equal((await h.action(user,{intent:'COOK_FOOD',recipe:'SEAFOOD_PLATTER',fish:['SARDINE','SARDINE','SARDINE']})).status,409);
    assert.equal((await h.action(user,{intent:'COOK_FOOD',recipe:'SEAFOOD_PLATTER'})).status,200);h.advance(10000);
    h.seed(user,'TOMATO',1);assert.equal((await h.action(user,{intent:'COOK_FOOD',recipe:'TOMATO_SALAD'})).status,200);h.advance(10000);
    const bag=new Map((await h.data(user)).inventory.map(i=>[i.itemId,i.quantity]));for(const id of ['GRILLED_FISH','SEAFOOD_PLATTER','TOMATO_SALAD'])assert.equal(bag.get(id),1);assert.equal(bag.get('GOLDEN_BREAM'),0);assert.equal(bag.get('TOMATO'),0);
  }finally{await h.close();}
});

test('stop, last-tab departure, and recovery cancel work without consuming ingredients or reserving plots',async()=>{
  const h=await harness();try{
    const user=await h.register('garden_cancel'),a=await h.connect(user),b=await h.connect(user);h.seed(user,'TOMATO',1);
    await h.action(user,{intent:'COOK_FOOD',recipe:'TOMATO_SALAD'});h.runtime.life.stop(user.id);h.advance(10000);assert.deepEqual((await h.data(user)).inventory,[{itemId:'TOMATO',quantity:1}]);
    await h.action(user,{intent:'PLANT_SEED',crop:'FLOWER'});await emit(a,'village:leave');assert.ok((await h.data(user)).task);await emit(b,'village:leave');h.advance(10000);assert.equal((await h.data(user)).task,null);assert.equal((await h.data(user)).garden.plots[0].reserved,false);
    const garden=createGardening(h.runtime.store,h.time);garden.prepare(user.id,randomUUID(),lifeActionSchema.parse({intent:'PLANT_SEED',crop:'HERB'}),'PLAYER');
    const recovered=createGardening(h.runtime.store,h.time);assert.equal(recovered.plots(user.id)[0].reserved,false);assert.equal(h.runtime.store.one("SELECT COUNT(*) n FROM life_operations WHERE status='pending'").n,0);
  }finally{await h.close();}
});

test('simultaneous requests cannot spend the same ingredient twice and failed writes roll back all changes',async()=>{
  const h=await harness();try{
    const user=await h.register('garden_atomic');await h.connect(user);h.seed(user,'TOMATO',1);
    assert.equal((await h.action(user,{intent:'COOK_FOOD',recipe:'TOMATO_SALAD'})).status,200);assert.equal((await h.action(user,{intent:'COOK_FOOD',recipe:'TOMATO_SALAD'})).status,409);h.advance(10000);
    assert.equal((await h.data(user)).inventory.find(i=>i.itemId==='TOMATO_SALAD').quantity,1);assert.equal(h.runtime.store.one("SELECT COUNT(*) n FROM life_operations WHERE status='failed'").n,0);
    h.seed(user,'SARDINE',1);h.seed(user,'HERB',1);h.runtime.store.db.exec("CREATE TRIGGER block_food BEFORE INSERT ON inventory_entries WHEN NEW.item_id='HERB_GRILLED_FISH' BEGIN SELECT RAISE(ABORT,'test output failure'); END;");
    await h.action(user,{intent:'COOK_FOOD',recipe:'HERB_GRILLED_FISH'});h.advance(10000);
    let bag=new Map((await h.data(user)).inventory.map(i=>[i.itemId,i.quantity]));assert.equal(bag.get('SARDINE'),1);assert.equal(bag.get('HERB'),1);assert.equal(bag.get('HERB_GRILLED_FISH'),undefined);
    h.runtime.store.db.exec('DROP TRIGGER block_food');await h.action(user,{intent:'COOK_FOOD',recipe:'HERB_GRILLED_FISH'});h.advance(10000);bag=new Map((await h.data(user)).inventory.map(i=>[i.itemId,i.quantity]));assert.equal(bag.get('HERB_GRILLED_FISH'),1);
  }finally{await h.close();}
});

test('all-plot harvest rolls back emptied beds and earlier outputs if a later output fails',async()=>{
  const h=await harness();try{
    const user=await h.register('garden_harvest_atomic');await h.connect(user);
    for(const crop of CROPS){await h.action(user,{intent:'PLANT_SEED',crop:crop.id});h.advance(10000);}h.advance(1200000);
    h.runtime.store.db.exec("CREATE TRIGGER block_harvest BEFORE INSERT ON inventory_entries WHEN NEW.item_id='FLOWER' BEGIN SELECT RAISE(ABORT,'test harvest failure'); END;");
    await h.action(user,{intent:'HARVEST_CROP'});h.advance(10000);
    assert.deepEqual((await h.data(user)).inventory,[]);assert.equal((await h.data(user)).garden.plots.filter(p=>p.state==='Ready'&&!p.reserved).length,3);assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM inventory_changes').n,0);
    h.runtime.store.db.exec('DROP TRIGGER block_harvest');await h.action(user,{intent:'HARVEST_CROP'});h.advance(10000);
    assert.equal((await h.data(user)).garden.plots.filter(p=>p.state==='Empty').length,3);assert.deepEqual((await h.data(user)).inventory.map(i=>i.quantity),[1,1,1]);
  }finally{await h.close();}
});

test('SQLite close and reopen retains crops, maturity, receipts and acquired inventory',async()=>{
  const path=join(tmpdir(),`pieona-garden-${randomUUID()}.sqlite`),uid=randomUUID();let runtime,time=Date.now();
  try{
    runtime=createApp({store:openStore(path),testing:true,lifeClock:()=>time});const store=runtime.store;
    store.run('INSERT INTO users(id,username,password,created_at) VALUES(?,?,?,?)',uid,'persist_garden','unused',new Date().toISOString());
    const garden=createGardening(store,()=>time),requestId=randomUUID(),action=lifeActionSchema.parse({intent:'PLANT_SEED',crop:'HERB'}),op=garden.prepare(uid,requestId,action,'PLAYER');garden.complete(op);
    await runtime.close();runtime=null;time+=300000;
    runtime=createApp({store:openStore(path),testing:true,lifeClock:()=>time});const recovered=createGardening(runtime.store,()=>time);assert.equal(recovered.plots(uid)[0].state,'Ready');assert.equal(recovered.existing(uid,requestId,action,'PLAYER').status,'completed');
    const harvest=recovered.prepare(uid,randomUUID(),lifeActionSchema.parse({intent:'HARVEST_CROP'}),'PLAYER');recovered.complete(harvest);await runtime.close();runtime=null;
    runtime=createApp({store:openStore(path),testing:true,lifeClock:()=>time});assert.equal(runtime.store.one('SELECT quantity FROM inventory_entries WHERE owner_id=? AND item_id=?',uid,'HERB').quantity,1);assert.equal(runtime.life.snapshot(uid).garden.plots[0].state,'Empty');
  }finally{if(runtime)await runtime.close();for(const suffix of ['','-wal','-shm'])rmSync(path+suffix,{force:true});}
});
