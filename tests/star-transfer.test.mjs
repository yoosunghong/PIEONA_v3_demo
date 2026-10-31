import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdirSync,rmSync} from 'node:fs';
import {harness} from './runtimeHarness.mjs';
import {openStore} from '../server/store.mjs';
import {createStarWorld,readStarWorld} from '../server/starWorlds.mjs';
import {validPlacement} from '../shared/world.mjs';
import {galaxyNpcs} from '../shared/galaxy.mjs';
import {DEFENSE_DURATION_MS} from '../shared/colony.mjs';

const npc=galaxyNpcs[0].id;
function fixture(h,u,time,status='pending'){
  const store=h.runtime.store,star=`found-red-${randomUUID()}`,letter=randomUUID(),robot=randomUUID();
  store.run('INSERT INTO owned_stars VALUES(?,?,?)',u.id,star,'이전별 · A');store.run('INSERT INTO colony_stars VALUES(?,?,?,?,?,?)',u.id,star,'red','A',35,3);createStarWorld(store,u.id,star);
  let point;for(let x=-7;x<=7&&!point;x++)for(let z=-7;z<=7;z++)if(validPlacement(x,z)){point={x,z};break;}
  const village={theme:'twilight',platformColor:'#aabbcc',items:[{id:robot,type:'miningRobot',...point,rotation:2}],scenery:[{id:'life-fishing',x:0,z:6.3,rotation:2,hidden:true}]};
  store.run('UPDATE star_worlds SET village=? WHERE owner_id=? AND star_id=?',JSON.stringify(village),u.id,star);h.runtime.colony.syncRobots(u.id,village,star);
  store.run('INSERT INTO garden_plots(owner_id,plot_id,crop_id,planted_at,planting_id,planted_by,water_count,last_watered_at) VALUES(?,?,?,?,?,?,?,?)',u.id,star+'|garden:0','HERB',time-600000,randomUUID(),'원래 주인',2,time-300000);
  store.run('INSERT INTO colony_letters VALUES(?,?,?,?,?,?,?,?)',letter,u.id,npc,star,'이전별',3,status,time);
  return {star,letter,robot,village};
}
const rows=(store,table,owner,star)=>store.all(`SELECT * FROM ${table} WHERE owner_id=? AND star_id=?`,owner,star);
const ore=(store,owner)=>store.one("SELECT quantity FROM inventory_entries WHERE owner_id=? AND item_id='IRON_ORE'",owner)?.quantity||0;

