import test,{before,after}from'node:test';
import assert from'node:assert/strict';
import{io as clientIO}from'socket.io-client';
import{createApp,questions}from'../server/app.mjs';
import{openStore,visibleMemories,retrieve}from'../server/store.mjs';
import{assembleContext,generateAnswer}from'../server/ai.mjs';
import{mkdtempSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{DatabaseSync}from'node:sqlite';

let runtime,url,alice,bob,carol;const packets=[];let gate=null;
async function request(path,{cookie,body,method='GET',headers={}}={}){const r=await fetch(url+'/api'+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function register(username){const r=await request('/auth/register',{method:'POST',body:{username,password:'test-only-password-283!'}});assert.equal(r.status,201,JSON.stringify(r.body));const u={...r.body.user,cookie:r.cookie};await request('/me',{method:'PATCH',cookie:u.cookie,body:{nickname:username,intro:'공개된 자기소개',settings:{publicTags:['음악']}}});return u;}
async function memory(owner,content,scope='private',category='취향'){const r=await request('/memories',{method:'POST',cookie:owner.cookie,body:{content,visibility:scope,category}});assert.equal(r.status,201);return r.body.id;}
async function conversation(viewer,target,share=false,anonymous=false){const r=await request('/conversations',{method:'POST',cookie:viewer.cookie,body:{targetId:target.id,share,anonymous}});assert.equal(r.status,201);return r.body.id;}
async function send(viewer,cid,text='안녕'){return request('/conversations/'+cid+'/messages',{method:'POST',cookie:viewer.cookie,body:{text,scene:'garden'}});}
before(async()=>{runtime=createApp({store:openStore(':memory:'),testing:true,generateAnswer:async(context,text,history)=>{packets.push({context,text,history});if(gate){gate.enter();await gate.wait;}return{reply:`${context.snapshot.nickname}: ${context.snapshot.memories.map(m=>m.content).join(' / ')||'허용된 기억이 없어요.'}`,emotion:'happy',memories:[{content:'서버가 검증하는 소유자 전용 새 기억',category:'경험'}],provider:'test'};}});await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${runtime.server.address().port}`;alice=await register('alice');bob=await register('bob');carol=await register('carol');});
after(async()=>{await runtime.close();});

test('conversation XP belongs to the target avatar, survives deletion and stays private when hidden',async()=>{
  const owner=await register('xp_owner'),visitor=await register('xp_visitor');
  const current=async u=>(await request('/me',{cookie:u.cookie})).body.user;
  assert.equal((await current(owner)).level,1);
  const ownChat=await conversation(owner,owner);
  assert.equal((await send(owner,ownChat)).status,200);
  const visitChat=await conversation(visitor,owner,false,true);
  assert.equal((await send(visitor,visitChat)).status,200);
  assert.equal((await current(owner)).xp,20);
  assert.equal((await current(visitor)).xp,0);
  assert.equal((await send(owner,ownChat,'')).status,400);
  await request('/conversations/'+ownChat,{method:'DELETE',cookie:owner.cookie});
  assert.equal((await current(owner)).xp,20);
  const original=(await request('/slots',{cookie:owner.cookie})).body.active;
  const slot=(await request('/slots',{method:'POST',cookie:owner.cookie,body:{nickname:'new avatar'}})).body.id;
  await request('/slots/'+slot+'/activate',{method:'POST',cookie:owner.cookie});
  assert.equal((await current(owner)).xp,0);
  await request('/slots/'+original+'/activate',{method:'POST',cookie:owner.cookie});
  assert.equal((await current(owner)).xp,20);
  runtime.store.run('INSERT INTO avatar_experience VALUES(?,?,?,?)','large-xp',owner.id,original,100000);
  assert.equal((await current(owner)).level,1001);
  await request('/me',{method:'PATCH',cookie:owner.cookie,body:{settings:{stageVisible:false}}});
  const publicProfile=(await request('/users',{cookie:visitor.cookie})).body.users.find(u=>u.id===owner.id);
  assert.equal(publicProfile.level,null);assert.equal(publicProfile.xp,null);
});

