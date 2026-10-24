import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {io} from 'socket.io-client';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {petFollowStep} from '../shared/petFollow.mjs';
import {WALK_RADIUS} from '../shared/villageSize.mjs';

test('following accelerates within a bounded step, turns smoothly and rests without jitter',()=>{
  let pet={x:0,z:0,rotation:0,moving:false},player={x:4,z:2,rotation:0};
  for(let i=0;i<200;i++){
    const next=petFollowStep(pet,player,.1);
    assert.ok(Math.hypot(next.x-pet.x,next.z-pet.z)<=.42);
    assert.ok(Math.abs(next.rotation-pet.rotation)<Math.PI);
    pet=next;
  }
  assert.equal(pet.moving,false);assert.ok(Math.hypot(pet.x-player.x,pet.z-player.z)>.65);
  const pose={x:pet.x,z:pet.z};for(let i=0;i<20;i++)pet=petFollowStep(pet,player,.1);
  assert.deepEqual({x:pet.x,z:pet.z},pose);
  for(let i=0;i<200;i++)pet=petFollowStep(pet,{x:WALK_RADIUS,z:0,rotation:-Math.PI/2},.1);
  assert.ok(Math.hypot(pet.x,pet.z)<=WALK_RADIUS);
});

test('pets follow across villages; interactions require ownership, presence and proximity and replay only once',async()=>{
  let time=Date.now();const runtime=createApp({testing:true,store:openStore(':memory:'),lifeClock:()=>time}),sockets=[];
  await new Promise(resolve=>runtime.server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${runtime.server.address().port}`;
  async function request(path,user,body,method=body?'POST':'GET'){
    const response=await fetch(url+'/api'+path,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body?JSON.stringify(body):undefined});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  const emit=(socket,event,data)=>new Promise(resolve=>socket.emit(event,data,resolve));
  async function register(username){const result=await request('/auth/register',null,{username,password:'pet-follow-password'});return {...result.body.user,cookie:result.cookie};}
  async function connect(user,villageId=user.id){const socket=io(url,{transports:['websocket'],extraHeaders:{Cookie:user.cookie},forceNew:true});sockets.push(socket);await new Promise(resolve=>socket.once('connect',resolve));assert.equal((await emit(socket,'village:join',{villageId})).ok,true);return socket;}
  function advance(ms=100){time+=ms;runtime.life.tick();}
  try{
    const user=await register('follow_pet_owner'),host=await register('follow_pet_host');
    const socket=await connect(user);advance();
    assert.equal(runtime.life.companionMembers(user.id).length,1);
    socket.emit('village:move',{villageId:user.id,x:3,z:2,rotation:0,moving:true,seatId:null,jumpStarted:0});await emit(socket,'village:join',{villageId:user.id});
    const before=runtime.life.companionMembers(user.id)[0];advance();const after=runtime.life.companionMembers(user.id)[0];
    assert.ok(after.x>before.x);for(let i=0;i<60;i++)advance();
    const body={kind:'pet',requestId:randomUUID(),villageId:user.id};
    assert.equal((await request('/me/pet/interactions',null,body)).status,401);
    assert.equal((await request('/me/pet/interactions',host,body)).status,409);
    assert.equal((await request('/me/pet/interactions',user,body)).status,200);
    assert.equal(runtime.life.companionMembers(user.id)[0].activityState,'Petted');
    const pose=runtime.life.companionMembers(user.id)[0];advance(1000);
    assert.equal(runtime.life.companionMembers(user.id)[0].x,pose.x);
    assert.equal((await request('/me/pet/interactions',user,body)).status,200);
    assert.equal((await request('/me/pet/interactions',user,{...body,kind:'snack'})).status,409);
    advance(2100);
    assert.equal((await request('/me/pet/interactions',user,{...body,kind:'snack',requestId:randomUUID()})).status,200);
    assert.equal(runtime.life.companionMembers(user.id)[0].activityState,'Snacking');
    assert.equal(runtime.store.one('SELECT COUNT(*) n FROM inventory_entries').n,0);
    advance(3100);await emit(socket,'village:join',{villageId:host.id});advance();
    const members=(await emit(socket,'village:join',{villageId:host.id})).members;
    assert.ok(members.find(m=>m.actorKind==='COMPANION'&&m.ownerId===user.id));
    assert.equal((await request('/me/pet/interactions',user,{...body,villageId:host.id,requestId:randomUUID()})).status,200);
    assert.equal((await request('/me/pet/interactions',user,{...body,requestId:randomUUID()})).status,409);
    advance(3100);socket.emit('village:move',{villageId:host.id,x:-5,z:-2,rotation:0,moving:true,seatId:null,jumpStarted:0});await emit(socket,'village:join',{villageId:host.id});
    assert.equal((await request('/me/pet/interactions',user,{...body,villageId:host.id,requestId:randomUUID()})).status,409);
    socket.disconnect();await new Promise(resolve=>setTimeout(resolve,20));advance();
    assert.equal(runtime.life.companionMembers(host.id).filter(m=>m.ownerId===user.id).length,0);
  }finally{for(const socket of sockets)socket.disconnect();await runtime.close();}
});
