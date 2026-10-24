import {mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../server/store.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {arrivalQuestions,chooseArrivalQuestion} from '../shared/arrivalQuestions.mjs';
import {harness} from './runtimeHarness.mjs';

test('quiet arrivals do not consume questions; exhausted history never repeats',()=>{
  const seen=new Set();assert.equal(chooseArrivalQuestion(seen,()=>.9),null);
  assert.equal(seen.size,0);
  for(const expected of arrivalQuestions){const question=chooseArrivalQuestion(seen,()=>0);assert.equal(question.id,expected.id);seen.add(question.id);}
  assert.equal(chooseArrivalQuestion(seen,()=>0),null);
  assert.equal(new Set(arrivalQuestions.map(question=>question.id)).size,arrivalQuestions.length);
});

test('arrival history belongs to the account and opening question reaches the model and transcript',async()=>{
  const packets=[];let quiet=false;
  const h=await harness({questionRandom:()=>quiet?.9:0,generateAnswer:async(context,text,history)=>{packets.push(history);return {reply:'토스트 맛있겠다!',emotion:'happy',memories:[],provider:'test'};}});
  try{
    const owner=await h.register('question_owner'),other=await h.register('question_other');
    assert.equal((await h.request('/me/questions/arrival',null,{})).status,401);
    quiet=true;assert.equal((await h.request('/me/questions/arrival',owner,{})).body.question,null);
    quiet=false;
    const first=(await h.request('/me/questions/arrival',owner,{})).body.question;
    const second=(await h.request('/me/questions/arrival',owner,{})).body.question;
    assert.notEqual(first.id,second.id);
    assert.equal((await h.request('/me/questions/arrival',other,{})).body.question.id,first.id);
    assert.equal((await h.request('/conversations',other,{targetId:owner.id,opening:first.id})).status,400);
    const cid=(await h.request('/conversations',owner,{targetId:owner.id,opening:first.id})).body.id;
    assert.equal((await h.request(`/conversations/${cid}/messages`,owner,{text:'토스트 먹었어'})).status,200);
    assert.equal(packets[0][0].role,'assistant');assert.equal(packets[0][0].content,first.text);
    const transcript=(await h.request('/conversations/'+cid,owner)).body.messages;
    assert.deepEqual(transcript.map(message=>message.role),['assistant','user','assistant']);
    for(let i=2;i<arrivalQuestions.length;i++)assert.ok((await h.request('/me/questions/arrival',owner,{})).body.question);
    assert.equal((await h.request('/me/questions/arrival',owner,{})).body.question,null);
    assert.equal(h.runtime.store.one("SELECT COUNT(*) n FROM events WHERE user_id=? AND name='arrival_question'",owner.id).n,arrivalQuestions.length);
  }finally{await h.close();}
});

test('arrival questions stay used after the database and server reopen',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'arrival-history-')),filename=join(directory,'store.sqlite');let h;
  try{
    h=await harness({store:openStore(filename),questionRandom:()=>0});const user=await h.register('persistent_questions');
    const first=(await h.request('/me/questions/arrival',user,{})).body.question;await h.close();
    h=await harness({store:openStore(filename),questionRandom:()=>0});
    const second=(await h.request('/me/questions/arrival',user,{})).body.question;assert.notEqual(second.id,first.id);
  }finally{if(h)await h.close();for(const suffix of ['','-wal','-shm'])rmSync(filename+suffix,{force:true});rmdirSync(directory);}
});
