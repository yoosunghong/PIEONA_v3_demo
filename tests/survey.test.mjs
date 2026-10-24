import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {surveyQuestions,surveyVersion} from '../shared/survey.mjs';

let runtime,url,serial=0;
async function request(path,user,body,method=body?'POST':'GET'){
  const r=await fetch(url+'/api'+path,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function register(){const r=await request('/auth/register',null,{username:'survey_'+(++serial),password:'survey-test-password'});assert.equal(r.status,201);return {...r.body.user,cookie:r.cookie};}
const status=async user=>(await request('/survey/status',user)).body;
const answer=()=>Object.fromEntries(surveyQuestions.filter(q=>q.type!=='text').map(q=>[q.id,q.type==='rating'?3:{selected:[0]}]));
before(async()=>{runtime=createApp({testing:true,store:openStore(':memory:'),generateAnswer:async()=>({reply:'반가워요!',emotion:'happy',memories:[],provider:'test'})});await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${runtime.server.address().port}`;});
after(async()=>runtime.close());

test('survey status requires auth, completed games count once and abandoned games do not count',async()=>{
  assert.equal((await request('/survey/status')).status,401);assert.equal((await request('/feedback',null,{version:surveyVersion,answers:answer()})).status,401);
  const user=await register();assert.deepEqual(await status(user),{completed:false,deferred:false,eligible:false});
  const abandoned=await request('/games',user,{targetId:user.id,kind:'rhythm'});assert.equal(abandoned.status,201);
  await request(`/games/${abandoned.body.id}/abandon`,user,{});assert.equal((await status(user)).eligible,false);
  const game=await request('/games',user,{targetId:user.id,kind:'rhythm'});assert.equal(game.status,201);
  runtime.store.run('UPDATE games SET started=? WHERE id=?',Date.now()-31000,game.body.id);
  assert.equal((await request(`/games/${game.body.id}/finish`,user,{})).status,200);assert.equal((await status(user)).eligible,true);
  assert.equal((await request(`/games/${game.body.id}/finish`,user,{})).status,409);
});

test('ten successful own turns or five other-avatar turns trigger independently and survive transcript deletion',async()=>{
  const own=await register(),other=await register(),visitor=await register();
  for(const [user,target,threshold] of [[own,own,10],[visitor,other,5]]){
    const c=await request('/conversations',user,{targetId:target.id});assert.equal(c.status,201);
    // Failed requests are not play experience.
    assert.equal((await request(`/conversations/${c.body.id}/messages`,user,{text:''})).status,400);
    for(let i=0;i<threshold;i++){
      assert.equal((await status(user)).eligible,false);
      assert.equal((await request(`/conversations/${c.body.id}/messages`,user,{text:'안녕 '+i,scene:'garden'})).status,200);
    }
    assert.equal((await status(user)).eligible,true);
    await request(`/conversations/${c.body.id}`,user,undefined,'DELETE');assert.equal((await status(user)).eligible,true);
  }
});

test('later defers the account across sessions for 24 hours without creating answers',async()=>{
  const user=await register();runtime.store.run('INSERT INTO events VALUES(?,?,?,?,?)',randomUUID(),user.id,'game_finished','{}',new Date().toISOString());
  assert.equal((await status(user)).eligible,true);assert.equal((await request('/survey/defer',user,{})).status,200);
  assert.deepEqual(await status(user),{completed:false,deferred:true,eligible:false});
  const fresh=await request('/auth/login',null,{username:user.username,password:'survey-test-password'});assert.equal((await status({cookie:fresh.cookie})).deferred,true);
  runtime.store.run('UPDATE survey_participation SET deferred_until=? WHERE user_id=?',Date.now()-1,user.id);assert.equal((await status(user)).eligible,true);
});

test('survey validates all eleven questions, optional text, no-experience and selection limits on the server',async()=>{
  const user=await register();
  for(const change of [a=>delete a.q1,a=>a.q2=6,a=>a.q4={selected:[0,1,2]},a=>a.q1={selected:[0,0]},a=>a.q5={selected:[0,1]},a=>a.q8={selected:[0,7]},a=>a.q4={selected:[9,1]},a=>a.q1={selected:[6]},a=>a.q1={selected:[0],other:'hidden'},a=>a.q10='가'.repeat(2001),a=>a.accountId=user.id]){
    const answers=answer();change(answers);assert.equal((await request('/feedback',user,{version:surveyVersion,answers})).status,400);
  }
  const answers={...answer(),q2:'unexperienced',q3:'unexperienced',q1:{selected:[0,6],other:'나만의 쉼터'},q10:'추가 기능',q11:''};
  assert.equal((await request('/feedback',user,{version:surveyVersion,answers,user_id:user.id})).status,400);
  assert.equal((await request('/feedback',user,{version:surveyVersion,answers})).status,201);assert.deepEqual(await status(user),{completed:true,deferred:false,eligible:false});
  assert.equal((await request('/feedback',user,{version:surveyVersion,answers})).status,409);
  const response=runtime.store.one('SELECT * FROM survey_responses');assert.equal(response.version,surveyVersion);assert.ok(!JSON.stringify(response).includes(user.id));assert.deepEqual(Object.keys(response).sort(),['answers','id','version']);
  assert.equal(runtime.store.one("SELECT COUNT(*) n FROM events WHERE user_id=? AND name='playtest_feedback'",user.id).n,0);
  assert.ok(!Object.values(runtime.store.one('SELECT * FROM survey_participation WHERE user_id=?',user.id)).includes(response.id));
  const fresh=await request('/auth/login',null,{username:user.username,password:'survey-test-password'});assert.equal((await status({cookie:fresh.cookie})).completed,true);
});

test('all stage modes save via partial updates, retain furniture and appear after login to visitors',async()=>{
  const user=await register(),visitor=await register(),items=[{id:randomUUID(),type:'bench',x:-3,z:-3.5,rotation:0}];
  await request('/me/world',user,{village:{items}},'PATCH');
  for(const theme of ['default','campfire','cafe','twilight','sunset']){
    assert.equal((await request('/me/world',user,{village:{theme}},'PATCH')).status,200);
    const viewed=await request('/users/'+user.id,visitor);assert.deepEqual(viewed.body.user.village,{theme,items});
  }
  const login=await request('/auth/login',null,{username:user.username,password:'survey-test-password'});assert.deepEqual(login.body.user.village,{theme:'sunset',items});
});

test('v5 evaluates avatar dialogue and memory rather than retired AI pet work',()=>{
  assert.equal(surveyVersion,5);assert.equal(surveyQuestions.length,11);
  const text=JSON.stringify(surveyQuestions);
  assert.doesNotMatch(text,/AI 펫|간식|따라다니|자율 활동|스스로 활동|오프라인|접속하지 않은 동안|생활 활동을 부탁/);
  assert.match(surveyQuestions.find(q=>q.id==='q2').title,/대화/);
  assert.match(surveyQuestions.find(q=>q.id==='q3').title,/취향·말투/);
  for(const topic of ['질문','기억','외형','직접 낚시','다른 사람의 마을'])assert.ok(surveyQuestions.find(q=>q.id==='q4').options.some(option=>option.includes(topic)),topic);
});

test('earlier participants can answer v5 once, while old or versionless tabs cannot mix answers',async()=>{
  const user=await register(),answers=answer();
  runtime.store.run('INSERT INTO survey_participation(user_id,completed,deferred_until,version) VALUES(?,1,?,4)',user.id,Date.now()+86400000);
  runtime.store.run('INSERT INTO events VALUES(?,?,?,?,?)',randomUUID(),user.id,'game_finished','{}',new Date().toISOString());
  const legacyId=randomUUID();runtime.store.run('INSERT INTO survey_responses VALUES(?,?,?)',legacyId,4,JSON.stringify(answers));
  assert.deepEqual(await status(user),{completed:false,deferred:false,eligible:true});
  const count=runtime.store.one('SELECT COUNT(*) n FROM survey_responses').n;
  for(const body of [{version:4,answers},{answers}]){
    const result=await request('/feedback',user,body);assert.equal(result.status,409);assert.match(result.body.error,/새로고침/);
  }
  assert.equal(runtime.store.one('SELECT COUNT(*) n FROM survey_responses').n,count);
  assert.equal((await request('/feedback',user,{version:surveyVersion,answers})).status,201);
  assert.equal((await request('/feedback',user,{version:surveyVersion,answers})).status,409);
  assert.deepEqual(await status(user),{completed:true,deferred:false,eligible:false});
  assert.equal(runtime.store.one('SELECT version FROM survey_responses WHERE id=?',legacyId).version,4);
  assert.equal(runtime.store.one('SELECT version FROM survey_participation WHERE user_id=?',user.id).version,surveyVersion);
});

test('deferring the new survey does not inherit completion from an old version',async()=>{
  const user=await register();runtime.store.run('INSERT INTO survey_participation(user_id,completed,version) VALUES(?,1,4)',user.id);
  assert.equal((await request('/survey/defer',user,{})).status,200);
  assert.deepEqual(await status(user),{completed:false,deferred:true,eligible:false});
  assert.equal((await request('/feedback',user,{version:surveyVersion,answers:answer()})).status,201);
});
