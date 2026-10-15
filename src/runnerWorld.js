import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {runDistance,RUN_DISTANCE} from '../shared/runner.mjs';

// Original procedural assets. Repeated track pieces share geometry and draw calls.
export function createRunnerWorld(scene) {
  const root=new THREE.Group();scene.add(root);
  const materials=[],geometries=[];
  const mat=(color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.78,...extra});materials.push(m);return m;};
  const geo=g=>{geometries.push(g);return g;};
  const stone=mat('#fff0d2'),gold=mat('#edc975'),grass=mat('#a9cd7e'),leaf=mat('#81b88c'),rose=mat('#eebbd4'),blue=mat('#7cdbff',{emissive:'#36baf1',emissiveIntensity:.45}),cloud=mat('#ffffff');
  const cube=geo(new THREE.BoxGeometry(1,1,1)),sphere=geo(new THREE.SphereGeometry(1,12,8));
  const rounded=geo(new RoundedBoxGeometry(1,1,1,2,.09));
  // Saturated, self-lit pickups remain distinct from the pale track and fences.
  const seedGold=mat('#ffb829',{emissive:'#ff9b08',emissiveIntensity:.9,roughness:.3});
  const seedLeaf=mat('#36ef74',{emissive:'#17ad45',emissiveIntensity:.6});
  const seedRingGeo=geo(new THREE.TorusGeometry(.85,.065,8,24));
  const seedRingMat=new THREE.MeshBasicMaterial({color:'#77ffb0',toneMapped:false});materials.push(seedRingMat);
  function mesh(g,m,x,y,z,sx=1,sy=1,sz=1,parent=root){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);parent.add(o);return o;}
  const dummy=new THREE.Object3D();
  function instances(g,m,count){const o=new THREE.InstancedMesh(g,m,count);o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);o.receiveShadow=true;o.frustumCulled=false;root.add(o);return o;}
  function put(o,i,x,y,z,sx,sy,sz){dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(0,0,0);dummy.updateMatrix();o.setMatrixAt(i,dummy.matrix);}
  const tiles=instances(rounded,stone,96),borders=instances(rounded,gold,64),verges=instances(cube,grass,64);
  const padGeometry=geo(new THREE.PlaneGeometry(1,1));padGeometry.rotateX(-Math.PI/2);
  const padMaterial=new THREE.MeshBasicMaterial({color:'#65cfff',toneMapped:false});materials.push(padMaterial);
  const pads=instances(padGeometry,padMaterial,8),arrows=instances(cube,cloud,32);
  const tileColor=new THREE.Color();
  for(let i=0;i<96;i++){tileColor.set(['#fff3dc','#f4e1c7','#fff7e9'][i%3]);tiles.setColorAt(i,tileColor);}
  // Green floating islands, topiary trees and clouds form the near scenery.
  const islands=[];
  const rock=geo(new THREE.ConeGeometry(1,1,6));
  for(let i=0;i<10;i++){
    const island=new THREE.Group();root.add(island);islands.push(island);
    mesh(sphere,grass,0,-.5,0,2.5,.65,3,island);
    const tip=mesh(rock,stone,0,-2.5,0,2.3,4,2.8,island);tip.rotation.z=Math.PI;
    mesh(cube,gold,0,1,0,.25,2,.25,island);
    for(const [y,r] of [[2,1.1],[2.7,.85],[3.3,.5]])mesh(sphere,i%3===0?rose:leaf,0,y,0,r,r*.8,r,island);
    for(let j=0;j<3;j++)mesh(sphere,cloud,(j-1)*1.5,-2,1,1.8,1,1.5,island);
    // Small pastel towers on alternating islands.
    if(i%3===1){mesh(cube,stone,1.2,.8,-1,1.1,2.8,1.1,island);mesh(geo(new THREE.ConeGeometry(.9,1.5,6)),rose,1.2,2.9,-1,1,1,1,island);}
  }
  // Ivy-covered finish arch remains in the distance until the end of the run.
  const arch=new THREE.Group();root.add(arch);
  for(const side of [-1,1]){
    mesh(rounded,stone,side*4.1,2.7,0,.65,5.4,.8,arch);
    mesh(rounded,gold,side*4.1,5.4,0,.95,.25,1,arch);
    for(let j=0;j<5;j++)mesh(sphere,leaf,side*(4.1+Math.sin(j)*.25),j+.5,.45,.35,.3,.2,arch);
  }
  mesh(rounded,stone,0,5,0,8.6,.7,.7,arch);
  const bannerCanvas=document.createElement('canvas');bannerCanvas.width=512;bannerCanvas.height=128;
  const ctx=bannerCanvas.getContext('2d');ctx.fillStyle='#819ecb';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#f9db9f';ctx.lineWidth=12;ctx.strokeRect(5,5,502,118);ctx.fillStyle='#fff9e9';ctx.font='bold 68px sans-serif';ctx.textAlign='center';ctx.fillText('PIEONA',256,88);
  const banner=new THREE.CanvasTexture(bannerCanvas);banner.colorSpace=THREE.SRGBColorSpace;
  mesh(geo(new THREE.PlaneGeometry(4.7,1.2)),mat('#ffffff',{map:banner}),0,4.7,.46,1,1,1,arch);
  const noteRoot=new THREE.Group();root.add(noteRoot);let notes=[];
  function setNotes(next){for(const n of notes)n.removeFromParent();notes=next.map(note=>{
    const group=new THREE.Group();noteRoot.add(group);group.userData.note=note;
    group.position.x=(note.lane-1)*2.4;
    if(note.kind==='seed'){
      const pickup=new THREE.Group();group.add(pickup);group.userData.pickup=pickup;
      const seed=mesh(sphere,seedGold,0,1.45,0,.5,.68,.46,pickup);seed.rotation.z=-.3;
      const sprout=mesh(sphere,seedLeaf,.3,2.06,0,.42,.18,.18,pickup);sprout.rotation.z=.6;
      const sprout2=mesh(sphere,seedLeaf,-.23,2.03,0,.36,.16,.17,pickup);sprout2.rotation.z=-.6;
      mesh(sphere,cloud,-.16,1.6,.4,.09,.2,.04,pickup);
      mesh(seedRingGeo,seedRingMat,0,1.5,0,1,1,1,group);
      return group;
    }
    const wide=note.lane===-1,width=wide?7.2:1.65;
    mesh(rounded,wide?rose:gold,0,note.height/2,0,width,note.height,.65,group);
    mesh(cube,stone,0,note.height*.84,.34,width*.88,.1,.035,group);
    for(const x of [-width*.39,width*.39])mesh(rounded,stone,x,note.height/2,.35,.09,note.height*.8,.08,group);
    // Leaf emblem identifies an obstacle rather than a collectible.
    const emblem=mesh(sphere,wide?stone:leaf,0,note.height*.48,.36,.16,.25,.05,group);emblem.rotation.z=-.5;
    group.position.x=wide?0:(note.lane-1)*2.4;return group;
  });}
  function update(elapsed,motion,resolved=0){
    for(let row=0;row<32;row++){
      const z=10-((row*3.5-motion)%112+112)%112;
      for(let lane=0;lane<3;lane++)put(tiles,row*3+lane,(lane-1)*2.4,-.18,z,2.35,.32,3.43);
      for(let side=0;side<2;side++){
        const x=side?4.04:-4.04;put(borders,row*2+side,x,.12,z,.6,.5,3.4);put(verges,row*2+side,x*.9,-.07,z,.5,.16,3.4);
      }
    }
    for(let i=0;i<8;i++){
      const z=8-((i*14-motion)%112+112)%112,x=(i%3-1)*2.4;
      put(pads,i,x,.045,z,1.75,1,1.8);
      for(let j=0;j<4;j++){
        const a=j%2?-.65:.65;
        dummy.position.set(x+(j%2?-.22:.22),.065,z+Math.floor(j/2)*.55-.3);dummy.scale.set(.12,.025,.65);dummy.rotation.set(0,a,0);dummy.updateMatrix();arrows.setMatrixAt(i*4+j,dummy.matrix);
      }
    }
    for(const o of [tiles,borders,verges,pads,arrows])o.instanceMatrix.needsUpdate=true;
    islands.forEach((o,i)=>o.position.set((i%2?1:-1)*(9+i%3*2),-1,8-((i*12-motion*.65)%120+120)%120));
    arch.position.z=motion-RUN_DISTANCE;
    arch.visible=arch.position.z>-100;
    notes.forEach((o,i)=>{
      o.position.z=motion-runDistance(o.userData.note.time);
      const seed=o.userData.note.kind==='seed';
      o.visible=o.position.z>-85&&o.position.z<5&&(!seed||i>=resolved);
      if(seed){o.userData.pickup.rotation.y=elapsed*.002;o.position.y=Math.sin(elapsed*.004+i)*.13;}
    });
  }
  return {setNotes,update,dispose(){root.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());banner.dispose();}};
}
