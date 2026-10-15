import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {io} from 'socket.io-client';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {newRun,advanceRun,runAction,jumpHeight,runScore,RUN_DURATION,RUN_EXPIRY} from '../shared/runner.mjs';
import {day} from '../server/store.mjs';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decorations} from '../shared/world.mjs';

let runtime,url,owner,visitor,third;
async function request(path,user,body,method=body?'POST':'GET'){const r=await fetch(url+'/api'+path,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function register(username){const r=await request('/auth/register',null,{username,password:'test-password-world'});assert.equal(r.status,201);await request('/me',{cookie:r.cookie},{nickname:username},'PATCH');return {...r.body.user,cookie:r.cookie};}
before(async()=>{runtime=createApp({testing:true,store:openStore(':memory:')});await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${runtime.server.address().port}`;owner=await register('garden_owner');visitor=await register('garden_visitor');third=await register('garden_third');});
after(async()=>runtime.close());
const piece=()=>({id:randomUUID(),type:'planter',x:-3,z:3.5,rotation:0});

test('game entry HTML is reloaded instead of keeping an old runner bundle in browser cache',{skip:!existsSync('dist/index.html')&&'Build the client to check served HTML cache headers'},async()=>{
  for(const path of ['/','/index.html','/runner-preview']){
    const response=await fetch(url+path);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
});
test('world saves are owner scoped, validated and public to visitors',async()=>{
  const village={items:[piece()],theme:'default'},appearance={hat:'crown',accessory:'wings',color:'#d994b6'};
  assert.equal((await request('/me/world',null,{village},'PATCH')).status,401);
  assert.equal((await request('/me/world',owner,{village,appearance},'PATCH')).status,200);
  const profile=(await request('/users/'+owner.id,visitor)).body.user;
  assert.deepEqual(profile.village,village);assert.deepEqual(profile.appearance,appearance);
  for(const item of [{...piece(),x:0,z:0},{...piece(),x:100},{...piece(),type:'injected-script'},{...piece(),rotation:.5}])assert.equal((await request('/me/world',owner,{village:{items:[item]}},'PATCH')).status,400);
  assert.equal((await request('/me/world',owner,{village:{items:Array.from({length:25},piece)}},'PATCH')).status,400);
  const duplicate=piece();assert.equal((await request('/me/world',owner,{village:{items:[duplicate,duplicate]}},'PATCH')).status,400);
  assert.equal((await request('/me/world',visitor,{targetId:owner.id,village:{items:[]}},'PATCH')).status,400);
  assert.deepEqual((await request('/users/'+owner.id,visitor)).body.user.village,village);
  assert.equal((await request('/me/world',owner,{appearance:{...appearance,color:'url(evil)'}},'PATCH')).status,400);
});

test('village themes persist independently of avatar slots, preserve furniture and reach visitors',async()=>{
  const before=(await request('/me',owner)).body.user;
  for(const theme of ['sunset','twilight']){
    const village={...before.village,theme};
    assert.equal((await request('/me/world',owner,{village},'PATCH')).status,200);
    assert.deepEqual((await request('/users/'+owner.id,visitor)).body.user.village,village);
  }
  assert.equal((await request('/me/world',owner,{village:{items:before.village.items,theme:'unknown'}},'PATCH')).status,400);
  // Older clients which only save furniture must retain the persisted theme.
  await request('/me/world',owner,{village:{items:before.village.items}},'PATCH');
  assert.equal((await request('/me',owner)).body.user.village.theme,'twilight');
  const slot=(await request('/slots',owner,{nickname:'theme_test'})).body;
  await request(`/slots/${slot.id}/activate`,owner,{});
  assert.equal((await request('/me',owner)).body.user.village.theme,'twilight');
});

test('all editor props are accepted by world API and survive reload and visitor reads',async()=>{
  const user=await register('prop_catalog_owner');
  for(const entry of decorations){
    const items=[{...piece(),type:entry.id,rotation:3}];
    const result=await request('/me/world',user,{village:{items}},'PATCH');
    assert.equal(result.status,200,entry.id);
    assert.deepEqual((await request('/me',user)).body.user.village.items,items);
    assert.deepEqual((await request('/users/'+user.id,visitor)).body.user.village.items,items);
  }
});

test('live visitors receive clothing updates; the host is separate from player positions',async()=>{
  const socket=io(url,{extraHeaders:{Cookie:visitor.cookie},transports:['websocket'],forceNew:true});
  try{await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
    const joined=await new Promise(r=>socket.emit('village:join',{villageId:owner.id},r));assert.equal(joined.ok,true);assert.equal(joined.members.length,1);assert.equal(joined.members[0].userId,visitor.id);assert.equal(joined.members[0].z,3);
    const updated=new Promise(resolve=>socket.once('village:members',resolve));
    const appearance={hat:'beret',accessory:'scarf',color:'#a6bc83'};await request('/me/world',visitor,{appearance},'PATCH');
    assert.equal((await updated).villageId,owner.id);
    const snapshot=await new Promise(resolve=>socket.emit('village:join',{villageId:owner.id},resolve));
    assert.deepEqual(snapshot.members[0].appearance,appearance);
  }finally{socket.disconnect();}
});

async function connectPlayer(user){
  const socket=io(url,{extraHeaders:{Cookie:user.cookie},transports:['websocket'],forceNew:true});
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
  return socket;
}
const joinVillage=(socket,villageId)=>socket.timeout(2000).emitWithAck('village:join',{villageId});

test('a standing jump reaches neighbours and survives room snapshots without moving horizontally',async()=>{
  const host=await connectPlayer(owner),guest=await connectPlayer(visitor);
  try{
    await joinVillage(host,owner.id);await joinVillage(guest,owner.id);
    const jumpStarted=Date.now(),pose={villageId:owner.id,x:1,z:3,rotation:0,moving:false,jumpStarted};
    const seen=villageEvent(host,'village:move',m=>m.userId===visitor.id);
    guest.emit('village:move',pose);
    assert.deepEqual(await seen,{...pose,userId:visitor.id});
    const snapshot=await joinVillage(host,owner.id);
    assert.equal(snapshot.members.find(m=>m.userId===visitor.id).jumpStarted,jumpStarted);
    guest.emit('village:move',{...pose,jumpStarted:-1,x:4});
    const unchanged=await joinVillage(host,owner.id);
    assert.equal(unchanged.members.find(m=>m.userId===visitor.id).x,1);
  }finally{await closePlayers(host,guest);}
});
async function closePlayers(...sockets){
  for(const socket of sockets){if(socket.connected)await socket.timeout(2000).emitWithAck('village:leave');socket.disconnect();}
}
function villageEvent(socket,event,predicate=()=>true){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{socket.off(event,receive);reject(new Error(`Timed out waiting for ${event}`));},2000);
    function receive(value){if(!predicate(value))return;clearTimeout(timer);socket.off(event,receive);resolve(value);}
    socket.on(event,receive);
  });
}

test('owner and visitor share poses, stop reliably, restore snapshots and leave without leaking to another village',async()=>{
  const host=await connectPlayer(owner),guest=await connectPlayer(visitor),other=await connectPlayer(third);
  try{
    await joinVillage(host,owner.id);await joinVillage(other,third.id);
    let unrelatedMoves=0;other.on('village:move',()=>unrelatedMoves++);
    const arrival=villageEvent(host,'village:members',s=>s.members.length===2);
    const joined=await joinVillage(guest,owner.id);assert.equal(joined.ok,true);
    assert.equal((await arrival).villageId,owner.id);assert.equal(joined.members.length,2);
    const hostStart=joined.members.find(m=>m.userId===owner.id),guestStart=joined.members.find(m=>m.userId===visitor.id);
    assert.notEqual(hostStart.x,guestStart.x);assert.equal('sockets' in hostStart,false);
    const hostPose={villageId:owner.id,x:2,z:1,rotation:1.2,moving:true};
    const seenByGuest=villageEvent(guest,'village:move',m=>m.userId===owner.id);
    host.emit('village:move',hostPose);assert.deepEqual(await seenByGuest,{...hostPose,userId:owner.id});
    const guestPose={villageId:owner.id,x:-2,z:2,rotation:-.8,moving:true};
    const seenByHost=villageEvent(host,'village:move',m=>m.userId===visitor.id);
    guest.emit('village:move',guestPose);assert.deepEqual(await seenByHost,{...guestPose,userId:visitor.id});
    const stopped=villageEvent(guest,'village:move',m=>!m.moving);
    host.emit('village:move',{...hostPose,rotation:2,moving:false});assert.equal((await stopped).rotation,2);
    const departure=villageEvent(host,'village:members',s=>s.members.length===1);
    await guest.timeout(2000).emitWithAck('village:leave');assert.equal((await departure).members[0].userId,owner.id);
    const restored=await joinVillage(guest,owner.id),pose=restored.members.find(m=>m.userId===owner.id);
    assert.equal(pose.x,2);assert.equal(pose.rotation,2);assert.equal(pose.moving,false);
    assert.equal(unrelatedMoves,0);
  }finally{await closePlayers(host,guest,other);}
});

test('one avatar survives another tab leaving or switching villages and disappears on final disconnect',async()=>{
  const host=await connectPlayer(owner),first=await connectPlayer(visitor),second=await connectPlayer(visitor);
  try{
    await joinVillage(host,owner.id);await joinVillage(first,owner.id);
    let snapshot=await joinVillage(second,owner.id);assert.equal(snapshot.members.length,2);
    const move=villageEvent(host,'village:move',m=>m.userId===visitor.id);
    first.emit('village:move',{villageId:owner.id,x:3,z:1,rotation:0,moving:false});await move;
    await joinVillage(first,third.id);
    snapshot=await joinVillage(host,owner.id);assert.equal(snapshot.members.length,2);
    assert.equal(snapshot.members.find(m=>m.userId===visitor.id).x,3);
    const gone=villageEvent(host,'village:members',s=>s.members.length===1);
    second.disconnect();assert.equal((await gone).members[0].userId,owner.id);
  }finally{await closePlayers(host,first,second);}
});

test('a new socket can rejoin after connection loss and receives the remaining player pose',async()=>{
  const host=await connectPlayer(owner);let guest=await connectPlayer(visitor);
  try{
    await joinVillage(host,owner.id);await joinVillage(guest,owner.id);
    const moved=villageEvent(guest,'village:move',m=>m.userId===owner.id);
    host.emit('village:move',{villageId:owner.id,x:-2,z:1,rotation:.4,moving:false});await moved;
    const departed=villageEvent(host,'village:members',s=>s.members.length===1);
    guest.disconnect();await departed;
    guest=await connectPlayer(visitor);
    const arrived=villageEvent(host,'village:members',s=>s.members.length===2);
    const rejoined=await joinVillage(guest,owner.id);await arrived;
    assert.equal(rejoined.members.find(m=>m.userId===owner.id).x,-2);
    const restored=villageEvent(host,'village:move',m=>m.userId===visitor.id);
    guest.emit('village:move',{villageId:owner.id,x:2,z:-1,rotation:-.4,moving:false});
    assert.equal((await restored).z,-1);
  }finally{await closePlayers(host,guest);}
});

test('room scoping, pose validation, boundary clamping and movement throttling preserve the final stop',async()=>{
  const host=await connectPlayer(owner),guest=await connectPlayer(visitor);
  try{
    await joinVillage(host,owner.id);await joinVillage(guest,owner.id);
    for(const bad of [{villageId:third.id,x:4,z:1,rotation:0,moving:false},{villageId:owner.id,x:null,z:1,rotation:0,moving:false},{villageId:owner.id,x:NaN,z:1,rotation:0,moving:false}])guest.emit('village:move',bad);
    let snapshot=await joinVillage(host,owner.id);assert.equal(snapshot.members.find(m=>m.userId===visitor.id).x,1);
    const clamp=villageEvent(host,'village:move',m=>m.userId===visitor.id);
    guest.emit('village:move',{villageId:owner.id,x:100,z:100,rotation:20,moving:false});
    const bounded=await clamp;assert.ok(Math.abs(Math.hypot(bounded.x,bounded.z)-5.8)<1e-8);assert.ok(Math.abs(bounded.rotation)<=Math.PI);
    let received=0;host.on('village:move',()=>received++);
    for(let i=0;i<100;i++)guest.emit('village:move',{villageId:owner.id,x:i/100,z:0,rotation:0,moving:true});
    const stop=villageEvent(host,'village:move',m=>!m.moving);
    guest.emit('village:move',{villageId:owner.id,x:1,z:0,rotation:0,moving:false});await stop;
    assert.ok(received<10,`Movement flood was not bounded: ${received}`);
    snapshot=await joinVillage(host,owner.id);assert.equal(snapshot.members.find(m=>m.userId===visitor.id).moving,false);
  }finally{await closePlayers(host,guest);}
});

test('closed villages and blocks reject live entry while the owner can still enter',async()=>{
  const host=await connectPlayer(owner),guest=await connectPlayer(visitor);
  try{
    await request('/me',owner,{settings:{allowVisitors:false}},'PATCH');
    assert.equal((await joinVillage(guest,owner.id)).ok,false);
    assert.equal((await joinVillage(host,owner.id)).ok,true);
    await request('/me',owner,{settings:{allowVisitors:true}},'PATCH');
    await request('/blocks/'+visitor.id,owner,{});
    assert.equal((await joinVillage(guest,owner.id)).ok,false);
  }finally{
    await request('/blocks/'+visitor.id,owner,undefined,'DELETE');
    await request('/me',owner,{settings:{allowVisitors:true}},'PATCH');
    await closePlayers(host,guest);
  }
});

test('runner jump, lane, collision, cooldown and terminal state are deterministic',()=>{
  const obstacles=[{time:5000,lane:-1,height:.9},{time:7000,lane:1,height:1.15},{time:9000,lane:-1,height:.9}];
  let state=runAction(newRun(),obstacles,4750,'jump');assert.ok(jumpHeight(5000,state.jumpAt)>1.15);
  state=advanceRun(state,obstacles,5100);assert.equal(state.lives,3);assert.equal(state.dodged,1);
  state=runAction(state,obstacles,6500,'left');assert.equal(state.lane,0);state=runAction(state,obstacles,6550,'right');assert.equal(state.lane,0);
  state=advanceRun(state,obstacles,10000);assert.equal(state.lives,2);assert.equal(state.dodged,2);
  const dead=advanceRun(newRun(),[{time:5000,lane:-1,height:1},{time:7000,lane:-1,height:1},{time:9000,lane:-1,height:1}],RUN_DURATION);assert.equal(dead.lives,0);assert.equal(dead.elapsed,9000);assert.equal(advanceRun(dead,obstacles,RUN_DURATION).elapsed,9000);
});

test('runner API rejects forged score, cross-user actions and rhythm hits; persists zero-reward records once',async()=>{
  const r=await request('/games',visitor,{targetId:owner.id,kind:'runner',anonymous:true});assert.equal(r.status,201);const gid=r.body.id;
  assert.equal(r.body.duration,RUN_DURATION);assert.ok(r.body.notes.some(n=>n.kind==='seed'));
  assert.equal((await request(`/games/${gid}/finish`,visitor,{score:999999})).status,400);
  assert.equal((await request(`/games/${gid}/action`,third,{action:'jump'})).status,404);
  assert.equal((await request(`/games/${gid}/hit`,visitor,{lane:1})).status,404);
  assert.equal((await request(`/games/${gid}/action`,visitor,{action:'jump',score:9000})).status,400);
  // Deliberately collide three times: even an unsuccessful round belongs in the village records.
  runtime.store.run('UPDATE games SET notes=?,started=? WHERE id=?',JSON.stringify([5000,7000,9000].map(time=>({time,lane:-1,height:1}))),Date.now()-10000,gid);
  const result=await request(`/games/${gid}/finish`,visitor,{});assert.equal(result.status,200);assert.equal(result.body.gold,0);assert.equal(result.body.lives,0);assert.ok(result.body.score<1000);
  assert.equal((await request(`/games/${gid}/finish`,visitor,{})).status,409);
  const records=(await request(`/villages/${owner.id}/records?kind=runner`,third)).body.records;
  assert.equal(records.length,1);assert.equal(records[0].nickname,'익명의 이웃');assert.ok(!JSON.stringify(records).includes(visitor.id));assert.ok(!JSON.stringify(records).includes(gid));
  assert.equal((await request(`/villages/${third.id}/records?kind=runner`,owner)).body.records.length,0);
});

test('runner can settle after two minutes and stays busy until its longer expiry',async()=>{
  const runner=await register('runner_expiry');
  const start=await request('/games',runner,{targetId:runner.id,kind:'runner'}),gid=start.body.id;
  runtime.store.run('UPDATE games SET started=?,notes=? WHERE id=?',Date.now()-RUN_DURATION-30000,'[]',gid);
  assert.equal((await request('/games',runner,{targetId:runner.id,kind:'runner'})).status,409);
  const state=await request(`/games/${gid}/state`,runner);
  assert.equal(state.status,200);assert.equal(state.body.state.elapsed,RUN_DURATION);
  assert.equal((await request(`/games/${gid}/finish`,runner,{})).status,200);
  const expired=await request('/games',runner,{targetId:runner.id,kind:'runner'});
  runtime.store.run('UPDATE games SET started=? WHERE id=?',Date.now()-RUN_EXPIRY-1000,expired.body.id);
  assert.equal((await request(`/games/${expired.body.id}/state`,runner)).status,400);
  assert.equal((await request(`/games/${expired.body.id}/finish`,runner,{})).status,400);
  await request(`/games/${expired.body.id}/abandon`,runner,{});
});

test('runner completion rewards derive from server progress and obey shared caps; abandon permits replay',async()=>{
  const start=await request('/games',visitor,{targetId:owner.id,kind:'runner'});const gid=start.body.id;
  const notes=[{kind:'seed',time:4000,lane:1},{kind:'seed',time:4200,lane:0},...Array.from({length:20},(_,i)=>({time:5000+i*1900,lane:0,height:1}))];
  runtime.store.run('UPDATE games SET started=?,notes=? WHERE id=?',Date.now()-RUN_DURATION-1000,JSON.stringify(notes),gid);
  const progress=await request(`/games/${gid}/state`,visitor);assert.equal(progress.body.state.collectedSeeds,1);
  const result=await request(`/games/${gid}/finish`,visitor,{score:999999});assert.equal(result.status,200);assert.equal(result.body.hits,20);assert.equal(result.body.total,20);assert.equal(result.body.collectedSeeds,1);assert.equal(result.body.score,runScore({...newRun(),elapsed:RUN_DURATION,dodged:20,collectedSeeds:1}));assert.ok(result.body.gold>0&&result.body.gold<100);assert.notEqual(result.body.score,999999);
  const a=await request('/games',visitor,{targetId:owner.id,kind:'rhythm'});assert.equal(a.status,201);assert.equal((await request('/games',visitor,{targetId:owner.id,kind:'runner'})).status,409);
  assert.equal((await request(`/games/${a.body.id}/abandon`,third,{})).status,200);assert.equal((await request('/games',visitor,{targetId:owner.id,kind:'runner'})).status,409);
  await request(`/games/${a.body.id}/abandon`,visitor,{});const b=await request('/games',visitor,{targetId:owner.id,kind:'runner'});assert.equal(b.status,201);await request(`/games/${b.body.id}/abandon`,visitor,{});
  assert.equal((await request(`/villages/${owner.id}/records?kind=runner`,owner)).body.records.length,2);
  runtime.store.run("INSERT INTO rewards VALUES(?,?,'game',?,?)",visitor.id,`${third.id}:cap-test`,day(),300-result.body.gold);
  const capped=await request('/games',visitor,{targetId:owner.id,kind:'runner'});runtime.store.run('UPDATE games SET started=?,notes=? WHERE id=?',Date.now()-RUN_DURATION-1000,JSON.stringify(Array.from({length:20},(_,i)=>({time:5000+i*1900,lane:0,height:1}))),capped.body.id);
  const noReward=await request(`/games/${capped.body.id}/finish`,visitor,{});assert.equal(noReward.body.gold,0);assert.equal((await request(`/villages/${owner.id}/records?kind=runner`,owner)).body.records.length,3);
});

test('world and completed game records survive SQLite reopen with additive schema migrations',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pieona-world-')),file=join(dir,'world.sqlite');let store;
  try{store=openStore(file);const userId=randomUUID(),gid=randomUUID(),village={items:[piece()],theme:'twilight'},appearance={hat:'crown',accessory:'bow',color:'#eee7da'};
    store.run('INSERT INTO users(id,username,password,created_at,village,appearance) VALUES(?,?,?,?,?,?)',userId,'persist_world','test-hash',new Date().toISOString(),JSON.stringify(village),JSON.stringify(appearance));
    store.run('INSERT INTO games(id,user_id,target_id,notes,hits,started,finished,kind,score) VALUES(?,?,?,?,?,?,1,?,?)',gid,userId,userId,'[]',JSON.stringify(newRun()),Date.now(),'runner',1234);
    store.close();store=openStore(file);const user=store.one('SELECT * FROM users WHERE id=?',userId);assert.deepEqual(JSON.parse(user.village),village);assert.deepEqual(JSON.parse(user.appearance),appearance);assert.equal(store.one('SELECT score FROM games WHERE id=?',gid).score,1234);
  }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});

test('village records enforce blocking and closed village settings',async()=>{
  await request('/blocks/'+visitor.id,third,{});const records=await request(`/villages/${owner.id}/records?kind=runner`,third);assert.equal(records.body.records.length,0);await request('/blocks/'+visitor.id,third,undefined,'DELETE');
  await request('/me',owner,{settings:{allowVisitors:false}},'PATCH');assert.equal((await request(`/villages/${owner.id}/records?kind=runner`,visitor)).status,403);assert.equal((await request(`/villages/${owner.id}/records?kind=runner`,owner)).status,200);
});


test('runner invitations require same village, support reject/cancel, and exclude busy players',async()=>{
  await request('/me',owner,{settings:{allowVisitors:true}},'PATCH');
  const host=await connectPlayer(owner),guest=await connectPlayer(visitor),other=await connectPlayer(third);
  const emit=(s,event,data)=>s.timeout(2000).emitWithAck(event,data);
  try{
    await joinVillage(host,owner.id);await joinVillage(guest,owner.id);await joinVillage(other,third.id);
    assert.equal((await emit(host,'runner:invite',{userId:third.id})).ok,false);
    const received=villageEvent(guest,'runner:invited');const sent=await emit(host,'runner:invite',{userId:visitor.id});assert.equal(sent.ok,true);assert.equal((await received).id,sent.id);
    assert.equal((await emit(other,'runner:respond',{inviteId:sent.id,accept:true})).ok,false);
    assert.equal((await emit(guest,'runner:invite',{userId:owner.id})).ok,false);
    const rejected=villageEvent(host,'runner:invite-ended');assert.equal((await emit(guest,'runner:respond',{inviteId:sent.id,accept:false})).ok,true);await rejected;
    const second=await emit(host,'runner:invite',{userId:visitor.id});const cancelled=villageEvent(guest,'runner:invite-ended');await emit(host,'runner:cancel-invite',{id:second.id});await cancelled;
    const solo=await request('/games',visitor,{targetId:owner.id,kind:'runner'});assert.equal(solo.status,201);
    assert.equal((await emit(host,'runner:invite',{userId:visitor.id})).ok,false);await request(`/games/${solo.body.id}/abandon`,visitor,{});
  }finally{await closePlayers(host,guest,other);}
});

test('accepted runner uses identical map and clock, waits for both ready, syncs movement and saves each result',async()=>{
  const host=await connectPlayer(owner),guest=await connectPlayer(visitor),other=await connectPlayer(third);
  const emit=(s,event,data)=>s.timeout(2000).emitWithAck(event,data);
  try{
    await joinVillage(host,owner.id);await joinVillage(guest,owner.id);await joinVillage(other,third.id);let leaked=0;other.on('runner:snapshot',()=>leaked++);
    const invitation=await emit(host,'runner:invite',{userId:visitor.id,anonymous:true});
    const matchedHost=villageEvent(host,'runner:matched'),matchedGuest=villageEvent(guest,'runner:matched');
    assert.equal((await emit(guest,'runner:respond',{inviteId:invitation.id,accept:true})).ok,true);
    const [a,b]=await Promise.all([matchedHost,matchedGuest]);assert.equal(a.id,b.id);assert.equal(a.players.length,2);
    assert.equal((await emit(other,'runner:ready',{id:a.id})).ok,false);
    await emit(host,'runner:ready',{id:a.id});assert.equal(runtime.store.one('SELECT COUNT(*) n FROM games WHERE user_id=? AND finished=0',owner.id).n,0);
    const startHost=villageEvent(host,'runner:started'),startGuest=villageEvent(guest,'runner:started');await emit(guest,'runner:ready',{id:a.id});
    const [ah,bh]=await Promise.all([startHost,startGuest]);assert.equal(ah.game.started,bh.game.started);assert.deepEqual(ah.game.notes,bh.game.notes);assert.notEqual(ah.game.id,bh.game.id);
    assert.equal(ah.game.duration,RUN_DURATION);assert.ok(ah.game.notes.some(n=>n.kind==='seed'));
    // Move the shared clock beyond countdown, then verify the other socket receives server state.
    const started=Date.now()-3500;for(const g of [ah.game,bh.game])runtime.store.run('UPDATE games SET started=? WHERE id=?',started,g.id);
    const moved=villageEvent(guest,'runner:snapshot',s=>s.players.find(p=>p.userId===owner.id)?.state.lane===0);
    assert.equal((await request(`/games/${ah.game.id}/action`,owner,{action:'left'})).status,200);assert.equal((await moved).id,a.id);
    assert.equal((await request(`/games/${ah.game.id}/action`,visitor,{action:'right'})).status,404);
    // The socket path acknowledges input IDs, preserves ownership, and retries exactly once.
    assert.equal((await emit(other,'runner:action',{id:ah.game.id,action:'right',seq:1})).ok,false);
    const jump=await emit(guest,'runner:action',{id:bh.game.id,action:'jump',seq:1});
    assert.equal(jump.ok,true);assert.equal(jump.state.inputSeq,1);assert.ok(jump.state.jumpAt>=0);
    const duplicate=await emit(guest,'runner:action',{id:bh.game.id,action:'left',seq:1});
    assert.equal(duplicate.ok,true);assert.equal(duplicate.state.lane,1);assert.equal(duplicate.state.jumpAt,jump.state.jumpAt);
    const fallback=await request(`/games/${bh.game.id}/action`,visitor,{action:'right',seq:1});
    assert.equal(fallback.body.state.lane,1);
    // Both players finish under identical server-side course rules, each settling once.
    for(const [user,g] of [[owner,ah.game],[visitor,bh.game]]){
      runtime.store.run('UPDATE games SET started=?,notes=? WHERE id=?',Date.now()-RUN_DURATION-1000,JSON.stringify(Array.from({length:20},(_,i)=>({time:5000+i*1900,lane:2,height:1}))),g.id);
      const result=await request(`/games/${g.id}/finish`,user,{});assert.equal(result.status,200);assert.equal(result.body.hits,20);
      assert.equal((await request(`/games/${g.id}/finish`,user,{})).status,409);
    }
    assert.equal(leaked,0);
  }finally{await closePlayers(host,guest,other);}
});

test('leaving cancels pending invitations and readiness before a match can start',async()=>{
  const host=await connectPlayer(owner),guest=await connectPlayer(visitor);
  const emit=(s,event,data)=>s.timeout(2000).emitWithAck(event,data);
  try{
    await joinVillage(host,owner.id);await joinVillage(guest,owner.id);
    const invite=await emit(host,'runner:invite',{userId:visitor.id});const ended=villageEvent(host,'runner:invite-ended');await guest.timeout(2000).emitWithAck('village:leave');assert.equal((await ended).id,invite.id);
    await joinVillage(guest,owner.id);const second=await emit(host,'runner:invite',{userId:visitor.id});const matched=villageEvent(host,'runner:matched');await emit(guest,'runner:respond',{inviteId:second.id,accept:true});const race=await matched;
    await emit(host,'runner:ready',{id:race.id});const cancelled=villageEvent(host,'runner:cancelled');await emit(guest,'runner:leave',{});assert.equal((await cancelled).id,race.id);
    assert.equal((await emit(host,'runner:ready',{id:race.id})).ok,false);
  }finally{await closePlayers(host,guest);}
});


test('disconnect during a race abandons only that player and leaves the other runner playable',async()=>{
  const host=await connectPlayer(owner),guest=await connectPlayer(visitor);
  const emit=(s,event,data)=>s.timeout(2000).emitWithAck(event,data);
  let hostGame;
  try{
    await joinVillage(host,owner.id);await joinVillage(guest,owner.id);
    const invite=await emit(host,'runner:invite',{userId:visitor.id});const matched=villageEvent(host,'runner:matched');
    await emit(guest,'runner:respond',{inviteId:invite.id,accept:true});const race=await matched;
    await emit(host,'runner:ready',{id:race.id});const startHost=villageEvent(host,'runner:started'),startGuest=villageEvent(guest,'runner:started');await emit(guest,'runner:ready',{id:race.id});
    const [a,b]=await Promise.all([startHost,startGuest]);hostGame=a.game.id;
    const departure=villageEvent(host,'runner:opponent-left');guest.disconnect();assert.equal((await departure).userId,visitor.id);
    assert.equal(runtime.store.one('SELECT finished FROM games WHERE id=?',b.game.id).finished,2);
    assert.equal(runtime.store.one('SELECT finished FROM games WHERE id=?',a.game.id).finished,0);
    assert.equal((await request(`/games/${a.game.id}/state`,owner)).status,200);
  }finally{if(hostGame)await request(`/games/${hostGame}/abandon`,owner,{});await closePlayers(host,guest);}
});


test('character wardrobes preserve legacy looks and independently persist every character',async()=>{
  const user=await register('wardrobe_owner');
  const legacy={hat:'crown',accessory:'wings',color:'#d994b6'};
  await request('/me/world',user,{appearance:legacy},'PATCH');
  const looks={};
  for(const [index,character] of ['luna','moa','tori'].entries()){
    looks[character]={character,hat:['beret','sprout','none'][index],accessory:['bow','scarf','none'][index],color:['#a6bc83','#c8a0dd','#eee7da'][index]};
    const saved=await request('/me/world',user,{appearance:looks[character]},'PATCH');
    assert.equal(saved.status,200);
    assert.deepEqual(saved.body.user.characterLooks.pio,{...legacy,character:'pio'});
    for(const [id,look] of Object.entries(looks))assert.deepEqual(saved.body.user.characterLooks[id],look);
  }
  const reloaded=(await request('/me',user)).body.user;
  assert.deepEqual(reloaded.appearance,looks.tori);
  const edited={...looks.luna,hat:'crown'};
  const saved=await request('/me/world',user,{appearance:{...legacy,character:'pio'},characterLooks:{luna:edited}},'PATCH');
  assert.equal(saved.status,200);
  assert.deepEqual(saved.body.user.characterLooks.luna,edited);
  assert.deepEqual(saved.body.user.characterLooks.moa,looks.moa);
  const visible=(await request('/users/'+user.id,visitor)).body.user;
  assert.equal(visible.appearance.character,'pio');
  assert.equal(visible.characterLooks,undefined);
  const before=(await request('/me',user)).body.user;
  for(const body of [{appearance:{...legacy,character:'unknown'}},{characterLooks:{unknown:legacy}},{characterLooks:{luna:{...legacy,hat:'invalid'}}}]){
    assert.equal((await request('/me/world',user,body,'PATCH')).status,400);
  }
  assert.deepEqual((await request('/me',user)).body.user.characterLooks,before.characterLooks);
});
