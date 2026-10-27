import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {harness} from './runtimeHarness.mjs';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {createGardening} from '../server/gardening.mjs';
import {CROPS,WATER_INTERVAL_MS,seedId} from '../shared/garden.mjs';

const action=(h,u,a,key=randomUUID())=>h.request('/me/life/actions',u,{requestId:key,action:a});
const data=async(h,u)=>(await h.request('/me/life',u)).body;
const seed=(h,u,item,quantity)=>h.runtime.store.run('INSERT INTO inventory_entries VALUES(?,?,?) ON CONFLICT(owner_id,item_id) DO UPDATE SET quantity=excluded.quantity',u.id,item,quantity);
async function job(h,u,a,key){const r=await action(h,u,a,key);assert.equal(r.status,200,JSON.stringify(r.body));h.advance(3000);return r;}
async function mature(h,u,plot='garden:0'){for(let i=0;i<3;i++){h.advance(WATER_INTERVAL_MS);await job(h,u,{intent:'WATER_CROP',plot});}}

test('farm has nine stable plots and starter seeds are granted once per account',async()=>{
 const h=await harness();try{const u=await h.register('farm_starter');assert.equal((await data(h,u)).inventory.length,0);
  for(let i=0;i<3;i++)assert.equal((await h.request('/me/farm',u)).status,200);
  const d=await data(h,u);assert.equal(d.garden.plots.length,9);assert.deepEqual(d.garden.plots.map(p=>p.id),Array.from({length:9},(_,i)=>`garden:${i}`));
  for(const c of CROPS)assert.equal(d.inventory.find(i=>i.itemId===seedId(c.id)).quantity,3);
  const other=await h.register('farm_other');assert.deepEqual((await data(h,other)).inventory,[]);
 }finally{await h.close();}
});

test('planting reserves a plot, consumes exactly one seed on completion and fills all nine beds',async()=>{
 const h=await harness();try{const u=await h.register('farm_plant');await h.connect(u);const key=randomUUID(),a={intent:'PLANT_SEED',crop:'TOMATO',plot:'garden:0'};
  const r=await action(h,u,a,key);assert.equal(r.status,200);assert.equal(r.body.garden.plots[0].reserved,true);assert.equal(r.body.garden.plots[0].cropId,null);
  assert.equal((await action(h,u,a,key)).body.operationId,r.body.operationId);assert.equal((await action(h,u,{...a,crop:'APPLE'},key)).status,409);
  assert.equal((await action(h,u,a)).status,409);h.advance(3000);let d=await data(h,u);assert.equal(d.inventory.find(i=>i.itemId==='TOMATO_SEED').quantity,2);assert.equal(d.garden.plots[0].waterCount,0);assert.equal(d.garden.plots[0].stage,1);
  await action(h,u,a,key);assert.equal((await data(h,u)).inventory.find(i=>i.itemId==='TOMATO_SEED').quantity,2);
  seed(h,u,'TOMATO_SEED',8);for(let i=1;i<9;i++)await job(h,u,{...a,plot:`garden:${i}`});
  assert.equal((await data(h,u)).garden.plots.filter(p=>p.cropId).length,9);assert.equal((await action(h,u,{intent:'PLANT_SEED',crop:'APPLE'})).status,409);
 }finally{await h.close();}
});

test('server requires three distinct waterings five minutes apart, with versioned and idempotent requests',async()=>{
 const h=await harness();try{const u=await h.register('farm_water');await h.connect(u);await job(h,u,{intent:'PLANT_SEED',crop:'STRAWBERRY',plot:'garden:0'});
  const p=(await data(h,u)).garden.plots[0],a={intent:'WATER_CROP',plot:p.id,plantingId:p.plantingId},key=randomUUID();
  h.advance(WATER_INTERVAL_MS-1);assert.equal((await action(h,u,a)).status,409);h.advance(1);
  assert.equal((await action(h,u,{...a,plantingId:randomUUID()})).status,409);
  await job(h,u,a,key);assert.equal((await data(h,u)).garden.plots[0].waterCount,1);assert.equal((await data(h,u)).garden.plots[0].stage,2);
  assert.equal((await action(h,u,a,key)).status,200);assert.equal((await action(h,u,a)).status,409);
  h.advance(WATER_INTERVAL_MS);await job(h,u,a);assert.equal((await data(h,u)).garden.plots[0].stage,3);assert.equal((await action(h,u,{intent:'HARVEST_CROP',plot:p.id})).status,409);
  h.advance(WATER_INTERVAL_MS);await job(h,u,a);const ready=(await data(h,u)).garden.plots[0];assert.equal(ready.state,'Ready');assert.equal(ready.canWater,false);assert.equal((await action(h,u,a)).status,409);
 }finally{await h.close();}
});

