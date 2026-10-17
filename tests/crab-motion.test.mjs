import test from 'node:test';
import assert from 'node:assert/strict';
import {newCrabMotion,predictCrabMotion,reconcileCrabMotion,crabClientTime,syncCrabClock,crabCameraSize} from '../src/crabMotion.mjs';
import {PLAYER_SPEED,BEACH_HALF} from '../shared/crab.mjs';
const player=(overrides={})=>({x:0,z:0,angle:0,alive:true,inputSeq:0,inputAt:3000,input:{x:0,z:0},...overrides});

test('local movement responds on the first frame, stops immediately, and normalizes diagonals',()=>{
  const m=newCrabMotion(player(),3000),pose=predictCrabMotion(m,{x:1,z:1},3016, .016);
  assert.ok(Math.abs(Math.hypot(pose.x,pose.z)-PLAYER_SPEED*.016)<1e-9);
  assert.deepEqual(predictCrabMotion(m,{x:0,z:0},3032,.016),pose);
  const countdown=newCrabMotion(player(),2980);assert.equal(predictCrabMotion(countdown,{x:1,z:0},2990,.01).x,0);
  assert.ok(Math.abs(predictCrabMotion(countdown,{x:1,z:0},3010,.02).x-.058)<1e-9);
});
test('periodic delayed snapshots preserve constant frame speed instead of resetting extrapolation',()=>{
  const m=newCrabMotion(player(),3000);let previous=0,largestError=0;
  for(let i=1;i<=120;i++){
    const time=3000+i*1000/60;
    if(i%6===0){const at=time-80;reconcileCrabMotion(m,player({x:(at-3000)/1000*PLAYER_SPEED,input:{x:1,z:0},inputAt:at,inputSeq:1}),at);}
    const pose=predictCrabMotion(m,{x:1,z:0},time,1/60);
    largestError=Math.max(largestError,Math.abs((pose.x-previous)-PLAYER_SPEED/60));previous=pose.x;
  }
  assert.ok(largestError<1e-8,`snapshot boundary changed frame displacement by ${largestError}m`);
});
test('server acknowledgements replay pending turns and stops while stale packets cannot rewind movement',()=>{
  const m=newCrabMotion(player(),3000);predictCrabMotion(m,{x:1,z:0},3100,.1);
  m.pending.push({seq:2,at:3100,input:{x:0,z:-1}},{seq:3,at:3200,input:{x:0,z:0}});
  predictCrabMotion(m,{x:0,z:-1},3200,.1);predictCrabMotion(m,{x:0,z:0},3300,.1);
  assert.equal(reconcileCrabMotion(m,player({x:.58,input:{x:1,z:0},inputSeq:1,inputAt:3100}),3100),true);
  assert.ok(Math.abs(m.x-.58)<1e-9);assert.ok(Math.abs(m.z+.58)<1e-9);assert.equal(m.pending.length,2);
  const before={...m};assert.equal(reconcileCrabMotion(m,player({x:99,inputSeq:0}),3090),false);assert.deepEqual(m,before);
  reconcileCrabMotion(m,player({x:.58,z:-.58,inputSeq:3,inputAt:3200}),3300);assert.equal(m.pending.length,0);
});
test('reconciliation is visually continuous for small corrections, but terminal positions and bounds stay authoritative',()=>{
  const m=newCrabMotion(player(),3000);predictCrabMotion(m,{x:1,z:0},3100,.1);const before=m.x;
  reconcileCrabMotion(m,player({x:.4}),3100);assert.ok(Math.abs(m.x+m.offsetX-before)<1e-9);
  const pose=predictCrabMotion(m,{x:0,z:0},3200,.1);assert.ok(pose.x>.4&&pose.x<before);
  reconcileCrabMotion(m,player({x:.3,alive:false}),3200);assert.equal(m.x,.3);assert.equal(m.offsetX,0);
  const edge=newCrabMotion(player({x:BEACH_HALF}),3000);assert.equal(predictCrabMotion(edge,{x:1,z:0},3100,.1).x,BEACH_HALF);
});
test('clock jitter never reverses local time and the closer camera preserves the viewport aspect',()=>{
  const clock={start:100,time:0};assert.equal(crabClientTime(clock,4100),4000);
  syncCrabClock(clock,3980,4100,4140);assert.ok(crabClientTime(clock,4140)>=4000);
  const desktop=crabCameraSize(16/9),phone=crabCameraSize(390/844);
  assert.ok(desktop.halfHeight>=10&&desktop.halfHeight<=12);assert.ok(Math.abs(desktop.halfWidth/desktop.halfHeight-16/9)<1e-9);
  assert.ok(phone.halfWidth>=10&&phone.halfWidth<=12);assert.ok(Math.abs(phone.halfWidth/phone.halfHeight-390/844)<1e-9);
});
