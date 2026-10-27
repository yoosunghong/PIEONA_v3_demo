import {WALK_RADIUS} from '../shared/villageSize.mjs';
import * as THREE from 'three';
import {villageThemes} from '../shared/world.mjs';

export const CAMERA_TRANSITION_SECONDS=1.1;
// Bound horizontal travel to the island and allow a little vertical framing.
export const VILLAGE_CAMERA_PAN_RADIUS=WALK_RADIUS;
export const VILLAGE_CAMERA_PAN_HEIGHT=.8;
const canPanScene=(mode,portrait)=>!portrait&&(mode==='home'||mode==='village');
export function configureScenePanning(controls,mode,{portrait=false}={}){
  controls.enablePan=canPanScene(mode,portrait)||mode==='edit';
  controls.screenSpacePanning=true;
  controls.maxTargetRadius=Infinity;
  controls.mouseButtons.RIGHT=mode==='edit'?THREE.MOUSE.ROTATE:THREE.MOUSE.PAN;
}
export function constrainScenePanning(camera,controls,mode,options={}){
  if(!canPanScene(mode,options.portrait))return;
  const target=controls.target,center=options.panCenter||[0,sceneView(mode,options).target[1],0];
  const radius=Math.hypot(target.x-center[0],target.z-center[2]);
  const scale=radius>VILLAGE_CAMERA_PAN_RADIUS?VILLAGE_CAMERA_PAN_RADIUS/radius:1;
  const centerY=center[1];
  const y=THREE.MathUtils.clamp(target.y,centerY-VILLAGE_CAMERA_PAN_HEIGHT,centerY+VILLAGE_CAMERA_PAN_HEIGHT);
  const dx=center[0]+(target.x-center[0])*scale-target.x,dy=y-target.y,dz=center[2]+(target.z-center[2])*scale-target.z;
  if(!dx&&!dy&&!dz)return;
  target.set(target.x+dx,y,target.z+dz);
  // Translate both ends together so hitting a limit never changes the viewing angle or zoom.
  camera.position.x+=dx;camera.position.y+=dy;camera.position.z+=dz;
  camera.updateMatrixWorld();
}
export const sceneMood=id=>villageThemes.find(theme=>theme.id===id)||villageThemes[0];
export function sceneView(mode,{portrait=false,petPreview=false,dragonRide=false,mood='default'}={}){
  if(mode==='topic')return{position:[0,4.3,10],target:[0,1.8,0]};
  if(mode==='edit')return{position:[1,17,12.5],target:[0,.1,0]};
  if(mode==='village')return{position:[11,17,14],target:[0,0,0]};
  if(portrait&&dragonRide)return{position:[4.5,4.1,8.5],target:[0,3.1,0]};
  if(portrait)return petPreview?{position:[0,1.15,3.4],target:[0,.9,0]}:{position:[0,1.65,5.4],target:[0,1.65,0]};
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

// Take a single position snapshot; a moving owner never drags the chat camera.
export function avatarChatView({x=0,y=.39,z=0}={},rotation=0){return {position:[x+Math.sin(rotation)*5.4,y+1.65,z+Math.cos(rotation)*5.4],target:[x,y+1.65,z]};}
