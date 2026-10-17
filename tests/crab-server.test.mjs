import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {day} from '../server/store.mjs';
import {installCrabGames} from '../server/crabGames.mjs';

let runtime,url,clock=Date.now(),owner,guest;
async function request(path,user,body,method=body?'POST':'GET'){
  const r=await fetch(url+'/api'+path,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function register(username){const r=await request('/auth/register',null,{username,password:'crab-test-password'});assert.equal(r.status,201);await request('/me',{cookie:r.cookie},{nickname:username},'PATCH');return {...r.body.user,cookie:r.cookie};}
async function tick(at){clock=at;await new Promise(r=>setTimeout(r,80));}
async function connect(user){const s=io(url,{extraHeaders:{Cookie:user.cookie},transports:['websocket'],forceNew:true});await new Promise((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});return s;}
const emit=(s,name,data)=>new Promise((resolve,reject)=>s.timeout(3000).emit(name,data,(err,r)=>err?reject(err):resolve(r)));
const once=(s,name)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Missing '+name)),3000);s.once(name,data=>{clearTimeout(timer);resolve(data);});});
before(async()=>{runtime=createApp({testing:true,store:openStore(':memory:'),crabClock:()=>clock});await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${runtime.server.address().port}`;owner=await register('crab_owner');guest=await register('crab_guest');});
after(async()=>runtime.close());

test('solo crab game validates ownership and input; the server owns movement and early settlement',async()=>{
  assert.equal((await request('/crab-games',null,{targetId:owner.id})).status,401);
  assert.equal((await request('/crab-games',owner,{targetId:owner.id,score:9999})).status,400);
  const created=await request('/crab-games',owner,{targetId:owner.id});assert.equal(created.status,201);const g=created.body;
  assert.equal(g.kind,'crab');assert.equal(g.snapshot.crabs.length,14);
  assert.equal(g.snapshot.players[0].lives,3);assert.deepEqual(g.snapshot.items.map(i=>i.type),['steal','launch','zigzag']);
  assert.equal((await request(`/crab-games/${g.id}/state`,guest)).status,404);
  assert.equal((await request(`/crab-games/${g.id}/finish`,owner,{})).status,400);
  assert.equal((await request(`/games/${g.id}/finish`,owner,{})).status,400);
  assert.equal((await request('/crab-games',owner,{targetId:owner.id})).status,409);
  const s=await connect(owner);
  try{
    await tick(g.started+3020);
    assert.equal((await emit(s,'crab:input',{id:g.id,x:1,z:0,seq:1,score:999999})).ok,false);
    assert.equal((await emit(s,'crab:input',{id:g.id,x:NaN,z:0,seq:1})).ok,false);
    assert.equal((await emit(s,'crab:input',{id:g.id,x:1,z:0,seq:1})).ok,true);
    await tick(g.started+3150);
    const state=(await request(`/crab-games/${g.id}/state`,owner)).body.snapshot;
    assert.ok(state.players[0].x>0&&state.players[0].x<1.5);
    const stop=await emit(s,'crab:input',{id:g.id,x:0,z:0,seq:2});assert.equal(stop.inputSeq,2);assert.ok(Number.isFinite(stop.elapsed));
    const turn=await emit(s,'crab:input',{id:g.id,x:0,z:-1,seq:3});assert.equal(turn.inputSeq,3);
    assert.equal((await emit(s,'crab:input',{id:g.id,x:0,z:0,seq:4})).inputSeq,4);
  }finally{await request(`/crab-games/${g.id}/abandon`,owner,{});s.disconnect();}
});

test('fatal contact settles once, records survival seconds, preserves anonymity and counts game completion',async()=>{
  const g=(await request('/crab-games',owner,{targetId:owner.id,anonymous:true})).body;
  await tick(g.started+4500);
  const hurt=(await request(`/crab-games/${g.id}/state`,owner)).body.snapshot;
  assert.equal(hurt.ended,false);assert.equal(hurt.players[0].lives,2);assert.equal(hurt.players[0].alive,true);
  await tick(g.started+9000);
  const snapshot=(await request(`/crab-games/${g.id}/state`,owner)).body.snapshot;assert.equal(snapshot.ended,true);
  const result=await request(`/crab-games/${g.id}/finish`,owner,{});assert.equal(result.status,200);assert.ok(result.body.seconds>0);assert.ok(result.body.score<50);assert.equal(result.body.gold,0);
  assert.deepEqual((await request(`/crab-games/${g.id}/finish`,owner,{})).body,result.body);
  assert.equal(runtime.store.one("SELECT COUNT(*) n FROM events WHERE user_id=? AND name='game_finished'",owner.id).n,1);
  const records=(await request(`/villages/${owner.id}/records?kind=crab`,guest)).body.records;assert.equal(records.length,1);assert.equal(records[0].nickname,'익명의 이웃');assert.equal(records[0].score,result.body.score);assert.equal(records[0].seconds,result.body.seconds);assert.equal('userId' in records[0],false);
});

test('the generic abandon endpoint releases the crab session and prevents recording abandoned games',async()=>{
  const g=(await request('/crab-games',owner,{targetId:owner.id})).body;
  assert.equal((await request(`/games/${g.id}/abandon`,owner,{})).status,200);
  assert.equal((await request(`/crab-games/${g.id}/finish`,owner,{})).status,409);
  const next=await request('/crab-games',owner,{targetId:owner.id});assert.equal(next.status,201);await request(`/crab-games/${next.body.id}/abandon`,owner,{});
});

async function match(a,b){
  // Solo fixtures advance a fake clock. Each real invitation starts a fresh
  // timeline so the simulation cannot finish before this test sends ready.
  clock=Date.now();
  assert.equal((await emit(a,'village:join',{villageId:owner.id})).ok,true);assert.equal((await emit(b,'village:join',{villageId:owner.id})).ok,true);
  const invited=once(b,'runner:invited');assert.equal((await emit(a,'runner:invite',{userId:guest.id,kind:'crab',anonymous:true})).ok,true);const invite=await invited;assert.equal(invite.kind,'crab');
  const matchedA=once(a,'runner:matched'),matchedB=once(b,'runner:matched');assert.equal((await emit(b,'runner:respond',{inviteId:invite.id,accept:true})).ok,true);
  const r=await matchedA;assert.equal(r.kind,'crab');assert.equal((await matchedB).id,r.id);
  assert.equal((await emit(a,'runner:ready',{id:r.id})).ok,true);
  const startedA=once(a,'runner:started'),startedB=once(b,'runner:started');assert.equal((await emit(b,'runner:ready',{id:r.id})).ok,true);
  return {a:(await startedA).game,b:(await startedB).game,id:r.id};
}
test('crab invitations share one beach and clock, reject forged opponent inputs and award a forfeit win',async()=>{
  const a=await connect(owner),b=await connect(guest);
  try{
    const game=await match(a,b);assert.equal(game.a.roomId,game.b.roomId);assert.equal(game.a.started,game.b.started);assert.deepEqual(game.a.snapshot,game.b.snapshot);assert.equal(game.a.snapshot.players.length,2);assert.equal(game.a.snapshot.crabs.length,16);
    assert.equal((await emit(b,'crab:input',{id:game.a.id,x:1,z:0,seq:1})).ok,false);
    const terminal=once(a,'crab:snapshot');await emit(b,'runner:leave',{});const snapshot=await terminal;assert.equal(snapshot.ended,true);assert.equal(snapshot.winner,owner.id);
    const result=await request(`/crab-games/${game.a.id}/finish`,owner,{});assert.equal(result.status,200);assert.equal(result.body.winner,owner.id);
    assert.equal((await request(`/crab-games/${game.b.id}/finish`,guest,{})).status,409);
    await emit(a,'runner:leave',{});
  }finally{a.disconnect();b.disconnect();}
});
test('simultaneous contacts yield a draw on both clients and each result can be saved independently',async()=>{
  const a=await connect(owner),b=await connect(guest);
  try{
    const game=await match(a,b);await tick(game.a.started+9000);
    const sa=(await request(`/crab-games/${game.a.id}/state`,owner)).body.snapshot,sb=(await request(`/crab-games/${game.b.id}/state`,guest)).body.snapshot;
    assert.equal(sa.ended,true);assert.equal(sa.winner,null);assert.deepEqual(sa,sb);
    assert.equal((await request(`/crab-games/${game.a.id}/finish`,owner,{})).status,200);assert.equal((await request(`/crab-games/${game.b.id}/finish`,guest,{})).status,200);
  }finally{a.disconnect();b.disconnect();}
});

test('rematches require opponent consent, support decline/cancel, and reject stale or forged requests',async()=>{
  const a=await connect(owner),b=await connect(guest);
  try{
    const game=await match(a,b),send=(s,gameId,action)=>emit(s,'crab:rematch',{id:game.id,gameId,action});
    assert.equal((await send(a,game.a.id,'request')).ok,false);
    await tick(game.a.started+9000);
    await request(`/crab-games/${game.a.id}/finish`,owner,{});
    assert.equal((await send(a,game.a.id,'request')).ok,false);
    await request(`/crab-games/${game.b.id}/finish`,guest,{});
    // Let the race cleanup timer run: settled crab races must remain available.
    await new Promise(r=>setTimeout(r,150));
    assert.equal((await send(b,game.a.id,'request')).ok,false);
    const pending=once(b,'crab:rematch');assert.equal((await send(a,game.a.id,'request')).ok,true);
    assert.equal((await pending).status,'pending');
    assert.equal((await send(a,game.a.id,'accept')).ok,false);
    assert.equal((await send(a,game.a.id,'decline')).ok,false);
    const declined=once(a,'crab:rematch');assert.equal((await send(b,game.b.id,'decline')).ok,true);assert.equal((await declined).status,'declined');
    assert.equal((await send(a,game.a.id,'request')).ok,true);
    assert.equal((await send(b,game.b.id,'cancel')).ok,false);
    assert.equal((await send(a,game.a.id,'cancel')).ok,true);
    assert.equal((await send(b,game.b.id,'accept')).ok,false);
    assert.equal((await send(a,game.a.id,'request')).ok,true);
    const nextA=once(a,'runner:started'),nextB=once(b,'runner:started');clock=Date.now();
    assert.equal((await send(b,game.b.id,'accept')).ok,true);
    const ra=await nextA,rb=await nextB;assert.equal(ra.id,game.id);assert.notEqual(ra.game.id,game.a.id);assert.notEqual(ra.game.roomId,game.a.roomId);
    assert.equal(ra.game.roomId,rb.game.roomId);assert.deepEqual(ra.game.snapshot,rb.game.snapshot);assert.equal(ra.game.snapshot.ended,false);assert.equal(ra.game.snapshot.players[0].score,0);
    assert.equal((await send(a,game.a.id,'request')).ok,false);
    // Leaving a rematch must affect the new room, not the previous room.
    await emit(b,'runner:leave',{});
    const state=(await request(`/crab-games/${ra.game.id}/state`,owner)).body.snapshot;assert.equal(state.ended,true);assert.equal(state.winner,owner.id);
    await request(`/crab-games/${ra.game.id}/finish`,owner,{});
    assert.equal((await send(a,ra.game.id,'request')).ok,false);
    assert.equal((await request(`/crab-games/${game.a.id}/finish`,owner,{})).status,200);
  }finally{await emit(a,'runner:leave',{});a.disconnect();b.disconnect();}
});

test('survival rewards use authoritative elapsed time, settle once, and share daily and village caps',()=>{
  // Supply terminal simulation fixtures directly to the service; transport and
  // ownership are exercised against real HTTP and sockets above.
  const routes=new Map(),noop=()=>{};
  const service=installCrabGames({app:{post:(path,...handlers)=>routes.set(path,handlers.at(-1)),get:noop},io:{on:noop,to:()=>({emit:noop})},store:runtime.store,auth:noop,sessionUser:noop,checkTarget:noop,busy:()=>false,emitVillage:noop,emitUpdate:noop,event:noop,activity:noop,rewardVisit:noop,clock:()=>clock});
  const finish=routes.get('/api/crab-games/:id/finish');
  function terminal(user){const room=service.start([{userId:user.id}],owner.id);room.state.ended=true;room.state.players[0].survived=25300;room.state.players[0].chainBonus=40;return room.players[0].gameId;}
  function settle(gameId,user){let response;finish({params:{id:gameId},user,body:{score:999999}},{json:r=>{response=r;}});return response;}
  try{
    const first=terminal(owner),result=settle(first,owner);assert.equal(result.score,263);assert.equal(result.baseScore,223);assert.equal(result.bonus,40);assert.equal(result.gold,32);assert.deepEqual(settle(first,owner),result);
    assert.equal(runtime.store.one('SELECT score FROM games WHERE id=?',first).score,263);
    assert.equal(runtime.store.one("SELECT COUNT(*) n FROM rewards WHERE user_id=? AND type='game' AND day=?",owner.id,day()).n,1);
    runtime.store.run("INSERT INTO rewards VALUES(?,?,'game',?,?)",owner.id,'other-game-cap-fixture',day(),267);
    assert.equal(settle(terminal(owner),owner).gold,1);assert.equal(settle(terminal(owner),owner).gold,0);
    for(let i=0;i<3;i++)runtime.store.run("INSERT INTO rewards VALUES(?,?,'game',?,1)",guest.id,`${owner.id}:other-game-${i}`,day());
    assert.equal(settle(terminal(guest),guest).gold,0);
  }finally{service.close();}
});
