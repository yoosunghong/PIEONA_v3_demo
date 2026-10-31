import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdirSync,rmSync} from 'node:fs';
import {harness} from './runtimeHarness.mjs';
import {openStore} from '../server/store.mjs';
import {readStarWorld,createStarWorld} from '../server/starWorlds.mjs';
import {validPlacement} from '../shared/world.mjs';
import {galaxyNpcs} from '../shared/galaxy.mjs';

function star(h,u,type='red',bonus=20){const id=`found-${type}-${randomUUID()}`;h.runtime.store.run('INSERT INTO owned_stars VALUES(?,?,?)',u.id,id,'독립별');h.runtime.store.run('INSERT INTO colony_stars VALUES(?,?,?,?,?,?)',u.id,id,type,'B',bonus,2);createStarWorld(h.runtime.store,u.id,id);return id;}
const world=(h,u,id)=>h.request(`/users/${u.id}/stars/${id}/world`,u);
const save=(h,u,id,village)=>h.request('/me/world',u,{starId:id,village},'PATCH');
function robot(){for(let x=-7;x<=7;x++)for(let z=-7;z<=7;z++)if(validPlacement(x,z))return {id:randomUUID(),type:'miningRobot',x,z,rotation:0};}

test('each star saves its own decorations, facility placement, theme and platform while account appearance stays shared',async()=>{
  const h=await harness();try{
    const u=await h.register('world_owner'),a=star(h,u),b=star(h,u,'blue'),r=robot();
    const initial=(await world(h,u,'plaza')).body.village;
    let result=await save(h,u,a,{items:[r],theme:'twilight',platformColor:'#123456',scenery:[{id:'life-fishing',x:0,z:6.3,rotation:0,hidden:true}]});assert.equal(result.status,200,JSON.stringify(result.body));
    assert.equal(result.body.starId,a);assert.equal(result.body.user.village.theme,initial.theme||'milkyway');
    const aw=(await world(h,u,a)).body.village,bw=(await world(h,u,b)).body.village;
    assert.equal(aw.items[0].id,r.id);assert.equal(aw.platformColor,'#123456');assert.equal(aw.scenery[0].hidden,true);
    assert.deepEqual(bw.items,[]);assert.equal(bw.scenery,undefined);assert.deepEqual((await world(h,u,'plaza')).body.village,initial);
    assert.equal((await save(h,u,b,{platformColor:'#abcdef'})).status,200);assert.equal((await world(h,u,a)).body.village.platformColor,'#123456');
    const v=await h.register('world_outsider');assert.equal((await save(h,v,a,{items:[]})).status,403);
    h.runtime.store.run('INSERT INTO colony_letters VALUES(?,?,?,?,?,?,?,?)',randomUUID(),u.id,galaxyNpcs[0].id,a,'독립별',2,'occupied',Date.now());
    assert.equal((await save(h,u,a,{items:[]})).status,403);assert.equal((await world(h,u,a)).status,403);
  }finally{await h.close();}
});

test('robots remain on their placement star with local bonuses, separate batteries and no duplication on other-star edits',async()=>{
  let time=Date.now();const h=await harness({colonyClock:()=>time});try{
    const u=await h.register('local_mining'),a=star(h,u,'red',50),b=star(h,u,'red',10),r=robot();
    assert.equal((await save(h,u,a,{items:[r]})).status,200);assert.equal((await save(h,u,b,{items:[r]})).status,200);
    time+=120000;let snap=h.runtime.colony.snapshot(u.id);assert.equal(snap.robots.find(i=>i.starId===a).collected,3);assert.equal(snap.robots.find(i=>i.starId===b).collected,2);
    assert.deepEqual((await world(h,u,'plaza')).body.village.items||[],[]);
    await save(h,u,b,{items:[]});time+=60000;snap=h.runtime.colony.snapshot(u.id);assert.equal(snap.robots.length,1);assert.equal(snap.robots[0].starId,a);assert.equal(snap.robots[0].totalRuntime,180000);
    assert.equal((await h.request('/me/colony/robots/'+r.id+'/recharge',u,{starId:b})).status,409);
    assert.equal((await h.request('/me/colony/robots/'+r.id+'/recharge',u,{starId:a})).status,200);
    assert.equal(h.runtime.colony.snapshot(u.id).robots[0].totalRuntime,180000);
  }finally{await h.close();}
});

