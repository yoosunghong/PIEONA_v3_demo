import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {harness} from './runtimeHarness.mjs';
import {galaxyNpcs} from '../shared/galaxy.mjs';
import {discoveryChance,persuasionChance,ROBOT_BATTERY_MS,DEFENSE_DURATION_MS} from '../shared/colony.mjs';
import {bestBonus} from '../server/colony.mjs';
import {rollFish} from '../shared/life.mjs';

function completed(h,users){const id=randomUUID();h.runtime.store.transaction(()=>{for(const u of users)h.runtime.store.run('INSERT INTO social_game_records VALUES(?,?,?,?,?,?,?)',id,u.id,u.id,'chain',10,'{}',new Date().toISOString());});return id;}
function seedStar(h,u,type='red',bonus=20){const id=`found-${type}-${randomUUID()}`;h.runtime.store.run('INSERT INTO owned_stars VALUES(?,?,?)',u.id,id,'테스트별');h.runtime.store.run('INSERT INTO colony_stars VALUES(?,?,?,?,?,?)',u.id,id,type,'B',bonus,2);return id;}
function letter(h,u,star,status='pending'){const id=randomUUID();h.runtime.store.run('INSERT INTO colony_letters VALUES(?,?,?,?,?,?,?,?)',id,u.id,galaxyNpcs[0].id,star,'테스트별',2,status,Date.now());return id;}

test('discovery rolls independently per participant, caps outstanding discoveries and charges the exact core cost once',async()=>{
  let roll=.35;const h=await harness({colonyRandom:()=>roll});try{
    const a=await h.register('colony_a'),b=await h.register('colony_b');
    assert.ok(Math.abs(discoveryChance(1)-.3)<1e-12);assert.equal(discoveryChance(20),1);assert.ok(persuasionChance(100)>persuasionChance(0));
    completed(h,[a,b]);const first=(await h.request('/me/colony',a)).body,second=(await h.request('/me/colony',b)).body;
    assert.equal(first.discovery.players,2);assert.equal(first.discovery.chance,.4);assert.notEqual(first.discovery.id,second.discovery.id);
    assert.equal(first.inventory.find(i=>i.itemId==='STAR_CORE').quantity,4);
    completed(h,[a]);assert.equal((await h.request('/me/colony',a)).body.discovery.id,first.discovery.id);
    assert.equal((await h.request('/me/colony/claim',b,{starId:first.discovery.id})).status,409);
    const claim=await h.request('/me/colony/claim',a,{starId:first.discovery.id});assert.equal(claim.status,200);assert.equal(claim.body.stars.length,1);assert.equal(claim.body.inventory.find(i=>i.itemId==='STAR_CORE').quantity,4);
    assert.equal((await h.request('/me/colony/claim',a,{starId:first.discovery.id})).status,409);
    assert.equal((await h.request('/me/stars',a)).body.stars.length,4);
    roll=.99;completed(h,[a]);assert.equal((await h.request('/me/colony',a)).body.discovery,null);
  }finally{await h.close();}
});

test('robot settlement survives movement, storage, battery depletion and recharge without duplicate ore',async()=>{
  let time=Date.now();const h=await harness({colonyClock:()=>time});try{
    const u=await h.register('robot_owner'),v=await h.register('robot_other');const {store,colony}=h.runtime;
    const village={items:[{id:'r1',type:'miningRobot',x:4,z:4,rotation:0}]};colony.syncRobots(u.id,village);
    time+=120_000;let snap=colony.snapshot(u.id);assert.equal(snap.robots[0].collected,2);assert.equal(colony.snapshot(u.id).robots[0].collected,2);
    colony.syncRobots(u.id,{items:[{...village.items[0],x:5}]});time+=60_000;assert.equal(colony.snapshot(u.id).robots[0].collected,3);
    colony.syncRobots(u.id,{items:[]});time+=120_000;colony.syncRobots(u.id,village);assert.equal(colony.snapshot(u.id).robots[0].collected,3);
    time+=ROBOT_BATTERY_MS; snap=colony.snapshot(u.id);assert.equal(snap.robots[0].battery,0);assert.equal(snap.robots[0].collected,60);
    assert.equal((await h.request('/me/colony/robots/r1/recharge',v,{})).status,409);
    const r=await h.request('/me/colony/robots/r1/recharge',u,{});assert.equal(r.status,200);assert.equal(r.body.robots[0].battery,100);assert.equal(r.body.robots[0].totalRuntime,ROBOT_BATTERY_MS);assert.equal(store.one('SELECT quantity FROM inventory_entries WHERE owner_id=? AND item_id=?',u.id,'IRON_ORE').quantity,55);
  }finally{await h.close();}
});

