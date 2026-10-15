import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {villageThemes} from '../shared/world.mjs';
import {sceneMood,sceneView,cameraPose,startCameraTransition,advanceCameraTransition} from '../src/sceneCamera.mjs';

function rig(){const camera=new THREE.PerspectiveCamera(),controls={target:new THREE.Vector3(1,1.6,-2)};camera.position.set(-6,5,11);return{camera,controls};}
test('home to editing travels continuously from the actual orbited camera and returns exactly',()=>{
  const {camera,controls}=rig(),original=cameraPose(camera,controls),view=sceneView('edit');
  const transition=startCameraTransition(camera,controls,view);
  assert.deepEqual(cameraPose(camera,controls),original);
  assert.equal(advanceCameraTransition(transition,camera,controls,0),false);
  assert.deepEqual(cameraPose(camera,controls),original);
  advanceCameraTransition(transition,camera,controls,.1);
  assert.ok(camera.position.distanceTo(transition.from)>0);
  assert.ok(camera.position.distanceTo(transition.from)<.1);
  advanceCameraTransition(transition,camera,controls,.45);
  assert.ok(camera.position.distanceTo(transition.from.clone().lerp(transition.to,.5))<1e-10);
  assert.equal(advanceCameraTransition(transition,camera,controls,1),true);
  assert.deepEqual(cameraPose(camera,controls),view);
  const returning=startCameraTransition(camera,controls,original);
  assert.equal(advanceCameraTransition(returning,camera,controls,2),true);
  assert.deepEqual(cameraPose(camera,controls),original);
});
test('interrupted and reversed camera travel starts at the current view without snapping',()=>{
  const {camera,controls}=rig(),original=cameraPose(camera,controls);
  const entering=startCameraTransition(camera,controls,sceneView('edit'));
  advanceCameraTransition(entering,camera,controls,.4);
  const midway=cameraPose(camera,controls),returning=startCameraTransition(camera,controls,original);
  advanceCameraTransition(returning,camera,controls,0);
  assert.deepEqual(cameraPose(camera,controls),midway);
  advanceCameraTransition(returning,camera,controls,1.1);
  assert.deepEqual(cameraPose(camera,controls),original);
});
test('reduced motion applies the destination directly; every village theme retains its original lighting',()=>{
  const {camera,controls}=rig(),view=sceneView('edit');
  assert.equal(advanceCameraTransition(startCameraTransition(camera,controls,view,0),camera,controls,0),true);
  assert.deepEqual(cameraPose(camera,controls),view);
  for(const theme of villageThemes){
    assert.equal(sceneMood(theme.id),theme);
    assert.deepEqual(sceneView('edit',{mood:theme.id}),view);
  }
  assert.equal(sceneMood('unknown'),villageThemes[0]);
  assert.deepEqual(sceneView('home',{mood:'cafe'}),{position:[1,4.5,9],target:[-1.9,1,0]});
});
