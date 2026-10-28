import test from 'node:test';
import assert from 'node:assert/strict';
import {localBallot,generateBallot} from '../server/villagePolls.mjs';
import {harness} from './runtimeHarness.mjs';
import {balanceQuestions} from '../shared/onboarding.mjs';

const user={active_slot:'slot',nickname:'피오',settings:JSON.stringify({publicTags:['차분한'],speechStyle:'다정한 존댓말'})};
const poll={id:'poll',question:'어떤 색이 더 좋아?',option_a:'파랑',option_b:'노랑',stake:100};
const signals={games:[]};

test('unfamiliar poll choices still express existing temperament and speech style',()=>{
  const polite=localBallot(user,poll,[],signals,{speechStyle:'차분한 존댓말'});
  assert.match(polite.reason,/편안하게 내 속도/);
  assert.match(polite.reason,/파랑/);assert.match(polite.reason,/노랑/);
  assert.match(polite.reason,/볼게요/);assert.doesNotMatch(polite.reason,/아직 뚜렷한 취향/);
  const casual=localBallot(user,poll,[],signals,{speechStyle:'장난스러운 반말'});
  assert.match(casual.reason,/마음속 결승전/);assert.match(casual.reason,/볼래/);
  assert.doesNotMatch(casual.reason,/볼게요|되네요/);
  assert.equal(polite.choice,casual.choice);
});

test('generated decisions receive the question and persona but exclude private evidence and wagering',async()=>{
  const privateMemory={content:'비공개 게임 취향',category:'취향'};
  const result=await generateBallot({user,poll,memories:[privateMemory],publicMemories:[],signals,persona:{speechStyle:'장난스러운 반말',curiosity:.8},enabled:true,generate:async(context,text)=>{
    const input=JSON.parse(text);
    assert.equal(input.question,poll.question);assert.deepEqual(input.options,{a:'파랑',b:'노랑'});
    assert.equal(input.persona.speechStyle,'장난스러운 반말');assert.deepEqual(input.memories,[]);
    assert.equal(input.stake,undefined);assert.equal(input.counts,undefined);
    assert.doesNotMatch(text,/비공개/);assert.match(context.system,/잠정적인 선택/);
    return {reply:JSON.stringify({choice:'b',reason:'노랑도 눈에 띄지만 차분한 쪽이 좋네. 오늘은 노랑을 천천히 알아볼래!'}),provider:'gemini'};
  }});
  assert.equal(result.choice,'b');assert.equal(result.provider,'gemini');assert.match(result.reason,/노랑/);
});

test('AI failures and invalid choices fall back to a persona-based ballot',async()=>{
  const input={user,poll,memories:[],signals,persona:{speechStyle:'반말'},enabled:true};
  for(const generate of [async()=>{throw new Error('offline');},async()=>({reply:'invalid'}),async()=>({reply:JSON.stringify({choice:'c',reason:'없는 선택지'})}),async()=>({provider:'local',reply:'안녕'})]){
    const result=await generateBallot({...input,generate});
    assert.ok(['a','b'].includes(result.choice));assert.equal(result.provider,'local');assert.match(result.reason,/내 속도/);
  }
});

test('live option counts are visible before participation while individual ballots remain hidden',async()=>{
  const h=await harness({generatePollAnswer:async()=>({reply:JSON.stringify({choice:'b',reason:'차분히 생각해 보니 노랑이 궁금하네요. 오늘은 노랑을 골라볼게요.'}),provider:'gemini'})});
  try{
    const owner=await h.register('count_owner'),visitor=await h.register('count_visitor');
    await h.request('/balance',owner,{answers:balanceQuestions.map(q=>({id:q.id,choice:'a'}))});await h.connect(owner);
    const created=await h.request(`/villages/${owner.id}/polls`,owner,{question:poll.question,a:'파랑',b:'노랑',stake:0,maxVotes:5,minutes:10});
    assert.deepEqual(created.body.poll.counts,{a:0,b:0});
    const attended=await h.request(`/polls/${created.body.poll.id}/attend`,owner,{});
    assert.equal(attended.status,200);assert.deepEqual(attended.body.poll.counts,{a:0,b:1});
    assert.equal(attended.body.poll.ballots[0].provider,'gemini');
    const before=(await h.request(`/villages/${owner.id}/polls`,visitor)).body.polls[0];
    assert.equal(before.participated,false);assert.deepEqual(before.ballots,[]);assert.deepEqual(before.counts,{a:0,b:1});
    const closed=(await h.request(`/polls/${before.id}/close`,owner,{})).body.poll;
    assert.equal(closed.counts.a,closed.result.a);assert.equal(closed.counts.b,closed.result.b);
  }finally{await h.close();}
});

test('a poll closed during generation cannot accept a delayed ballot or debit gold',async()=>{
  let began,release;const started=new Promise(resolve=>{began=resolve;}),waiting=new Promise(resolve=>{release=resolve;});
  const h=await harness({generatePollAnswer:async()=>{began();await waiting;return {reply:JSON.stringify({choice:'a',reason:'파랑을 골라볼게요.'}),provider:'gemini'};}});
  try{
    const owner=await h.register('delay_owner');
    await h.request('/balance',owner,{answers:balanceQuestions.map(q=>({id:q.id,choice:'a'}))});await h.connect(owner);
    h.runtime.store.run('UPDATE users SET gold=100 WHERE id=?',owner.id);
    const created=(await h.request(`/villages/${owner.id}/polls`,owner,{question:poll.question,a:'파랑',b:'노랑',stake:10,maxVotes:5,minutes:10})).body.poll;
    const pending=h.request(`/polls/${created.id}/attend`,owner,{});await started;
    await h.request(`/polls/${created.id}/close`,owner,{});release();
    assert.equal((await pending).status,409);
    assert.equal(h.runtime.store.one('SELECT gold FROM users WHERE id=?',owner.id).gold,100);
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM village_ballots WHERE poll_id=?',created.id).n,0);
  }finally{release();await h.close();}
});
