import {Vector3} from 'three';

const forward=new Vector3(),right=new Vector3();

const movementKeys=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);

export function villageMovementKey(event){
  if(event.defaultPrevented||event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return null;
  if(event.target?.isContentEditable||event.target?.closest?.('input,textarea,select,[role="textbox"]'))return null;
  const key=(event.code?.startsWith('Key')?event.code.slice(3):event.key).toLowerCase();
  return movementKeys.has(key)?key:null;
}

// The owner's local walk must not depend on the room connection being ready.
export function villagePlayers(members,ownerId,viewerId,nickname,appearance){
  if(!viewerId||ownerId!==viewerId||members.some(member=>member.userId===viewerId))return members;
  return [...members,{userId:viewerId,nickname,appearance,x:0,z:3}];
}

// Map input onto the ground relative to the current camera, including after orbiting.
export function showVillageStandIn(mode,ownerId,members,viewerId){
  return (mode!=='village'&&ownerId!==viewerId)||!members.some(member=>member.userId===ownerId);
}

export function joystickAxis(x,y,radius=44){
  const length=Math.hypot(x,y);
  if(length<radius*.15)return {x:0,y:0};
  const scale=1/Math.max(radius,length);
  return {x:x*scale,y:y*scale};
}

export function villageDirection(keys,camera,target=new Vector3(),stick={x:0,y:0}){
  const x=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'))+stick.x;
  const z=Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'))+stick.y;
  camera.getWorldDirection(forward);forward.y=0;forward.normalize();
  right.set(-forward.z,0,forward.x);
  target.copy(right).multiplyScalar(x).addScaledVector(forward,-z);
  return target.lengthSq()>1?target.normalize():target;
}