test('offline time and recovery make watering available without automatically growing a crop',async()=>{
 const h=await harness();try{const u=await h.register('farm_offline'),s=await h.connect(u);await job(h,u,{intent:'PLANT_SEED',crop:'APPLE'});
  await new Promise(resolve=>s.emit('village:leave',resolve));h.advance(24*60*60_000);createGardening(h.runtime.store,()=>h.runtime.life.snapshot(u.id).serverTime);
  const p=(await data(h,u)).garden.plots[0];assert.equal(p.state,'Growing');assert.equal(p.stage,1);assert.equal(p.canWater,true);assert.equal(p.waterCount,0);
 }finally{await h.close();}
});

test('harvest awards fruit and a seed exactly once; a stale harvest cannot touch a replanted crop',async()=>{
 const h=await harness();try{const u=await h.register('farm_harvest');await h.connect(u);await job(h,u,{intent:'PLANT_SEED',crop:'APPLE'});await mature(h,u);
  const p=(await data(h,u)).garden.plots[0],a={intent:'HARVEST_CROP',plot:p.id,plantingId:p.plantingId},key=randomUUID();await job(h,u,a,key);await action(h,u,a,key);
  let d=await data(h,u);assert.equal(d.inventory.find(i=>i.itemId==='APPLE').quantity,1);assert.equal(d.inventory.find(i=>i.itemId==='APPLE_SEED').quantity,3);assert.equal(d.garden.plots[0].state,'Empty');
  await job(h,u,{intent:'PLANT_SEED',crop:'APPLE'});await mature(h,u);assert.equal((await action(h,u,a)).status,409);assert.equal((await data(h,u)).garden.plots[0].state,'Ready');
 }finally{await h.close();}
});

test('cancelled planting and failed seed consumption leave both plot and inventory unchanged',async()=>{
 const h=await harness();try{const u=await h.register('farm_cancel');await h.connect(u);await action(h,u,{intent:'PLANT_SEED',crop:'APPLE'});h.runtime.life.stop(u.id);h.advance(3000);
  let d=await data(h,u);assert.equal(d.garden.plots[0].cropId,null);assert.equal(d.inventory.find(i=>i.itemId==='APPLE_SEED').quantity,3);
  await action(h,u,{intent:'PLANT_SEED',crop:'APPLE'});seed(h,u,'APPLE_SEED',0);h.advance(3000);d=await data(h,u);assert.equal(d.garden.plots[0].state,'Empty');assert.equal(d.garden.plots[0].reserved,false);assert.equal((await action(h,u,{intent:'PLANT_SEED',crop:'APPLE'})).status,409);
 }finally{await h.close();}
});

test('harvest transaction rolls back fruit, returned seeds and all cleared beds on output failure',async()=>{
 const h=await harness();try{const u=await h.register('farm_atomic');await h.connect(u);for(const [i,crop] of ['APPLE','STRAWBERRY'].entries())await job(h,u,{intent:'PLANT_SEED',crop,plot:`garden:${i}`});
  await mature(h,u,'garden:0');await mature(h,u,'garden:1');const before=(await data(h,u)).inventory;
  h.runtime.store.db.exec("CREATE TRIGGER block_harvest BEFORE INSERT ON inventory_entries WHEN NEW.item_id='STRAWBERRY_SEED' BEGIN SELECT RAISE(ABORT,'test harvest failure'); END;");
  await job(h,u,{intent:'HARVEST_CROP'});assert.deepEqual((await data(h,u)).inventory,before);assert.equal((await data(h,u)).garden.plots.filter(p=>p.state==='Ready').length,2);
  h.runtime.store.db.exec('DROP TRIGGER block_harvest');await job(h,u,{intent:'HARVEST_CROP'});assert.equal((await data(h,u)).garden.plots.filter(p=>p.state==='Empty').length,9);
 }finally{await h.close();}
});

