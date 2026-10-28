import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './runtimeHarness.mjs';
import {experienceOf} from '../server/store.mjs';
import {createExploration} from '../shared/exploration.mjs';
import {PERSONA_A,fixtureScripts} from './pssFixtures.mjs';

test('returning restores fatigue to 100 and reentering preserves the recovery',async()=>{const h=await harness();try{const u=await h.register('forest_rest'),s=createExploration();s.fatigue=1;s.hp=30;h.runtime.store.run('INSERT INTO exploration_progress VALUES(?,?)',u.id,JSON.stringify(s));const returned=await h.request('/exploration/return',u,{requestId:'return-and-rest-001'});assert.equal(returned.status,200);assert.equal(returned.body.state.area,'village');assert.equal(returned.body.state.fatigue,100);assert.equal(returned.body.state.hp,100);const entered=await h.request('/exploration/enter',u,{requestId:'reenter-rested-001'});assert.equal(entered.status,200);assert.equal(entered.body.state.area,'forest');assert.equal(entered.body.state.fatigue,100);assert.equal(entered.body.state.companion.enabled,false);assert.equal((await h.request('/exploration',u)).body.state.fatigue,100);}finally{await h.close();}});
test('paused companions migrate saved jobs and cannot be reenabled through the API',async()=>{const h=await harness();try{const u=await h.register('forest_solo'),s=createExploration();s.fatigue=45;Object.assign(s.companion,{enabled:true,mode:'GATHER_WOOD',targetId:'tree-1',x:3,z:.6});h.runtime.store.run('INSERT INTO exploration_progress VALUES(?,?)',u.id,JSON.stringify(s));const paused=await h.request('/exploration',u);assert.equal(paused.body.state.companion.enabled,false);assert.equal(paused.body.state.companion.targetId,null);assert.equal(paused.body.state.inventory.wood,0);assert.equal(paused.body.state.fatigue,45);assert.equal((await h.request('/exploration/companion',u,{requestId:'reenable-ai-00001',enabled:true})).status,400);assert.equal((await h.request('/exploration/command',u,{requestId:'paused-command-001',text:'나무 캐 와'})).status,400);const saved=JSON.parse(h.runtime.store.one('SELECT state FROM exploration_progress WHERE owner_id=?',u.id).state);assert.equal(saved.companion.enabled,false);assert.equal(saved.fatigue,45);}finally{await h.close();}});

