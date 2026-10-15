import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {io} from 'socket.io-client';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {newRun,advanceRun,runAction,jumpHeight,RUN_DURATION} from '../shared/runner.mjs';
import {day} from '../server/store.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

let runtime,url,owner,visitor,third;
async function request(path,user,body,method=body?'POST':'GET'){const r=await fetch(url+'/api'+path,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function register(username){const r=await request('/auth/register',null,{username,password:'test-password-world'});assert.equal(r.status,201);await request('/me',{cookie:r.cookie},{nickname:username},'PATCH');return {...r.body.user,cookie:r.cookie};}
before(async()=>{runtime=createApp({testing:true,store:openStore(':memory:')});await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${runtime.server.address().port}`;owner=await register('garden_owner');visitor=await register('garden_visitor');third=await register('garden_third');});
after(async()=>runtime.close());
const piece=()=>({id:randomUUID(),type:'planter',x:-3,z:3.5,rotation:0});
test('world saves are owner scoped, validated and public to visitors',async()=>{
  const village={items:[piece()]},appearance={hat:'crown',accessory:'wings',color:'#d994b6'};
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

test('live visitors receive clothing updates; the host is separate from player positions',async()=>{
  const socket=io(url,{extraHeaders:{Cookie:visitor.cookie},transports:['websocket'],forceNew:true});
  try{await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
    const joined=await new Promise(r=>socket.emit('village:join',{villageId:owner.id},r));assert.equal(joined.ok,true);assert.equal(joined.members.length,1);assert.equal(joined.members[0].userId,visitor.id);assert.equal(joined.members[0].z,3);
    const updated=new Promise(resolve=>socket.once('village:members',resolve));
    const appearance={hat:'beret',accessory:'scarf',color:'#a6bc83'};await request('/me/world',visitor,{appearance},'PATCH');
    assert.deepEqual((await updated)[0].appearance,appearance);
  }finally{socket.disconnect();}
});

test('runner jump, lane, collision, cooldown and terminal state are deterministic',()=>{
  const obstacles=[{time:5000,lane:-1,height:.9},{time:7000,lane:1,height:1.15},{time:9000,lane:-1,height:.9}];
  let state=runAction(newRun(),obstacles,4550,'jump');assert.ok(jumpHeight(5000,state.jumpAt)>2);
  state=advanceRun(state,obstacles,5100);assert.equal(state.lives,3);assert.equal(state.dodged,1);
  state=runAction(state,obstacles,6500,'left');assert.equal(state.lane,0);state=runAction(state,obstacles,6550,'right');assert.equal(state.lane,0);
  state=advanceRun(state,obstacles,10000);assert.equal(state.lives,2);assert.equal(state.dodged,2);
  const dead=advanceRun(newRun(),[{time:5000,lane:-1,height:1},{time:7000,lane:-1,height:1},{time:9000,lane:-1,height:1}],RUN_DURATION);assert.equal(dead.lives,0);assert.equal(dead.elapsed,9000);assert.equal(advanceRun(dead,obstacles,RUN_DURATION).elapsed,9000);
});

test('runner API rejects forged score, cross-user actions and rhythm hits; persists zero-reward records once',async()=>{
  const r=await request('/games',visitor,{targetId:owner.id,kind:'runner',anonymous:true});assert.equal(r.status,201);const gid=r.body.id;
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

test('runner completion rewards derive from server progress and obey shared caps; abandon permits replay',async()=>{
  const start=await request('/games',visitor,{targetId:owner.id,kind:'runner'});const gid=start.body.id;
  runtime.store.run('UPDATE games SET started=?,notes=? WHERE id=?',Date.now()-46000,JSON.stringify(Array.from({length:20},(_,i)=>({time:5000+i*1900,lane:0,height:1}))),gid);
  const result=await request(`/games/${gid}/finish`,visitor,{score:999999});assert.equal(result.status,200);assert.equal(result.body.hits,20);assert.ok(result.body.gold>0&&result.body.gold<100);assert.notEqual(result.body.score,999999);
  const a=await request('/games',visitor,{targetId:owner.id,kind:'rhythm'});assert.equal(a.status,201);assert.equal((await request('/games',visitor,{targetId:owner.id,kind:'runner'})).status,409);
  assert.equal((await request(`/games/${a.body.id}/abandon`,third,{})).status,200);assert.equal((await request('/games',visitor,{targetId:owner.id,kind:'runner'})).status,409);
  await request(`/games/${a.body.id}/abandon`,visitor,{});const b=await request('/games',visitor,{targetId:owner.id,kind:'runner'});assert.equal(b.status,201);await request(`/games/${b.body.id}/abandon`,visitor,{});
  assert.equal((await request(`/villages/${owner.id}/records?kind=runner`,owner)).body.records.length,2);
  runtime.store.run("INSERT INTO rewards VALUES(?,?,'game',?,?)",visitor.id,`${third.id}:cap-test`,day(),300-result.body.gold);
  const capped=await request('/games',visitor,{targetId:owner.id,kind:'runner'});runtime.store.run('UPDATE games SET started=?,notes=? WHERE id=?',Date.now()-46000,JSON.stringify(Array.from({length:20},(_,i)=>({time:5000+i*1900,lane:0,height:1}))),capped.body.id);
  const noReward=await request(`/games/${capped.body.id}/finish`,visitor,{});assert.equal(noReward.body.gold,0);assert.equal((await request(`/villages/${owner.id}/records?kind=runner`,owner)).body.records.length,3);
});

test('world and completed game records survive SQLite reopen with additive schema migrations',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pieona-world-')),file=join(dir,'world.sqlite');let store;
  try{store=openStore(file);const userId=randomUUID(),gid=randomUUID(),village={items:[piece()]},appearance={hat:'crown',accessory:'bow',color:'#eee7da'};
    store.run('INSERT INTO users(id,username,password,created_at,village,appearance) VALUES(?,?,?,?,?,?)',userId,'persist_world','test-hash',new Date().toISOString(),JSON.stringify(village),JSON.stringify(appearance));
    store.run('INSERT INTO games(id,user_id,target_id,notes,hits,started,finished,kind,score) VALUES(?,?,?,?,?,?,1,?,?)',gid,userId,userId,'[]',JSON.stringify(newRun()),Date.now(),'runner',1234);
    store.close();store=openStore(file);const user=store.one('SELECT * FROM users WHERE id=?',userId);assert.deepEqual(JSON.parse(user.village),village);assert.deepEqual(JSON.parse(user.appearance),appearance);assert.equal(store.one('SELECT score FROM games WHERE id=?',gid).score,1234);
  }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});

test('village records enforce blocking and closed village settings',async()=>{
  await request('/blocks/'+visitor.id,third,{});const records=await request(`/villages/${owner.id}/records?kind=runner`,third);assert.equal(records.body.records.length,0);await request('/blocks/'+visitor.id,third,undefined,'DELETE');
  await request('/me',owner,{settings:{allowVisitors:false}},'PATCH');assert.equal((await request(`/villages/${owner.id}/records?kind=runner`,visitor)).status,403);assert.equal((await request(`/villages/${owner.id}/records?kind=runner`,owner)).status,200);
});
