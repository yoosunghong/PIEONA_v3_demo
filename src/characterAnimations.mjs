// Keep animation on the skeleton: exported object transforms must not overwrite
// the scale/grounding applied by each game scene.
export function prepareCharacterAnimations(avatar){
  const bones=new Map();avatar.traverse(bone=>{if(bone.isBone)bones.set(bone.name,bone);});
  const order=['Mirror_Viewing','Walking','Running'];
  avatar.animations=order.map(name=>{
    const source=avatar.animations.find(clip=>clip.name===name);
    if(!source)throw new Error(`Missing character animation: ${name}`);
    const clip=source.clone();
    clip.tracks=clip.tracks.filter(track=>bones.has(track.name.split('.')[0]));
    for(const track of clip.tracks){
      const bone=bones.get(track.name.split('.')[0]);
      if(track.name.endsWith('Hips.position')){
        // Locomotion is controlled by gameplay; keep vertical hip movement only.
        for(let i=0;i<track.values.length;i+=3){track.values[i]=bone.position.x;track.values[i+2]=bone.position.z;}
      }
    }
    return clip;
  });
  return avatar;
}
