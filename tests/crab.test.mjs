import test from 'node:test';
import assert from 'node:assert/strict';
import {newCrabGame,stepCrab,advanceCrab,crabInput,crabSnapshot,crabScore,crabBaseScore,crabChainBonus,crabScoreRate,chainTarget,CRAB_COUNTDOWN,CRAB_STEP,BEACH_HALF,PLAYER_SPEED} from '../shared/crab.mjs';

test('countdown freezes players and crabs; each player starts with a two-crab procession',()=>{
  const s=newCrabGame(['a','b'],17),before=crabSnapshot(s);advanceCrab(s,CRAB_COUNTDOWN-CRAB_STEP);
  assert.equal(s.crabs.length,16);assert.deepEqual(s.crabs.map(c=>({id:c.id,x:c.x,z:c.z})),before.crabs.map(({id,x,z})=>({id,x,z})));
  assert.ok(s.players.every(p=>p.chain.length===2&&p.alive&&p.survived===0));
  assert.equal(s.players[0].x,-4);assert.equal(s.players[1].x,4);
  assert.equal(s.crabs.filter(c=>c.mode==='patrol').length,12);
});
test('input is normalized, stale packets are ignored, input expires and beach bounds hold',()=>{
  const s=newCrabGame(['a']);s.crabs=[];s.elapsed=3000;
  crabInput(s,'a',{x:1,z:1,seq:2});crabInput(s,'a',{x:-1,z:0,seq:1});
  stepCrab(s);assert.ok(s.players[0].x>0);assert.ok(Math.abs(Math.hypot(s.players[0].x,s.players[0].z)-PLAYER_SPEED*CRAB_STEP/1000)<1e-6);
  advanceCrab(s,4000);const position={x:s.players[0].x,z:s.players[0].z};advanceCrab(s,4500);assert.equal(s.players[0].x,position.x);assert.equal(s.players[0].z,position.z);
  s.players[0].x=BEACH_HALF;crabInput(s,'a',{x:1,z:0,seq:3});stepCrab(s);assert.equal(s.players[0].x,BEACH_HALF);
});
test('nearby patrols acquire a player and merge at the tail exactly once',()=>{
  const s=newCrabGame(['a']);s.elapsed=3000;const p=s.players[0];
  s.crabs=[...s.crabs.filter(c=>c.owner==='a'),{id:100,x:3,z:0,cx:3,cz:0,phase:0,rate:0,rx:0,rz:0,mode:'patrol'}];
  stepCrab(s);const crab=s.crabs.find(c=>c.id===100);assert.equal(crab.mode,'chase');assert.equal(crab.owner,'a');
  crab.x=0;crab.z=5.9;stepCrab(s);assert.equal(crab.mode,'chain');assert.equal(p.chain.length,3);stepCrab(s);assert.equal(p.chain.filter(id=>id===100).length,1);
});
test('a stopped player is caught; terminal time and score cannot grow after death',()=>{
  const s=newCrabGame(['a']);advanceCrab(s,10000);assert.equal(s.ended,true);assert.equal(s.players[0].alive,false);
  const score=crabScore(s.players[0]),elapsed=s.elapsed;assert.ok(score>=1&&score<50);advanceCrab(s,30000);assert.equal(s.elapsed,elapsed);assert.equal(crabScore(s.players[0]),score);
});
test('the procession records turns and idle positions without exposing path history in snapshots',()=>{
  const s=newCrabGame(['a']);s.crabs=[];s.elapsed=3000;
  for(let i=0;i<20;i++){crabInput(s,'a',{x:1,z:0,seq:i+1});stepCrab(s);}
  for(let i=0;i<30;i++){crabInput(s,'a',{x:0,z:-1,seq:i+21});stepCrab(s);}
  const head=chainTarget(s.players[0],0),tail=chainTarget(s.players[0],1);assert.ok(head.z<tail.z);assert.ok(head.x>=tail.x);
  assert.equal('trail' in crabSnapshot(s).players[0],false);assert.deepEqual(crabSnapshot(s).players[0].input,{x:0,z:-1});
});

test('longer processions earn a time-integrated bonus, with no retroactive points or post-death growth',()=>{
  const s=newCrabGame(['a']);s.crabs=[];s.elapsed=3000;const p=s.players[0];p.survived=3000;
  advanceCrab(s,4001);assert.equal(crabScore(p),10);assert.equal(crabChainBonus(p),0);assert.equal(crabScoreRate(p),10);
  p.chain.push(100,101,102,103);assert.equal(crabScore(p),10);assert.equal(crabScoreRate(p),18);
  advanceCrab(s,9001);assert.equal(crabBaseScore(p),60);assert.equal(crabChainBonus(p),40);assert.equal(crabScore(p),100);
  p.chain.splice(2);advanceCrab(s,10001);assert.equal(crabChainBonus(p),40);assert.equal(crabScore(p),110);
  const snapshot=crabSnapshot(s);assert.equal(snapshot.players[0].bonus,40);assert.equal(snapshot.players[0].scoreRate,10);
  s.ended=true;advanceCrab(s,60000);assert.equal(crabScore(p),110);
});
test('countdown contributes no procession bonus and accrual is independent of simulation chunk size',()=>{
  const a=newCrabGame(['a']),b=newCrabGame(['a']);for(const s of [a,b]){s.crabs=[];s.players[0].chain.push(50,51,52);}
  advanceCrab(a,2990);assert.equal(crabScore(a.players[0]),0);
  advanceCrab(a,6001);for(let t=0;t<=6001;t+=7)advanceCrab(b,t);advanceCrab(b,6001);
  assert.equal(crabScore(a.players[0]),48);assert.equal(crabChainBonus(a.players[0]),18);assert.deepEqual(a,b);
});
test('any crab including the player own chain or opponent chain is fatal; ties resolve together',()=>{
  for(const owner of ['a','b',null]){const s=newCrabGame(['a','b']);s.elapsed=3000;s.crabs=[{id:200,x:-4,z:0,angle:0,mode:owner?'chain':'chase',owner}];stepCrab(s);assert.equal(s.ended,true);assert.equal(s.winner,'b');assert.equal(s.players[0].alive,false);}
  const tie=newCrabGame(['a','b']);tie.elapsed=3000;tie.crabs=[{id:90,x:-4,z:0,mode:'chase',owner:null},{id:91,x:4,z:0,mode:'chase',owner:null}];stepCrab(tie);assert.equal(tie.ended,true);assert.equal(tie.winner,null);assert.ok(tie.players.every(p=>!p.alive));
});
test('difficulty adds more crabs and dynamic patrols over time with deterministic bounded ecology',()=>{
  const s=newCrabGame([],77),copy=newCrabGame([],77);advanceCrab(s,120000);advanceCrab(copy,120000);
  assert.deepEqual(s,copy);assert.ok(s.crabs.length>35);assert.ok(s.crabs.some(c=>c.dynamic));assert.ok(s.crabs.every(c=>Math.abs(c.x)<=BEACH_HALF&&Math.abs(c.z)<=BEACH_HALF));assert.ok(s.crabs.length<=100);
});