test('occupied-star robots pause battery and mining while other stars continue, then resume without catch-up',async()=>{
  let time=Date.now();const h=await harness({colonyClock:()=>time});try{
    const u=await h.register('occupied_mining'),a=star(h,u),b=star(h,u),r=robot();await save(h,u,a,{items:[r]});await save(h,u,b,{items:[r]});
    time+=60000;h.runtime.colony.snapshot(u.id);const letter=randomUUID();h.runtime.store.run('INSERT INTO colony_letters VALUES(?,?,?,?,?,?,?,?)',letter,u.id,galaxyNpcs[0].id,a,'독립별',2,'occupied',time);
    time+=120000;let snap=h.runtime.colony.snapshot(u.id);assert.equal(snap.robots.find(i=>i.starId===a).runtime,60000);assert.equal(snap.robots.find(i=>i.starId===a).operating,false);assert.equal(snap.robots.find(i=>i.starId===b).runtime,180000);
    h.runtime.store.run("UPDATE colony_letters SET status='defended' WHERE id=?",letter);time+=60000;snap=h.runtime.colony.snapshot(u.id);assert.equal(snap.robots.find(i=>i.starId===a).runtime,120000);
  }finally{await h.close();}
});

test('two green stars have independent crops, growth bonuses and request receipts; travel cancels pending work',async()=>{
  let time=Date.now();const h=await harness({lifeClock:()=>time});try{
    const u=await h.register('separate_farms'),a=star(h,u,'green',20),b=star(h,u,'green',50),socket=await h.connect(u);
    await h.emit(socket,'star:travel',{starId:a});await h.request('/me/farm',u);const key=randomUUID();
    let result=await h.request('/me/life/actions',u,{starId:a,requestId:key,action:{intent:'PLANT_SEED',crop:'HERB',plot:'garden:0'}});assert.equal(result.status,200);time+=3000;h.runtime.life.tick();
    assert.equal(h.runtime.life.gardenSnapshot(u.id,a).plots[0].cropId,'HERB');assert.equal(h.runtime.life.gardenSnapshot(u.id,b).plots[0].cropId,null);assert.equal(h.runtime.life.gardenSnapshot(u.id).plots[0].cropId,null);
    assert.equal(h.runtime.life.gardenSnapshot(u.id,a).plots[0].waterIntervalMs,250000);assert.equal(h.runtime.life.gardenSnapshot(u.id,b).plots[0].waterIntervalMs,200000);
    await h.emit(socket,'star:travel',{starId:b});result=await h.request('/me/life/actions',u,{starId:a,requestId:randomUUID(),action:{intent:'PLANT_SEED',crop:'HERB',plot:'garden:1'}});assert.equal(result.status,409);
    result=await h.request('/me/life/actions',u,{starId:b,requestId:key,action:{intent:'PLANT_SEED',crop:'HERB',plot:'garden:0'}});assert.equal(result.status,409);
    result=await h.request('/me/life/actions',u,{starId:b,requestId:randomUUID(),action:{intent:'PLANT_SEED',crop:'TOMATO',plot:'garden:0'}});assert.equal(result.status,200);
    await h.emit(socket,'star:travel',{starId:a});time+=3000;h.runtime.life.tick();assert.equal(h.runtime.life.gardenSnapshot(u.id,b).plots[0].cropId,null);assert.equal(h.runtime.life.gardenSnapshot(u.id,a).plots[0].cropId,'HERB');
  }finally{await h.close();}
});

test('fishing seats and facilities are scoped by star, including same-seat visitors on separate stars',async()=>{
  const h=await harness();try{
    const u=await h.register('fishing_worlds'),v=await h.register('fishing_guest'),a=star(h,u,'blue'),b=star(h,u,'blue'),sa=await h.connect(u),sb=await h.connect(v,u.id);
    await h.emit(sa,'star:travel',{starId:a});await h.emit(sb,'star:travel',{starId:b});
    for(const s of [sa,sb]){s.emit('village:move',{villageId:u.id,x:-1.35,z:6.3,rotation:0,moving:false});await h.emit(s,'village:join',{villageId:u.id});assert.equal((await h.emit(s,'life:start',{anchorId:'fishing:0'})).ok,true);}
    assert.equal(h.runtime.life.active(u.id).star_id,a);assert.equal(h.runtime.life.active(v.id).star_id,b);
    assert.equal((await h.emit(sa,'fishing:challenge',{targetId:v.id,minutes:1,stake:0})).ok,false);
    await h.emit(sa,'life:stop',{});assert.equal((await save(h,u,a,{scenery:[{id:'life-fishing',x:0,z:6.3,rotation:0,hidden:true}]})).status,200);
    sa.emit('village:move',{villageId:u.id,x:-1.35,z:6.3,rotation:0,moving:false});await h.emit(sa,'village:join',{villageId:u.id});assert.equal((await h.emit(sa,'life:start',{anchorId:'fishing:0'})).ok,false);
    assert.equal(h.runtime.life.active(v.id).star_id,b);
  }finally{await h.close();}
});

