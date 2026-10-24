import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {petWanderStep} from '../shared/petWander.mjs';
import {WALK_RADIUS} from '../shared/villageSize.mjs';
import {harness} from './runtimeHarness.mjs';

test('wandering is bounded and stops at its destination without following a player',()=>{
  let pet={x:0,z:0,destination:{x:4,z:2}};
  for(let i=0;i<200;i++){const before={...pet};pet={...pet,...petWanderStep(pet,.1)};assert.ok(Math.hypot(pet.x-before.x,pet.z-before.z)<=.171);}
  assert.equal(pet.moving,false);assert.ok(Math.hypot(pet.x-4,pet.z-2)<.16);
  pet={x:WALK_RADIUS-.1,z:0,destination:{x:100,z:100}};
  for(let i=0;i<200;i++){pet={...pet,...petWanderStep(pet,1)};assert.ok(Math.hypot(pet.x,pet.z)<=WALK_RADIUS+1e-8);}
});

test('only pet and call interactions are available; proximity, ownership and retries are checked',async()=>{
  const h=await harness();try{
    const user=await h.register('wander_owner'),host=await h.register('wander_host');
    const socket=await h.connect(user);h.advance(100);
    const body={kind:'pet',requestId:randomUUID(),villageId:user.id};
    assert.equal((await h.request('/me/pet/interactions',null,body)).status,401);
    assert.equal((await h.request('/me/pet/interactions',host,body)).status,409);
    assert.equal((await h.request('/me/pet/interactions',user,{...body,kind:'snack'})).status,400);
    const call={...body,kind:'call',requestId:randomUUID()};
    assert.equal((await h.request('/me/pet/interactions',user,call)).status,200);
    assert.equal((await h.request('/me/pet/interactions',user,call)).status,200);
    const pet=h.runtime.life.petMembers(user.id)[0];assert.equal(pet.actorKind,'PET');assert.ok(pet.destination);
    for(let i=0;i<20;i++)h.advance(100);
    assert.equal((await h.request('/me/pet/interactions',user,body)).status,200);
    const pose={...h.runtime.life.petMembers(user.id)[0]};h.advance(1000);
    assert.equal(h.runtime.life.petMembers(user.id)[0].x,pose.x);
    assert.equal((await h.request('/me/pet/interactions',user,body)).status,200);
    assert.equal((await h.request('/me/pet/interactions',user,{...body,kind:'call'})).status,409);
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM inventory_entries').n,0);
    h.advance(3100);await h.emit(socket,'village:join',{villageId:host.id});h.advance(100);
    const members=(await h.emit(socket,'village:join',{villageId:host.id})).members;
    assert.ok(members.some(member=>member.actorKind==='PET'&&member.ownerId===user.id));
    assert.equal((await h.request('/me/pet/interactions',user,{...call,requestId:randomUUID()})).status,409);
    assert.equal((await h.request('/me/pet/interactions',user,{...call,villageId:host.id,requestId:randomUUID()})).status,200);
    socket.emit('village:move',{villageId:host.id,x:-5,z:-2,rotation:0,moving:false,seatId:null,jumpStarted:0});await h.emit(socket,'village:join',{villageId:host.id});
    assert.equal((await h.request('/me/pet/interactions',user,{...body,villageId:host.id,requestId:randomUUID()})).status,409);
  }finally{await h.close();}
});

test('visitors immediately see the absent owner pet wandering in its own village',async()=>{
  const h=await harness({lifeRandom:()=>.25});try{
    const owner=await h.register('resident_owner'),visitor=await h.register('resident_visitor');
    const socket=await h.connect(visitor,owner.id);
    const joined=await h.emit(socket,'village:join',{villageId:owner.id});
    const resident=joined.members.find(m=>m.actorKind==='PET'&&m.ownerId===owner.id);
    assert.ok(resident,'offline owner pet is included in the initial snapshot');
    assert.ok(resident.appearance.petType);
    const start={x:resident.x,z:resident.z};
    for(let i=0;i<10;i++)h.advance(100);
    const pets=h.runtime.life.petMembers(owner.id);
    const moved=pets.find(m=>m.ownerId===owner.id);
    assert.ok(Math.hypot(moved.x-start.x,moved.z-start.z)>.1);
    assert.equal(moved.activityState,'Wandering');
    assert.equal(pets.filter(m=>m.ownerId===owner.id).length,1);
    // The owner's resident remains visible even when the owner visits elsewhere.
    const ownerSocket=await h.connect(owner,visitor.id);h.advance(100);
    assert.equal(h.runtime.life.petMembers(owner.id).filter(m=>m.ownerId===owner.id).length,1);
    assert.ok(h.runtime.life.petMembers(visitor.id).some(m=>m.ownerId===owner.id));
    await h.emit(ownerSocket,'village:join',{villageId:owner.id});h.advance(100);
    assert.equal(h.runtime.life.petMembers(owner.id).filter(m=>m.ownerId===owner.id).length,1);
    await new Promise(resolve=>ownerSocket.emit('village:leave',resolve));h.advance(100);
    assert.ok(h.runtime.life.petMembers(owner.id).some(m=>m.ownerId===owner.id));
    await new Promise(resolve=>socket.emit('village:leave',resolve));h.advance(100);
    assert.equal(h.runtime.life.petMembers(owner.id).length,0,'empty villages release resident simulation');
  }finally{await h.close();}
});

