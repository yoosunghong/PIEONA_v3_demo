import {INTERACTION_REACH} from '../shared/life.mjs';

export const isClickFacility=id=>id==='storage'||id==='kitchen'||id?.startsWith('garden:');

// Stop beside the facility instead of walking into its model. Clamp the last
// step so slow frames cannot overshoot and oscillate around the destination.
export function facilityStep(position,target,speed,dt){
  const dx=target.x-position.x,dz=target.z-position.z,distance=Math.hypot(dx,dz);
  const remaining=Math.max(0,distance-INTERACTION_REACH*.7);
  const step=Math.min(remaining,Math.max(0,speed*dt));
  return {x:position.x+(distance?dx/distance*step:0),z:position.z+(distance?dz/distance*step:0),rotation:Math.atan2(dx,dz),arrived:remaining<=step+.001};
}
