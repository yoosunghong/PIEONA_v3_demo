import test from 'node:test';
import assert from 'node:assert/strict';
import {newCrabGame,stepCrab,advanceCrab,crabInput,crabSnapshot,crabScore,crabBaseScore,crabChainBonus,crabScoreRate,chainTarget,crabSpawnInterval,CRAB_COUNTDOWN,CRAB_STEP,BEACH_HALF,PLAYER_SPEED,CRAB_INVULNERABLE_MS,CRAB_ZIGZAG_MS} from '../shared/crab.mjs';

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
test('own, opponent and wild crabs each cost one life; the third hit ends the game',()=>{
  for(const owner of ['a','b',null]){
    const s=newCrabGame(['a','b']);s.elapsed=3000;s.nextSpawn=Infinity;s.items=[];
    s.crabs=[{id:200,x:-4,z:0,angle:0,mode:owner?'chain':'chase',owner}];
    const p=s.players[0];stepCrab(s);assert.equal(s.ended,false);assert.equal(p.alive,true);assert.equal(p.lives,2);
    // Even several overlapping hazards and repeated ticks cannot burn all lives.
    s.crabs.push({id:201,x:-4,z:0,angle:0,mode:'chase',owner:null});
    advanceCrab(s,p.invulnerableUntil-CRAB_STEP);assert.equal(p.lives,2);
    for(let hit=2;hit<=3;hit++){
      s.elapsed=p.invulnerableUntil;s.crabs.forEach(c=>{c.x=p.x;c.z=p.z;});stepCrab(s);
      assert.equal(p.lives,3-hit);assert.equal(s.ended,hit===3);
    }
    assert.equal(s.winner,'b');assert.equal(p.alive,false);
  }
});
test('last-life simultaneous contacts resolve to a draw in the same tick',()=>{
  const s=newCrabGame(['a','b']);s.elapsed=3000;s.players.forEach(p=>p.lives=1);
  s.crabs=[{id:90,x:-4,z:0,mode:'chase',owner:null},{id:91,x:4,z:0,mode:'chase',owner:null}];stepCrab(s);
  assert.equal(s.ended,true);assert.equal(s.winner,null);assert.ok(s.players.every(p=>!p.alive&&p.lives===0));
});

test('difficulty adds more crabs and dynamic patrols over time with deterministic bounded ecology',()=>{
  const s=newCrabGame([],77),copy=newCrabGame([],77);advanceCrab(s,120000);advanceCrab(copy,120000);
  assert.deepEqual(s,copy);assert.ok(s.crabs.length>35);assert.ok(s.crabs.some(c=>c.dynamic));assert.ok(s.crabs.every(c=>Math.abs(c.x)<=BEACH_HALF&&Math.abs(c.z)<=BEACH_HALF));assert.ok(s.crabs.length<=100);
});

test('patrols first appear after 2.8 seconds, accelerate each wave, and stop at the ecology cap',()=>{
  const s=newCrabGame([],77);advanceCrab(s,CRAB_COUNTDOWN+2750);assert.equal(s.crabs.length,12);
  advanceCrab(s,CRAB_COUNTDOWN+2850);assert.equal(s.crabs.length,13);
  assert.ok(s.nextSpawn-(CRAB_COUNTDOWN+2800)<2800);
  for(let seconds=0;seconds<58;seconds++)assert.ok(crabSpawnInterval(seconds+1)<crabSpawnInterval(seconds));
  assert.equal(crabSpawnInterval(0),2800);assert.equal(crabSpawnInterval(600),700);
  const counts=[s.crabs.length];for(const time of [20000,40000,60000]){advanceCrab(s,CRAB_COUNTDOWN+time);counts.push(s.crabs.length);}
  assert.ok(counts[3]-counts[2]>counts[2]-counts[1]);
  advanceCrab(s,600000);assert.equal(s.crabs.length,100);
});

