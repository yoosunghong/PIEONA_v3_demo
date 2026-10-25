import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './runtimeHarness.mjs';
import {balanceQuestions} from '../shared/onboarding.mjs';
import {preferenceQuestions,cardTier} from '../shared/avatarCards.mjs';
import {createExploration} from '../shared/exploration.mjs';
const answers=balanceQuestions.map(q=>({id:q.id,choice:'a'}));
const preferences=preferenceQuestions.map(q=>({id:q.id,value:q.options[0]}));
const localAnswer=async()=>({reply:'같이 이야기하자!',emotion:'happy',memories:[],provider:'test'});
const cardHarness=options=>harness({generateCardAnalysis:async()=>({provider:'local'}),...options});

test('card portraits follow the AI character independently of theme and player character, including slot previews and visitors',async()=>{
  const h=await cardHarness();
  try{
    const owner=await h.register('portrait_owner'),visitor=await h.register('portrait_visitor');
    await h.request('/balance',owner,{answers,preferences});
    assert.equal((await h.request('/me/world',owner,{appearance:{character:'tori',hat:'none',accessory:'none',color:'#88b5d7'}},'PATCH')).status,200);
    for(const character of ['pio','luna','moa','tori']){
      assert.equal((await h.request('/me/world',owner,{avatarAppearance:{character,hat:'none',accessory:'none',color:'#88b5d7'}},'PATCH')).status,200);
      const result=(await h.request('/avatar-cards',owner)).body;
      assert.equal(result.card.character,character);
      assert.ok(result.slots.every(slot=>slot.preview.character===character));
      assert.equal((await h.request(`/users/${owner.id}/avatar-card`,visitor)).body.card.character,character);
    }
  }finally{await h.close();}
});

test('tutorial preferences create one independent card; invalid preferences are atomic and tiers follow discovery progress',async()=>{
  const h=await cardHarness({generateAnswer:localAnswer});
  try{
    const owner=await h.register('card_owner');
    assert.equal((await h.request('/avatar-cards',null)).status,401);
    assert.equal((await h.request('/avatar-cards',owner)).body.card,null);
    assert.equal((await h.request('/balance',owner,{answers,preferences})).status,200);
    let result=(await h.request('/avatar-cards',owner)).body;
    assert.ok(result.card.id);assert.equal(result.slots.length,1);assert.equal(result.card.tier,1);assert.equal(result.card.own,true);
    const before=(await h.request('/memories',owner)).body.memories;
    assert.equal(before.length,8);assert.ok(before.every(m=>m.visibility==='private'));
    assert.equal((await h.request('/balance',owner,{answers,preferences:[preferences[0],preferences[0],preferences[0]]})).status,400);
    assert.deepEqual((await h.request('/memories',owner)).body.memories,before);
    for(const level of [2,3,4,5]){
      const progress=createExploration();progress.level=level;
      h.runtime.store.run('INSERT INTO exploration_progress VALUES(?,?) ON CONFLICT(owner_id) DO UPDATE SET state=excluded.state',owner.id,JSON.stringify(progress));
      result=(await h.request('/avatar-cards',owner)).body;
      assert.equal(result.card.level,level);assert.equal(result.card.tier,cardTier(level));
    }
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM avatar_slots WHERE owner_id=?',owner.id).n,1);
  }finally{await h.close();}
});

test('cards, friend updates and offline greeting obey memory scopes and invalidate revoked analyses',async()=>{
  const h=await cardHarness({generateAnswer:localAnswer});
  try{
    const owner=await h.register('card_host'),visitor=await h.register('card_friend'),stranger=await h.register('card_stranger');
    await h.request('/balance',owner,{answers,preferences});
    const privateMemory=(await h.request('/memories',owner,{content:'PRIVATE_CARD_SECRET 캠핑',category:'취향',visibility:'private'})).body.id;
    const publicMemory=(await h.request('/memories',owner,{content:'캠핑에 진심인 친구',category:'취향',visibility:'public'})).body.id;
    await h.request('/friends/'+visitor.id,owner,{});await h.request('/friends/'+owner.id,visitor,{});
    assert.equal((await h.request('/users',visitor)).body.users.find(u=>u.id===owner.id).memoryUpdated,true);
    const ownCard=(await h.request('/users/'+owner.id+'/avatar-card',owner)).body.card;
    assert.ok(JSON.stringify(ownCard).includes('PRIVATE_CARD_SECRET'));
    const publicCard=(await h.request('/users/'+owner.id+'/avatar-card',visitor)).body.card;
    assert.ok(!JSON.stringify(publicCard).includes('PRIVATE_CARD_SECRET'));assert.ok(publicCard.tags.includes('캠핑에 진심'));
    await h.request('/users/'+owner.id+'/memory-seen',visitor,{});
    assert.equal((await h.request('/users',visitor)).body.users.find(u=>u.id===owner.id).memoryUpdated,false);
    await h.request('/memories/'+publicMemory,owner,{content:'음악을 사랑하는 친구'},'PATCH');
    assert.equal((await h.request('/users',visitor)).body.users.find(u=>u.id===owner.id).memoryUpdated,true);
    await h.request('/memories/'+publicMemory,owner,{visibility:'private'},'PATCH');
    const revoked=(await h.request('/users/'+owner.id+'/avatar-card',visitor)).body.card;
    assert.ok(!JSON.stringify(revoked).includes('음악을 사랑하는 친구'));assert.ok(!revoked.tags.includes('캠핑에 진심'));
    const socket=await h.connect(visitor,owner.id);
    const reconnect=await new Promise(resolve=>socket.emit('village:leave',resolve));assert.equal(reconnect.ok,true);
    const joined=await h.emit(socket,'village:join',{villageId:owner.id});assert.ok(joined.greeting.text.includes('주인 대신'));assert.ok(!joined.greeting.text.includes('PRIVATE_CARD_SECRET'));assert.ok(!joined.greeting.text.includes('캠핑'));
    const closeMem=(await h.request('/memories',owner,{content:'CLOSE_CARD_SECRET 독서',category:'취향',visibility:'close'})).body.id;
    await h.request('/friends/'+visitor.id,owner,{close:true},'PATCH');
    const [closeResult,strangerResult]=await Promise.all([h.request('/users/'+owner.id+'/avatar-card',visitor),h.request('/users/'+owner.id+'/avatar-card',stranger)]);
    assert.ok(JSON.stringify(closeResult.body).includes('CLOSE_CARD_SECRET'));assert.ok(!JSON.stringify(strangerResult.body).includes('CLOSE_CARD_SECRET'));
    await h.request('/blocks/'+visitor.id,owner,{});
    assert.equal((await h.request('/users/'+owner.id+'/avatar-card',visitor)).status,403);
  }finally{await h.close();}
});

