import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {isFoldViewport,isFoldCoverViewport,villageFieldOfView} from '../src/foldViewport.mjs';
import {createSceneViewport} from '../src/sceneViewport.mjs';
import {sceneView} from '../src/sceneCamera.mjs';
import {VILLAGE_RADIUS} from '../shared/villageSize.mjs';

test('inner-display shapes get a fold layout in both orientations; phones and desktops retain theirs',()=>{
  for(const [w,h] of [[674,842],[690,829],[768,882],[853,707],[1008,840]])assert.equal(isFoldViewport(w,h),true,`${w}x${h}`);
  for(const [w,h] of [[344,882],[390,844],[740,390],[1280,720],[768,1024],[0,0],[NaN,700]])assert.equal(isFoldViewport(w,h),false,`${w}x${h}`);
  for(const [w,h] of [[344,882],[422,968]])assert.equal(isFoldCoverViewport(w,h),true);
  for(const [w,h] of [[390,844],[430,932],[674,842],[0,0]])assert.equal(isFoldCoverViewport(w,h),false);
});

test('unfolded village framing fits the whole island without changing camera pose or user zoom',()=>{
  const view=sceneView('village');
  for(const [w,h] of [[674,842],[690,829],[853,707],[344,882],[422,968]]){
    const camera=new THREE.PerspectiveCamera(villageFieldOfView(w,h),w/(h-114),.1,120);
    camera.position.fromArray(view.position);camera.lookAt(new THREE.Vector3(...view.target));camera.updateMatrixWorld();
    for(let i=0;i<72;i++){
      const angle=i*Math.PI/36,point=new THREE.Vector3(Math.cos(angle)*VILLAGE_RADIUS,.15,Math.sin(angle)*VILLAGE_RADIUS).project(camera);
      assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1,`${w}x${h}: island fits (${point.x}, ${point.y})`);
    }
    assert.deepEqual(camera.position.toArray(),view.position);assert.equal(camera.zoom,1);
  }
});

test('folding and opening detail views update projection without clearing or resizing an unchanged buffer',()=>{
  let size=[853,707],mode='village';const events=[];
  const camera=new THREE.PerspectiveCamera(38),renderer={setSize:()=>events.push('resize')};
  const viewport=createSceneViewport(renderer,camera,{getFieldOfView:()=>villageFieldOfView(...size,{mode})});
  viewport.resize(853,603);viewport.draw(()=>events.push('draw'));assert.equal(camera.fov,46);
  events.length=0;mode='guestbook';viewport.draw(()=>events.push('draw'));assert.equal(camera.fov,38);assert.deepEqual(events,['draw']);
  mode='village';viewport.draw(()=>{});assert.equal(camera.fov,46);
  size=[344,882];viewport.resize(344,768);viewport.draw(()=>{});assert.equal(camera.fov,villageFieldOfView(...size));assert.equal(camera.aspect,344/768);
  assert.equal(villageFieldOfView(390,844),38);
  assert.equal(villageFieldOfView(853,707,{portrait:true}),38);
  assert.equal(villageFieldOfView(853,707,{chatActive:true}),38);
});
