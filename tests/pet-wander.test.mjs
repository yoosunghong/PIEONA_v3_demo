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
