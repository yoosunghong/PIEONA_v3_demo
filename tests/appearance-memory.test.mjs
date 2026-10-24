import test from 'node:test';
import assert from 'node:assert/strict';
import {petColors} from '../shared/pets.mjs';
import {harness} from './runtimeHarness.mjs';
import {characters,characterLooks} from '../shared/world.mjs';

test('changing every character and pet preserves memories, persona and the active chat context',async()=>{
  const packets=[];
  const h=await harness({generateAnswer:async(context,text,history)=>{
    packets.push({context,text,history});
    return {reply:'기타 연습 이야기 기억하고 있어.',emotion:'happy',provider:'test',memories:packets.length===1?[{content:'기타 연습을 좋아한다.',category:'취향'}]:[]};
  }});
  try{
    const user=await h.register('appearance_memory');
    await h.request('/slots',user);
    const cid=(await h.request('/conversations',user,{targetId:user.id})).body.id;
    assert.equal((await h.request(`/conversations/${cid}/messages`,user,{text:'내 취미는 기타 연습이야.'})).status,200);
    const before=(await h.request('/me',user)).body.user;
    const memories=h.runtime.store.all('SELECT * FROM memories WHERE owner_id=? ORDER BY id',user.id);
    const looks=characterLooks();
    for(const character of characters){
      assert.equal((await h.request('/me/world',user,{appearance:looks[character.id]},'PATCH')).status,200);
      const after=(await h.request('/me',user)).body.user;
      assert.equal(after.activeSlot,before.activeSlot);assert.equal(after.revision,before.revision);
      assert.deepEqual(h.runtime.store.all('SELECT * FROM memories WHERE owner_id=? ORDER BY id',user.id),memories);
      const restored=(await h.request('/me/conversation',user)).body.conversation;
      assert.equal(restored.id,cid);assert.equal(restored.messages[0].content,'내 취미는 기타 연습이야.');
      assert.equal((await h.request(`/conversations/${cid}/messages`,user,{text:'내 취미를 기억해?'})).status,200);
      assert.equal(packets.at(-1).history[0].content,'내 취미는 기타 연습이야.');
      assert.ok(packets.at(-1).context.snapshot.memories.some(memory=>memory.content==='기타 연습을 좋아한다.'));
    }
    assert.equal((await h.request('/me/pet/appearance',user,{petType:'cat',petColor:petColors[0].id},'PATCH')).status,200);
    assert.deepEqual(h.runtime.store.all('SELECT * FROM memories WHERE owner_id=? ORDER BY id',user.id),memories);
    assert.equal((await h.request('/me/conversation',user)).body.conversation.id,cid);
  }finally{await h.close();}
});

test('chat restoration never crosses account or persona boundaries and ignores deleted sessions',async()=>{
  const h=await harness();
  try{
    const owner=await h.register('restore_owner'),visitor=await h.register('restore_visitor');
    assert.equal((await h.request('/me/conversation')).status,401);
    const original=(await h.request('/slots',owner)).body.active;
    const cid=(await h.request('/conversations',owner,{targetId:owner.id})).body.id;
    await h.request('/conversations',visitor,{targetId:owner.id,share:true});
    await h.request('/conversations',owner,{targetId:visitor.id});
    assert.equal((await h.request('/me/conversation',owner)).body.conversation.id,cid);
    assert.equal((await h.request('/me/conversation',visitor)).body.conversation,null);
    // This account has earned a card; quest gating is exercised in avatar-cards.test.mjs.
    h.runtime.store.run("INSERT INTO avatar_quest_rewards(owner_id,quest_id,created_at) VALUES(?,'first-chat',?)",owner.id,new Date().toISOString());
    const slot=(await h.request('/slots',owner,{nickname:'별도 자아'})).body.id;
    await h.request(`/slots/${slot}/activate`,owner,{});
    assert.equal((await h.request('/me/conversation',owner)).body.conversation,null);
    await h.request(`/slots/${original}/activate`,owner,{});
    assert.equal((await h.request('/me/conversation',owner)).body.conversation.id,cid);
    await h.request(`/conversations/${cid}`,owner,undefined,'DELETE');
    assert.equal((await h.request('/me/conversation',owner)).body.conversation,null);
  }finally{await h.close();}
});
