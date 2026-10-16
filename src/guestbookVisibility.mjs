import * as THREE from 'three';
import {GUESTBOOK_ID} from '../shared/guestbook.mjs';

// Find foreground scenery covering the book; only suppress it during the focused draw.
export function guestbookOccluders(world,camera,book){
  world.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),ray=new THREE.Raycaster(),hidden=new Set();
  ray.camera=camera; // Name tags are sprites and require a camera for raycasting.
  for(const x of [-.75,0,.75])for(const y of [-.35,0,.35]){
    const point=new THREE.Vector3(book.x,1.5+y,book.z).addScaledVector(right,x),direction=point.sub(camera.position);
    ray.set(camera.position,direction.clone().normalize());ray.far=Math.max(0,direction.length()-.25);
    for(const hit of ray.intersectObjects(world.children,true)){
      let object=hit.object;
      while(object.parent&&object.parent!==world&&!object.userData.itemId)object=object.parent;
      if(object.visible&&object.userData.itemId!==GUESTBOOK_ID)hidden.add(object);
    }
  }
  return [...hidden];
}
