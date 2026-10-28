import test from 'node:test';
import assert from 'node:assert/strict';
import {companionReply} from '../shared/companionScripts.mjs';
import {COMPANION_REQUESTS,validateScripts} from '../shared/personaScripts.mjs';
import {PERSONA_A,fixtureScripts} from './pssFixtures.mjs';
test('all forest commands select applied generated dialogue and rotate every saved variant',()=>{
 const scripts=fixtureScripts(PERSONA_A);validateScripts(scripts,{requireAll:true});
 for(const [action,[task]] of Object.entries(COMPANION_REQUESTS)){
  const saved=scripts.events.find(e=>e.eventId===`request.${task}.accept`);saved.variants.forEach((v,i)=>{v.text=`저장된 ${task} 요청 대사 ${i}`;});
  let history;const ids=[];for(let i=0;i<6;i++){const line=companionReply(action,{version:8,scripts},history);history=line.history;ids.push(line.variantId);assert.equal(line.personaVersion,8);assert.ok(line.text.startsWith(`저장된 ${task}`));}assert.equal(new Set(ids).size,3);
 }
});
test('legacy village-only script versions remain valid but cannot be newly generated',()=>{
 const old=fixtureScripts(PERSONA_A);old.events=old.events.filter(e=>!e.eventId.startsWith('request.'));validateScripts(old);assert.throws(()=>validateScripts(old,{requireAll:true}),/PSS_EVENT_MISSING/);
 assert.ok(companionReply('RETURN',{version:2,scripts:old}).text.includes('돌아갈게'));
});
test('applied persona changes request tone and the PSS selector rotates variants',()=>{
 const formal={version:3,persona:{speechStyle:'정중한 존댓말',playfulness:.1}},playful={version:4,persona:{playfulness:.9}};
 const a=companionReply('GATHER_WOOD',formal),b=companionReply('GATHER_WOOD',playful);assert.notEqual(a.text,b.text);assert.ok(a.text.includes('모을게요'));assert.equal(a.personaVersion,3);
 let history;const ids=[];for(let i=0;i<6;i++){const line=companionReply('MINE_STONE',playful,history);ids.push(line.variantId);history=line.history;}assert.equal(new Set(ids).size,3);assert.notEqual(ids[0],ids[1]);
});
