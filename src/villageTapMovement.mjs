import {WALK_RADIUS} from '../shared/villageSize.mjs';

// A drag that returns to its starting point and either finger of a pinch must
// never become a walk command when the fingers lift.
export function createVillageTapGesture(tolerance=6){
  const pointers=new Set();let candidate=null;
  return {
    down(event){
      pointers.add(event.pointerId);
      candidate=pointers.size===1&&event.button===0?{id:event.pointerId,x:event.clientX,y:event.clientY}:null;
    },
    move(event){if(candidate?.id===event.pointerId&&Math.hypot(event.clientX-candidate.x,event.clientY-candidate.y)>tolerance)candidate=null;},
    up(event){
      const tapped=candidate?.id===event.pointerId&&Math.hypot(event.clientX-candidate.x,event.clientY-candidate.y)<=tolerance;
      pointers.delete(event.pointerId);candidate=null;return !!tapped;
    },
    cancel(event){pointers.delete(event.pointerId);candidate=null;},
    reset(){pointers.clear();candidate=null;}
  };
}

export function villageTapDestination(point){
  return point&&Number.isFinite(point.x)&&Number.isFinite(point.z)&&Math.hypot(point.x,point.z)<=WALK_RADIUS?{x:point.x,z:point.z}:null;
}

export function villageTapStep(position,target,speed,dt){
  const dx=target.x-position.x,dz=target.z-position.z,distance=Math.hypot(dx,dz);
  const step=Math.min(distance,Math.max(0,speed*dt));
  return {x:position.x+(distance?dx/distance*step:0),z:position.z+(distance?dz/distance*step:0),rotation:Math.atan2(dx,dz),arrived:distance<=step+.001};
}
