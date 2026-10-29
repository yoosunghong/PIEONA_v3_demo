import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {villageThemes} from '../shared/world.mjs';
import {sceneMood,sceneView,avatarChatView,cameraPose,startCameraTransition,advanceCameraTransition,configureScenePanning,constrainScenePanning,VILLAGE_CAMERA_PAN_RADIUS,VILLAGE_CAMERA_PAN_HEIGHT} from '../src/sceneCamera.mjs';

test('chat camera faces the avatar at face height from its current position and rotation',()=>{
  for(const rotation of [0,Math.PI/2,Math.PI,-Math.PI/2,.55]){
    const position=new THREE.Vector3(-3,.39,4),view=avatarChatView(position,rotation);
    const offset=new THREE.Vector3(...view.position).sub(new THREE.Vector3(...view.target));
    const forward=new THREE.Vector3(Math.sin(rotation),0,Math.cos(rotation));
    assert.ok(offset.clone().normalize().distanceTo(forward)<1e-10);
    assert.ok(Math.abs(offset.length()-5.4)<1e-10);
    assert.deepEqual(view.target,[-3,2.04,4]);
    position.x=10;
    assert.equal(view.target[0],-3,'opening captures the position instead of following movement');
  }
});

function rig(){const camera=new THREE.PerspectiveCamera(),controls={target:new THREE.Vector3(1,1.6,-2)};camera.position.set(-6,5,11);return{camera,controls};}
function villageRig(initialMode='village',options={}){
  const canvas=new EventTarget(),document=new EventTarget();
  Object.assign(canvas,{style:{},clientWidth:1000,clientHeight:800,getRootNode:()=>document,setPointerCapture(){},releasePointerCapture(){}});
  let mode=initialMode;
  const camera=new THREE.PerspectiveCamera(38,1.25,.1,120),view=sceneView(mode,options);camera.position.set(...view.position);
  const controls=new OrbitControls(camera,canvas);controls.target.fromArray(view.target);controls.update();controls.enableDamping=true;configureScenePanning(controls,mode,options);
  controls.addEventListener('change',()=>constrainScenePanning(camera,controls,mode,options));
  function update(){controls.update();constrainScenePanning(camera,controls,mode,options);}
  function setMode(next){mode=next;configureScenePanning(controls,mode,options);}
  function drag(dx,dy,button=2){
    for(const [type,x,y] of [['pointerdown',400,300],['pointermove',400+dx,300+dy],['pointerup',400+dx,300+dy]]){
      const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:1,pointerType:'mouse',button,clientX:x,clientY:y,pageX:x,pageY:y});canvas.dispatchEvent(event);
    }
  }
  return{canvas,camera,controls,drag,setMode,update};
}
test('right drag moves horizontally and vertically in both own home and visited villages without changing angle or zoom',()=>{
  for(const mode of ['home','village']){
  const {canvas,camera,controls,drag,update}=villageRig(mode),initialTarget=controls.target.clone(),offset=camera.position.clone().sub(controls.target),rotation=camera.quaternion.clone();
  drag(120,80);for(let i=0;i<180;i++)update();
  assert.ok(Math.hypot(controls.target.x-initialTarget.x,controls.target.z-initialTarget.z)>.1,mode);
  assert.ok(Math.abs(controls.target.y-initialTarget.y)>.1,mode);
  assert.ok(camera.position.clone().sub(controls.target).distanceTo(offset)<1e-10);
  assert.ok(camera.quaternion.angleTo(rotation)<1e-7);
  const context=new Event('contextmenu',{cancelable:true});canvas.dispatchEvent(context);assert.equal(context.defaultPrevented,true);
  controls.dispose();
  }
});
test('large drags and remaining damping respect separate horizontal and vertical limits in both screens',()=>{
  for(const mode of ['home','village']){
  for(const [dx,dy] of [[100000,0],[-100000,0],[0,100000],[0,-100000],[100000,-100000]]){
    const {camera,controls,drag,update}=villageRig(mode),distance=camera.position.distanceTo(controls.target),centerY=sceneView(mode).target[1],rotation=camera.quaternion.clone();
    drag(dx,dy);
    for(let i=0;i<240;i++){
      update();
      assert.ok(Math.hypot(controls.target.x,controls.target.z)<=VILLAGE_CAMERA_PAN_RADIUS+1e-8);
      assert.ok(Math.abs(controls.target.y-centerY)<=VILLAGE_CAMERA_PAN_HEIGHT+1e-8);
      assert.ok(Math.abs(camera.position.distanceTo(controls.target)-distance)<1e-8);
      assert.ok(camera.quaternion.angleTo(rotation)<1e-6);
    }
    if(dy)assert.ok(Math.abs(Math.abs(controls.target.y-centerY)-VILLAGE_CAMERA_PAN_HEIGHT)<1e-8);
    const edge=controls.target.clone();drag(-dx/1000,-dy/1000);for(let i=0;i<240;i++)update();
    assert.ok(controls.target.distanceTo(edge)>.01,'can drag back inward after reaching the boundary');
    controls.dispose();
  }
  }
});
test('left drag still rotates and detail modes and editing retain their existing controls',()=>{
  const {camera,controls,drag,setMode}=villageRig(),rotation=camera.quaternion.clone();
  drag(100,30,0);for(let i=0;i<240;i++)controls.update();
  assert.ok(camera.quaternion.angleTo(rotation)>.1);assert.ok(controls.target.length()<1e-10);
  controls.enableDamping=false;controls.update();controls.enableDamping=true;
  for(const mode of ['topic','sign','guestbook']){
    setMode(mode);const original=camera.position.clone();drag(100,100);controls.update();
    assert.ok(camera.position.distanceTo(original)<1e-10);assert.ok(controls.target.length()<1e-10);
  }
  setMode('edit');const beforeEdit=camera.quaternion.clone();drag(100,0);controls.update();assert.ok(camera.quaternion.angleTo(beforeEdit)>.01);
  assert.equal(controls.maxTargetRadius,Infinity);assert.equal(controls.screenSpacePanning,true);
  controls.dispose();
});
test('portrait previews keep panning disabled and cafe framing uses its own height limit',()=>{
  const preview=villageRig('home',{portrait:true}),original=cameraPose(preview.camera,preview.controls);
  preview.drag(200,200);preview.controls.update();assert.deepEqual(cameraPose(preview.camera,preview.controls),original);preview.controls.dispose();
  const cafe=villageRig('home',{mood:'cafe'}),centerY=sceneView('home',{mood:'cafe'}).target[1];
  cafe.drag(0,100000);for(let i=0;i<240;i++)cafe.update();
  assert.ok(Math.abs(Math.abs(cafe.controls.target.y-centerY)-VILLAGE_CAMERA_PAN_HEIGHT)<1e-8);cafe.controls.dispose();
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
test('reduced motion applies directly; space themes retain their lighting and use the full star framing',()=>{
  const {camera,controls}=rig(),view=sceneView('edit');
  assert.equal(advanceCameraTransition(startCameraTransition(camera,controls,view,0),camera,controls,0),true);
  assert.deepEqual(cameraPose(camera,controls),view);
  for(const theme of villageThemes){
    assert.equal(sceneMood(theme.id),theme);
    assert.deepEqual(sceneView('edit',{mood:theme.id}),view);
  }
  assert.equal(sceneMood('unknown'),villageThemes[0]);
  assert.deepEqual(sceneView('home',{mood:'cafe'}),sceneView('home',{mood:'default'}));
});
