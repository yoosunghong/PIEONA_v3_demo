// Shared procedural run cycle used by Cloud Run and village characters.
export function createRunMotion(avatar){
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
