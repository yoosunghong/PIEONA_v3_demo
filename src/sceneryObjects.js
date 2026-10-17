import * as THREE from 'three';
import {sceneryDefinitions} from '../shared/scenery.mjs';

export function registerScenery(world,roots,id,objects,x,z){
  const root=new THREE.Group();root.position.set(x,0,z);world.add(root);world.updateMatrixWorld(true);
  for(const object of objects)root.attach(object);
  root.userData.itemId='scenery:'+id;roots.set(root.userData.itemId,root);return root;
}

export function registerGardenDetails(world,roots,details){
  world.add(details);world.updateMatrixWorld(true);
  for(const part of [...details.children]){
    const id=part.userData.sceneryId,definition=sceneryDefinitions.find(item=>item.id===id);
    if(!definition)throw new Error('Unknown scenery: '+id);
    const existing=roots.get('scenery:'+id);
    if(existing)existing.attach(part);
    else registerScenery(world,roots,id,[part],definition.x,definition.z);
  }
}
