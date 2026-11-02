import test from 'node:test';
import assert from 'node:assert/strict';
import {isBirthdayVillageVisible} from '../src/birthday.mjs';

test('birthday celebration runs on arrival by village or visitor chat, after the map closes',()=>{
  const birthday=new Date('2026-11-03T03:00:00Z');
  assert.equal(isBirthdayVillageVisible('겨울이','village',false,birthday),true);
  assert.equal(isBirthdayVillageVisible('겨울이','chat',false,birthday),true);
  assert.equal(isBirthdayVillageVisible('겨울이','village',true,birthday),false);
  assert.equal(isBirthdayVillageVisible('다른 사람','chat',false,birthday),false);
  assert.equal(isBirthdayVillageVisible('겨울이','chat',false,new Date('2026-11-03T15:00:00Z')),false);
});
