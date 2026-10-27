import test from 'node:test';
import assert from 'node:assert/strict';
import {typingWordSequence,TYPING_HARD_WORDS,TYPING_LONG_WORDS,chainWordPoints} from '../shared/wordGames.mjs';

test('typing regularly interleaves hard and long words throughout each shuffled sequence',()=>{
  const words=typingWordSequence(limit=>limit-1);
  for(let start=0;start+6<=words.length;start+=6){
    const block=words.slice(start,start+6);
    assert.ok(block.some(w=>TYPING_HARD_WORDS.includes(w)));
    assert.ok(block.some(w=>TYPING_LONG_WORDS.includes(w)));
  }
});
test('chain scoring rewards faster responses and remains bounded',()=>{
  assert.equal(chainWordPoints(0),100);assert.equal(chainWordPoints(1000),90);
  assert.ok(chainWordPoints(1500)>chainWordPoints(5000));
  assert.equal(chainWordPoints(9000),10);assert.equal(chainWordPoints(120000),10);
});
