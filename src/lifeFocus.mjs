import {villageLife} from '../shared/lifeLayout.mjs';
import * as THREE from 'three';

export const isLifeFocus=mode=>['storage','garden','kitchen'].includes(mode);
export function lifeFocusView(mode,objectId,aspect=1,village={}){
  const {storage:STORAGE,beds:GARDEN_BEDS,kitchen:KITCHEN}=villageLife(village);
  const object=mode==='storage'?STORAGE:mode==='kitchen'?KITCHEN:GARDEN_BEDS.find(bed=>bed.id===objectId)||GARDEN_BEDS[1];
  const distance=Math.max(1,Math.min(2.4,.95/Math.max(.1,aspect)));
  const target=[object.x,mode==='kitchen'?.85:.55,object.z];
  return {position:[object.x+2.5*distance,target[1]+2.9*distance,object.z+4.1*distance],target};
}

export function lifePanelTabs(context,discovered,total){
  if(context==='storage')return [['storage','보관함'],['collection',`도감 ${discovered}/${total}`]];
  if(context==='garden')return [['garden','텃밭']];
  if(context==='kitchen')return [['kitchen','요리']];
  return [['autonomy','AI 생활'],['memories','우리의 추억']];
}

// Suppress foreground scenery only while drawing the focused content.
export function lifeFocusOccluders(world,camera,target,lifeRoot,objectId){
  world.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),ray=new THREE.Raycaster(),hidden=new Set();
  ray.camera=camera;
  for(const x of [-.85,0,.85])for(const y of [-.4,0,.5]){
    const point=new THREE.Vector3(...target).addScaledVector(right,x);point.y+=y;
    const direction=point.sub(camera.position);ray.set(camera.position,direction.clone().normalize());ray.far=Math.max(0,direction.length()-.2);
    for(const hit of ray.intersectObjects(world.children,true)){
      let object=hit.object,selected=false;
      for(let ancestor=object;ancestor;ancestor=ancestor.parent)if(objectId&&ancestor.userData.action===objectId){selected=true;break;}
      if(selected)continue;
      while(object.parent&&object.parent!==world&&object.parent!==lifeRoot&&!object.userData.itemId&&!object.userData.action)object=object.parent;
      if(object===lifeRoot||object.parent===lifeRoot&&!object.userData.action)continue;
      if(object.visible)hidden.add(object);
    }
  }
  return [...hidden];
}
