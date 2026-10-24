import * as THREE from 'three';
import skin from './lunaSkin.json' with {type:'json'};

// Geometry and weights are generated alongside the editable Blender armature.
export function createLunaDragon(color='#e8efff'){
 const root=new THREE.Group();root.name='Luna Frostwing baby dragon';root.userData.petType='babyDragon';root.userData.generated=true;root.userData.source='Meshy_AI_Luna_Frostwing_1024093329_texture.fbx';root.scale.setScalar(4.1);
 const geometry=new THREE.BufferGeometry();
 for(const [name,data,size,Type] of [['position',skin.position,3,Float32Array],['normal',skin.normal,3,Float32Array],['uv',skin.uv,2,Float32Array],['skinIndex',skin.skinIndex,4,Uint16Array],['skinWeight',skin.skinWeight,4,Float32Array]])geometry.setAttribute(name,new THREE.BufferAttribute(new Type(data),size));
 geometry.setIndex(skin.index);geometry.computeBoundingSphere();
 const material=new THREE.MeshStandardMaterial({color,roughness:.65});
 if(typeof document!=='undefined'){
  const loader=new THREE.TextureLoader();
  for(const [slot,file] of [['map','luna'],['normalMap','luna_normal'],['roughnessMap','luna_roughness'],['metalnessMap','luna_metallic']]){
   const texture=loader.load('/models/luna/'+file+'.png');texture.flipY=true;if(slot==='map')texture.colorSpace=THREE.SRGBColorSpace;material[slot]=texture;
  }
  material.metalness=1;
 }
 const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name='coat';mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
 const bones=skin.bones.map(def=>{const b=new THREE.Bone();b.name=def.name;return b;});
 skin.bones.forEach((def,i)=>{const p=def.parent;bones[i].position.fromArray(def.position);if(p>=0){bones[i].position.sub(new THREE.Vector3().fromArray(skin.bones[p].position));bones[p].add(bones[i]);}else mesh.add(bones[i]);});
 root.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton(bones));
 const rig=Object.fromEntries(bones.map(b=>[b.name,b]));rig.wing_L.name='dragon wing';root.userData.rig='Luna 16 bone spatial skin';
 const hearts=new THREE.Group();hearts.name='affection';hearts.visible=false;root.add(hearts);
 const shape=new THREE.Shape();shape.moveTo(0,-.04);shape.bezierCurveTo(-.10,.02,-.055,.09,0,.045);shape.bezierCurveTo(.055,.09,.10,.02,0,-.04);
 for(const x of [-.10,.10]){const heart=new THREE.Mesh(new THREE.ShapeGeometry(shape,16),new THREE.MeshStandardMaterial({color:'#f297b6',side:THREE.DoubleSide}));heart.position.set(x,1.04,0);hearts.add(heart);}
 let interaction=null,progress=0;
 return {root,rig,setInteraction:value=>{interaction=value;},runMotion:{update(time,moving,reduced=false){
  bones.forEach(b=>b.rotation.set(0,0,0));
  const stride=moving&&!reduced?Math.sin(time*12)*.28:0;
  for(const [s,sign] of [['L',1],['R',-1]]){
   rig['front_'+s].rotation.x=stride*sign;rig['hind_'+s].rotation.x=-stride*sign-.35*progress;
   rig['hind_paw_'+s].rotation.x=.25*progress;
   rig['wing_'+s].rotation.z=reduced?0:Math.sin(time*(moving?7:2.4))*.07*sign;
   rig['wing_tip_'+s].rotation.z=reduced?0:Math.sin(time*2.4-.5)*.04*sign;
  }
  rig.tail.rotation.y=reduced?0:Math.sin(time*3)*.12;rig.tail_tip.rotation.y=reduced?0:Math.sin(time*3-.6)*.16;
  const happy=interaction?.kind==='pet'&&Date.now()<interaction.until;
  rig.head.rotation.z=happy?.10:reduced?0:Math.sin(time*1.7)*.018;
  hearts.visible=!!happy;hearts.position.y=reduced?0:Math.sin(time*3)*.04;
  rig.body.rotation.x=-.08*progress;
  return moving&&!reduced?Math.abs(stride)*.025:0;
 }},sitMotion:{get active(){return progress>0;},update(dt,seated,height=.58,reduced=false){progress=reduced?Number(seated):THREE.MathUtils.clamp(progress+(seated?1:-1)*dt*4,0,1);rig.body.position.y=.26-.055*progress;rig.body.rotation.x=-.08*progress;return(height-.39)*progress;}}};
}


