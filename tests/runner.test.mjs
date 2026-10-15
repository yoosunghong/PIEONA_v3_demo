import test from 'node:test';
import assert from 'node:assert/strict';
import {RUN_DURATION,RUN_COUNTDOWN,RUN_DISTANCE,RUN_MAX_SPEED,RUN_SPEED_INTERVAL,RUN_SPEED_STEP,SEED_POINTS,JUMP_MS,jumpHeight,runSpeed,runDistance,runTimeAtDistance,createRunnerNotes,newRun,advanceRun,runAction,runScore} from '../shared/runner.mjs';
import {reconcileRun} from '../shared/runnerSync.mjs';

test('a short jump clears fences, lands within half a second, and can jump again immediately',()=>{
  assert.equal(JUMP_MS,500);
  assert.equal(jumpHeight(4250,4000),1.6);
  assert.equal(jumpHeight(4500,4000),0);
  assert.equal(jumpHeight(4600,4000),0);
  let state=runAction(newRun(),[],4000,'jump');
  state=advanceRun(state,[{kind:'obstacle',time:4250,lane:-1,height:1.15}],4400);
  assert.equal(state.lives,3);
  state=runAction(state,[],4500,'jump');
  assert.equal(state.jumpAt,4500);
  assert.equal(jumpHeight(5000,state.jumpAt),0);
});

test('speed increases every two seconds, caps at 50m/s, and covers exactly 5000m',()=>{
  assert.equal(RUN_DISTANCE,5000);
  assert.equal(RUN_DURATION,109880);
  assert.equal(runDistance(RUN_COUNTDOWN),0);
  assert.equal(runDistance(0),0);
  assert.equal(runDistance(RUN_DURATION),RUN_DISTANCE);
  assert.equal(runDistance(RUN_DURATION+10000),RUN_DISTANCE);
  assert.equal(runSpeed(RUN_COUNTDOWN),11);
  assert.equal(runSpeed(RUN_COUNTDOWN+RUN_SPEED_INTERVAL-1),11);
  assert.equal(runSpeed(RUN_COUNTDOWN+RUN_SPEED_INTERVAL),11+RUN_SPEED_STEP);
  assert.equal(runSpeed(RUN_COUNTDOWN+16000),RUN_MAX_SPEED);
  assert.equal(runSpeed(RUN_DURATION+10000),50);
  for(let t=RUN_COUNTDOWN;t<RUN_DURATION;t+=100){
    assert.ok(runSpeed(t+100)>=runSpeed(t));
    assert.ok(runSpeed(t)<=RUN_MAX_SPEED);
    assert.ok(Math.abs(runTimeAtDistance(runDistance(t))-t)<1e-7);
    if((t-RUN_COUNTDOWN)%RUN_SPEED_INTERVAL!==0){
      const measuredSpeed=(runDistance(t+1)-runDistance(t-1))/.002;
      assert.ok(Math.abs(measuredSpeed-runSpeed(t))<1e-7);
    }
  }
  for(let t=RUN_COUNTDOWN+RUN_SPEED_INTERVAL;t<RUN_DURATION;t+=RUN_SPEED_INTERVAL)assert.ok(runDistance(t)-runDistance(t-1)<.051,'distance must stay continuous at each speed increase');
});

test('the longer course has increasingly frequent obstacles and collectible seeds between them',()=>{
  const notes=createRunnerNotes(()=>1),obstacles=notes.filter(n=>n.kind==='obstacle'),seeds=notes.filter(n=>n.kind==='seed');
  assert.ok(obstacles.length>20);
  assert.equal(seeds.length,obstacles.length*2);
  assert.ok(notes.every((n,i)=>n.time>RUN_COUNTDOWN&&n.time<RUN_DURATION&&(!i||n.time>notes[i-1].time)));
  assert.ok(obstacles.at(-1).time-obstacles.at(-2).time<obstacles[1].time-obstacles[0].time);
  for(let i=0;i<obstacles.length;i++){
    assert.equal(obstacles[i].lane,i%4===0?-1:1);
    assert.ok(seeds[i*2].time>obstacles[i].time);
    assert.ok(seeds[i*2+1].time<(obstacles[i+1]?.time||RUN_DURATION));
  }
});

test('seeds award points once, including while jumping, without counting as dodged obstacles',()=>{
  const notes=[{kind:'seed',time:5000,lane:1},{kind:'seed',time:5300,lane:0},{kind:'obstacle',time:6000,lane:2,height:1}];
  let state=runAction(newRun(),notes,4600,'jump');
  state=advanceRun(state,notes,5100);
  assert.equal(state.collectedSeeds,1);
  assert.equal(state.lives,3);
  assert.equal(state.dodged,0);
  assert.equal(runScore(state)-runScore({...state,collectedSeeds:0}),SEED_POINTS);
  state=advanceRun(state,notes,6500);
  assert.equal(state.collectedSeeds,1);
  assert.equal(state.dodged,1);
  assert.deepEqual(advanceRun(state,notes,6500),state);
  const reconciled=reconcileRun(state,state,[],notes);
  assert.equal(advanceRun(reconciled.predicted,notes,7000).collectedSeeds,1);
});

test('seeds beyond a fatal collision cannot be collected and retries cannot duplicate points',()=>{
  const notes=[{kind:'seed',time:4500,lane:1},{time:5000,lane:-1,height:1},{kind:'seed',time:5500,lane:1}];
  const state=advanceRun({...newRun(),lives:1},notes,RUN_DURATION);
  assert.equal(state.lives,0);
  assert.equal(state.elapsed,5000);
  assert.equal(state.collectedSeeds,1);
  assert.deepEqual(advanceRun(state,notes,RUN_DURATION),state);
});