test('ceding moves the complete star and robot history to the NPC once, including across restart',async()=>{
  mkdirSync('tmp',{recursive:true});const path=resolve('tmp','star-transfer-'+randomUUID()+'.sqlite');let h,time=Date.now();
  try{
    h=await harness({store:openStore(path),colonyClock:()=>time});const u=await h.register('complete_transfer'),v=await h.register('transfer_visitor'),f=fixture(h,u,time),store=h.runtime.store;
    const other=`found-red-${randomUUID()}`;store.run('INSERT INTO owned_stars VALUES(?,?,?)',u.id,other,'남은 별');store.run('INSERT INTO colony_stars VALUES(?,?,?,?,?,?)',u.id,other,'red','B',20,2);createStarWorld(store,u.id,other);
    h.runtime.colony.syncRobots(u.id,{items:[{...f.village.items[0]}]},other);
    const npcHome=store.one('SELECT village FROM users WHERE id=?',npc).village,playerHome=store.one('SELECT village FROM users WHERE id=?',u.id).village;
    const crop=store.one('SELECT * FROM garden_plots WHERE owner_id=? AND plot_id=?',u.id,f.star+'|garden:0');
    const socket=await h.connect(u),guest=await h.connect(v,u.id);await h.emit(guest,'star:travel',{starId:f.star});await h.emit(socket,'village:join',{villageId:npc});
    time+=120000;const before=h.runtime.colony.snapshot(u.id).robots.find(r=>r.starId===f.star),oldOre=ore(store,u.id);
    const result=await h.request('/me/colony/letters/'+f.letter+'/resolve',u,{choice:'cede'});assert.equal(result.status,200);assert.equal(result.body.letters[0].status,'ceded');assert.equal(result.body.inventory.find(i=>i.itemId==='STAR_CORE').quantity,9);
    for(const table of ['owned_stars','star_worlds','colony_stars','colony_robots']){assert.equal(rows(store,table,u.id,f.star).length,0);assert.equal(rows(store,table,npc,f.star).length,1);}
    assert.deepEqual(readStarWorld(store,npc,f.star),f.village);assert.equal(rows(store,'owned_stars',npc,f.star)[0].name,'이전별 · A');assert.equal(rows(store,'colony_stars',npc,f.star)[0].bonus,35);
    const moved=store.one('SELECT * FROM garden_plots WHERE owner_id=? AND plot_id=?',npc,f.star+'|garden:0');assert.deepEqual({...moved},{...crop,owner_id:npc});assert.equal(store.one('SELECT 1 FROM garden_plots WHERE owner_id=? AND plot_id=?',u.id,crop.plot_id),undefined);
    const npcRobot=h.runtime.colony.snapshot(npc).robots.find(r=>r.starId===f.star);for(const key of ['id','runtime','totalRuntime','battery','collected','started'])assert.equal(npcRobot[key],before[key]);assert.equal(npcRobot.operating,true);
    assert.equal(rows(store,'colony_robots',u.id,other).length,1);assert.equal(store.one('SELECT village FROM users WHERE id=?',u.id).village,playerHome);assert.equal(store.one('SELECT village FROM users WHERE id=?',npc).village,npcHome);
    assert.equal((await h.emit(guest,'village:join',{villageId:u.id})).members.find(m=>m.userId===v.id).starId,'plaza');
    assert.equal((await h.request(`/users/${npc}/stars/${f.star}/world`,u)).status,200);assert.equal((await h.request(`/users/${u.id}/stars/${f.star}/world`,u)).status,403);
    assert.equal((await h.request('/me/colony/letters/'+f.letter+'/resolve',u,{choice:'cede'})).status,409);
    time+=60000;h.runtime.colony.snapshot(npc);assert.equal(ore(store,npc),2);assert.equal(ore(store,u.id),oldOre);assert.equal((await h.request('/me/colony/robots/'+f.robot+'/recharge',u,{starId:f.star})).status,409);
    const checkpoint=rows(store,'colony_robots',npc,f.star)[0];await h.close();h=null;h=await harness({store:openStore(path),colonyClock:()=>time});
    assert.deepEqual(readStarWorld(h.runtime.store,npc,f.star),f.village);assert.deepEqual(rows(h.runtime.store,'colony_robots',npc,f.star)[0],checkpoint);assert.deepEqual(h.runtime.store.one('SELECT * FROM garden_plots WHERE owner_id=? AND plot_id=?',npc,crop.plot_id),moved);
  }finally{await h?.close();for(const suffix of ['','-wal','-shm'])rmSync(path+suffix,{force:true});}
});

test('failed transfer rolls ownership, facilities, robot settlement, crops and compensation back together',async()=>{
  let time=Date.now();const h=await harness({colonyClock:()=>time});try{
    const u=await h.register('transfer_rollback'),f=fixture(h,u,time),store=h.runtime.store,socket=await h.connect(u);await h.emit(socket,'village:join',{villageId:npc});h.runtime.colony.snapshot(u.id);
    const robotBefore=rows(store,'colony_robots',u.id,f.star)[0],cropBefore=store.one('SELECT * FROM garden_plots WHERE owner_id=? AND plot_id=?',u.id,f.star+'|garden:0');
    store.db.exec("CREATE TRIGGER reject_transfer BEFORE UPDATE OF owner_id ON garden_plots BEGIN SELECT RAISE(ABORT,'test transfer failure'); END");time+=120000;
    assert.equal((await h.request('/me/colony/letters/'+f.letter+'/resolve',u,{choice:'cede'})).status,500);
    assert.deepEqual(readStarWorld(store,u.id,f.star),f.village);assert.deepEqual(rows(store,'colony_robots',u.id,f.star)[0],robotBefore);assert.deepEqual(store.one('SELECT * FROM garden_plots WHERE owner_id=? AND plot_id=?',u.id,cropBefore.plot_id),cropBefore);
    assert.equal(rows(store,'owned_stars',u.id,f.star).length,1);assert.equal(rows(store,'owned_stars',npc,f.star).length,0);assert.equal(rows(store,'star_worlds',npc,f.star).length,0);assert.equal(ore(store,u.id),0);
    assert.equal(store.one("SELECT quantity FROM inventory_entries WHERE owner_id=? AND item_id='STAR_CORE'",u.id).quantity,3);assert.equal(store.one('SELECT status FROM colony_letters WHERE id=?',f.letter).status,'pending');
    store.db.exec('DROP TRIGGER reject_transfer');assert.equal((await h.request('/me/colony/letters/'+f.letter+'/resolve',u,{choice:'cede'})).status,200);
  }finally{await h.close();}
});