test('NPC wish discovery and trades require a visit, validate inventory and keep separate affinities',async()=>{
  const h=await harness();try{
    const u=await h.register('npc_friend'),n=galaxyNpcs[0],socket=await h.connect(u);const store=h.runtime.store;
    assert.equal((await h.request('/npcs/'+n.id+'/talk',u,{})).status,409);
    await h.emit(socket,'village:join',{villageId:n.id});let r=await h.request('/npcs/'+n.id+'/talk',u,{});assert.equal(r.body.npcs[0].wishlist.length,1);assert.match(r.body.reply,/꽃/);
    r=await h.request('/npcs/'+n.id+'/talk',u,{});assert.equal(r.body.npcs[0].wishlist.length,2);assert.equal(r.body.npcs[0].affinity,1);
    store.run('INSERT INTO inventory_entries VALUES(?,?,?)',u.id,'FLOWER',2);
    r=await h.request('/npcs/'+n.id+'/trade',u,{itemId:'FLOWER',quantity:2});assert.equal(r.status,200);assert.equal(r.body.reward.itemId,'STAR_CORE');assert.equal(r.body.npcs[0].affinity,11);assert.equal(r.body.npcs[1].affinity,0);
    assert.equal((await h.request('/npcs/'+n.id+'/trade',u,{itemId:'FLOWER',quantity:1})).status,409);
    assert.equal((await h.request('/npcs/'+n.id+'/trade',u,{itemId:'STAR_CORE',quantity:-1})).status,400);
  }finally{await h.close();}
});

test('ceding transfers ownership, doubles cores once and occupied stars reject travel and bonuses',async()=>{
  const h=await harness();try{
    const u=await h.register('star_rights'),socket=await h.connect(u),s=seedStar(h,u),id=letter(h,u,s);
    assert.equal(bestBonus(h.runtime.store,u.id,'red'),20);
    assert.equal((await h.request('/me/colony/letters/'+id+'/resolve',u,{choice:'cede'})).status,409);
    await h.emit(socket,'village:join',{villageId:galaxyNpcs[0].id});const r=await h.request('/me/colony/letters/'+id+'/resolve',u,{choice:'cede'});assert.equal(r.status,200);assert.equal(r.body.inventory.find(i=>i.itemId==='STAR_CORE').quantity,7);
    assert.equal((await h.request('/me/colony/letters/'+id+'/resolve',u,{choice:'cede'})).status,409);assert.equal(bestBonus(h.runtime.store,u.id,'red'),0);
    assert.ok(h.runtime.store.one('SELECT 1 FROM owned_stars WHERE owner_id=? AND star_id=?',galaxyNpcs[0].id,s));
    const s2=seedStar(h,u);letter(h,u,s2,'occupied');await h.emit(socket,'village:join',{villageId:u.id});assert.equal((await h.emit(socket,'star:travel',{starId:s2})).ok,false);
    assert.equal(bestBonus(h.runtime.store,u.id,'red'),0);
    const other=await h.register('star_intruder'),guest=await h.connect(other);assert.equal((await h.emit(guest,'star:travel',{starId:s2})).ok,false);
  }finally{await h.close();}
});

test('failed persuasion leads to server-timed defense, occupation on loss, and successful recapture',async()=>{
  let time=Date.now();const h=await harness({colonyClock:()=>time,colonyRandom:()=>.99});try{
    const u=await h.register('defense_owner'),socket=await h.connect(u),s=seedStar(h,u),id=letter(h,u,s);
    await h.emit(socket,'village:join',{villageId:galaxyNpcs[0].id});let r=await h.request('/me/colony/letters/'+id+'/resolve',u,{choice:'keep'});assert.equal(r.body.letters[0].status,'attacking');assert.equal(bestBonus(h.runtime.store,u.id,'red'),0);
    r=await h.request('/me/colony/letters/'+id+'/defense',u,{});assert.ok(r.body.defense);const defense=r.body.defense.id;
    assert.equal((await h.request('/me/colony/letters/'+id+'/defense',u,{})).status,409);
    time+=DEFENSE_DURATION_MS;r=await h.request('/me/colony',u);assert.equal(r.body.letters[0].status,'occupied');assert.equal(r.body.defense,null);
    assert.equal((await h.request('/me/colony/defense/'+defense+'/fire',u,{lane:0})).status,409);
    r=await h.request('/me/colony/letters/'+id+'/defense',u,{});const retry=r.body.defense.id;
    for(let i=0;i<15;i++){r=await h.request('/me/colony/defense/'+retry+'/fire',u,{lane:i%3});assert.equal(r.status,200);time+=1000;}
    time+=DEFENSE_DURATION_MS;r=await h.request('/me/colony',u);assert.equal(r.body.letters[0].status,'defended');assert.equal(bestBonus(h.runtime.store,u.id,'red'),20);
    assert.equal(h.runtime.store.one('SELECT status FROM colony_defenses WHERE id=?',retry).status,'won');
  }finally{await h.close();}
});

test('owned blue star bonus changes rare fish chance while keeping base catch success',()=>{
  const sequence=[.5,.8,0];assert.equal(rollFish(()=>sequence.shift(),20).rarity,'rare');assert.equal(rollFish(()=>.9,50),null);
});
