import * as THREE from 'three';
import {BEACH_HALF} from '../shared/crab.mjs';

// Original low-poly beach and animated crab models. Shared instancing keeps the
// increasingly large crab procession inexpensive on phones.
export function createCrabWorld(scene){
  const root=new THREE.Group();scene.add(root);
  const geometries=[],materials=[],textures=[],batches=[];
  const geo=g=>(geometries.push(g),g),mat=(color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.85,...extra});materials.push(m);return m;};
  const sphere=geo(new THREE.SphereGeometry(1,10,7)),box=geo(new THREE.BoxGeometry(1,1,1)),cylinder=geo(new THREE.CylinderGeometry(1,1,1,8));
  const sand=mat('#f9dba2'),wet=mat('#d5ba87'),sea=mat('#30bdbb',{roughness:.3,metalness:.15}),foam=mat('#edffef'),wood=mat('#ac7c55'),green=mat('#5c9f70'),leaf=mat('#77b482'),cream=mat('#fff4dc'),coral=mat('#ee7967'),teal=mat('#68bdb5'),rock=mat('#b3ac98');
  function mesh(g,m,x,y,z,sx=1,sy=1,sz=1,parent=root){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#f8dba5';ctx.fillRect(0,0,256,256);
  let seed=152;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<2600;i++){ctx.fillStyle=i%2?'#cfa87035':'#fff4d350';ctx.fillRect(rand()*256,rand()*256,1+rand()*2,1+rand()*2);}
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(12,12);texture.colorSpace=THREE.SRGBColorSpace;textures.push(texture);sand.map=texture;
  mesh(box,sand,0,-.22,0,49,.4,54);
  mesh(box,wet,-21,-.02,0,3,.1,54);
  mesh(box,sea,-36,-.06,0,30,.12,100);
  const waves=[];
  for(let j=0;j<5;j++){
    const line=new THREE.Group();root.add(line);waves.push(line);
    for(let i=0;i<34;i++)mesh(sphere,foam,-21.6-j*3,.02,-35+i*2.2,.16,.025,1.3,line);
  }
  // A coral buoy rope outlines the playable area; decoration remains outside it.
  for(const side of [-1,1])for(let i=-19;i<=19;i+=2){
    mesh(sphere,i%4===1?coral:cream,side*(BEACH_HALF+.65),.22,i,.18,.22,.18);
    mesh(sphere,i%4===1?coral:cream,i,.22,side*(BEACH_HALF+.65),.18,.22,.18);
  }
  const rope=mat('#d19b6b');
  for(const side of [-1,1]){mesh(box,rope,side*19.65,.1,0,.05,.05,39);mesh(box,rope,0,.1,side*19.65,39,.05,.05);}
  const cone=geo(new THREE.ConeGeometry(1,1,12));
  function palm(x,z,scale=1){
    const group=new THREE.Group();root.add(group);group.position.set(x,0,z);group.scale.setScalar(scale);
    const trunk=mesh(cylinder,wood,0,2.1,0,.19,4.2,.19,group);trunk.rotation.z=.13;
    for(let i=0;i<7;i++){
      const angle=i*Math.PI*2/7,frond=mesh(sphere,i%2?green:leaf,Math.cos(angle)*1.15,4.2,Math.sin(angle)*1.15,1.7,.12,.42,group);frond.rotation.y=-angle;frond.rotation.z=Math.cos(angle)*.15;
    }
    for(let i=0;i<3;i++)mesh(sphere,wood,.3+Math.cos(i*2)*.2,3.8,Math.sin(i*2)*.25,.22,.25,.22,group);
  }
  for(const [x,z,s] of [[22,-17,1.3],[22,1,1],[-21,-19,1],[17,23,1.2],[-13,-23,1.1],[3,-23,1],[22,18,1.4]])palm(x,z,s);
  for(let i=0;i<7;i++){
    const x=i%2?22:-21,z=-16+i*5.2;
    mesh(cylinder,wood,x,1.4,z,.05,2.8,.05);
    const parasol=mesh(cone,i%2?teal:coral,x,2.9,z,1.5,.65,1.5);
    mesh(cone,cream,x,2.91,z,1.51,.65,1.51).rotation.y=Math.PI/6;
    parasol.rotation.y=Math.PI/12;
    const towel=mesh(box,i%2?coral:teal,x,.025,z+1.5,1.2,.04,2.2);towel.rotation.y=.4;
  }
  for(let i=0;i<110;i++){
    const x=(rand()*2-1)*23,z=(rand()*2-1)*25;
    if(i<75){const shell=mesh(sphere,i%3?cream:coral,x,.025,z,.07+rand()*.1,.045,.11);shell.rotation.y=rand()*6;}
    else if(Math.abs(x)>20||Math.abs(z)>21)mesh(sphere,rock,x,.3,z,.4+rand()*.8,.4,.6);
  }
  // Tiny starfish and shell clusters keep the beach lively without obscuring hazards.
  for(const [x,z] of [[-18,-22],[12,22],[22,-9],[-21,13],[6,-22]]){
    mesh(sphere,coral,x,.04,z,.18,.07,.18);
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5,arm=mesh(sphere,coral,x+Math.cos(a)*.17,.04,z+Math.sin(a)*.17,.27,.045,.065);arm.rotation.y=-a;}
    for(let i=0;i<3;i++)mesh(sphere,cream,x+.6+i*.21,.06,z+.4,.13,.07,.18);
  }
  // Bake hundreds of static props and foam beads into a handful of draws.
  // Waves keep their own moving parent; everything else uses world transforms.
  root.updateMatrixWorld(true);
  function batchMeshes(meshes,parent){
    const groups=new Map(),inverse=new THREE.Matrix4().copy(parent.matrixWorld).invert(),matrix=new THREE.Matrix4();
    for(const m of meshes){const key=m.geometry.uuid+':'+m.material.uuid;const group=groups.get(key)||[];group.push(m);groups.set(key,group);}
    for(const group of groups.values()){
      if(group.length<2)continue;
      const first=group[0],inst=new THREE.InstancedMesh(first.geometry,first.material,group.length);inst.castShadow=parent===root;inst.receiveShadow=true;
      group.forEach((m,i)=>{matrix.multiplyMatrices(inverse,m.matrixWorld);inst.setMatrixAt(i,matrix);m.removeFromParent();});inst.computeBoundingSphere();parent.add(inst);batches.push(inst);
    }
  }
  const animated=new Set();for(const wave of waves){wave.traverse(o=>{if(o.isMesh)animated.add(o);});batchMeshes([...wave.children],wave);}
  const staticMeshes=[];root.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh&&!animated.has(o))staticMeshes.push(o);});batchMeshes(staticMeshes,root);
  const red=mat('#f76c4f'),orange=mat('#ff9871'),white=mat('#fff9e9'),black=mat('#243940'),shadow=mat('#a87453',{transparent:true,opacity:.18,depthWrite:false});
  const dummy=new THREE.Object3D(),color=new THREE.Color(),parts=[];
  const sparkleMaterial=new THREE.MeshBasicMaterial({color:'#eeffff',transparent:true,opacity:.65,depthWrite:false});materials.push(sparkleMaterial);
  const sparkles=new THREE.InstancedMesh(geo(new THREE.PlaneGeometry(1,1)),sparkleMaterial,65);sparkles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);sparkles.frustumCulled=false;root.add(sparkles);
  const sparklePositions=Array.from({length:65},()=>({x:-22-rand()*15,z:(rand()*2-1)*35,phase:rand()*Math.PI*2}));
  const arrivalMaterial=new THREE.MeshBasicMaterial({color:'#fff7ca',transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide});materials.push(arrivalMaterial);
  const arrivals=new THREE.InstancedMesh(geo(new THREE.RingGeometry(.65,.72,24)),arrivalMaterial,100);arrivals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);arrivals.frustumCulled=false;root.add(arrivals);
  const appeared=new Map();let previousCount=0;
  function part(g,m,pose){const inst=new THREE.InstancedMesh(g,m,100);inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);inst.castShadow=false;inst.receiveShadow=true;inst.frustumCulled=false;root.add(inst);parts.push({inst,pose});return inst;}
  const body=part(sphere,red,(t)=>[0,.28+Math.sin(t*14)*.025,0,.46,.24,.34,0,0,0]);
  part(sphere,orange,()=>[0,.23,.24,.31,.11,.14,0,0,0]);
  const circle=geo(new THREE.CircleGeometry(1,14));
  part(circle,shadow,()=>[0,.012,0,.7,.5,1,-Math.PI/2,0,0]);
  const printMaterial=mat('#be955f',{transparent:true,opacity:.24,depthWrite:false});
  const printMesh=new THREE.InstancedMesh(circle,printMaterial,240);printMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);printMesh.frustumCulled=false;root.add(printMesh);
  const footprints=[],lastSteps=new Map();let lastElapsed=0;
  for(const side of [-1,1]){
    for(let leg=0;leg<3;leg++){
      part(cylinder,red,(t)=>[side*.48,.17,(leg-1)*.22,.045,.48,.045,0,0,side*(.9+Math.sin(t*19+leg*2)*.22)]);
    }
    part(cylinder,red,()=>[side*.26,.5,.23,.045,.34,.045,0,0,side*-.3]);
    part(sphere,white,()=>[side*.3,.69,.28,.105,.12,.105,0,0,0]);
    part(sphere,black,()=>[side*.3,.71,.37,.052,.063,.04,0,0,0]);
    part(cylinder,red,t=>[side*.54,.4,.4,.065,.5,.065,side*.8,0,side*-.7+Math.sin(t*10)*.15]);
    for(const claw of [-1,1])part(sphere,red,t=>[side*.72+claw*.065,.62+Math.sin(t*10)*.03,.63,.11,.19,.13,claw*.2,0,claw*.35]);
  }
  const old=new Map();
  return {
    update(snapshot,time,dt){
      if(snapshot.elapsed<lastElapsed){footprints.length=0;lastSteps.clear();old.clear();appeared.clear();previousCount=0;}lastElapsed=snapshot.elapsed;
      for(let i=0;i<sparklePositions.length;i++){const p=sparklePositions[i],size=.04+Math.pow(Math.max(0,Math.sin(time*1.6+p.phase)),8)*.3;dummy.position.set(p.x+Math.sin(time*.5+p.phase)*.15,.025,p.z);dummy.rotation.set(-Math.PI/2,0,Math.PI/4);dummy.scale.set(size,size,1);dummy.updateMatrix();sparkles.setMatrixAt(i,dummy.matrix);}sparkles.instanceMatrix.needsUpdate=true;
      if(snapshot.crabs.length>previousCount&&previousCount)for(const c of snapshot.crabs)if(!old.has(c.id))appeared.set(c.id,time);
      previousCount=snapshot.crabs.length;let arrivalCount=0;
      for(const c of snapshot.crabs){const born=appeared.get(c.id);if(born===undefined)continue;const age=time-born;if(age>1){appeared.delete(c.id);continue;}dummy.position.set(c.x,.035,c.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(1+age*1.7);dummy.updateMatrix();arrivals.setMatrixAt(arrivalCount++,dummy.matrix);}arrivals.count=arrivalCount;arrivals.instanceMatrix.needsUpdate=true;
      for(const p of snapshot.players){const last=lastSteps.get(p.id)||{x:p.x,z:p.z,side:1};
        if(Math.hypot(p.x-last.x,p.z-last.z)>.5&&p.alive){const side=-last.side;footprints.push({x:p.x+Math.cos(p.angle)*side*.18,z:p.z-Math.sin(p.angle)*side*.18,angle:p.angle,born:time});lastSteps.set(p.id,{x:p.x,z:p.z,side});}
        else if(!lastSteps.has(p.id))lastSteps.set(p.id,last);
      }
      while(footprints.length&&(footprints.length>240||time-footprints[0].born>15))footprints.shift();
      printMesh.count=footprints.length;footprints.forEach((p,i)=>{const fade=Math.min(1,(15-(time-p.born))/4);dummy.position.set(p.x,.013,p.z);dummy.rotation.set(-Math.PI/2,0,p.angle);dummy.scale.set(.075*fade,.14*fade,1);dummy.updateMatrix();printMesh.setMatrixAt(i,dummy.matrix);});printMesh.instanceMatrix.needsUpdate=true;
      for(let j=0;j<waves.length;j++){waves[j].position.x=Math.sin(time*.7+j)*.65;waves[j].position.z=Math.sin(time*.4+j)*.7;}
      const crabs=snapshot.crabs||[],blend=1-Math.exp(-16*dt);
      for(const {inst,pose} of parts){inst.count=crabs.length;for(let i=0;i<crabs.length;i++){
        const c=crabs[i],prev=old.get(c.id)||{x:c.x,z:c.z,angle:c.angle};
        // All parts use the same interpolated transform, committed after the loop.
        const x=prev.x+(c.x-prev.x)*blend,z=prev.z+(c.z-prev.z)*blend,angle=prev.angle+Math.atan2(Math.sin(c.angle-prev.angle),Math.cos(c.angle-prev.angle))*blend;
        const [px,py,pz,sx,sy,sz,rx,ry,rz]=pose(time+c.id*.73);
        dummy.position.set(x+px*Math.cos(angle)+pz*Math.sin(angle),py,z-px*Math.sin(angle)+pz*Math.cos(angle));dummy.scale.set(sx,sy,sz);dummy.rotation.set(rx,ry+angle,rz);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);
        if(inst===body){color.set(c.mode==='patrol'?'#ffb075':c.mode==='chase'?'#f95042':'#f57a56');inst.setColorAt(i,color);}
      }inst.instanceMatrix.needsUpdate=true;if(inst===body&&inst.instanceColor)inst.instanceColor.needsUpdate=true;}
      for(const c of crabs){const prev=old.get(c.id)||{x:c.x,z:c.z,angle:c.angle};old.set(c.id,{x:prev.x+(c.x-prev.x)*blend,z:prev.z+(c.z-prev.z)*blend,angle:prev.angle+Math.atan2(Math.sin(c.angle-prev.angle),Math.cos(c.angle-prev.angle))*blend});}
    },
    dispose(){root.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());parts.forEach(p=>p.inst.dispose());batches.forEach(b=>b.dispose());printMesh.dispose();sparkles.dispose();arrivals.dispose();}
  };
}
