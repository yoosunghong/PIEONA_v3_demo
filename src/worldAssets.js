import * as THREE from 'three';
import {defaultAppearance} from '../shared/world.mjs';

// Original low-poly models made specifically for PIEONA, in world-space meters.
export function createDecoration(type){
  const root=new THREE.Group();
  const material=color=>new THREE.MeshStandardMaterial({color,roughness:.7});
  const wood=material('#b78c72'),cream=material('#fff1dc'),green=material('#9ebc94'),pink=material('#ecb2ce'),blue=material('#9ed7ec');
  function shape(geo,mat,x,y,z){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;}
  const box=(w,h,d,m,x,y,z)=>shape(new THREE.BoxGeometry(w,h,d),m,x,y,z);
  const ball=(r,m,x,y,z)=>shape(new THREE.IcosahedronGeometry(r,1),m,x,y,z);
  const cyl=(a,b,h,m,x,y,z)=>shape(new THREE.CylinderGeometry(a,b,h,20),m,x,y,z);
  if(type==='planter'){
    box(1,.3,.6,cream,0,.15,0);box(.9,.06,.5,wood,0,.32,0);
    for(let i=0;i<5;i++){const x=(i-2)*.17;cyl(.018,.018,.3,green,x,.48,0);ball(.105,i%2?pink:blue,x,.68,0);const leaf=ball(.09,green,x+.06,.46,0);leaf.scale.set(.8,.3,1);}
  }else if(type==='bench'){
    for(const x of [-.42,.42])box(.1,.45,.5,wood,x,.23,0);
    for(let i=0;i<3;i++)box(1.15,.08,.14,cream,0,.49,(i-1)*.17);
    box(1.15,.15,.08,wood,0,.75,-.25);box(1.15,.14,.08,cream,0,.94,-.25);
  }else if(type==='lantern'){
    cyl(.22,.3,.12,wood,0,.06,0);cyl(.045,.07,1.4,wood,0,.78,0);
    const lit=material('#ffdf96');lit.emissive.set('#ffc979');lit.emissiveIntensity=.8;
    box(.33,.4,.33,lit,0,1.62,0);shape(new THREE.ConeGeometry(.32,.2,4),blue,0,1.94,0);
  }else if(type==='fountain'){
    cyl(.65,.7,.22,cream,0,.11,0);cyl(.56,.56,.03,blue,0,.24,0);cyl(.1,.18,.65,cream,0,.5,0);
    cyl(.32,.24,.12,cream,0,.82,0);ball(.15,blue,0,1.05,0);
    for(let i=0;i<6;i++){const a=i*Math.PI/3;const drop=ball(.055,blue,Math.cos(a)*.26,.63,Math.sin(a)*.26);drop.scale.y=2;}
  }else if(type==='arch'){
    for(const x of [-.5,.5]){box(.1,1.65,.1,wood,x,.82,0);cyl(.2,.25,.28,cream,x,.14,0);}
    shape(new THREE.TorusGeometry(.5,.075,8,24,Math.PI),green,0,1.6,0);
    for(let i=0;i<9;i++){const a=i*Math.PI/8;ball(.13,i%2?pink:cream,Math.cos(a)*.51,1.6+Math.sin(a)*.51,0);}
  }else if(type==='mushroom'){
    cyl(.35,.43,.8,cream,0,.4,0);const cap=ball(.64,pink,0,.93,0);cap.scale.y=.55;
    box(.22,.4,.04,wood,0,.23,.4);ball(.12,blue,.25,.6,.31);
    for(const [x,y,z] of [[0,1.25,0],[-.3,1.12,.27],[.3,1.12,.27]])ball(.09,cream,x,y,z);
  }
  // Dispose materials that weren't used by this model, too.
  const used=new Set();root.traverse(o=>{if(o.isMesh)used.add(o.material);});
  [wood,cream,green,pink,blue].forEach(m=>{if(!used.has(m))m.dispose();});
  return root;
}

