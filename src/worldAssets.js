import * as THREE from 'three';
import {defaultAppearance} from '../shared/world.mjs';
import {createDragonNest} from './dragonModels.mjs';

// Original low-poly models made specifically for PIEONA, in world-space meters.
export function createDecoration(type){
  if(type==='dragonNest')return createDragonNest();
  const root=new THREE.Group();
  const material=color=>new THREE.MeshStandardMaterial({color,roughness:.7});
  const wood=material('#b78c72'),cream=material('#fff1dc'),green=material('#9ebc94'),pink=material('#ecb2ce'),blue=material('#9ed7ec');
  function shape(geo,mat,x,y,z){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;}
  const box=(w,h,d,m,x,y,z)=>shape(new THREE.BoxGeometry(w,h,d),m,x,y,z);
  const ball=(r,m,x,y,z)=>shape(new THREE.IcosahedronGeometry(r,1),m,x,y,z);
  const cyl=(a,b,h,m,x,y,z)=>shape(new THREE.CylinderGeometry(a,b,h,20),m,x,y,z);
  if(type==='miningRobot'){
    const metal=material('#7d98b7'),dark=material('#34445e'),glow=material('#a6f9d9');glow.emissive.set('#64d8c6');glow.emissiveIntensity=.5;
    box(.85,.24,.68,dark,0,.16,0);box(.64,.6,.52,metal,0,.58,0);box(.46,.2,.04,dark,0,.72,.28);
    for(const x of [-.13,.13])ball(.055,glow,x,.74,.31);
    for(const x of [-.48,.48]){cyl(.13,.13,.5,dark,x,.24,0).rotation.x=Math.PI/2;box(.12,.5,.12,metal,x,.52,.12);}
    const drill=shape(new THREE.ConeGeometry(.17,.5,9),cream,0,.35,.6);drill.rotation.z=Math.PI;drill.name='mining-drill';
    cyl(.025,.025,.3,metal,0,1.02,0);ball(.07,glow,0,1.2,0);
  }else if(type==='planter'){
    box(1,.3,.6,cream,0,.15,0);box(.9,.06,.5,wood,0,.32,0);
    for(let i=0;i<5;i++){const x=(i-2)*.17;cyl(.018,.018,.3,green,x,.48,0);ball(.105,i%2?pink:blue,x,.68,0);const leaf=ball(.09,green,x+.06,.46,0);leaf.scale.set(.8,.3,1);}
  }else if(type==='bench'){
    for(const x of [-.42,.42])box(.1,.45,.5,wood,x,.23,0);
    for(let i=0;i<3;i++)box(1.15,.08,.14,wood,0,.49,(i-1)*.17);
    box(1.15,.15,.08,wood,0,.75,-.25);box(1.15,.14,.08,wood,0,.94,-.25);
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
  }else if(type==='cherry'||type==='bush'){
    if(type==='cherry'){
      cyl(.1,.2,1.6,wood,0,.8,0);
      for(const sign of [-1,1]){const branch=cyl(.045,.07,.8,wood,sign*.22,1.25,0);branch.rotation.z=-sign*.5;}
    }
    const y=type==='cherry'?1.65:.3,s=type==='cherry'?.62:.36;
    for(const [x,h,z] of [[0,.3,0],[-.5,0,0],[.5,.12,0],[-.2,.05,.4],[.25,.42,-.24]]){
      ball(s,type==='cherry'?pink:green,x*.8,y+h,z);
      for(let i=0;i<3;i++)ball(.065,cream,x*.8+Math.sin(i*3)*s*.6,y+h+s*.8,z+Math.cos(i*3)*s*.5);
    }
  }else if(type==='parasol'){
    cyl(.48,.5,.1,wood,0,.65,0);cyl(.055,.1,.6,wood,0,.3,0);cyl(.025,.025,1.65,wood,0,.9,0);
    shape(new THREE.ConeGeometry(.9,.32,10),cream,0,1.8,0);
    for(let i=0;i<10;i++){const a=i*Math.PI/5;const spoke=box(.025,.025,.85,wood,Math.sin(a)*.41,1.7,Math.cos(a)*.41);spoke.rotation.y=a;spoke.rotation.x=.16;}
    for(const x of [-.65,.65]){cyl(.22,.24,.12,wood,x,.35,.16);for(const z of [-.12,.12])box(.055,.3,.055,wood,x,.16,z+.16);}
  }else if(type==='cart'){
    box(1.2,.65,.65,wood,0,.64,0);box(1.32,.08,.78,cream,0,1.01,0);
    for(const x of [-.46,.46]){box(.045,1.1,.045,wood,x,1.48,-.22);const wheel=cyl(.23,.23,.08,wood,x,.27,.38);wheel.rotation.x=Math.PI/2;ball(.07,cream,x,.27,.44);}
    for(let i=0;i<7;i++){const roof=box(.2,.065,.96,i%2?cream:blue,-.6+i*.2,2.02,.06);roof.rotation.x=.13;box(.2,.19,.05,i%2?cream:blue,-.6+i*.2,1.91,.54);}
    for(let i=0;i<4;i++){cyl(.08,.065,.15,cream,-.38+i*.25,1.13,0);ball(.08,pink,-.38+i*.25,1.22,0);}
  }else if(type==='fence'){
    for(const x of [-.6,0,.6]){box(.13,.85,.13,wood,x,.43,0);shape(new THREE.ConeGeometry(.1,.14,4),wood,x,.91,0);}
    for(const y of [.3,.65])box(1.4,.12,.09,wood,0,y,.02);
  }else if(type==='path'){
    for(let i=0;i<3;i++){const tile=box(.75,.07,.38,cream,(i%2)*.12,.035,(i-1)*.43);tile.rotation.y=i%2?.06:-.04;}
  }else if(type==='statue'){
    cyl(.42,.48,.16,cream,0,.08,0);cyl(.32,.38,.12,cream,0,.22,0);
    const body=ball(.28,cream,0,.63,0);body.scale.y=1.25;ball(.3,cream,0,1.02,0);
    for(const x of [-.16,.16]){const ear=ball(.13,cream,x,1.36,0);ear.scale.set(.65,1.7,.7);ball(.045,wood,x*.65,1.05,.275);ball(.12,cream,x,.35,.15);}
    shape(new THREE.ConeGeometry(.27,.25,5),material('#dfbe7f'),0,1.48,0);
  }else if(type==='mushroomSeat'){
    cyl(.18,.24,.45,cream,0,.23,0);const cap=ball(.48,pink,0,.6,0);cap.scale.y=.65;
    for(const [x,z] of [[0,0],[-.25,.14],[.23,.17],[.1,-.26]])ball(.07,cream,x,.84-Math.hypot(x,z)*.2,z);
  }else if(type==='swing'){
    for(const x of [-.65,.65])for(const sign of [-1,1]){const pole=cyl(.045,.055,1.9,pink,x,.92,sign*.3);pole.rotation.x=sign*.32;}
    box(1.5,.1,.1,pink,0,1.85,0);
    for(const x of [-.35,.35])cyl(.012,.012,1.15,cream,x,1.2,0);
    box(.85,.1,.42,pink,0,.6,0);box(.85,.3,.06,pink,0,.79,-.19);
  }else if(type==='sign'){
    box(.12,1.35,.12,wood,0,.68,0);box(1,.55,.12,wood,0,1.18,0);box(.83,.39,.03,cream,0,1.18,.08);
    for(let i=0;i<3;i++)box(.55-i*.12,.035,.02,wood,-.07,1.27-i*.09,.105);
  }else if(type==='mailbox'){
    box(.11,.85,.11,wood,0,.42,0);box(.55,.38,.5,blue,0,1,0);const roof=cyl(.28,.28,.5,blue,0,1.18,0);roof.rotation.x=Math.PI/2;
    box(.32,.04,.02,wood,0,1.04,.26);box(.035,.36,.035,wood,.32,1.23,0);box(.2,.15,.04,pink,.4,1.39,0);
  }else if(type==='picnic'){
    box(1.25,.025,1,cream,0,.015,0);
    for(let i=0;i<5;i++)box(.12,.008,1,pink,-.5+i*.25,.035,0);
    box(.55,.3,.35,wood,0,.2,0);const handle=shape(new THREE.TorusGeometry(.23,.025,8,18,Math.PI),wood,0,.36,0);handle.scale.y=.8;
    ball(.1,pink,.14,.37,.05);cyl(.08,.06,.15,cream,-.4,.12,.25);
  }else if(type==='flowerLamp'){
    cyl(.15,.22,.08,cream,0,.04,0);cyl(.025,.04,1.05,green,0,.55,0);
    const light=material('#ffe9a3');light.emissive.set('#ffd06e');light.emissiveIntensity=.65;
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const petal=ball(.19,cream,Math.cos(a)*.21,1.1+Math.sin(a)*.21,0);petal.scale.z=.4;}
    ball(.15,light,0,1.1,.05);
  }else if(type==='gazebo'){
    cyl(.95,1,.12,cream,0,.06,0);
    for(let i=0;i<6;i++){const a=i*Math.PI/3;cyl(.04,.06,1.5,cream,Math.cos(a)*.8,.85,Math.sin(a)*.8);}
    shape(new THREE.ConeGeometry(1.18,.6,6),blue,0,1.9,0);ball(.08,cream,0,2.25,0);
    for(const x of [-.5,.5])box(.12,.5,.6,wood,x,.35,0);box(1.2,.08,.6,wood,0,.63,0);
  }else if(type==='crystal'){
    cyl(.36,.43,.15,cream,0,.08,0);
    const glow=material('#bca5f1');glow.emissive.set('#9472ce');glow.emissiveIntensity=.4;
    for(const [x,h,z] of [[0,.9,0],[-.25,.5,.12],[.23,.65,.08]]){const shard=shape(new THREE.OctahedronGeometry(.25,0),glow,x,h*.5+.15,z);shard.scale.y=h/.35;}
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

export function disposeObject(root){const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>{m.map?.dispose();m.dispose();});}
