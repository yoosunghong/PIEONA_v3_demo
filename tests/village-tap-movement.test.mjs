import test from 'node:test';
import assert from 'node:assert/strict';
import {createVillageTapGesture,villageTapDestination,villageTapStep} from '../src/villageTapMovement.mjs';
import {WALK_RADIUS} from '../shared/villageSize.mjs';

const pointer=(x=100,y=100,id=1)=>({clientX:x,clientY:y,pointerId:id,button:0});

test('single taps work but camera drags, pinches and cancelled touches never issue walks',()=>{
  const gesture=createVillageTapGesture();
  gesture.down(pointer());assert.equal(gesture.up(pointer(102,102)),true);
  gesture.down(pointer());gesture.move(pointer(130,100));gesture.move(pointer());assert.equal(gesture.up(pointer()),false);
  gesture.down(pointer());gesture.down(pointer(200,200,2));assert.equal(gesture.up(pointer()),false);assert.equal(gesture.up(pointer(200,200,2)),false);
  gesture.down(pointer());gesture.cancel(pointer());assert.equal(gesture.up(pointer()),false);
  gesture.down(pointer());gesture.reset();assert.equal(gesture.up(pointer()),false);
  gesture.down(pointer());assert.equal(gesture.up(pointer()),true);
});

test('off-island and invalid taps are rejected instead of moving toward the sea',()=>{
  assert.deepEqual(villageTapDestination({x:1.125,z:-2.375}),{x:1.125,z:-2.375});
  assert.deepEqual(villageTapDestination({x:WALK_RADIUS,z:0}),{x:WALK_RADIUS,z:0});
  for(const point of [null,{x:WALK_RADIUS+.01,z:0},{x:NaN,z:0},{x:0,z:Infinity}])assert.equal(villageTapDestination(point),null);
});

test('walks use real speed, accept a changed destination, and stop exactly without overshoot',()=>{
  const target={x:3,z:4};let point={x:0,z:0};
  let next=villageTapStep(point,target,3.2,.1);
  assert.ok(Math.abs(Math.hypot(next.x,next.z)-.32)<1e-10);assert.equal(next.arrived,false);
  assert.ok(Math.abs(next.rotation-Math.atan2(3,4))<1e-10);
  next=villageTapStep(next,{x:-2,z:1},3.2,10);assert.equal(next.arrived,true);assert.equal(next.x,-2);assert.equal(next.z,1);
  for(let i=0;i<100;i++){const result=villageTapStep(point,target,3.2,.1);point=result;if(result.arrived)break;}
  assert.equal(point.arrived,true);assert.equal(point.x,3);assert.equal(point.z,4);
  assert.deepEqual(villageTapStep({x:0,z:0},target,3.2,0),{x:0,z:0,rotation:Math.atan2(3,4),arrived:false});
});
