import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {assembleContext} from '../server/ai.mjs';
import {balanceQuestions,scenarioQuestions} from '../shared/onboarding.mjs';

let runtime,url,owner,visitor;
async function request(path,user,body,method=body?'POST':'GET'){
  const response=await fetch(url+'/api'+path,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return{status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function register(username){const result=await request('/auth/register',null,{username,password:'onboarding-test-only'});assert.equal(result.status,201);return{...result.body.user,cookie:result.cookie};}
const answers=balanceQuestions.map(q=>({id:q.id,choice:'b'}));
const responses=[{id:'comfort',text:'헐 속상했겠다ㅠㅠ 일단 맛있는 거 먹자!'}, {id:'invitation',text:'나랑 조용한 숲길 산책 어때? 나무 보면 기분 좋아지잖아ㅎㅎ'}];
before(async()=>{runtime=createApp({testing:true,store:openStore(':memory:')});await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${runtime.server.address().port}`;owner=await register('persona_owner');visitor=await register('persona_visitor');});
after(async()=>runtime.close());

test('all balance questions expose a local example illustration and two speech scenarios',async()=>{
  const result=await request('/questions',owner);
  assert.equal(result.body.balance.length,5);assert.deepEqual(result.body.scenarios,scenarioQuestions);
  for(const q of result.body.balance)assert.ok(existsSync(new URL('../public'+q.image,import.meta.url)),q.id);
});
test('five choices and two literal speech examples save atomically and enter the first owner context',async()=>{
  assert.equal((await request('/balance',null,{answers,responses})).status,401);
  const saved=await request('/balance',owner,{answers,responses});assert.equal(saved.status,200);
  const memories=(await request('/memories',owner)).body.memories;
  assert.equal(memories.length,7);assert.ok(memories.every(m=>m.visibility==='private'&&m.confirmed));
  const target=runtime.store.one('SELECT * FROM users WHERE id=?',owner.id),context=assembleContext(runtime.store,target,owner.id,'안녕!');
  for(const response of responses){const category=scenarioQuestions.find(q=>q.id===response.id).category;assert.ok(context.snapshot.personality[category].some(m=>m.includes(response.text)));assert.ok(context.system.includes(response.text));}
  const publicContext=assembleContext(runtime.store,target,visitor.id,'산책');
  for(const response of responses)assert.ok(!publicContext.system.includes(response.text));
  assert.equal((await request('/balance',owner,{answers,responses})).status,200);
  assert.equal((await request('/memories',owner)).body.memories.length,7);
});
test('invalid or missing scenario answers cannot partially overwrite existing personality',async()=>{
  const prior=(await request('/memories',owner)).body.memories;
  for(const invalid of [[],responses.slice(0,1),[responses[0],responses[0]],[responses[0],{id:'other',text:'안녕'}],[responses[0],{id:'invitation',text:'  '}],[responses[0],{id:'invitation',text:'가'.repeat(241)}]]){
    assert.equal((await request('/balance',owner,{answers,responses:invalid})).status,400);
    assert.deepEqual((await request('/memories',owner)).body.memories,prior);
  }
});
