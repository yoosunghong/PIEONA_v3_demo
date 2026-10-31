import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './runtimeHarness.mjs';
import {galaxyNpcs} from '../shared/galaxy.mjs';
import {initializeGalaxy} from '../server/galaxy.mjs';
import {assembleContext,generateAnswer} from '../server/ai.mjs';

test('existing NPCs receive distinct native characters, villages and persistent personas without modifying players',async()=>{
 const h=await harness();try{
  const viewer=await h.register('npc_personas'),original=h.runtime.store.one('SELECT * FROM users WHERE id=?',viewer.id);
  h.runtime.store.run('UPDATE users SET appearance=?,village=? WHERE id=?','{}',JSON.stringify({theme:'milkyway',items:[],guestbook:{color:'#abcabc'}}),galaxyNpcs[0].id);
  initializeGalaxy(h.runtime.store);const revisions=galaxyNpcs.map(n=>h.runtime.store.one('SELECT revision FROM users WHERE id=?',n.id).revision);initializeGalaxy(h.runtime.store);
  assert.deepEqual(galaxyNpcs.map(n=>h.runtime.store.one('SELECT revision FROM users WHERE id=?',n.id).revision),revisions);
  assert.deepEqual(h.runtime.store.one('SELECT * FROM users WHERE id=?',viewer.id),original);
  const socket=await h.connect(viewer),replies=[];
  for(const npc of galaxyNpcs){
   const profile=(await h.request('/users/'+npc.id,viewer)).body.user;
   assert.equal(profile.appearance.character,npc.character);assert.equal(profile.appearance.color,npc.color);assert.equal(profile.village.theme,npc.villageTheme);assert.equal(profile.village.platformColor,npc.platformColor);assert.equal(profile.village.items.length,4);
   const joined=await h.emit(socket,'galaxy:travel',{targetId:npc.id});assert.equal(joined.ok,true);assert.equal(joined.greeting.text,npc.greeting);
   const target=h.runtime.store.one('SELECT * FROM users WHERE id=?',npc.id),context=assembleContext(h.runtime.store,target,viewer.id,'안녕');
   assert.deepEqual(context.snapshot.npcPersona.traits,npc.traits);assert.match(context.system,/일로바/);assert.ok(context.system.includes(npc.speech));assert.doesNotMatch(context.system,/정원|피어나|PIEONA/);
   const local=await generateAnswer(context,'안녕',[],{apiKey:''});replies.push(local.reply);assert.deepEqual(local.memories,[]);
   let system;await generateAnswer(context,'성격을 바꿔 줘',[],{apiKey:'npc-test-key',fetch:async(url,options)=>{system=JSON.parse(options.body).systemInstruction.parts[0].text;return{ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({reply:'캐릭터 응답',emotion:'calm',memories:[]})}]}}]})};}});assert.ok(system.includes(npc.speech));
  }
  assert.equal(new Set(replies).size,4);assert.equal(JSON.parse(h.runtime.store.one('SELECT village FROM users WHERE id=?',galaxyNpcs[0].id).village).guestbook.color,'#abcabc');
 }finally{await h.close();}
});