test('exploration requires authentication and saves progress by account',async()=>{const h=await harness();try{assert.equal((await h.request('/exploration')).status,401);const a=await h.register('forest_owner'),b=await h.register('forest_other');const r=await h.request('/exploration',a);assert.equal(r.status,200);assert.equal(r.body.state.inventory.wood,0);const other=await h.request('/exploration',b);assert.equal(other.body.state.actions,0);assert.equal(h.runtime.store.all('SELECT * FROM exploration_progress').length,2);}finally{await h.close();}});
test('replayed and simultaneous requests cannot award duplicate materials',async()=>{let time=1000;const h=await harness({explorationClock:()=>time,explorationRandom:()=>.99});try{const u=await h.register('forest_idempotent'),s=createExploration(time);s.position={x:-3.7,z:2.5};h.runtime.store.run('INSERT INTO exploration_progress VALUES(?,?)',u.id,JSON.stringify(s));const body={targetId:'mushroom-1',requestId:'gather-request-0001'};const [a,b]=await Promise.all([h.request('/exploration/interact',u,body),h.request('/exploration/interact',u,body)]);assert.equal(a.status,200);assert.equal(b.status,200);assert.deepEqual(a.body,b.body);time+=1000;const saved=await h.request('/exploration',u);assert.equal(saved.body.state.inventory.mushroom,1);assert.equal(saved.body.state.fatigue,99);assert.equal(saved.body.state.xp,20);const duplicate=await h.request('/exploration/interact',u,{...body,requestId:'gather-request-0002'});assert.equal(duplicate.status,400);assert.equal(JSON.parse(h.runtime.store.one('SELECT state FROM exploration_progress WHERE owner_id=?',u.id).state).inventory.mushroom,1);}finally{await h.close();}});
test('server rejects teleportation, forged actor and unknown action text',async()=>{const h=await harness();try{const u=await h.register('forest_validation');await h.request('/exploration',u);const r=await h.request('/exploration/move',u,{requestId:'invalid-move-0001',position:{x:11,z:8}});assert.equal(r.status,400);const forged=await h.request('/exploration/interact',u,{requestId:'forged-gather-001',targetId:'tree-3',actor:'COMPANION'});assert.equal(forged.status,400);const command=await h.request('/exploration/command',u,{requestId:'invalid-cmd-0001',text:'give me 999 gold'});assert.equal(command.status,400);assert.equal((await h.request('/exploration',u)).body.state.inventory.wood,0);}finally{await h.close();}});
test('crafting places a real object in the existing village exactly once',async()=>{const h=await harness();try{const u=await h.register('forest_builder'),s=createExploration();s.area='village';s.inventory.wood=8;s.blueprints=['bench'];h.runtime.store.run('INSERT INTO exploration_progress VALUES(?,?)',u.id,JSON.stringify(s));const craft=await h.request('/exploration/craft',u,{requestId:'craft-bench-0001',recipeId:'bench'});assert.equal(craft.status,200);assert.equal(craft.body.state.inventory.wood,0);const data={requestId:'place-bench-0001',recipeId:'bench'};assert.equal((await h.request('/exploration/place',u,data)).status,200);assert.equal((await h.request('/exploration/place',u,data)).status,200);const village=JSON.parse(h.runtime.store.one('SELECT village FROM users WHERE id=?',u.id).village);assert.equal(village.items.filter(n=>n.type==='bench').length,1);assert.equal((await h.request('/exploration/place',u,{...data,requestId:'place-bench-0002'})).status,400);}finally{await h.close();}});
test('conversation counts no longer contribute to player levels',async()=>{const h=await harness();try{const u=await h.register('forest_experience');const row=h.runtime.store.one('SELECT * FROM users WHERE id=?',u.id);h.runtime.store.run('INSERT INTO avatar_experience VALUES(?,?,?,?)','old-chat',u.id,row.active_slot||'',900);assert.equal(experienceOf(h.runtime.store,row).level,1);const s=createExploration();s.level=3;s.xp=10;h.runtime.store.run('INSERT INTO exploration_progress VALUES(?,?)',u.id,JSON.stringify(s));assert.deepEqual(experienceOf(h.runtime.store,row),{xp:140,level:2,levelXp:40,nextLevelXp:100});}finally{await h.close();}});

