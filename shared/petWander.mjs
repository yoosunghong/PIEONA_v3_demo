import {WALK_RADIUS} from './villageSize.mjs';
export function petWanderStep(pet,dt){
  const target=pet.destination;
  if(!target)return {moving:false,activityState:'Idle'};
  const dx=target.x-pet.x,dz=target.z-pet.z,distance=Math.hypot(dx,dz);
  if(distance<.15)return {moving:false,destination:null,activityState:'Idle'};
  const step=Math.min(distance,Math.max(0,Math.min(dt,.25))*1.7);
  const x=pet.x+dx/distance*step,z=pet.z+dz/distance*step;
  const radius=Math.hypot(x,z),scale=radius>WALK_RADIUS?WALK_RADIUS/radius:1;
  return {x:x*scale,z:z*scale,rotation:Math.atan2(dx,dz),moving:true,activityState:'Wandering'};
}
