import {validateChain} from '../server/chainDictionary.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './runtimeHarness.mjs';
import {openStore} from '../server/store.mjs';
import {randomUUID} from 'node:crypto';
import {mkdirSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {balanceQuestions} from '../shared/onboarding.mjs';
import {TYPING_WORDS,TYPING_ROUNDS,TYPING_ROUND_MS,chainStarts} from '../shared/wordGames.mjs';
const answers=balanceQuestions.map(q=>({id:q.id,choice:'a'}));
const gold=(h,user)=>h.runtime.store.one('SELECT gold FROM users WHERE id=?',user.id).gold;

test('word chain accepts dictionary nouns beyond the village list and rejects invented words',()=>{
  for(const word of ['컴퓨터','학교','도서관','해바라기','국어사전','대한민국'])assert.equal(validateChain(word,[]),null,word);
  assert.equal(validateChain('  해바라기  ',[]),null);
  assert.equal(validateChain('해바라기'.normalize('NFD'),[]),null);
  for(const word of ['가','abc','학교123','가나다라마바사아자차카타파하','달리다','사과 나무'])assert.ok(validateChain(word,[]),word);
  assert.equal(validateChain('해바라기',['해바라기']),'이미 사용한 단어예요.');
  assert.equal(validateChain('학교',['음악']), '“악”로 시작해주세요.');
  assert.equal(validateChain('역사',['능력']),null);
  assert.equal(validateChain('여자',['소녀']),null);
});

test('duel creation, joining and leaving refresh village participant availability',async()=>{
  const h=await harness();
  const nextMembers=(socket,ready)=>new Promise((resolve,reject)=>{
    const update=data=>{if(!ready(data.members))return;clearTimeout(timer);socket.off('village:members',update);resolve(data.members);};
    const timer=setTimeout(()=>{socket.off('village:members',update);reject(new Error('Missing village availability update'));},3000);
    socket.on('village:members',update);
  });
  try{
    const a=await h.register('lobby_a'),b=await h.register('lobby_b');
    await h.connect(a);const socket=await h.connect(b,a.id);
    for(const kind of ['typing','wordchain']){
      const bothBusy=value=>members=>members.filter(m=>[a.id,b.id].includes(m.userId)).length===2&&members.filter(m=>[a.id,b.id].includes(m.userId)).every(m=>m.runnerBusy===value);
      let updated=nextMembers(socket,members=>members.find(m=>m.userId===a.id)?.runnerBusy===true&&members.find(m=>m.userId===b.id)?.runnerBusy===false);
      const created=await h.request(`/villages/${a.id}/duels`,a,{kind});assert.equal(created.status,201);
      let members=await updated;
      assert.equal(members.find(m=>m.userId===a.id).runnerBusy,true);
      assert.equal(members.find(m=>m.userId===b.id).runnerBusy,false);
      updated=nextMembers(socket,bothBusy(true));
      assert.equal((await h.request(`/duels/${created.body.room.id}/join`,b,{})).status,200);
      members=await updated;assert.ok(members.filter(m=>[a.id,b.id].includes(m.userId)).every(m=>m.runnerBusy));
      updated=nextMembers(socket,bothBusy(false));
      assert.equal((await h.request(`/duels/${created.body.room.id}/leave`,a,{})).status,200);
      assert.equal((await h.request(`/duels/${created.body.room.id}/leave`,b,{})).status,200);
      members=await updated;assert.ok(members.filter(m=>[a.id,b.id].includes(m.userId)).every(m=>!m.runnerBusy));
    }
  }finally{await h.close();}
});

test('multiplayer typing supports eight players, host start, actual appearances and five authoritative rounds',async()=>{
  let time=Date.now();const h=await harness({socialClock:()=>time});
  try{
    const users=[];for(let i=0;i<8;i++){const user=await h.register('typing_'+i);h.runtime.store.run('UPDATE users SET nickname=?,appearance=? WHERE id=?','Player '+i,JSON.stringify({character:i%2?'luna':'moa',color:i%2?'#ffaabb':'#bbddaa',hat:'none',accessory:'none'}),user.id);users.push(user);}
    const [a,b]=users,outsider=await h.register('typing_outside');
    assert.equal((await h.request(`/villages/${a.id}/duels`,a,{kind:'typing'})).status,409);
    for(const user of [...users,outsider])await h.connect(user,a.id);
    const room=(await h.request(`/villages/${a.id}/duels`,a,{kind:'typing'})).body.room;
    assert.equal((await h.request(`/duels/${room.id}/start`,a,{})).status,409);
    assert.equal((await h.request(`/duels/${room.id}/join`,a,{})).status,409);
    for(const user of users.slice(1))assert.equal((await h.request(`/duels/${room.id}/join`,user,{})).status,200);
    assert.equal((await h.request(`/duels/${room.id}/start`,b,{})).status,403);
    const started=await h.request(`/duels/${room.id}/start`,a,{});assert.equal(started.status,200);
    assert.equal(started.body.room.players.length,8);assert.equal(started.body.room.status,'playing');
    assert.equal(started.body.room.deadline-started.body.room.startedAt,TYPING_ROUNDS*TYPING_ROUND_MS);
    assert.equal(started.body.room.players[0].nickname,'Player 0');assert.ok(started.body.room.players.every(p=>p.appearance?.character));assert.equal(started.body.room.players[0].appearance.character,'moa');assert.equal(started.body.room.players[1].appearance.color,'#ffaabb');
    assert.ok(room.words.every(w=>TYPING_WORDS.includes(w)));
    assert.equal((await h.request(`/duels/${room.id}/join`,outsider,{})).status,409);
    assert.equal((await h.request(`/duels/${room.id}/action`,a,{text:room.words[0],index:0})).status,409);
    time+=6000;
    const wrong=await h.request(`/duels/${room.id}/action`,a,{text:'틀린단어',index:0});assert.ok(wrong.body.error);assert.equal(wrong.body.room.players[0].score,0);
    time+=1000;
    const correct=await h.request(`/duels/${room.id}/action`,a,{text:room.words[0],index:0});assert.equal(correct.body.room.players[0].score,10);assert.equal(correct.body.room.players[0].correct,room.words[0].length);
    assert.equal((await h.request(`/duels/${room.id}/action`,a,{text:room.words[0],index:0})).status,409);
    assert.equal((await h.request(`/duels/${room.id}/action`,outsider,{text:room.words[0],index:0})).status,403);
    // A third player wins: winner calculation must consider the entire roster.
    for(let index=0;index<2;index++){time+=1000;assert.equal((await h.request(`/duels/${room.id}/action`,users[2],{text:room.words[index],index})).status,200);}
    time=started.body.room.startedAt+TYPING_ROUND_MS;
    assert.equal((await h.request(`/villages/${a.id}/duels`,a)).body.rooms[0].round,2);
    time=started.body.room.deadline;h.runtime.wordGames.tick();
    const finished=(await h.request(`/villages/${a.id}/duels`,a)).body.rooms.find(r=>r.id===room.id);
    assert.equal(finished.status,'finished');assert.equal(finished.winner,users[2].id);assert.equal(gold(h,users[2]),20);assert.equal(gold(h,a),10);
    h.runtime.wordGames.tick();await h.request(`/duels/${room.id}/leave`,a,{});assert.equal(gold(h,users[2]),20);
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM social_game_records WHERE id=?',room.id).n,8);
  }finally{await h.close();}
});

test('typing transfers the waiting host and one departure does not terminate the multiplayer game',async()=>{
  let time=Date.now();const h=await harness({socialClock:()=>time});
  try{
    const users=[];for(let i=0;i<4;i++){const user=await h.register('depart_'+i);users.push(user);await h.connect(user,users[0].id);}
    const [a,b,c,d]=users,room=(await h.request(`/villages/${a.id}/duels`,a,{kind:'typing'})).body.room;
    for(const user of [b,c,d])await h.request(`/duels/${room.id}/join`,user,{});
    await h.request(`/duels/${room.id}/leave`,a,{});assert.equal(h.runtime.wordGames.busy(a.id),false);
    const waiting=(await h.request(`/villages/${a.id}/duels`,b)).body.rooms[0];assert.equal(waiting.hostId,b.id);assert.equal(waiting.players.length,3);
    assert.equal((await h.request(`/duels/${room.id}/start`,b,{})).status,200);time+=5000;
    await h.request(`/duels/${room.id}/leave`,c,{});assert.equal(h.runtime.wordGames.busy(c.id),false);
    const state=(await h.request(`/villages/${a.id}/duels`,b)).body.rooms[0];assert.equal(state.status,'playing');assert.equal(state.players.find(p=>p.id===c.id).left,true);
    assert.equal((await h.request(`/duels/${room.id}/action`,c,{text:room.words[0],index:0})).status,403);
    const score=await h.request(`/duels/${room.id}/action`,d,{text:room.words[0],index:0});assert.equal(score.body.room.players.find(p=>p.id===d.id).score,10);
    time=state.deadline;h.runtime.wordGames.tick();assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM social_game_records WHERE id=?',room.id).n,2);assert.equal(gold(h,c),0);
  }finally{await h.close();}
});

test('word chain enforces vocabulary, duplicate words, turn ownership and timeout skips',async()=>{
  let time=Date.now();const h=await harness({socialClock:()=>time});
  try{
    const a=await h.register('chain_a'),b=await h.register('chain_b');await h.connect(a);await h.connect(b,a.id);
    const room=(await h.request(`/villages/${a.id}/duels`,a,{kind:'wordchain'})).body.room;await h.request(`/duels/${room.id}/join`,b,{});await h.request(`/duels/${room.id}/start`,a,{});time+=3500;
    assert.equal((await h.request(`/duels/${room.id}/action`,b,{text:'사과'})).status,409);
    assert.equal((await h.request(`/duels/${room.id}/action`,a,{text:'가나다라마바사아자차카타파하'})).status,400);
    assert.equal((await h.request(`/duels/${room.id}/action`,a,{text:'사과'})).status,200);
    assert.equal((await h.request(`/duels/${room.id}/action`,b,{text:'나무'})).status,400);
    assert.equal((await h.request(`/duels/${room.id}/action`,b,{text:'과일'})).status,200);
    assert.equal((await h.request(`/duels/${room.id}/action`,a,{text:'사과'})).status,400);
    assert.equal((await h.request(`/duels/${room.id}/action`,a,{text:'일기'})).status,200);
    time+=16000;h.runtime.wordGames.tick();
    const skipped=(await h.request(`/villages/${a.id}/duels`,a)).body.rooms.find(r=>r.id===room.id);assert.equal(skipped.status,'playing');assert.equal(skipped.turn,0);assert.equal(skipped.lastEvent.type,'timeout');
    for(let i=0;i<10;i++){time+=16000;h.runtime.wordGames.tick();}
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

test('poll edits enforce ownership, three-day limits and preserve existing ballots and stakes',async()=>{
  let time=Date.now();const h=await harness({socialClock:()=>time});
  try{
    const a=await h.register('edit_owner'),b=await h.register('edit_guest');
    const setup={question:'어떤 하루?',a:'캠핑',b:'게임',stake:0,maxVotes:5,minutes:4320};
    assert.equal((await h.request(`/villages/${a.id}/polls`,a,{...setup,minutes:4321})).status,400);
    const created=await h.request(`/villages/${a.id}/polls`,a,setup);assert.equal(created.status,201);const p=created.body.poll;
    assert.equal(p.deadline,time+3*86400000);
    assert.equal((await h.request(`/polls/${p.id}/edit`,b,setup)).status,403);
    assert.equal((await h.request(`/polls/${p.id}/edit`,a,{...setup,minutes:4321})).status,400);
    const updated={...setup,question:'주말에는?',a:'독서',b:'산책'};
    assert.equal((await h.request(`/polls/${p.id}/edit`,a,updated)).body.poll.question,updated.question);
    await h.request('/balance',a,{answers});await h.connect(a);
    const attended=await h.request(`/polls/${p.id}/attend`,a,{});assert.equal(attended.status,200);
    const ballot=attended.body.poll.ballots[0];assert.ok(ballot.reason.includes(attended.body.poll.options[ballot.choice]));
    assert.equal((await h.request(`/polls/${p.id}/edit`,a,{...updated,a:'다른 선택'})).status,409);
    assert.equal((await h.request(`/polls/${p.id}/edit`,a,{...updated,stake:10})).status,409);
    time+=60000;const edited=await h.request(`/polls/${p.id}/edit`,a,{...updated,minutes:4320,maxVotes:8});
    assert.equal(edited.status,200);assert.equal(edited.body.poll.deadline,time+3*86400000);assert.deepEqual(edited.body.poll.ballots[0],ballot);
    await h.request(`/polls/${p.id}/close`,a,{});
    assert.equal((await h.request(`/polls/${p.id}/edit`,a,updated)).status,409);
  }finally{await h.close();}
});
