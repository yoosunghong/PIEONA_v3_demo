import {WALK_RADIUS} from './villageSize.mjs';

// A dead zone prevents circling at rest; acceleration and turn easing prevent snapping.
export function petFollowStep(pet,player,dt){
  dt=Math.max(0,Math.min(.25,dt));
  const angle=player.rotation||0;
  let x=player.x-Math.sin(angle)*1.05+Math.cos(angle)*.5,z=player.z-Math.cos(angle)*1.05-Math.sin(angle)*.5;
  const radius=Math.hypot(x,z);if(radius>WALK_RADIUS-.2){x*= (WALK_RADIUS-.2)/radius;z*= (WALK_RADIUS-.2)/radius;}
  const dx=x-pet.x,dz=z-pet.z,distance=Math.hypot(dx,dz);
  const moving=distance>(pet.moving?.22:.65);
  const speed=moving?Math.min(4.2,Math.max(.5,distance*2)):0;
  const velocity=(pet.velocity||0)+(speed-(pet.velocity||0))*(1-Math.exp(-dt*7));
  const step=moving?Math.min(distance,velocity*dt):0;
  const desired=step?Math.atan2(dx,dz):pet.rotation||0;
  const turn=Math.atan2(Math.sin(desired-(pet.rotation||0)),Math.cos(desired-(pet.rotation||0)));
  return {x:pet.x+(distance?dx/distance*step:0),z:pet.z+(distance?dz/distance*step:0),rotation:(pet.rotation||0)+turn*(1-Math.exp(-dt*9)),moving,velocity,activityState:moving?'Following':'Idle'};
}