function itemFixture(type,players=['a','b']){
  const s=newCrabGame(players,17);s.elapsed=3000;s.nextSpawn=Infinity;s.nextItem=Infinity;
  const p=s.players[0];s.crabs=s.crabs.filter(c=>c.mode==='chain');
  s.items=[{id:50,type,x:p.x,z:p.z,expires:22000}];return s;
}
test('steal activates on contact, transfers only the opponent tail and cannot duplicate it',()=>{
  const s=itemFixture('steal'),[a,b]=s.players,tail=b.chain.at(-1),before=crabSnapshot(s);
  stepCrab(s);assert.equal(s.items.length,0);assert.equal(a.chain.at(-1),tail);assert.equal(a.chain.length,3);assert.equal(b.chain.length,1);
  assert.equal(s.crabs.find(c=>c.id===tail).owner,'a');assert.equal(s.crabs.length,4);assert.equal(a.lastItem.applied,true);
  stepCrab(s);assert.equal(a.chain.length,3);assert.equal(before.players[0].chain.length,2);assert.equal(before.players[1].chain.length,2);
});
test('an empty opponent procession or a full receiving chain consumes the bubble without stealing another crab',()=>{
  for(const full of [false,true]){const s=itemFixture('steal'),[a,b]=s.players;
    if(full)a.chain=Array.from({length:52},(_,i)=>i+100);else b.chain=[];
    const before=[...b.chain];stepCrab(s);assert.equal(a.lastItem.applied,false);assert.deepEqual(b.chain,before);assert.equal(s.items.length,0);
  }
});
test('launch consumes one tail crab, aims at the opponent and swept collision costs exactly one life',()=>{
  const s=itemFixture('launch'),[a,b]=s.players,tail=a.chain.at(-1);
  stepCrab(s,500);const c=s.crabs.find(c=>c.id===tail);
  assert.equal(a.chain.length,1);assert.equal(b.lives,2);assert.equal(a.lives,3);assert.equal(c.mode,'chase');assert.equal(c.owner,'b');assert.equal(a.lastItem.applied,true);
  stepCrab(s);assert.equal(b.lives,2);assert.equal(a.chain.length,1);
});
test('a launched crab expires back into the ecology; empty launch is safe and reports no effect',()=>{
  const s=itemFixture('launch');s.players[1].x=18;s.players[1].z=18;stepCrab(s);
  const c=s.crabs.find(c=>c.mode==='projectile');assert.ok(c);assert.equal(c.owner,'a');
  s.elapsed=c.until;stepCrab(s);assert.equal(c.mode,'chase');assert.equal(c.owner,'b');assert.equal('vx' in c,false);
  const empty=itemFixture('launch');empty.players[0].chain=[];stepCrab(empty);assert.equal(empty.players[0].lastItem.applied,false);
});
test('launch also hits an opponent at close range without hitting its shooter on the impact tick',()=>{
  const s=itemFixture('launch');s.players[1].x=s.players[0].x+.2;stepCrab(s);
  assert.equal(s.players[1].lives,2);assert.equal(s.players[0].lives,3);
});
test('zigzag changes both processions for seven seconds, then follows the ordinary targets again',()=>{
  const s=itemFixture('zigzag'),straight=structuredClone(s);straight.items=[];
  stepCrab(s);stepCrab(straight);assert.equal(s.zigzagUntil,s.elapsed+CRAB_ZIGZAG_MS);
  for(const p of s.players){const c=s.crabs.find(c=>c.id===p.chain[0]),normal=straight.crabs.find(v=>v.id===c.id);assert.notEqual(c.x,normal.x);}
  s.elapsed=s.zigzagUntil;const expired=structuredClone(s);expired.zigzagUntil=0;
  stepCrab(s);stepCrab(expired);assert.deepEqual(s.crabs,expired.crabs);
});
test('bubbles freeze during countdown, expire, respawn deterministically and stay within the population cap',()=>{
  const s=newCrabGame([],77),copy=structuredClone(s);advanceCrab(s,2999);assert.equal(s.items.length,3);
  advanceCrab(s,120000);advanceCrab(copy,120000);assert.deepEqual(s,copy);
  assert.ok(s.items.length<=5);assert.ok(s.items.every(i=>i.expires>s.elapsed&&Math.abs(i.x)<=15&&Math.abs(i.z)<=15));
  const same=itemFixture('steal');same.players[1].x=same.players[0].x;same.players[1].z=same.players[0].z;stepCrab(same);
  assert.equal(same.players.filter(p=>p.lastItem).length,1);
});
test('solo bubbles work without an opponent and snapshots do not share mutable state',()=>{
  for(const type of ['steal','launch','zigzag']){const s=itemFixture(type,['a']);s.crabs.push({id:88,mode:'patrol',x:12,z:12,cx:12,cz:12,rx:0,rz:0,rate:0,phase:0});
    stepCrab(s);assert.equal(s.players[0].lastItem.applied,true);
    const snapshot=crabSnapshot(s);snapshot.players[0].chain.push(999);snapshot.players[0].lastItem.applied=false;
    assert.equal(s.players[0].chain.includes(999),false);assert.equal(s.players[0].lastItem.applied,true);
  }
});
