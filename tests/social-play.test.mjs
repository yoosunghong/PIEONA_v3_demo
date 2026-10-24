import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './runtimeHarness.mjs';
import {openStore} from '../server/store.mjs';
import {randomUUID} from 'node:crypto';
import {mkdirSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {balanceQuestions} from '../shared/onboarding.mjs';
import {TYPING_PHRASES,validateChain,chainStarts} from '../shared/wordGames.mjs';
const answers=balanceQuestions.map(q=>({id:q.id,choice:'a'}));
const gold=(h,user)=>h.runtime.store.one('SELECT gold FROM users WHERE id=?',user.id).gold;

test('two-player typing uses server time, exact phrases, membership and idempotent completion',async()=>{
  let time=Date.now();const h=await harness({socialClock:()=>time});
  try{
    const a=await h.register('typing_a'),b=await h.register('typing_b'),c=await h.register('typing_c');
    assert.equal((await h.request(`/villages/${a.id}/duels`,a,{kind:'typing'})).status,409);
    await h.connect(a);await h.connect(b,a.id);await h.connect(c,a.id);
    const room=(await h.request(`/villages/${a.id}/duels`,a,{kind:'typing'})).body.room;
    assert.equal((await h.request(`/duels/${room.id}/join`,a,{})).status,409);
    assert.equal((await h.request(`/duels/${room.id}/join`,b,{})).status,200);
    assert.equal((await h.request(`/duels/${room.id}/join`,c,{})).status,409);
    assert.equal((await h.request(`/duels/${room.id}/action`,a,{text:TYPING_PHRASES[0],index:0})).status,409);
    time+=6000;
    const wrong=await h.request(`/duels/${room.id}/action`,a,{text:'틀린 문장',index:0});assert.ok(wrong.body.error);assert.equal(wrong.body.room.players[0].correct,0);
    time+=3000;
    const correct=await h.request(`/duels/${room.id}/action`,a,{text:TYPING_PHRASES[0],index:0});assert.equal(correct.body.room.players[0].correct,TYPING_PHRASES[0].length);
    assert.equal((await h.request(`/duels/${room.id}/action`,a,{text:TYPING_PHRASES[0],index:0})).status,409);
    assert.equal((await h.request(`/duels/${room.id}/action`,c,{text:TYPING_PHRASES[0],index:0})).status,403);
    time+=60000;h.runtime.wordGames.tick();
    const finished=(await h.request(`/villages/${a.id}/duels`,a)).body.rooms.find(r=>r.id===room.id);
    assert.equal(finished.status,'finished');assert.equal(finished.winner,a.id);assert.equal(gold(h,a),20);assert.equal(gold(h,b),10);
    h.runtime.wordGames.tick();await h.request(`/duels/${room.id}/leave`,a,{});assert.equal(gold(h,a),20);
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM social_game_records WHERE id=?',room.id).n,2);
  }finally{await h.close();}
});

test('word chain enforces vocabulary, duplicate words, turn ownership and timeout forfeits',async()=>{
  let time=Date.now();const h=await harness({socialClock:()=>time});
  try{
    const a=await h.register('chain_a'),b=await h.register('chain_b');await h.connect(a);await h.connect(b,a.id);
    const room=(await h.request(`/villages/${a.id}/duels`,a,{kind:'wordchain'})).body.room;await h.request(`/duels/${room.id}/join`,b,{});time+=3500;
    assert.equal((await h.request(`/duels/${room.id}/action`,b,{text:'사과'})).status,409);
    assert.equal((await h.request(`/duels/${room.id}/action`,a,{text:'사과'})).status,200);
    assert.equal((await h.request(`/duels/${room.id}/action`,b,{text:'나무'})).status,400);
    assert.equal((await h.request(`/duels/${room.id}/action`,b,{text:'과일'})).status,200);
    assert.equal((await h.request(`/duels/${room.id}/action`,a,{text:'사과'})).status,400);
    assert.equal((await h.request(`/duels/${room.id}/action`,a,{text:'일기'})).status,200);
    time+=16000;h.runtime.wordGames.tick();
    const ended=(await h.request(`/villages/${a.id}/duels`,a)).body.rooms.find(r=>r.id===room.id);assert.equal(ended.winner,a.id);
    assert.equal(validateChain('사과',['사과']), '이미 사용한 단어예요.');assert.ok(chainStarts('녀').includes('여'));assert.ok(chainStarts('림').includes('임'));
  }finally{await h.close();}
});

test('poll ownership, membership, one ballot per account, manual refunds and durable results',async()=>{
  let time=Date.now();const h=await harness({socialClock:()=>time});
  try{
    const a=await h.register('poll_a'),b=await h.register('poll_b');await h.request('/balance',a,{answers});await h.request('/balance',b,{answers});
    for(const u of [a,b])h.runtime.store.run('UPDATE users SET gold=100 WHERE id=?',u.id);
    const setup={question:'어떤 하루가 좋을까?',a:'캠핑',b:'게임',stake:10,maxVotes:5,minutes:1};
    assert.equal((await h.request(`/villages/${a.id}/polls`,b,setup)).status,403);
    const poll=(await h.request(`/villages/${a.id}/polls`,a,setup)).body.poll;
    assert.equal((await h.request(`/villages/${a.id}/polls`,a,setup)).status,409);
    assert.equal((await h.request(`/polls/${poll.id}/attend`,b,{})).status,409);
    await h.connect(a);await h.connect(b,a.id);
    const votes=await Promise.all([h.request(`/polls/${poll.id}/attend`,a,{}),h.request(`/polls/${poll.id}/attend`,a,{})]);assert.deepEqual(votes.map(r=>r.status).sort(),[200,409]);assert.equal(gold(h,a),90);
    assert.equal((await h.request(`/polls/${poll.id}/attend`,b,{})).status,200);assert.equal(gold(h,b),90);
    assert.equal((await h.request(`/polls/${poll.id}/close`,b,{})).status,403);
    const ended=(await h.request(`/polls/${poll.id}/close`,a,{})).body.poll;assert.equal(ended.status,'cancelled');assert.equal(ended.ballots.length,2);assert.ok(ended.result.refund);
    assert.equal(gold(h,a),100);assert.equal(gold(h,b),100);await h.request(`/polls/${poll.id}/close`,a,{});assert.equal(gold(h,a),100);
    const history=(await h.request(`/villages/${a.id}/polls`,b)).body.polls[0];assert.deepEqual(history.result,ended.result);
  }finally{await h.close();}
});

test('automatic vote cap settles the majority pool exactly once and deadlines return tie stakes',async()=>{
  let time=Date.now();const h=await harness({socialClock:()=>time});
  try{
    const users=await Promise.all(['majority_a','majority_b','majority_c'].map(name=>h.register(name))),[a,b,c]=users;
    for(let i=0;i<users.length;i++){const u=users[i];await h.request('/balance',u,{answers});await h.request('/memories',u,{content:i===1?'게임을 좋아해요':'캠핑을 좋아해요',category:'취향',visibility:'private'});h.runtime.store.run('UPDATE users SET gold=100 WHERE id=?',u.id);await h.connect(u,a.id);}
    const setup={question:'함께 할 것은?',a:'캠핑',b:'게임',stake:1,maxVotes:3,minutes:1};
    const p=(await h.request(`/villages/${a.id}/polls`,a,setup)).body.poll;
    for(const u of users)assert.equal((await h.request(`/polls/${p.id}/attend`,u,{})).status,200);
    const result=(await h.request(`/villages/${a.id}/polls`,a)).body.polls[0];assert.equal(result.status,'closed');assert.equal(result.result.winner,'a');assert.equal(result.result.pool,3);assert.equal(result.ballots.reduce((sum,v)=>sum+v.payout,0),3);assert.equal(gold(h,b),99);assert.equal(users.reduce((sum,u)=>sum+gold(h,u),0),300);
    h.runtime.polls.tick();assert.equal(users.reduce((sum,u)=>sum+gold(h,u),0),300);
    const tie=(await h.request(`/villages/${a.id}/polls`,a,{...setup,stake:10,maxVotes:5})).body.poll;
    await h.request(`/polls/${tie.id}/attend`,a,{});await h.request(`/polls/${tie.id}/attend`,b,{});const prior=gold(h,a);time+=61000;h.runtime.polls.tick();assert.equal(gold(h,a),prior+10);const t=(await h.request(`/villages/${a.id}/polls`,a)).body.polls[0];assert.ok(t.result.refund);assert.equal(t.status,'closed');
  }finally{await h.close();}
});

test('poll deadlines and escrow survive a server restart without a second refund',async()=>{
  mkdirSync('tmp',{recursive:true});const file=resolve('tmp',`poll-restart-${randomUUID()}.sqlite`);let time=Date.now(),h=await harness({store:openStore(file),socialClock:()=>time});
  try{
    const a=await h.register('restart_a'),b=await h.register('restart_b');
    for(const u of [a,b]){await h.request('/balance',u,{answers});h.runtime.store.run('UPDATE users SET gold=100 WHERE id=?',u.id);await h.connect(u,a.id);}
    await h.request('/memories',a,{content:'캠핑을 좋아해요',category:'취향',visibility:'private'});await h.request('/memories',b,{content:'게임을 좋아해요',category:'취향',visibility:'private'});
    const poll=(await h.request(`/villages/${a.id}/polls`,a,{question:'주말의 선택은?',a:'캠핑',b:'게임',stake:10,maxVotes:5,minutes:1})).body.poll;
    for(const u of [a,b])await h.request(`/polls/${poll.id}/attend`,u,{});assert.equal(gold(h,a),90);
    await h.close();h=null;time+=61000;h=await harness({store:openStore(file),socialClock:()=>time});
    const p=(await h.request(`/villages/${a.id}/polls`,a)).body.polls[0];assert.equal(p.status,'closed');assert.ok(p.result.refund);assert.equal(gold(h,a),100);assert.equal(gold(h,b),100);
    h.runtime.polls.tick();await h.request(`/polls/${poll.id}/close`,a,{});assert.equal(gold(h,a),100);
  }finally{if(h)await h.close();for(const suffix of ['','-wal','-shm'])try{unlinkSync(file+suffix);}catch{}}
});

test('a poll cannot debit an underfunded avatar and cannot accept more than its limit',async()=>{
  const h=await harness();
  try{
    const a=await h.register('poor_avatar');await h.request('/balance',a,{answers});await h.connect(a);
    const poll=(await h.request(`/villages/${a.id}/polls`,a,{question:'골드 내기',a:'캠핑',b:'게임',stake:10,maxVotes:2,minutes:1})).body.poll;
    assert.equal((await h.request(`/polls/${poll.id}/attend`,a,{})).status,400);assert.equal(gold(h,a),0);assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM village_ballots WHERE poll_id=?',poll.id).n,0);
  }finally{await h.close();}
});