test('actual defense loss and recapture preserve ownership, full layout, crops and battery checkpoint',async()=>{
  mkdirSync('tmp',{recursive:true});const path=resolve('tmp','star-recapture-'+randomUUID()+'.sqlite');let time=Date.now(),h;try{
    h=await harness({store:openStore(path),colonyClock:()=>time});const u=await h.register('recapture_preserves'),f=fixture(h,u,time,'attacking');let store=h.runtime.store;
    const crop=store.one('SELECT * FROM garden_plots WHERE owner_id=? AND plot_id=?',u.id,f.star+'|garden:0');
    const started=await h.request('/me/colony/letters/'+f.letter+'/defense',u,{});assert.equal(started.status,200);time+=DEFENSE_DURATION_MS;
    const occupied=h.runtime.colony.snapshot(u.id);assert.equal(occupied.letters[0].status,'occupied');const paused=occupied.robots.find(r=>r.starId===f.star);assert.equal(paused.operating,false);
    await h.close();h=null;time+=300000;h=await harness({store:openStore(path),colonyClock:()=>time});store=h.runtime.store;
    assert.equal(h.runtime.colony.snapshot(u.id).robots.find(r=>r.starId===f.star).runtime,paused.runtime);
    assert.equal((await h.request('/me/world',u,{starId:f.star,village:{items:[]}},'PATCH')).status,403);
    assert.deepEqual(readStarWorld(store,u.id,f.star),f.village);assert.deepEqual(store.one('SELECT * FROM garden_plots WHERE owner_id=? AND plot_id=?',u.id,crop.plot_id),crop);assert.equal(rows(store,'owned_stars',npc,f.star).length,0);
    const retry=await h.request('/me/colony/letters/'+f.letter+'/defense',u,{});assert.equal(retry.status,200);
    for(let i=0;i<15;i++){assert.equal((await h.request('/me/colony/defense/'+retry.body.defense.id+'/fire',u,{lane:i%3})).status,200);time+=1000;}
    time+=DEFENSE_DURATION_MS-15000;const recovered=h.runtime.colony.snapshot(u.id);assert.equal(recovered.letters[0].status,'defended');const robot=recovered.robots.find(r=>r.starId===f.star);
    for(const key of ['id','runtime','totalRuntime','battery','collected','started'])assert.equal(robot[key],paused[key]);assert.equal(robot.operating,true);
    assert.deepEqual(readStarWorld(store,u.id,f.star),f.village);assert.deepEqual(store.one('SELECT * FROM garden_plots WHERE owner_id=? AND plot_id=?',u.id,crop.plot_id),crop);assert.equal(rows(store,'owned_stars',u.id,f.star).length,1);assert.equal(rows(store,'colony_stars',u.id,f.star)[0].bonus,35);
    time+=60000;assert.equal(h.runtime.colony.snapshot(u.id).robots.find(r=>r.starId===f.star).runtime,paused.runtime+60000);
  }finally{await h?.close();for(const suffix of ['','-wal','-shm'])rmSync(path+suffix,{force:true});}
});
