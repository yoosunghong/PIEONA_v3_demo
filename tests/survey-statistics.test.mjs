import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {io as clientIO} from 'socket.io-client';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {surveyQuestions,surveyVersion} from '../shared/survey.mjs';

let runtime,url,serial=0;
async function request(path,user,body,method=body?'POST':'GET'){
  const response=await fetch(url+'/api'+path,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function register(role='user'){
  const r=await request('/auth/register',null,{username:'stats_'+(++serial),password:'statistics-test-password',surveyRole:'admin'});
  assert.equal(r.status,201);assert.equal(r.body.user.surveyRole,'user');
  if(role!=='user')runtime.store.run('UPDATE users SET survey_role=? WHERE id=?',role,r.body.user.id);
  return {...r.body.user,cookie:r.cookie};
}
const answer=()=>Object.fromEntries(surveyQuestions.filter(q=>q.type!=='text').map(q=>[q.id,q.type==='rating'?3:{selected:[0]}]));
before(async()=>{runtime=createApp({testing:true,store:openStore(':memory:')});await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${runtime.server.address().port}`;});
after(async()=>runtime.close());
const change=(actor,target,role)=>request('/survey/managers/'+target.id,actor,{role},'PATCH');
const waitFor=(socket,event)=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{socket.off(event,listener);reject(new Error('Missing '+event));},3000);const listener=data=>{clearTimeout(timeout);resolve(data);};socket.once(event,listener);});
async function connect(user){const socket=clientIO(url,{extraHeaders:{Cookie:user.cookie},transports:['websocket'],forceNew:true,reconnection:false});await waitFor(socket,'connect');return socket;}

test('statistics and manager APIs enforce current server roles, prevent self escalation and hide roles in public profiles',async()=>{
  const admin=await register('admin'),manager=await register('manager'),user=await register();
  for(const path of ['/survey/statistics','/survey/statistics/comments?question=q10','/survey/managers']){
    assert.equal((await request(path)).status,401);
    assert.equal((await request(path,user)).status,403);
  }
  assert.equal((await request('/survey/statistics',manager)).status,200);
  assert.equal((await request('/survey/managers',manager)).status,403);
  assert.equal((await change(manager,user,'manager')).status,403);
  assert.equal((await change(user,user,'manager')).status,403);
  assert.equal((await change(admin,user,'admin')).status,400);
  assert.equal((await change(admin,admin,'user')).status,403);
  assert.equal((await change(admin,{id:randomUUID()},'manager')).status,404);
  await request('/me',user,{surveyRole:'admin',survey_role:'admin',settings:{surveyRole:'admin'}},'PATCH');
  assert.equal((await request('/me',user)).body.user.surveyRole,'user');
  const profiles=(await request('/users',user)).body.users;
  assert.equal(profiles.find(p=>p.id===admin.id).surveyRole,undefined);
  assert.equal((await change(admin,user,'manager')).status,200);
  assert.equal((await request('/survey/statistics',user)).status,200);
  assert.equal((await request('/me',user)).body.user.surveyRole,'manager');
  assert.equal((await change(admin,user,'user')).status,200);
  assert.equal((await request('/survey/statistics',user)).status,403);
  assert.equal((await request('/survey/statistics/comments?question=q10',user)).status,403);
});

test('empty statistics, rating averages, multiple selections, no-experience and anonymous paged comments',async()=>{
  const manager=await register('manager');
  assert.equal((await request('/survey/statistics',manager)).body.total,0);
  assert.equal((await request('/survey/statistics',manager)).body.questions.find(q=>q.id==='q2').average,null);
  const first=await register(),second=await register();
  const a={...answer(),q1:{selected:[0,1,6],other:'기타 의견'},q2:5,q10:'새 기능을 원해요',q11:'<script>text only</script>'};
  const b={...answer(),q2:'unexperienced',q3:1};
  assert.equal((await request('/feedback',first,{answers:a})).status,201);
  assert.equal((await request('/feedback',second,{answers:b})).status,201);
  assert.equal((await request('/feedback',second,{answers:b})).status,409);
  runtime.store.run('INSERT INTO survey_responses VALUES(?,?,?)',randomUUID(),surveyVersion-1,'{}');
  const stats=(await request('/survey/statistics',manager)).body;
  assert.equal(stats.total,2);assert.equal(stats.legacyTotal,1);
  assert.deepEqual(stats.questions.find(q=>q.id==='q1').counts,[2,1,0,0,0,0,1]);
  assert.deepEqual(stats.questions.find(q=>q.id==='q2'),{id:'q2',answered:2,rated:1,unexperienced:1,average:5,counts:[0,0,0,0,1]});
  assert.equal(stats.questions.find(q=>q.id==='q3').average,2);
  assert.equal(stats.questions.find(q=>q.id==='q10').answered,1);
  assert.deepEqual((await request('/survey/statistics/comments?question=q1',manager)).body.comments,['기타 의견']);
  assert.deepEqual((await request('/survey/statistics/comments?question=q11',manager)).body.comments,['<script>text only</script>']);
  for(let i=0;i<12;i++)runtime.store.run('INSERT INTO survey_responses VALUES(?,?,?)',randomUUID(),surveyVersion,JSON.stringify({...answer(),q10:'의견 '+i}));
  const page1=(await request('/survey/statistics/comments?question=q10&page=1',manager)).body,page2=(await request('/survey/statistics/comments?question=q10&page=2',manager)).body;
  assert.equal(page1.comments.length,10);assert.equal(page2.comments.length,3);assert.equal(page2.total,13);assert.equal(new Set([...page1.comments,...page2.comments]).size,13);
  assert.equal((await request('/survey/statistics/comments?question=q2',manager)).status,400);
  assert.equal((await request('/survey/statistics/comments?question=q10&page=0',manager)).status,400);
  const payload=JSON.stringify({stats,page1,page2});
  for(const privateValue of [first.id,first.username,second.id,second.username,'password','created_at','user_id'])assert.ok(!payload.includes(privateValue));
});

test('admin can search and page all accounts including accounts outside social visibility',async()=>{
  const admin=await register('admin'),user=await register();
  await request('/me',user,{nickname:'찾을 매니저'},'PATCH');
  await request('/blocks/'+user.id,admin,{});
  const results=(await request('/survey/managers?q='+encodeURIComponent('찾을 매니저'),admin)).body;
  assert.equal(results.total,1);assert.equal(results.users[0].id,user.id);
  assert.deepEqual(Object.keys(results.users[0]).sort(),['id','nickname','role','username']);
  assert.equal((await change(admin,user,'manager')).status,200);
  assert.equal((await request('/survey/managers?q=not_found',admin)).body.total,0);
  assert.equal((await request('/survey/managers?q=%25',admin)).body.total,0);
});

test('new submissions notify readers only; grants and revocations update connected sessions immediately',async()=>{
  const admin=await register('admin'),manager=await register('manager'),user=await register(),submitter=await register();
  const sockets=await Promise.all([admin,manager,user].map(connect));
  try{
    const [adminSocket,managerSocket,userSocket]=sockets;let leaked=false;userSocket.on('survey:changed',()=>{leaked=true;});
    const signals=[waitFor(adminSocket,'survey:changed'),waitFor(managerSocket,'survey:changed')];
    assert.equal((await request('/feedback',submitter,{answers:answer()})).status,201);await Promise.all(signals);
    assert.equal(leaked,false);
    let access=waitFor(userSocket,'survey:access');await change(admin,user,'manager');assert.deepEqual(await access,{role:'manager'});
    const received=waitFor(userSocket,'survey:changed');
    const another=await register();await request('/feedback',another,{answers:answer()});await received;
    access=waitFor(userSocket,'survey:access');await change(admin,user,'user');assert.deepEqual(await access,{role:'user'});
    assert.equal((await request('/survey/statistics',user)).status,403);
    leaked=false;const last=await register();const delivered=waitFor(managerSocket,'survey:changed');await request('/feedback',last,{answers:answer()});await delivered;
    assert.equal(leaked,false);
  }finally{sockets.forEach(socket=>socket.disconnect());}
});

test('existing database gets designated admin by immutable ID, roles and answers survive reopening and nickname impersonation cannot grant admin',()=>{
  const directory=mkdtempSync(join(tmpdir(),'pieona-survey-roles-')),filename=join(directory,'test.sqlite');
  let store;
  try{
    const db=new DatabaseSync(filename);
    db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,nickname TEXT NOT NULL DEFAULT '',intro TEXT NOT NULL DEFAULT '',theme TEXT NOT NULL DEFAULT 'sage',settings TEXT NOT NULL DEFAULT '{}',balance TEXT NOT NULL DEFAULT '[]',gold INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)");
    const adminId='a5a056ab-e1e6-42e6-833f-3a61f31fe05e',imposter=randomUUID();
    db.prepare('INSERT INTO users(id,username,password,nickname,created_at) VALUES(?,?,?,?,?)').run(adminId,'hys8623','unused','안녕하세요유성입니다잘부탁드립니다',new Date().toISOString());
    db.prepare('INSERT INTO users(id,username,password,nickname,created_at) VALUES(?,?,?,?,?)').run(imposter,'imposter','unused','안녕하세요유성입니다잘부탁드립니다',new Date().toISOString());db.close();
    store=openStore(filename);assert.equal(store.one('SELECT survey_role FROM users WHERE id=?',adminId).survey_role,'admin');assert.equal(store.one('SELECT survey_role FROM users WHERE id=?',imposter).survey_role,'user');
    store.run("UPDATE users SET nickname='새 닉네임' WHERE id=?",adminId);store.run("UPDATE users SET survey_role='manager' WHERE id=?",imposter);
    store.run('INSERT INTO survey_responses VALUES(?,?,?)',randomUUID(),surveyVersion,JSON.stringify(answer()));store.close();store=openStore(filename);
    assert.equal(store.one('SELECT survey_role FROM users WHERE id=?',adminId).survey_role,'admin');assert.equal(store.one('SELECT survey_role FROM users WHERE id=?',imposter).survey_role,'manager');assert.equal(store.one('SELECT COUNT(*) n FROM survey_responses').n,1);
  }finally{store?.close();rmSync(directory,{recursive:true,force:true});}
});
