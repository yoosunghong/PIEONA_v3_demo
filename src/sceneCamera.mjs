import * as THREE from 'three';
import {villageThemes} from '../shared/world.mjs';

export const CAMERA_TRANSITION_SECONDS=1.1;
// Keep the camera's focus within the village's walkable island.
export const VILLAGE_CAMERA_PAN_RADIUS=5.8;
export function configureScenePanning(controls,mode){
  const village=mode==='village';
  controls.enablePan=village||mode==='edit';
  controls.screenSpacePanning=!village;
  controls.maxTargetRadius=village?VILLAGE_CAMERA_PAN_RADIUS:Infinity;
  controls.mouseButtons.RIGHT=mode==='edit'?THREE.MOUSE.ROTATE:THREE.MOUSE.PAN;
}
export const sceneMood=id=>villageThemes.find(theme=>theme.id===id)||villageThemes[0];
export function sceneView(mode,{portrait=false,mood='default'}={}){
  if(mode==='topic')return{position:[0,4.3,10],target:[0,1.8,0]};
  if(mode==='edit')return{position:[1,17,12.5],target:[0,.1,0]};
  if(mode==='village')return{position:[11,17,14],target:[0,0,0]};
  if(portrait)return{position:[0,1.65,5.4],target:[0,1.65,0]};
  if(mood==='cafe')return{position:[1,4.5,9],target:[-1.9,1,0]};
  return{position:[4.7,3.25,8],target:[0,1.45,0]};
}
export function cameraPose(camera,controls){return{position:camera.position.toArray(),target:controls.target.toArray()};}
export function startCameraTransition(camera,controls,view,duration=CAMERA_TRANSITION_SECONDS){
  return{from:camera.position.clone(),fromTarget:controls.target.clone(),to:new THREE.Vector3(...view.position),toTarget:new THREE.Vector3(...view.target),elapsed:0,duration};
}
export function advanceCameraTransition(transition,camera,controls,dt){
  transition.elapsed+=Math.max(0,dt);
  const progress=transition.duration>0?Math.min(1,transition.elapsed/transition.duration):1;
  if(progress===1){camera.position.copy(transition.to);controls.target.copy(transition.toTarget);return true;}
  const ease=progress<.5?4*progress**3:1-(-2*progress+2)**3/2;
  camera.position.lerpVectors(transition.from,transition.to,ease);
  controls.target.lerpVectors(transition.fromTarget,transition.toTarget,ease);
  return progress===1;
}
