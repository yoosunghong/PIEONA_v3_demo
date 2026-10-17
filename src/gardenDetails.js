import * as THREE from 'three';
import {perimeterRocks,perimeterTrees} from '../shared/scenery.mjs';

// Small, deterministic world details use shared geometry and instancing.
export function createGardenDetails(){
  const root=new THREE.Group();let parent=root;
  const group=id=>{const object=new THREE.Group();object.userData.sceneryId=id;root.add(object);parent=object;return object;};
  const material=color=>new THREE.MeshStandardMaterial({color,roughness:.9});
  const rock=material('#aebfce'),foliage=material('#a6c5b1'),blossom=material('#e4c9e3'),bark=material('#aa887c');
  const rockGeo=new THREE.IcosahedronGeometry(1,1),leafGeo=new THREE.IcosahedronGeometry(1,1);
  const mesh=(geometry,mat,x,y,z,sx=1,sy=sx,sz=sx)=>{const part=new THREE.Mesh(geometry,mat);part.position.set(x,y,z);part.scale.set(sx,sy,sz);part.castShadow=true;part.receiveShadow=true;parent.add(part);return part;};
  const flowers=[];
  for(let i=0;i<42;i++){
    const {x,z}=perimeterRocks[i];group(`edge-rock-${i}`);
    const stone=mesh(rockGeo,rock,x,.23,z,.23+(i%4)*.045,.18+(i%3)*.04,.24+(i%2)*.09);stone.rotation.set(i*.3,i*.73,i*.15);
    if(i%3===0){
      group(`edge-bush-${i}`);const bx=x*.93,bz=z*.93;
      for(let j=0;j<4;j++){const a=j*2.4;mesh(leafGeo,foliage,bx+Math.cos(a)*.25,.42+j*.06,bz+Math.sin(a)*.25,.42,.4,.36);flowers.push({parent,point:[bx+Math.cos(a)*.22,.73+j*.06,bz+Math.sin(a)*.22]});}
    }
  }
  // Keep each tree and its flowers in one editable group.
  for(const [index,[x,z,s]] of perimeterTrees.entries()){
    group(`edge-tree-${index}`);
    mesh(new THREE.CylinderGeometry(.09,.16,1.3,8),bark,x,.77,z,s,1,s);
    for(let i=0;i<12;i++){
      const a=i*2.39996,r=.3+(i%3)*.13,tx=x+Math.cos(a)*r*s,tz=z+Math.sin(a)*r*s,ty=1.7+(i%4)*.18;
      mesh(leafGeo,blossom,tx,ty,tz,.5*s,.46*s,.46*s);
      if(i%2===0)flowers.push({parent,point:[tx-.12,ty+.32,tz+.2]});
    }
  }
  // Water, surrounding rocks, waterfall and ripples belong to the same pond.
  group('pond');
  for(let i=0;i<13;i++){
    const a=i*Math.PI*2/13;
    mesh(rockGeo,rock,3.35+Math.cos(a)*1.24,.22,1.2+Math.sin(a)*1.72,.19+(i%3)*.035,.16,.2);
  }
  for(const [x,y,z,sx,sy,sz] of [[3.6,.65,-.2,.48,.75,.36],[4.15,.7,.05,.4,.8,.38],[3.85,1.45,-.22,.45,.3,.36]])mesh(rockGeo,rock,x,y,z,sx,sy,sz);
  const water=new THREE.MeshStandardMaterial({color:'#b3dff1',emissive:'#77bad6',emissiveIntensity:.15,roughness:.2,transparent:true,opacity:.8});
  for(let i=0;i<3;i++){
    const x=3.8+i*.09,curve=new THREE.CatmullRomCurve3([new THREE.Vector3(x,1.5,-.12),new THREE.Vector3(x,1.2,.02),new THREE.Vector3(x,.55,.14),new THREE.Vector3(x,.24,.42)]);
    const stream=new THREE.Mesh(new THREE.TubeGeometry(curve,16,.055,5,false),water);parent.add(stream);
  }
  for(let i=0;i<6;i++)mesh(leafGeo,water,3.82+Math.sin(i*3)*.15,.25,Math.cos(i*3)*.12+.43,.11,.05,.09);
  for(let i=0;i<5;i++){
    const ring=mesh(new THREE.TorusGeometry(.12+i*.055,.007,4,28),new THREE.MeshBasicMaterial({color:0xdcefff,transparent:true,opacity:.35}),3.4+Math.sin(i*3)*.6,.223,1.2+Math.cos(i*3)*.6);
    ring.rotation.x=Math.PI/2;
  }
  const dummy=new THREE.Object3D(),flowerGroups=new Map();
  for(const {parent,point} of flowers){if(!flowerGroups.has(parent))flowerGroups.set(parent,[]);flowerGroups.get(parent).push(point);}
  const petalGeo=new THREE.IcosahedronGeometry(.057,1),centerGeo=new THREE.IcosahedronGeometry(.036,0),petalMat=material('#f4e8ec'),centerMat=material('#edcf87');
  for(const [parent,points] of flowerGroups){
    const petals=new THREE.InstancedMesh(petalGeo,petalMat,points.length*5);
    const centers=new THREE.InstancedMesh(centerGeo,centerMat,points.length);
    points.forEach(([x,y,z],index)=>{
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;dummy.position.set(x+Math.cos(a)*.065,y,z+Math.sin(a)*.065);dummy.scale.set(1,.5,1);dummy.updateMatrix();petals.setMatrixAt(index*5+i,dummy.matrix);}
      dummy.position.set(x,y+.015,z);dummy.scale.set(1,1,1);dummy.updateMatrix();centers.setMatrixAt(index,dummy.matrix);
    });parent.add(petals,centers);
  }
  return root;
}
