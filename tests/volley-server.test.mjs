import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {VOLLEY} from '../shared/volleyball.mjs';
let runtime,url,clock=Date.now(),owner,guest;
async function request(path,user,body,method=body?'POST':'GET'){const r=await fetch(url+'/api'+path,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function register(username){const r=await request('/auth/register',null,{username,password:'volley-test-password'});assert.equal(r.status,201);const u={...r.body.user,cookie:r.cookie};await request('/me',u,{nickname:username},'PATCH');return u;}
async function connect(user){const s=io(url,{extraHeaders:{Cookie:user.cookie},transports:['websocket'],forceNew:true});await new Promise((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});return s;}
const emit=(s,name,data)=>new Promise((resolve,reject)=>s.timeout(3000).emit(name,data,(err,r)=>err?reject(err):resolve(r)));
const once=(s,name,predicate=()=>true)=>new Promise((resolve,reject)=>{const receive=d=>{if(!predicate(d))return;clearTimeout(t);s.off(name,receive);resolve(d);};const t=setTimeout(()=>{s.off(name,receive);reject(new Error(name+' timed out'));},3000);s.on(name,receive);});
before(async()=>{runtime=createApp({testing:true,store:openStore(':memory:'),volleyClock:()=>clock});await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${runtime.server.address().port}`;owner=await register('volley_owner');guest=await register('volley_guest');});
after(async()=>runtime.close());
test('solo game validates ownership and inputs, saves authoritative anonymous records once',async()=>{
  assert.equal((await request('/volley-games',null,{targetId:owner.id})).status,401);
  assert.equal((await request('/volley-games',owner,{targetId:owner.id,score:9999})).status,400);
  const g=(await request('/volley-games',owner,{targetId:owner.id,anonymous:true})).body;assert.equal(g.snapshot.players[1].ai,true);
  const s=await connect(owner);try{
    assert.equal((await request('/volley-games',owner,{targetId:owner.id})).status,409);
    assert.equal((await request(`/volley-games/${g.id}/state`,guest)).status,404);
    assert.equal((await request(`/volley-games/${g.id}/finish`,owner,{})).status,400);
    assert.equal((await request(`/games/${g.id}/finish`,owner,{})).status,400);
    assert.equal((await emit(s,'volley:input',{id:g.id,move:1,jump:false,spike:false,seq:1,score:9999})).ok,false);
    assert.equal((await emit(s,'volley:input',{id:g.id,move:1,jump:true,spike:false,seq:1})).ok,true);
    clock=g.started+VOLLEY.duration;
    const state=(await request(`/volley-games/${g.id}/state`,owner)).body.snapshot;assert.equal(state.ended,true);
    assert.equal((await request(`/volley-games/${g.id}/finish`,owner,{score:9999})).status,400);
    const result=await request(`/volley-games/${g.id}/finish`,owner,{});assert.equal(result.status,200);assert.ok(result.body.score<=1000);
    assert.deepEqual((await request(`/volley-games/${g.id}/finish`,owner,{})).body,result.body);
    const records=(await request(`/villages/${owner.id}/records?kind=volley`,guest)).body.records;assert.equal(records.length,1);assert.equal(records[0].nickname,'익명의 이웃');assert.equal(records[0].score,result.body.score);assert.equal('userId' in records[0],false);
    assert.equal(runtime.store.one("SELECT COUNT(*) n FROM events WHERE user_id=? AND name='game_finished'",owner.id).n,1);
  }finally{s.disconnect();}
});
test('generic abandon frees the volley room and cannot produce a completed record',async()=>{
  clock=Date.now();const g=(await request('/volley-games',owner,{targetId:owner.id})).body;
  assert.equal((await request(`/games/${g.id}/abandon`,owner,{})).status,200);assert.equal((await request(`/volley-games/${g.id}/finish`,owner,{})).status,409);
  const next=await request('/volley-games',owner,{targetId:owner.id});assert.equal(next.status,201);await request(`/volley-games/${next.body.id}/abandon`,owner,{});
});
test('last socket disconnect abandons a solo match and permits a fresh match',async()=>{
  clock=Date.now();const a=await connect(owner),b=await connect(owner),g=(await request('/volley-games',owner,{targetId:owner.id})).body;
  // A second tab keeps the session alive when the first tab disconnects.
  a.disconnect();await new Promise(r=>setTimeout(r,35));assert.equal(runtime.store.one('SELECT finished FROM games WHERE id=?',g.id).finished,0);
  b.disconnect();await new Promise(r=>setTimeout(r,35));assert.equal(runtime.store.one('SELECT finished FROM games WHERE id=?',g.id).finished,2);
  assert.equal((await request(`/volley-games/${g.id}/finish`,owner,{})).status,409);
  const next=await request('/volley-games',owner,{targetId:owner.id});assert.equal(next.status,201);await request(`/volley-games/${next.body.id}/abandon`,owner,{});
});
test('friend invitation shares one match, authenticates inputs and resolves opponent departure',async()=>{
  clock=Date.now();const a=await connect(owner),b=await connect(guest);
  try{
    await emit(a,'village:join',{villageId:owner.id});await emit(b,'village:join',{villageId:owner.id});
    const invited=once(b,'runner:invited');assert.equal((await emit(a,'runner:invite',{userId:guest.id,kind:'volley'})).ok,true);const invite=await invited;assert.equal(invite.kind,'volley');
    const matchA=once(a,'runner:matched'),matchB=once(b,'runner:matched');assert.equal((await emit(b,'runner:respond',{inviteId:invite.id,accept:true})).ok,true);const match=await matchA;await matchB;
    await emit(a,'runner:ready',{id:match.id});const startA=once(a,'runner:started'),startB=once(b,'runner:started');await emit(b,'runner:ready',{id:match.id});const ga=(await startA).game,gb=(await startB).game;
    assert.equal(ga.kind,'volley');assert.equal(ga.roomId,gb.roomId);assert.deepEqual(ga.snapshot,gb.snapshot);assert.equal(ga.snapshot.players[1].ai,false);
    assert.equal((await emit(b,'volley:input',{id:ga.id,move:1,jump:false,spike:false,seq:1})).ok,false);
    const end=once(a,'volley:snapshot',s=>s.ended);await emit(b,'runner:leave',{});assert.equal((await end).winner,owner.id);
    const result=await request(`/volley-games/${ga.id}/finish`,owner,{});assert.equal(result.status,200);assert.equal(result.body.winner,owner.id);assert.equal(result.body.gold,0);assert.equal(result.body.forfeit,true);
    assert.equal((await request(`/volley-games/${gb.id}/finish`,guest,{})).status,409);
  }finally{await emit(a,'runner:leave',{});a.disconnect();b.disconnect();}
});

test('volley replays support decline and cancel, reset the court and reject old game inputs',async()=>{
  clock=Date.now();const a=await connect(owner),b=await connect(guest);
  try{
    await emit(a,'village:join',{villageId:owner.id});await emit(b,'village:join',{villageId:owner.id});
    const invited=once(b,'runner:invited');await emit(a,'runner:invite',{userId:guest.id,kind:'volley'});const invite=await invited;
    const matched=once(a,'runner:matched');await emit(b,'runner:respond',{inviteId:invite.id,accept:true});const race=await matched;
    await emit(a,'runner:ready',{id:race.id});const starts=[once(a,'runner:started'),once(b,'runner:started')];await emit(b,'runner:ready',{id:race.id});
    const [ga,gb]=(await Promise.all(starts)).map(r=>r.game);
    const send=(s,g,action)=>emit(s,'game:rematch',{id:race.id,gameId:g.id,action});
    assert.equal((await send(a,ga,'request')).ok,false);
    clock=ga.started+VOLLEY.duration;
    assert.equal((await request(`/volley-games/${ga.id}/finish`,owner,{})).status,200);
    assert.equal((await send(a,ga,'request')).ok,false);
    assert.equal((await request(`/volley-games/${gb.id}/finish`,guest,{})).status,200);
    await new Promise(r=>setTimeout(r,150));
    assert.equal((await send(a,ga,'request')).ok,true);
    const declined=once(a,'game:rematch',v=>v.status==='declined');assert.equal((await send(b,gb,'decline')).ok,true);await declined;
    assert.equal((await send(a,ga,'request')).ok,true);assert.equal((await send(a,ga,'cancel')).ok,true);
    assert.equal((await send(b,gb,'accept')).ok,false);
    assert.equal((await send(a,ga,'request')).ok,true);clock=Date.now();const next=[once(a,'runner:started'),once(b,'runner:started')];
    assert.equal((await send(b,gb,'accept')).ok,true);const [ra,rb]=(await Promise.all(next)).map(r=>r.game);
    assert.notEqual(ra.id,ga.id);assert.notEqual(ra.roomId,ga.roomId);assert.equal(ra.roomId,rb.roomId);assert.equal(ra.round,ga.round+1);
    assert.deepEqual(ra.snapshot.scores,[0,0]);assert.equal(ra.snapshot.ended,false);assert.ok(ra.snapshot.players.every(p=>p.seq===0));
    assert.equal((await send(a,ga,'request')).ok,false);
    assert.equal((await emit(a,'volley:input',{id:ga.id,move:1,jump:true,spike:false,seq:1})).ok,false);
    assert.equal((await emit(a,'volley:input',{id:ra.id,move:1,jump:true,spike:false,seq:1})).ok,true);
    const unavailable=once(a,'game:rematch',v=>v.status==='unavailable');await emit(b,'runner:leave',{});await unavailable;
    assert.equal((await send(a,ra,'request')).ok,false);
  }finally{await emit(a,'runner:leave',{});a.disconnect();b.disconnect();}
});