test('harvested fruits are usable cooking ingredients and cooking remains atomic',async()=>{
 const h=await harness();try{const u=await h.register('farm_cook');await h.connect(u);for(const [i,crop] of ['APPLE','STRAWBERRY'].entries()){await job(h,u,{intent:'PLANT_SEED',crop,plot:`garden:${i}`});await mature(h,u,`garden:${i}`);}await job(h,u,{intent:'HARVEST_CROP'});
  h.runtime.store.db.exec("CREATE TRIGGER block_food BEFORE INSERT ON inventory_entries WHEN NEW.item_id='FRUIT_SALAD' BEGIN SELECT RAISE(ABORT,'test food failure'); END;");
  await job(h,u,{intent:'COOK_FOOD',recipe:'FRUIT_SALAD'});let bag=new Map((await data(h,u)).inventory.map(i=>[i.itemId,i.quantity]));assert.equal(bag.get('APPLE'),1);assert.equal(bag.get('STRAWBERRY'),1);
  h.runtime.store.db.exec('DROP TRIGGER block_food');await job(h,u,{intent:'COOK_FOOD',recipe:'FRUIT_SALAD'});bag=new Map((await data(h,u)).inventory.map(i=>[i.itemId,i.quantity]));assert.equal(bag.get('FRUIT_SALAD'),1);assert.equal(bag.get('APPLE'),0);assert.equal(bag.get('STRAWBERRY'),0);
  seed(h,u,'GOLDEN_BREAM',1);assert.equal((await action(h,u,{intent:'COOK_FOOD',recipe:'GRILLED_FISH'})).status,409);await job(h,u,{intent:'COOK_FOOD',recipe:'GRILLED_FISH',fish:['GOLDEN_BREAM']});assert.equal((await data(h,u)).inventory.find(i=>i.itemId==='GRILLED_FISH').quantity,1);
 }finally{await h.close();}
});

test('legacy village crops migrate in place; waterings, seed grants and receipts survive database reopen',async()=>{
 const path=join(tmpdir(),`pieona-farm-${randomUUID()}.sqlite`),uid=randomUUID();let runtime,time=Date.now();
 try{let store=openStore(path);store.run('INSERT INTO users(id,username,password,created_at) VALUES(?,?,?,?)',uid,'persist_farm','unused',new Date().toISOString());
  store.db.exec('CREATE TABLE garden_plots(owner_id TEXT NOT NULL,plot_id TEXT NOT NULL,crop_id TEXT,planted_at INTEGER,ready_at INTEGER,planting_id TEXT,planted_by TEXT,PRIMARY KEY(owner_id,plot_id))');
  const plantingId=randomUUID();store.run('INSERT INTO garden_plots VALUES(?,?,?,?,?,?,?)',uid,'garden:1','TOMATO',time-999999,time-1,plantingId,'legacy');runtime=createApp({store,testing:true,lifeClock:()=>time});
  let g=createGardening(store,()=>time);g.ensureSeeds(uid);assert.equal(g.plots(uid)[1].plantingId,plantingId);assert.equal(g.plots(uid)[1].state,'Growing');
  for(let i=0;i<2;i++){time+=WATER_INTERVAL_MS;g.complete(g.prepare(uid,randomUUID(),{intent:'WATER_CROP',plot:'garden:1'},'PLAYER'));}
  await runtime.close();runtime=null;time+=WATER_INTERVAL_MS;runtime=createApp({store:openStore(path),testing:true,lifeClock:()=>time});g=createGardening(runtime.store,()=>time);g.ensureSeeds(uid);assert.equal(g.plots(uid)[1].waterCount,2);assert.equal(runtime.store.one('SELECT quantity FROM inventory_entries WHERE owner_id=? AND item_id=?',uid,'TOMATO_SEED').quantity,3);
  g.complete(g.prepare(uid,randomUUID(),{intent:'WATER_CROP',plot:'garden:1'},'PLAYER'));const key=randomUUID(),a={intent:'HARVEST_CROP',plot:'garden:1'};g.complete(g.prepare(uid,key,a,'PLAYER'));await runtime.close();runtime=null;
  runtime=createApp({store:openStore(path),testing:true,lifeClock:()=>time});g=createGardening(runtime.store,()=>time);assert.equal(g.existing(uid,key,a,'PLAYER').status,'completed');assert.equal(g.plots(uid)[1].state,'Empty');assert.equal(runtime.store.one('SELECT quantity FROM inventory_entries WHERE owner_id=? AND item_id=?',uid,'TOMATO').quantity,1);
 }finally{if(runtime)await runtime.close();for(const suffix of ['','-wal','-shm'])rmSync(path+suffix,{force:true});}
});
