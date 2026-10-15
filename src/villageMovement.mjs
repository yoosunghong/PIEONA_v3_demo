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
export function villageDirection(keys,camera,target=new Vector3()){
  const x=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
  const z=Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'));
  camera.getWorldDirection(forward);forward.y=0;forward.normalize();
  right.set(-forward.z,0,forward.x);
  return target.copy(right).multiplyScalar(x).addScaledVector(forward,-z).normalize();
}
