import test from 'node:test';
import assert from 'node:assert/strict';
import {companionReply} from '../shared/companionScripts.mjs';
test('applied persona changes request tone and the PSS selector rotates variants',()=>{
 const formal={version:3,persona:{speechStyle:'정중한 존댓말',playfulness:.1}},playful={version:4,persona:{playfulness:.9}};
 const a=companionReply('GATHER_WOOD',formal),b=companionReply('GATHER_WOOD',playful);assert.notEqual(a.text,b.text);assert.ok(a.text.includes('모을게요'));assert.equal(a.personaVersion,3);
 let history;const ids=[];for(let i=0;i<6;i++){const line=companionReply('MINE_STONE',playful,history);ids.push(line.variantId);history=line.history;}assert.equal(new Set(ids).size,3);assert.notEqual(ids[0],ids[1]);
});
