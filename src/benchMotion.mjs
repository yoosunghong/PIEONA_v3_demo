import {Vector3,Quaternion,MathUtils} from 'three';

// Aim in avatar space rather than assuming identical local bone axes across the four FBXs.
export function createSitMotion(avatar){
  const bones=[];
  avatar.traverse(bone=>{if(bone.isBone)bones.push({bone,rest:bone.quaternion.clone(),position:bone.position.clone()});});
  const originalPosition=avatar.position.clone(),worldQ=new Quaternion(),parentQ=new Quaternion();
  const find=name=>bones.find(({bone})=>bone.name.toLowerCase().endsWith(name.toLowerCase()))?.bone;
  function aim(name,childName,direction){
    const bone=find(name),child=find(childName);if(!bone||!child)return;
    avatar.updateWorldMatrix(true,true);
    const from=child.getWorldPosition(new Vector3()).sub(bone.getWorldPosition(new Vector3())).normalize();
    const to=new Vector3(...direction).normalize().applyQuaternion(avatar.getWorldQuaternion(new Quaternion()));
    const delta=new Quaternion().setFromUnitVectors(from,to);
    bone.getWorldQuaternion(worldQ);bone.parent.getWorldQuaternion(parentQ);
    bone.quaternion.copy(parentQ.invert().multiply(delta).multiply(worldQ));
  }
  aim('Hips','Spine',[0,1,.05]);
  for(const [name,child] of [['Spine','Spine1'],['Spine1','Spine2'],['Spine2','Neck'],['Neck','Head'],['Head','HeadTop_End']])aim(name,child,[0,1,0]);
  for(const [side,sign] of [['Left',1],['Right',-1]]){
    aim(side+'UpLeg',side+'Leg',[sign*.12,-.06,1]);
    aim(side+'Leg',side+'Foot',[0,-1,.04]);
    aim(side+'Foot',side+'ToeBase',[0,-.15,1]);
    aim(side+'Arm',side+'ForeArm',[sign*.18,-1,.25]);
    aim(side+'ForeArm',side+'Hand',[0,-.55,1]);
  }
  avatar.updateWorldMatrix(true,true);
  const hip=find('Hips');
  const pelvis=hip?avatar.parent.worldToLocal(hip.getWorldPosition(new Vector3())):new Vector3(0,.8,0);
  // Undo the parent's rotation: the offsets belong to the avatar's local ground plane.
  const seatedPosition=originalPosition.clone().add(new Vector3(-pelvis.x,0,-pelvis.z));
  for(const part of bones){part.seated=part.bone.quaternion.clone();part.bone.quaternion.copy(part.rest);}
  let progress=0,start=bones.map(part=>part.rest.clone());
  return {
    get active(){return progress>0;},
    get blend(){return progress*progress*(3-2*progress);},
    update(dt,seated,height=.68,reducedMotion=false){
      if(seated&&progress===0)start=bones.map(part=>part.bone.quaternion.clone());
      progress=reducedMotion?Number(seated):MathUtils.clamp(progress+(seated?1:-1)*dt/.75,0,1);
      const blend=this.blend;
      bones.forEach((part,index)=>{part.bone.position.copy(part.position);part.bone.quaternion.slerpQuaternions(start[index],part.seated,blend);});
      avatar.position.lerpVectors(originalPosition,seatedPosition,blend);
      return (height+.09-pelvis.y-.39)*blend;
    }
  };
}