export function dressAvatar(avatar,appearance={}){
  const look={...defaultAppearance,...appearance};const root=new THREE.Group();root.name='pieona-wearables';root.userData.generated=true;
  const color=new THREE.MeshStandardMaterial({color:look.color,roughness:.6});
  const gold=new THREE.MeshStandardMaterial({color:'#f5d683',metalness:.35,roughness:.4});
  const mesh=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;root.add(m);return m;};
  // Attach in bone coordinates so the accessories follow the original animation.
  const bones=[];avatar.traverse(o=>{if(o.isBone)bones.push(o);});
  const head=bones.find(b=>/headtop_end$/i.test(b.name))||bones.find(b=>/head$/i.test(b.name))||bones.find(b=>/head/i.test(b.name));
  const chest=bones.find(b=>/spine2|chest|spine_03/i.test(b.name))||bones.find(b=>/spine/i.test(b.name));
  function attach(group,bone,height){
    avatar.updateMatrixWorld(true);
    const scale=new THREE.Vector3();avatar.getWorldScale(scale);
    if(bone){bone.add(group);bone.updateWorldMatrix(true,false);const s=new THREE.Vector3();bone.getWorldScale(s);group.scale.set(1/s.x,1/s.y,1/s.z);}
    else{avatar.add(group);group.position.y=height/Math.max(scale.y,.001);group.scale.setScalar(1/Math.max(scale.y,.001));}
  }
  if(look.hat!=='none'){
    if(look.hat==='beret'){const beret=mesh(new THREE.SphereGeometry(.43,20,12),color,0,.25,0);beret.scale.set(1,.4,1);beret.rotation.z=.2;mesh(new THREE.CylinderGeometry(.04,.04,.1,8),gold,.08,.43,0);}
    if(look.hat==='crown'){mesh(new THREE.CylinderGeometry(.34,.3,.15,24,true),gold,0,.23,0);for(let i=0;i<5;i++){const a=i*Math.PI*2/5;mesh(new THREE.ConeGeometry(.1,.25,4),gold,Math.cos(a)*.3,.42,Math.sin(a)*.3);}}
    if(look.hat==='sprout'){mesh(new THREE.CylinderGeometry(.025,.025,.3,8),color,0,.32,0);for(const sign of [-1,1]){const leaf=mesh(new THREE.SphereGeometry(.18,12,8),color,sign*.12,.46,0);leaf.scale.set(1,.35,.5);leaf.rotation.z=sign*.4;}}
  }
  root.children.forEach(m=>{m.position.y-=.5;});
  attach(root,head,2.35);root.scale.multiplyScalar(1.5);
  const accessory=new THREE.Group();accessory.userData.generated=true;
  function part(geo,mat,x,y,z){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);accessory.add(m);return m;}
  if(look.accessory==='scarf'){const ring=part(new THREE.TorusGeometry(.25,.085,8,24),color,0,.16,0);ring.rotation.x=Math.PI/2;part(new THREE.BoxGeometry(.17,.5,.07),color,.17,-.12,.24);}
  if(look.accessory==='bow'){for(const sign of [-1,1]){const bow=part(new THREE.SphereGeometry(.15,12,8),color,sign*.13,.12,.25);bow.scale.set(1,.65,.45);}part(new THREE.SphereGeometry(.07,10,8),gold,0,.12,.28);}
  if(look.accessory==='wings'){for(const sign of [-1,1]){const wing=part(new THREE.SphereGeometry(.5,16,12),color,sign*.43,-.08,-.25);wing.scale.set(.7,1,.12);wing.rotation.z=sign*-.4;}}
  attach(accessory,chest,1.7);
  const used=new Set();for(const group of [root,accessory])group.traverse(o=>{if(o.material)used.add(o.material);});
  for(const material of [color,gold])if(!used.has(material))material.dispose();
}

export function disposeObject(root){const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>{m.map?.dispose();m.dispose();});}
