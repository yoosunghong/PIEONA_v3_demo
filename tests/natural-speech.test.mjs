import test from 'node:test';
import assert from 'node:assert/strict';
import {generateAnswer,observedSpeechStyle,assembleContext} from '../server/ai.mjs';
import {harness} from './runtimeHarness.mjs';

test('ordinary owner conversations learn speech and keep it across chat sessions',async()=>{
  const h=await harness({generateAnswer:(context,text,history)=>generateAnswer(context,text,history,{apiKey:''})});
  try{
    const owner=await h.register('natural_speech'),visitor=await h.register('speech_visitor');
    const cid=(await h.request('/conversations',owner,{targetId:owner.id})).body.id;
    for(const text of ['안녕하세요.','여기는 조용하네요.','산책할까요?']){
      assert.equal((await h.request(`/conversations/${cid}/messages`,owner,{text})).status,200);
    }
    const learned=h.runtime.store.all("SELECT * FROM memories WHERE owner_id=? AND category='말투'",owner.id);
    assert.ok(learned.some(m=>m.content.includes('존댓말')));
    const next=(await h.request('/conversations',owner,{targetId:owner.id})).body.id;
    const reply=await h.request(`/conversations/${next}/messages`,owner,{text:'안녕하세요?'});
    assert.match(reply.body.reply,/안녕하세요/);
    const target=h.runtime.store.one('SELECT * FROM users WHERE id=?',owner.id);
    assert.match(assembleContext(h.runtime.store,target,owner.id,'새 주제').snapshot.speechStyle,/존댓말/);
    const context=assembleContext(h.runtime.store,target,visitor.id,'왔어');
    const answer=await generateAnswer(context,'좋아 ㅋㅋ',[{role:'user',content:'안녕 ㅋㅋ'},{role:'user',content:'여기 좋네 ㅋㅋ'}],{apiKey:''});
    assert.deepEqual(answer.memories,[]);
  }finally{await h.close();}
});

test('observations need repeated user evidence and exclude quoted or assistant text',()=>{
  assert.equal(observedSpeechStyle('안녕 ㅋㅋ'), '');
  assert.equal(observedSpeechStyle('안녕',[{role:'assistant',content:'안녕하세요.'},{role:'assistant',content:'좋아요.'}]),'');
  assert.equal(observedSpeechStyle('"안녕하세요"',[{role:'user',content:'"좋네요"'},{role:'user',content:'"갈까요"'}]),'');
  assert.match(observedSpeechStyle('좋아 ㅋㅋ',[{role:'user',content:'여기 좋네 ㅋㅋ'},{role:'user',content:'같이 가자 ㅎㅎ'}]),/반말.*웃음/);
});

test('profile privacy defaults are enabled and explicit opt-outs survive reloads',async()=>{
  const h=await harness();
  try{
    const owner=await h.register('privacy_defaults');
    const keys=['allowVisitors','receiveTranscripts','allowTopics','stageVisible'];
    let me=(await h.request('/me',owner)).body.user;
    for(const key of keys)assert.equal(me.settings[key],true);
    assert.equal((await h.request('/me',owner,{settings:Object.fromEntries(keys.map(key=>[key,false]))},'PATCH')).status,200);
    me=(await h.request('/me',owner)).body.user;
    for(const key of keys)assert.equal(me.settings[key],false);
  }finally{await h.close();}
});
