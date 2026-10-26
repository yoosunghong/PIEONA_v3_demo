import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import dog from './petModels/dog.json' with {type:'json'};
import cat from './petModels/cat.json' with {type:'json'};
import babyDragon from './petModels/babyDragon.json' with {type:'json'};

const definitions={dog,cat,babyDragon},templates=new Map();
const sources={dog:'Meshy_AI_Blossom_Pup_quadruped',cat:'Meshy_AI_Blossom_Kitty_quadruped',babyDragon:'Meshy_AI_Character_output.glb'};

export function createImportedPet(type,color){
  const definition=definitions[type],flight=type==='babyDragon';
  if(!templates.has(type))templates.set(type,new THREE.ObjectLoader().parse(definition.model));
  const template=templates.get(type),model=clone(template),root=new THREE.Group(),body=new THREE.Group();
  root.name=`Meshy ${type}`;root.userData={generated:true,petType:type,source:sources[type],rig:'Original Meshy skin'};
  if(flight)root.userData.mountType='babyDragon';
  root.add(body);body.add(model);
  const material=new THREE.MeshStandardMaterial({color,roughness:.85,metalness:1});
  if(typeof document!=='undefined'){
    const loader=new THREE.TextureLoader();
    for(const [slot,url] of Object.entries(definition.textures)){
      const texture=loader.load(url,()=>material.needsUpdate=true,undefined,error=>console.error('Pet texture failed',url,error));
      texture.flipY=false;if(slot==='map')texture.colorSpace=THREE.SRGBColorSpace;
      material[slot]=texture;
    }
  }
  model.traverse(node=>{
    if(node.isMesh){node.geometry=node.geometry.clone();node.material=material;node.name='coat';node.castShadow=true;node.receiveShadow=true;node.frustumCulled=false;}
  });
  const mixer=new THREE.AnimationMixer(model),clip=template.animations[0];
  const action=clip?mixer.clipAction(clip).play():null;
  mixer.setTime(0);
  root.updateMatrixWorld(true);
  model.traverse(node=>{if(node.isSkinnedMesh){node.skeleton.update();node.computeBoundingBox();}});
  // Normalize units and ground the skinned bind pose; the supplied FBX and GLB
  // use different units. Meshy exports already face the world's positive Z.
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
  const scale=(flight?1.9:.70)/size.y;
  model.scale.multiplyScalar(scale);model.updateMatrixWorld(true);
  const normalized=new THREE.Box3().setFromObject(model),center=normalized.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(center.x,normalized.min.y,center.z));
  root.updateMatrixWorld(true);
  const rig={};model.traverse(node=>{if(node.isBone)rig[node.name]=node;});
  const hearts=new THREE.Group();hearts.name='affection';hearts.visible=false;root.add(hearts);
  const shape=new THREE.Shape();shape.moveTo(0,-.06);shape.bezierCurveTo(-.15,.03,-.08,.14,0,.07);shape.bezierCurveTo(.08,.14,.15,.03,0,-.06);
  const heartMaterial=new THREE.MeshStandardMaterial({color:'#f297b6',side:THREE.DoubleSide});
  for(const x of [-.12,.12]){const heart=new THREE.Mesh(new THREE.ShapeGeometry(shape,16),heartMaterial);heart.position.x=x;hearts.add(heart);}
  let interaction=null,progress=0;
  const update=(time,moving,reduced=false)=>{
    // Absolute clip time makes duplicate updates in one frame idempotent.
    // Idle and reduced motion keep a grounded authored pose without walking.
    if(action)mixer.setTime(reduced||(!flight&&!moving)?0:time);
    const happy=interaction?.kind==='pet'&&Date.now()<interaction.until;
    hearts.visible=!!happy;hearts.position.y=(flight?2.05:.95)+(reduced?0:Math.sin(time*3)*.04);
    body.rotation.z=happy?.05:0;
    return flight&&!reduced?Math.sin(time*2.8)*.055:0;
  };
  update(0,false,true);
  return {root,rig,flight,mixer,mountSeat:flight?[0,.86,.10]:null,setInteraction:value=>{interaction=value;},runMotion:{update},sitMotion:{
    get active(){return progress>0;},
    update(dt,seated,height=.58,reduced=false){
      if(flight)return 0;
      progress=reduced?Number(seated):THREE.MathUtils.clamp(progress+(seated?1:-1)*dt*4,0,1);
      body.rotation.x=-.12*progress;body.position.y=-.07*progress;
      return(height-.39)*progress;
    }
  }};
}

export function createImportedBabyDragon(color='#e8efff'){return createImportedPet('babyDragon',color);}
