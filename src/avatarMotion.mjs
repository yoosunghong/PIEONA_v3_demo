import {AnimationMixer} from 'three';

// The village walks; running games use the supplied running cycle.
export function createRunMotion(avatar,{clip='Running',idle=true}={}){
  const movement=avatar.animations?.find(action=>action.name===clip);
  if(movement){
    const mixer=new AnimationMixer(avatar),move=mixer.clipAction(movement);
    const rest=idle&&avatar.animations.find(action=>action.name==='Mirror_Viewing');
    const wait=rest?mixer.clipAction(rest):null;
    let current=null,started=0,lastTime=0;
    return {update(time,moving,reducedMotion=false){
      const next=moving?move:wait;
      if(next!==current){mixer.stopAllAction();current=next;started=time;current?.reset().play();}
      // Callers pass elapsed time rather than dt. A zero-time idle call also
      // releases all tracks before sitting/riding or an external idle mixer.
      if(!moving&&time===0){mixer.stopAllAction();current=null;return 0;}
      if(time<lastTime)started=time;
      lastTime=time;
      if(current)mixer.setTime(reducedMotion?0:Math.max(0,time-started));
      return 0;
    }};
  }
  // Small generated stand-ins may not have authored animation clips.
  const legs=[],arms=[];
  avatar.traverse(bone=>{
    if(!bone.isBone)return;
    const part={bone,rotation:bone.rotation.clone(),sign:/left|\.l|_l|l_/i.test(bone.name)?1:-1};
    if(/thigh|upleg|upperleg/i.test(bone.name))legs.push(part);
    if(/upperarm|arm$/i.test(bone.name)&&!/fore|lower/i.test(bone.name))arms.push(part);
  });
  return {
    update(time,moving){
      const stride=moving?Math.sin(time*18):0;
      for(const {bone,rotation,sign} of legs){bone.rotation.copy(rotation);bone.rotation.x+=stride*.7*sign;}
      for(const {bone,rotation,sign} of arms){bone.rotation.copy(rotation);bone.rotation.x-=stride*.55*sign;}
      return moving?Math.abs(stride)*.09:0;
    }
  };
}