test('a quest grants exactly one new persona, completion survives deleted chat, and memories stay independent',async()=>{
  const h=await cardHarness({generateAnswer:localAnswer});
  try{
    const owner=await h.register('quest_owner');await h.request('/balance',owner,{answers});
    assert.equal((await h.request('/slots',owner,{nickname:'잠긴 자아'})).status,403);
    const conversation=(await h.request('/conversations',owner,{targetId:owner.id})).body.id;
    await h.request(`/conversations/${conversation}/messages`,owner,{text:'안녕, 첫 이야기야.'});
    await h.request(`/conversations/${conversation}`,owner,undefined,'DELETE');
    const quest=(await h.request('/avatar-quests',owner)).body;assert.equal(quest.available,1);assert.ok(quest.quests.find(q=>q.id==='first-chat').complete);
    const original=(await h.request('/slots',owner)).body.active;
    const [one,two]=await Promise.all([h.request('/slots',owner,{nickname:'새로운 나'}),h.request('/slots',owner,{nickname:'중복 카드'})]);
    assert.deepEqual([one.status,two.status].sort(),[201,403]);const created=one.status===201?one:two;
    assert.equal((await h.request('/avatar-quests',owner)).body.available,0);
    await h.request('/slots/'+created.body.id+'/activate',owner,{});
    assert.equal((await h.request('/memories',owner)).body.memories.length,0);assert.equal((await h.request('/me',owner)).body.user.level,1);
    await h.request('/slots/'+original+'/activate',owner,{});assert.equal((await h.request('/memories',owner)).body.memories.length,5);
  }finally{await h.close();}
});

test('new observation signals include real decoration coordinates and completed games only',async()=>{
  const h=await cardHarness();
  try{
    const owner=await h.register('signal_owner');await h.request('/balance',owner,{answers});
    h.runtime.store.run('UPDATE users SET village=? WHERE id=?',JSON.stringify({theme:'campfire',items:[{id:'observation',type:'bench',x:3,z:4,rotation:2},{id:'hidden',type:'lamp',x:4,z:4,hidden:true}]}),owner.id);
    h.runtime.store.run("INSERT INTO social_game_records VALUES('game-signal',?,?,'typing',45,'{}',?)",owner.id,owner.id,new Date().toISOString());
    const result=(await h.request('/avatar-cards',owner)).body.card;
    assert.deepEqual(result.signals.decorations,[{type:'bench',x:3,z:4,rotation:2}]);assert.ok(result.signals.games.some(g=>g.kind==='typing'&&g.count===1));assert.ok(result.tags.includes('캠핑에 진심'));
  }finally{await h.close();}
});

test('a revoked memory discards an in-flight card analysis and hidden levels stay hidden',async()=>{
  let start,release;const started=new Promise(resolve=>{start=resolve;}),gate=new Promise(resolve=>{release=resolve;});let gated=true;
  const h=await cardHarness({generateCardAnalysis:async()=>{if(gated){start();await gate;}return {summary:'허용된 이야기만 담아요.',tags:['다정한'],provider:'test'};}});
  try{
    const owner=await h.register('revoked_card_owner'),visitor=await h.register('revoked_card_visitor');await h.request('/balance',owner,{answers});
    const mid=(await h.request('/memories',owner,{content:'다정한 친구의 공개 이야기',category:'취향',visibility:'public'})).body.id;
    const reading=h.request(`/users/${owner.id}/avatar-card`,visitor);await started;
    await h.request(`/memories/${mid}`,owner,{visibility:'private'},'PATCH');gated=false;release();assert.equal((await reading).status,409);
    await h.request('/me',owner,{settings:{stageVisible:false}},'PATCH');
    const card=(await h.request(`/users/${owner.id}/avatar-card`,visitor)).body.card;
    assert.equal(card.level,null);assert.equal(card.tier,null);assert.ok(!JSON.stringify(card).includes('다정한 친구의 공개 이야기'));
  }finally{release();await h.close();}
});
