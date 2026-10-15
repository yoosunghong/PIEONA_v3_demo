import test from 'node:test';
import assert from 'node:assert/strict';
import {newRun,runAction,jumpHeight,JUMP_MS,RUN_DURATION} from '../shared/runner.mjs';
import {reconcileRun,runTime,predictRunInput,acknowledgeJump,visualJumpTime,runnerPose} from '../shared/runnerSync.mjs';

test('one unacknowledged jump lands even through many delayed broadcasts',()=>{
  let authoritative={...newRun(),elapsed:4000};
  const pending=[{seq:1,action:'jump',elapsed:4100}];
  for(let elapsed=4200;elapsed<=8000;elapsed+=100){
    const incoming={...authoritative,elapsed};
    const reconciled=reconcileRun(authoritative,incoming,pending,[]);
    authoritative=incoming;
    assert.equal(reconciled.predicted.jumpAt,4100,'a broadcast must not restart the jump');
    if(elapsed>=4100+JUMP_MS)assert.equal(jumpHeight(elapsed,reconciled.predicted.jumpAt),0);
  }
  const withMovement=reconcileRun(authoritative,authoritative,[...pending,{seq:2,action:'left',elapsed:5200}],[]);
  assert.equal(withMovement.predicted.lane,0,'movement after the jump still applies');
  assert.equal(withMovement.predicted.jumpAt,4100);
});

test('airborne jump presses are ignored without queuing another jump, while lanes remain usable',()=>{
  const jumping=predictRunInput(newRun(),[],4100,'jump');
  for(const offset of [120,240,JUMP_MS-1])assert.equal(predictRunInput(jumping,[],4100+offset,'jump'),null);
  assert.equal(predictRunInput(jumping,[],4220,'left').lane,0);
  assert.equal(predictRunInput(jumping,[],4100+JUMP_MS,'jump').jumpAt,4100+JUMP_MS);
  assert.equal(predictRunInput({...jumping,lives:0},[],5200,'right'),null);
});

test('late acknowledgement does not rewind or restart the visible jump',()=>{
  const base=newRun(),visual={seq:1,at:4100};
  const incoming={...runAction(base,[],4350,'jump'),inputSeq:1};
  const acknowledged=acknowledgeJump(visual,base,incoming);
  assert.equal(visualJumpTime(acknowledged,incoming),4100);
  assert.equal(runnerPose(incoming,[],5100,{jumpAt:visualJumpTime(acknowledged,incoming)}).jump,0);
  const rejected=acknowledgeJump(visual,base,{...base,inputSeq:1,elapsed:4400});
  assert.equal(rejected,null);
});

test('remote running, lane changes and jump keep animating after local game over',()=>{
  const local={...newRun(),lives:0,elapsed:5000},remote=runAction(newRun(),[],5500,'jump');
  assert.equal(runnerPose(local,[],5700,{finished:true}).moving,false);
  assert.equal(runnerPose(remote,[],5700).moving,true);
  assert.ok(runnerPose(remote,[],5700).jump>0);
  assert.equal(runnerPose(remote,[],6500).jump,0);
  const moved=runAction(remote,[],5800,'left');
  assert.equal(runnerPose(moved,[],5900).state.lane,0);
  assert.equal(runnerPose(moved,[],RUN_DURATION+1000).moving,false);
});

test('delayed snapshots preserve unacknowledged lane and jump inputs',()=>{
  const base={...newRun(),elapsed:4000};
  const pending=[{seq:1,action:'left',elapsed:4100},{seq:2,action:'jump',elapsed:4250}];
  const result=reconcileRun(base,{...base,elapsed:4050},pending,[]);
  assert.equal(result.predicted.lane,0);assert.equal(result.predicted.jumpAt,4250);
  const ack={...runAction(base,[],4150,'left'),inputSeq:1};
  const next=reconcileRun(base,ack,pending,[]);
  assert.equal(next.predicted.lane,0);assert.equal(next.predicted.jumpAt,4250);assert.deepEqual(next.pending,[pending[1]]);
});

test('out of order replies cannot overwrite newer server state',()=>{
  const current={...newRun(),inputSeq:3,elapsed:4600,lane:2};
  assert.equal(reconcileRun(current,{...current,inputSeq:2,elapsed:4700},[],[]),null);
  assert.equal(reconcileRun(current,{...current,elapsed:4500},[],[]),null);
  const result=reconcileRun(current,{...current,elapsed:4800,lives:2},[],[]);
  assert.equal(result.predicted.lives,2);
});

test('track time never reverses when clock corrections arrive',()=>{
  const clock={start:100,time:0,correction:0};
  assert.equal(runTime(clock,500,45000),400);
  clock.start+=150;clock.correction=150;
  let last=400;
  for(let now=501;now<1000;now+=16){const time=runTime(clock,now,45000);assert.ok(time>=last);last=time;}
  assert.equal(runTime(clock,100000,45000),45000);
});
