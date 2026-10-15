import {Vector3} from 'three';

const forward=new Vector3(),right=new Vector3();

// Map input onto the ground relative to the current camera, including after orbiting.
export function villageDirection(keys,camera,target=new Vector3()){
  const x=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
  const z=Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'));
  camera.getWorldDirection(forward);forward.y=0;forward.normalize();
  right.set(-forward.z,0,forward.x);
  return target.copy(right).multiplyScalar(x).addScaledVector(forward,-z).normalize();
}
