import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {MAX_PARTY_PLAYERS} from '../shared/multiplayer.mjs';
import {RUN_DURATION,newRun} from '../shared/runner.mjs';
let runtime,url,users=[],clock=Date.now();
async function request(path,user,body,method=body?'POST':'GET'){
  const r=await fetch(url+'/api'+path,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
const emit=(socket,name,data)=>new Promise((resolve,reject)=>socket.timeout(3000).emit(name,...(data===undefined?[]:[data]),(err,r)=>err?reject(new Error(`${name}: ${err.message}`)):resolve(r)));
const once=(socket,name)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(name+' timed out')),3000);socket.once(name,data=>{clearTimeout(timer);resolve(data);});});
async function connect(user){const socket=io(url,{extraHeaders:{Cookie:user.cookie},transports:['websocket'],forceNew:true});await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});await emit(socket,'village:join',{villageId:users[0].id});return socket;}
async function socketsFor(count){const sockets=[];for(const user of users.slice(0,count))sockets.push(await connect(user));return sockets;}
async function cleanup(sockets){for(const socket of sockets){if(socket.connected)await emit(socket,'runner:leave',{});socket.disconnect();}}
async function match(sockets,kind){
  clock=Date.now();const invited=sockets.slice(1).map(s=>once(s,'runner:invited'));
  const r=await emit(sockets[0],'runner:invite',{kind,userIds:users.slice(1,sockets.length).map(u=>u.id),anonymous:true});assert.equal(r.ok,true);
  const invitations=await Promise.all(invited);assert.ok(invitations.every(i=>i.id===r.id&&i.total===sockets.length));
  let matched=0;const track=()=>matched++;sockets[0].on('runner:matched',track);
  for(let i=1;i<sockets.length-1;i++){assert.equal((await emit(sockets[i],'runner:respond',{inviteId:r.id,accept:true,anonymous:true})).waiting,true);assert.equal(matched,0);}
  const matches=sockets.map(s=>once(s,'runner:matched'));assert.equal((await emit(sockets.at(-1),'runner:respond',{inviteId:r.id,accept:true})).ok,true);
  const rooms=await Promise.all(matches);sockets[0].off('runner:matched',track);assert.ok(rooms.every(room=>room.id===rooms[0].id&&room.players.length===sockets.length));
  let starts=0;const trackStart=()=>starts++;sockets[0].on('runner:started',trackStart);
  for(const s of sockets.slice(0,-1)){assert.equal((await emit(s,'runner:ready',{id:rooms[0].id})).ok,true);assert.equal(starts,0);}
  const started=sockets.map(s=>once(s,'runner:started'));assert.equal((await emit(sockets.at(-1),'runner:ready',{id:rooms[0].id})).ok,true);
  const games=(await Promise.all(started)).map(r=>r.game);sockets[0].off('runner:started',trackStart);
  assert.equal(new Set(games.map(g=>g.started)).size,1);assert.equal(new Set(games.map(g=>g.id)).size,sockets.length);
  return {id:rooms[0].id,games};
}
before(async()=>{
  runtime=createApp({testing:true,store:openStore(':memory:'),crabClock:()=>clock});await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${runtime.server.address().port}`;
  for(let i=0;i<=MAX_PARTY_PLAYERS;i++){const r=await request('/auth/register',null,{username:`party_user_${i}`,password:'party-test-password'});assert.equal(r.status,201);const u={...r.body.user,cookie:r.cookie};await request('/me',u,{nickname:`Party ${i}`},'PATCH');users.push(u);}
});
after(async()=>runtime.close());

test('eight runners wait for every acceptance and readiness, share a track, and continue after one leaves',async()=>{
  const sockets=await socketsFor(MAX_PARTY_PLAYERS);
  try{
    const {id,games}=await match(sockets,'runner');assert.ok(games.every(g=>JSON.stringify(g.notes)===JSON.stringify(games[0].notes)));
    assert.equal((await emit(sockets[1],'runner:action',{id:games[0].id,action:'left',seq:1})).ok,false);
    assert.equal((await emit(sockets[0],'runner:action',{id:games[0].id,action:'right',seq:1})).ok,true);
    const snapshot=once(sockets[0],'runner:snapshot');assert.equal((await snapshot).players.length,MAX_PARTY_PLAYERS);
    const left=once(sockets[0],'runner:opponent-left');await emit(sockets.at(-1),'runner:leave',{});assert.equal((await left).id,id);
    assert.equal(runtime.store.one('SELECT finished FROM games WHERE id=?',games.at(-1).id).finished,2);
    assert.equal((await emit(sockets[0],'runner:action',{id:games[0].id,action:'left',seq:2})).ok,true);
    // Terminal authoritative fixtures let each remaining player settle independently.
    for(let i=0;i<games.length-1;i++){const g=runtime.store.one('SELECT hits FROM games WHERE id=?',games[i].id),state=JSON.parse(g.hits);state.lives=0;runtime.store.run('UPDATE games SET hits=? WHERE id=?',JSON.stringify(state),games[i].id);assert.equal((await request(`/games/${games[i].id}/finish`,users[i],{})).status,200);}
    const records=(await request(`/villages/${users[0].id}/records?kind=runner`,users[0])).body.records;assert.equal(records.length,MAX_PARTY_PLAYERS-1);assert.equal(records.filter(r=>r.nickname==='익명의 이웃').length,MAX_PARTY_PLAYERS-1);
  }finally{await cleanup(sockets);}
});
test('eight crab players spawn apart, keep playing after departures, and settle the last survivor',async()=>{
  const sockets=await socketsFor(MAX_PARTY_PLAYERS);
  try{
    const {games}=await match(sockets,'crab');const initial=games[0].snapshot;
    assert.equal(initial.players.length,MAX_PARTY_PLAYERS);assert.equal(new Set(initial.players.map(p=>`${p.x},${p.z}`)).size,MAX_PARTY_PLAYERS);
    assert.ok(games.every(g=>g.roomId===games[0].roomId));assert.equal(initial.crabs.length,12+2*MAX_PARTY_PLAYERS);
    await emit(sockets.at(-1),'runner:leave',{});
    let state=(await request(`/crab-games/${games[0].id}/state`,users[0])).body.snapshot;assert.equal(state.ended,false);assert.equal(state.players.filter(p=>p.alive).length,MAX_PARTY_PLAYERS-1);
    assert.equal((await request(`/crab-games/${games[0].id}/finish`,users[0],{})).status,400);
    assert.equal((await emit(sockets[0],'crab:input',{id:games[0].id,x:1,z:0,seq:1})).ok,true);
    for(let i=1;i<sockets.length-1;i++)await emit(sockets[i],'runner:leave',{});
    state=(await request(`/crab-games/${games[0].id}/state`,users[0])).body.snapshot;assert.equal(state.ended,true);assert.equal(state.winner,users[0].id);
    const result=await request(`/crab-games/${games[0].id}/finish`,users[0],{});assert.equal(result.status,200);assert.equal(result.body.winner,users[0].id);
    assert.equal((await request(`/crab-games/${games[1].id}/finish`,users[1],{})).status,409);
  }finally{await cleanup(sockets);}
});
test('group crab rematches require every participant to consent',async()=>{
  const sockets=await socketsFor(3);
  try{
    const {id,games}=await match(sockets,'crab');clock=games[0].started+15000;await new Promise(r=>setTimeout(r,100));
    for(let i=0;i<3;i++)assert.equal((await request(`/crab-games/${games[i].id}/finish`,users[i],{})).status,200);
    const send=(i,action)=>emit(sockets[i],'crab:rematch',{id,gameId:games[i].id,action});
    assert.equal((await send(0,'request')).ok,true);let started=false;const track=()=>started=true;sockets[0].on('runner:started',track);
    assert.equal((await send(1,'accept')).ok,true);assert.equal(started,false);assert.equal((await send(1,'accept')).ok,false);
    const next=sockets.map(s=>once(s,'runner:started'));clock=Date.now();assert.equal((await send(2,'accept')).ok,true);
    const rooms=await Promise.all(next);sockets[0].off('runner:started',track);assert.ok(rooms.every(r=>r.game.snapshot.players.length===3));assert.notEqual(rooms[0].game.id,games[0].id);
  }finally{await cleanup(sockets);}
});

test('runner replay waits for all results and consent, keeps old records and resets the entire party',async()=>{
  const sockets=await socketsFor(3);
  try{
    const {id,games}=await match(sockets,'runner');
    const send=(i,action,gameId=games[i].id)=>emit(sockets[i],'game:rematch',{id,gameId,action});
    const dead={...newRun(),lives:0,elapsed:6000};
    runtime.store.run('UPDATE games SET hits=? WHERE id=?',JSON.stringify(dead),games[0].id);
    const eliminated=once(sockets[1],'runner:snapshot');
    // A snapshot must report elimination even before the player saves a record.
    await emit(sockets[1],'runner:action',{id:games[1].id,action:'left',seq:1});
    const first=await eliminated;assert.equal(first.players[0].finished,true);assert.equal(first.players[0].state.lives,0);
    assert.equal((await request(`/games/${games[0].id}/finish`,users[0],{})).status,200);
    assert.equal((await send(0,'request')).ok,false);
    for(let i=1;i<3;i++){runtime.store.run('UPDATE games SET hits=? WHERE id=?',JSON.stringify(dead),games[i].id);assert.equal((await request(`/games/${games[i].id}/finish`,users[i],{})).status,200);}
    // Settled runner rooms must survive cleanup so replay remains available.
    await new Promise(r=>setTimeout(r,150));assert.equal((await send(0,'request')).ok,true);
    let starts=0;const track=()=>starts++;sockets[0].on('runner:started',track);
    assert.equal((await send(1,'accept')).ok,true);assert.equal(starts,0);
    assert.equal((await send(1,'accept')).ok,false);
    assert.equal((await send(2,'cancel')).ok,false);
    const next=sockets.map(s=>once(s,'runner:started'));assert.equal((await send(2,'accept')).ok,true);
    const replay=(await Promise.all(next)).map(v=>v.game);sockets[0].off('runner:started',track);
    assert.ok(replay.every(g=>g.round===games[0].round+1&&g.duration===RUN_DURATION));
    assert.equal(new Set(replay.map(g=>g.started)).size,1);
    for(let i=0;i<3;i++){assert.notEqual(replay[i].id,games[i].id);assert.equal(runtime.store.one('SELECT finished FROM games WHERE id=?',games[i].id).finished,1);assert.deepEqual(JSON.parse(runtime.store.one('SELECT hits FROM games WHERE id=?',replay[i].id).hits),newRun());}
    assert.equal((await send(0,'request')).ok,false,'old game IDs cannot start another replay');
    assert.equal((await emit(sockets[0],'runner:action',{id:replay[0].id,action:'right',seq:1})).ok,true);
    const snapshot=await once(sockets[0],'runner:snapshot');assert.equal(snapshot.round,replay[0].round);assert.ok(snapshot.players.every(p=>!p.finished&&p.state.lives===3));
    await emit(sockets[2],'runner:leave',{});assert.equal((await send(0,'request',replay[0].id)).ok,false);
  }finally{await cleanup(sockets);}
});
test('invites reject duplicates, excess capacity, cross-guest blocks, busy and absent players',async()=>{
  const sockets=await socketsFor(MAX_PARTY_PLAYERS+1),a=sockets[0];
  try{
    for(const data of [
      {userIds:[users[1].id,users[1].id]}, {userIds:[users[0].id]},
      {userIds:users.slice(1).map(u=>u.id)}, {userIds:[users[1].id,users[2].id],kind:'volley'},
      {userIds:[users[1].id],userId:users[2].id}
    ])assert.equal((await emit(a,'runner:invite',{kind:'runner',...data})).ok,false);
    runtime.store.run('INSERT INTO blocks(owner_id,blocked_id) VALUES(?,?)',users[1].id,users[2].id);
    assert.equal((await emit(a,'runner:invite',{kind:'crab',userIds:[users[1].id,users[2].id]})).ok,false);
    runtime.store.run('DELETE FROM blocks WHERE owner_id=?',users[1].id);
    const solo=(await request('/games',users[2],{targetId:users[0].id,kind:'runner'})).body;
    assert.equal((await emit(a,'runner:invite',{userIds:[users[1].id,users[2].id]})).ok,false);await request(`/games/${solo.id}/abandon`,users[2],{});
    await emit(sockets[2],'village:leave');assert.equal((await emit(a,'runner:invite',{userIds:[users[1].id,users[2].id]})).ok,false);
    const invited=once(sockets[1],'runner:invited');assert.equal((await emit(a,'runner:invite',{userId:users[1].id})).ok,true);const invite=await invited;await emit(a,'runner:cancel-invite',{id:invite.id});
  }finally{await cleanup(sockets);}
});
test('a decline or village departure cancels the whole invitation and releases reservations',async()=>{
  const sockets=await socketsFor(3);
  try{
    for(const leave of [false,true]){
      const invited=sockets.slice(1).map(s=>once(s,'runner:invited'));const invite=await emit(sockets[0],'runner:invite',{kind:'crab',userIds:users.slice(1,3).map(u=>u.id)});assert.equal(invite.ok,true);await Promise.all(invited);
      assert.equal((await emit(sockets[1],'runner:respond',{inviteId:invite.id,accept:true})).waiting,true);
      assert.equal((await request('/crab-games',users[1],{targetId:users[0].id})).status,409);
      const ended=sockets.map(s=>once(s,'runner:invite-ended'));
      if(leave)await emit(sockets[2],'village:leave');else await emit(sockets[2],'runner:respond',{inviteId:invite.id,accept:false});
      assert.ok((await Promise.all(ended)).every(r=>r.id===invite.id));
      assert.equal((await emit(sockets[1],'runner:respond',{inviteId:invite.id,accept:true})).ok,false);
    }
    const solo=await request('/crab-games',users[1],{targetId:users[0].id});assert.equal(solo.status,201);await request(`/crab-games/${solo.body.id}/abandon`,users[1],{});
  }finally{await cleanup(sockets);}
});