test('separate layouts, crops and robot provenance survive server restart without cloning legacy robots',async()=>{
  mkdirSync('tmp',{recursive:true});const path=resolve('tmp','star-worlds-'+randomUUID()+'.sqlite');let h;
  try{
    h=await harness({store:openStore(path)});const u=await h.register('world_restart'),a=star(h,u,'green'),r=robot();await save(h,u,a,{items:[r],platformColor:'#aabbcc'});
    h.runtime.store.run('INSERT INTO garden_plots(owner_id,plot_id,crop_id,planted_at,planting_id) VALUES(?,?,?,?,?)',u.id,a+'|garden:0','HERB',Date.now(),randomUUID());
    await h.close();h=null;h=await harness({store:openStore(path)});
    assert.equal((await world(h,u,a)).body.village.platformColor,'#aabbcc');assert.equal(h.runtime.life.gardenSnapshot(u.id,a).plots[0].cropId,'HERB');assert.equal(h.runtime.life.gardenSnapshot(u.id).plots[0].cropId,null);
    const robots=h.runtime.colony.snapshot(u.id).robots;assert.equal(robots.length,1);assert.equal(robots[0].starId,a);assert.equal(robots[0].id,r.id);
    assert.equal(readStarWorld(h.runtime.store,u.id,'fishing').items.filter(i=>i.type==='miningRobot').length,0);
  }finally{await h?.close();for(const suffix of ['','-wal','-shm'])rmSync(path+suffix,{force:true});}
});

test('legacy robot migration preserves its plaza history and never clones it to previously shared stars',async()=>{
  mkdirSync('tmp',{recursive:true});const path=resolve('tmp','legacy-world-'+randomUUID()+'.sqlite');let h,raw;let time=Date.now();
  try{
    h=await harness({store:openStore(path),colonyClock:()=>time});const u=await h.register('legacy_world'),a=star(h,u),r=robot();assert.equal((await save(h,u,'plaza',{items:[r]})).status,200);
    time+=120000;h.runtime.colony.snapshot(u.id);await h.close();h=null;
    raw=openStore(path);raw.db.exec(`CREATE TABLE old_robots(owner_id TEXT NOT NULL,item_id TEXT NOT NULL,started INTEGER NOT NULL,settled INTEGER NOT NULL,runtime INTEGER NOT NULL DEFAULT 0,collected INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,total_runtime INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner_id,item_id));
      INSERT INTO old_robots SELECT owner_id,item_id,started,settled,runtime,collected,active,total_runtime FROM colony_robots;DROP TABLE colony_robots;ALTER TABLE old_robots RENAME TO colony_robots;`);
    raw.run('DELETE FROM star_worlds WHERE owner_id=?',u.id);raw.close();raw=null;
    h=await harness({store:openStore(path),colonyClock:()=>time});const robots=h.runtime.colony.snapshot(u.id).robots;
    assert.equal(robots.length,1);assert.equal(robots[0].starId,'plaza');assert.equal(robots[0].collected,2);assert.equal(robots[0].totalRuntime,120000);
    assert.equal(readStarWorld(h.runtime.store,u.id,a).items.filter(i=>i.type==='miningRobot').length,0);
    assert.equal(readStarWorld(h.runtime.store,u.id,'fishing').items.filter(i=>i.type==='miningRobot').length,0);
    assert.equal(readStarWorld(h.runtime.store,u.id,'plaza').items[0].id,r.id);
  }finally{raw?.close();await h?.close();for(const suffix of ['','-wal','-shm'])rmSync(path+suffix,{force:true});}
});

test('late settlement of a won defense keeps the placed robot producing after the victory deadline',async()=>{
  let time=Date.now();const h=await harness({colonyClock:()=>time});try{
    const u=await h.register('offline_victory'),a=star(h,u),r=robot();await save(h,u,a,{items:[r]});const letter=randomUUID(),defense=randomUUID();
    h.runtime.store.run('INSERT INTO colony_letters VALUES(?,?,?,?,?,?,?,?)',letter,u.id,galaxyNpcs[0].id,a,'독립별',2,'attacking',time);
    h.runtime.store.run("INSERT INTO colony_defenses(id,owner_id,letter_id,started,hits) VALUES(?,?,?,?,?)",defense,u.id,letter,time,JSON.stringify(Array.from({length:12},(_,i)=>i)));
    time+=120000;const snapshot=h.runtime.colony.snapshot(u.id);assert.equal(snapshot.letters[0].status,'defended');assert.equal(snapshot.robots[0].totalRuntime,120000);assert.equal(snapshot.robots[0].collected,2);
  }finally{await h.close();}
});
