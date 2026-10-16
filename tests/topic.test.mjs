import test from 'node:test';
import assert from 'node:assert/strict';
import {shortTopicTurn,topicTurnDelay} from '../shared/topic.mjs';
import {generateTopic} from '../server/topic.mjs';
import {generateAnswer} from '../server/ai.mjs';

test('topic turns keep two sentences and cap oversized provider replies',()=>{
  assert.equal(shortTopicTurn('첫인상은 차분했어요. 낯을 가리나요? 사실 저는 말이죠.'),'첫인상은 차분했어요. 낯을 가리나요?');
  assert.ok(shortTopicTurn('가'.repeat(500)).length<=120);
  assert.ok(shortTopicTurn(''));
  assert.ok(topicTurnDelay('짧은 대사')>=3500);
  assert.ok(topicTurnDelay('가'.repeat(500))<=11000);
});

test('each speaker receives the conversation from their own perspective',async()=>{
  const people=[{id:'a',nickname:'나',theme:'sage'},{id:'b',nickname:'이웃',theme:'rose'}];
  const calls=[];
  const transcript=await generateTopic([{system:'a',own:false},{system:'b',own:false}],people,'첫인상',async(c,p,h)=>{
    calls.push({c,p,h});return{reply:`대사 ${calls.length}예요. 궁금하죠? 이것은 넘치는 문장이에요.`,emotion:'curious'};
  });
  assert.equal(transcript.length,8);
  assert.deepEqual(calls[2].h,[{role:'assistant',content:transcript[0].text},{role:'user',content:transcript[1].text}]);
  assert.deepEqual(calls[3].h.map(m=>m.role),['user','assistant','user']);
  assert.ok(transcript.every(m=>!m.text.includes('넘치는')));
  assert.ok(calls.every(m=>m.c.system.includes('한두 문장')));
});

test('local topic fallback exchanges reactions instead of repeating introductions',async()=>{
  const contexts=['나','이웃'].map(nickname=>({system:'',own:false,snapshot:{nickname,interests:['산책'],personality:{}}}));
  const transcript=await generateTopic(contexts,[{id:'a',nickname:'나'},{id:'b',nickname:'이웃'}],'첫인상', (c,p,h)=>generateAnswer(c,p,h,{apiKey:''}));
  assert.equal(new Set(transcript.map(m=>m.text)).size,8);
  assert.ok(transcript.every(m=>m.text.length<=120&&!m.text.includes('등장!')));
});
