import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {villageThemes} from '../shared/world.mjs';
import {sceneMood,sceneView,cameraPose,startCameraTransition,advanceCameraTransition,configureScenePanning,VILLAGE_CAMERA_PAN_RADIUS} from '../src/sceneCamera.mjs';

function rig(){const camera=new THREE.PerspectiveCamera(),controls={target:new THREE.Vector3(1,1.6,-2)};camera.position.set(-6,5,11);return{camera,controls};}
function villageRig(){
  const canvas=new EventTarget(),document=new EventTarget();
  Object.assign(canvas,{style:{},clientWidth:1000,clientHeight:800,getRootNode:()=>document,setPointerCapture(){},releasePointerCapture(){}});
  const camera=new THREE.PerspectiveCamera(38,1.25,.1,120);camera.position.set(...sceneView('village').position);
  const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;configureScenePanning(controls,'village');
  function drag(dx,dy,button=2){
    for(const [type,x,y] of [['pointerdown',400,300],['pointermove',400+dx,300+dy],['pointerup',400+dx,300+dy]]){
      const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:1,pointerType:'mouse',button,clientX:x,clientY:y,pageX:x,pageY:y});canvas.dispatchEvent(event);
    }
  }
  return{canvas,camera,controls,drag};
}
test('right drag pans along the village ground while preserving view direction and zoom',()=>{
  const {canvas,camera,controls,drag}=villageRig(),offset=camera.position.clone().sub(controls.target),rotation=camera.quaternion.clone();
  drag(120,80);for(let i=0;i<180;i++)controls.update();
  assert.ok(controls.target.length()>.1);
  assert.ok(Math.abs(controls.target.y)<1e-10);
  assert.ok(camera.position.clone().sub(controls.target).distanceTo(offset)<1e-10);
  assert.ok(camera.quaternion.angleTo(rotation)<1e-7);
  const context=new Event('contextmenu',{cancelable:true});canvas.dispatchEvent(context);assert.equal(context.defaultPrevented,true);
  controls.dispose();
});
test('large drags and remaining damping stay within the circular village limit in every direction',()=>{
  for(const [dx,dy] of [[100000,0],[-100000,0],[0,100000],[0,-100000],[100000,-100000]]){
    const {camera,controls,drag}=villageRig(),distance=camera.position.distanceTo(controls.target);
    drag(dx,dy);
    for(let i=0;i<240;i++){
      controls.update();
      assert.ok(controls.target.length()<=VILLAGE_CAMERA_PAN_RADIUS+1e-10);
      assert.ok(Math.abs(camera.position.distanceTo(controls.target)-distance)<1e-10);
    }
    assert.ok(Math.abs(controls.target.length()-VILLAGE_CAMERA_PAN_RADIUS)<1e-8);
    const edge=controls.target.clone();drag(-dx/1000,-dy/1000);for(let i=0;i<240;i++)controls.update();
    assert.ok(controls.target.distanceTo(edge)>.01,'can drag back inward after reaching the boundary');
    controls.dispose();
  }
});
test('left drag still rotates and switching modes restores their existing camera controls',()=>{
  const {camera,controls,drag}=villageRig(),rotation=camera.quaternion.clone();
  drag(100,30,0);for(let i=0;i<240;i++)controls.update();
  assert.ok(camera.quaternion.angleTo(rotation)>.1);assert.ok(controls.target.length()<1e-10);
  controls.enableDamping=false;controls.update();controls.enableDamping=true;
  configureScenePanning(controls,'home');const original=camera.position.clone();drag(100,100);controls.update();
  assert.ok(camera.position.distanceTo(original)<1e-10);assert.ok(controls.target.length()<1e-10);
  configureScenePanning(controls,'edit');const beforeEdit=camera.quaternion.clone();drag(100,0);controls.update();assert.ok(camera.quaternion.angleTo(beforeEdit)>.01);
  assert.equal(controls.maxTargetRadius,Infinity);assert.equal(controls.screenSpacePanning,true);
  controls.dispose();
});
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