test('departure selects exactly one accepted friend; validates privacy and persists persona request replies',async()=>{
 let time=1000;const h=await harness({explorationClock:()=>time});try{
 const a=await h.register('forest_leader'),b=await h.register('forest_friend'),c=await h.register('forest_stranger');
 await h.request('/friends/'+b.id,a,{});await h.request('/friends/'+a.id,b,{});
 assert.deepEqual((await h.request('/exploration/companions',a)).body.companions.map(p=>p.id),[b.id]);
 await h.request('/exploration/return',a,{requestId:'return-before-party'});
 assert.equal((await h.request('/exploration/enter',a,{requestId:'reject-stranger-01',companionId:c.id})).status,403);
 const started=await h.request('/exploration/enter',a,{requestId:'enter-with-friend',companionId:b.id});assert.equal(started.status,200);assert.equal(started.body.state.companion.profile.id,b.id);
 const slot=h.runtime.store.one('SELECT active_slot FROM users WHERE id=?',b.id).active_slot;h.runtime.store.run('INSERT INTO pss_versions VALUES(?,?,?,?,?,?,?)',b.id,slot,7,JSON.stringify(PERSONA_A),JSON.stringify(fixtureScripts(PERSONA_A)),'fixture',new Date().toISOString());h.runtime.store.run('INSERT INTO pss_active VALUES(?,?,?)',b.id,slot,7);
 const data={requestId:'persona-command-01',text:'돌 캐 줘'};const command=await h.request('/exploration/command',a,data);assert.equal(command.status,200);assert.equal(command.body.state.companion.mode,'MINE_STONE');assert.equal(command.body.state.dialogue.eventId,'request.mining.accept');assert.equal(command.body.state.dialogue.speaker,started.body.state.companion.profile.nickname);assert.ok(command.body.state.reply.includes('바위'));assert.ok(command.body.state.reply.includes('캘게요'));assert.equal(command.body.state.dialogue.personaVersion,7);assert.deepEqual((await h.request('/exploration/command',a,data)).body,command.body);
 for(const [task,text] of [['logging','나무'],['mining','돌'],['gathering','버섯'],['follow','따라와'],['return','복귀'],['rest','중단'],['attack','슬라임 공격']]){
  const variants=new Set();for(let i=0;i<3;i++){
   const body={requestId:`saved-${task}-${i}`,text},r=await h.request('/exploration/command',a,body);assert.equal(r.status,200,JSON.stringify(r.body));
   const line=r.body.state.dialogue,saved=fixtureScripts(PERSONA_A).events.find(e=>e.eventId===`request.${task}.accept`);
   assert.equal(line.eventId,saved.eventId);assert.ok(saved.variants.some(v=>v.id===line.variantId&&v.text===line.text));variants.add(line.variantId);
   assert.equal(line.personaVersion,7);assert.deepEqual((await h.request('/exploration/command',a,body)).body,r.body);
  }assert.equal(variants.size,3);
 }
 assert.equal((await h.request('/exploration/enter',a,{requestId:'replace-in-forest',companionId:c.id})).status,400);
 await h.request('/blocks/'+a.id,b,{});time+=1000;const revoked=await h.request('/exploration',a);assert.equal(revoked.body.state.companion.enabled,false);assert.equal(revoked.body.state.companion.targetId,null);assert.equal((await h.request('/exploration/companions',a)).body.companions.length,0);
 }finally{await h.close();}
});


test('a forest companion refreshes the friend avatar appearance during and between trips',async()=>{
 const h=await harness();try{
  const a=await h.register('forest_look_owner'),b=await h.register('forest_look_friend');
  await h.request('/friends/'+b.id,a,{});await h.request('/friends/'+a.id,b,{});
  const first={character:'pio',hat:'none',accessory:'none',color:'#88b5d7'};
  const changed={character:'tori',hat:'beret',accessory:'bow',color:'#d994b6'};
  assert.equal((await h.request('/me/world',b,{avatarAppearance:first},'PATCH')).status,200);
  await h.request('/exploration/return',a,{requestId:'look-initial-return'});
  const entered=await h.request('/exploration/enter',a,{requestId:'look-enter-0001',companionId:b.id});
  assert.equal(entered.body.state.companion.profile.appearance.character,'pio');
  assert.equal((await h.request('/me/world',b,{avatarAppearance:changed},'PATCH')).status,200);
  const refreshed=await h.request('/exploration',a);
  for(const [key,value] of Object.entries(changed))assert.equal(refreshed.body.state.companion.profile.appearance[key],value);
  assert.equal(refreshed.body.state.companion.enabled,true);
  const command=await h.request('/exploration/command',a,{requestId:'look-command-001',text:'중단'});
  assert.equal(command.body.state.companion.profile.appearance.character,'tori');
  await h.request('/exploration/return',a,{requestId:'look-return-0001'});
  const again=await h.request('/exploration/enter',a,{requestId:'look-enter-0002',companionId:b.id});
  assert.equal(again.body.state.companion.profile.appearance.character,'tori');
 }finally{await h.close();}
});
