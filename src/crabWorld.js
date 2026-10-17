import * as THREE from 'three';

// Detailed beach art and instanced crab sprites follow live simulation poses.
// Bubble meshes, contact shadows and footprints share the same world coordinates.
export function createCrabWorld(scene,{loadTexture=true}={}){
  const root=new THREE.Group();scene.add(root);
  const geometries=[],materials=[],textures=[];
  const geo=g=>(geometries.push(g),g),mat=(color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.32,...extra});materials.push(m);return m;};
  const sphere=geo(new THREE.SphereGeometry(1,24,16)),cylinder=geo(new THREE.CylinderGeometry(1,1,1,10));
  const groundMaterial=new THREE.MeshBasicMaterial({color:'#f7d9a2',toneMapped:false});materials.push(groundMaterial);
  const ground=new THREE.Mesh(geo(new THREE.PlaneGeometry(64,60)),groundMaterial);ground.rotation.x=-Math.PI/2;ground.position.set(0,-.018,0);root.add(ground);
  const spriteMaterial=new THREE.MeshBasicMaterial({transparent:true,alphaTest:.08,depthWrite:false,toneMapped:false});materials.push(spriteMaterial);
  const sprites=new THREE.InstancedMesh(geo(new THREE.PlaneGeometry(2.05,2.05)),spriteMaterial,100);sprites.visible=false;sprites.frustumCulled=false;sprites.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(sprites);
  let disposed=false;
  function load(path,apply){return new Promise((resolve,reject)=>new THREE.TextureLoader().load(path,texture=>{
    if(disposed){texture.dispose();resolve();return;}
    texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;textures.push(texture);apply(texture);resolve();
  },undefined,reject));}
  const ready=loadTexture?Promise.all([
    load('/images/minigames/crab-beach-v2.png',texture=>{groundMaterial.map=texture;groundMaterial.color.set('white');groundMaterial.needsUpdate=true;}),
    load('/images/minigames/crab-sprite-v2.png',texture=>{spriteMaterial.map=texture;spriteMaterial.needsUpdate=true;sprites.visible=true;})
  ]):Promise.resolve();
  // The playable area has a subtle perimeter; scenery outside it is decorative.
  const edgeMaterial=new THREE.LineBasicMaterial({color:'#fff6cf',transparent:true,opacity:.45});materials.push(edgeMaterial);
  const edgeGeometry=geo(new THREE.BufferGeometry().setFromPoints([[-19,-19],[19,-19],[19,19],[-19,19],[-19,-19]].map(([x,z])=>new THREE.Vector3(x,.02,z))));
  root.add(new THREE.Line(edgeGeometry,edgeMaterial));
  let seed=152;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const red=mat('#ff571f',{roughness:.22,metalness:.08}),orange=mat('#ffe4b2'),white=mat('#fff9ef'),black=mat('#211215',{roughness:.08}),shadow=mat('#705239',{transparent:true,opacity:.18,depthWrite:false});
  const dummy=new THREE.Object3D(),color=new THREE.Color(),parts=[];
  const sparkleMaterial=new THREE.MeshBasicMaterial({color:'#eeffff',transparent:true,opacity:.65,depthWrite:false});materials.push(sparkleMaterial);
  const sparkles=new THREE.InstancedMesh(geo(new THREE.PlaneGeometry(1,1)),sparkleMaterial,65);sparkles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);sparkles.frustumCulled=false;root.add(sparkles);
  const sparklePositions=Array.from({length:65},()=>({x:-22-rand()*15,z:(rand()*2-1)*35,phase:rand()*Math.PI*2}));
  const arrivalMaterial=new THREE.MeshBasicMaterial({color:'#fff7ca',transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide});materials.push(arrivalMaterial);
  const arrivals=new THREE.InstancedMesh(geo(new THREE.RingGeometry(.65,.72,24)),arrivalMaterial,100);arrivals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);arrivals.frustumCulled=false;root.add(arrivals);
  const appeared=new Map();let previousCount=0;
  function part(g,m,pose){const inst=new THREE.InstancedMesh(g,m,100);inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);inst.castShadow=false;inst.receiveShadow=true;inst.frustumCulled=false;root.add(inst);parts.push({inst,pose});return inst;}
  const body=part(sphere,red,(t)=>[0,.28+Math.sin(t*14)*.025,0,.46,.24,.34,0,0,0]);
  part(sphere,orange,()=>[0,.25,.24,.34,.17,.15,0,0,0]);
  const mouth=mat('#651817'),pink=mat('#ff8971'),glint=mat('#ffffff',{emissive:'#ffffff',emissiveIntensity:.25});
  part(sphere,mouth,()=>[0,.36,.323,.15,.085,.035,0,0,0]);
  for(const side of [-1,1]){
    part(sphere,pink,()=>[side*.29,.38,.29,.1,.045,.04,0,0,0]);
    part(sphere,glint,()=>[side*.3-.027,.765,.4,.026,.032,.018,0,0,0]);
  }
  const circle=geo(new THREE.CircleGeometry(1,14));
  const crabShadow=part(circle,shadow,()=>[0,.012,0,.7,.5,1,-Math.PI/2,0,0]);
  const printMaterial=mat('#be955f',{transparent:true,opacity:.24,depthWrite:false});
  const printMesh=new THREE.InstancedMesh(circle,printMaterial,240);printMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);printMesh.frustumCulled=false;root.add(printMesh);
  const footprints=[],lastSteps=new Map();let lastElapsed=0;
  for(const side of [-1,1]){
    for(let leg=0;leg<3;leg++){
      part(cylinder,red,(t)=>[side*.48,.17,(leg-1)*.22,.045,.48,.045,0,0,side*(.9+Math.sin(t*19+leg*2)*.22)]);
    }
    part(cylinder,red,()=>[side*.26,.5,.23,.045,.34,.045,0,0,side*-.3]);
    part(sphere,white,()=>[side*.3,.69,.28,.15,.17,.14,0,0,0]);
    part(sphere,black,()=>[side*.3,.72,.39,.1,.12,.045,0,0,0]);
    part(cylinder,red,t=>[side*.54,.4,.4,.065,.5,.065,side*.8,0,side*-.7+Math.sin(t*10)*.15]);
    for(const claw of [-1,1])part(sphere,red,t=>[side*.72+claw*.065,.62+Math.sin(t*10)*.03,.63,.11,.19,.13,claw*.2,0,claw*.35]);
  }
  const bubbleColors={steal:'#b489ff',launch:'#ffb04b',zigzag:'#4ee1cd'};
  const bubbleGeometry=geo(new THREE.SphereGeometry(.7,24,16));
  const bubbleModels=new Map();
  function bubble(item){
    const group=new THREE.Group(),material=mat(bubbleColors[item.type],{transparent:true,opacity:.36,roughness:.08,metalness:.3,depthWrite:false});
    const shell=new THREE.Mesh(bubbleGeometry,material);group.add(shell);
    const coreMaterial=mat(bubbleColors[item.type],{emissive:bubbleColors[item.type],emissiveIntensity:.25});
    const core=new THREE.Mesh(item.type==='zigzag'?geo(new THREE.TorusGeometry(.28,.085,8,20)):sphere,coreMaterial);core.scale.setScalar(item.type==='zigzag'?1:.28);group.add(core);
    if(item.type==='launch'){core.scale.set(.14,.14,.42);core.rotation.x=-Math.PI/4;}
    if(item.type==='steal'){const second=new THREE.Mesh(sphere,coreMaterial);second.scale.setScalar(.2);second.position.x=.25;group.add(second);core.position.x=-.15;}
    const shine=new THREE.Mesh(sphere,glint);shine.scale.set(.18,.075,.05);shine.position.set(-.23,.4,.42);shine.rotation.z=-.6;group.add(shine);
    const ring=new THREE.Mesh(geo(new THREE.RingGeometry(.65,.72,32)),new THREE.MeshBasicMaterial({color:bubbleColors[item.type],side:THREE.DoubleSide,transparent:true,opacity:.65}));materials.push(ring.material);ring.rotation.x=-Math.PI/2;ring.position.y=-.9;group.add(ring);
    root.add(group);bubbleModels.set(item.id,{group,resources:[material,coreMaterial,ring.material,ring.geometry,...(item.type==='zigzag'?[core.geometry]:[])]});return group;
  }
  const old=new Map();
  return {
    ready,
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
      const ids=new Set((snapshot.items||[]).map(item=>item.id));
      for(const [id,model] of bubbleModels)if(!ids.has(id)){model.group.removeFromParent();model.resources.forEach(resource=>{resource.dispose();const list=resource.isBufferGeometry?geometries:materials,index=list.indexOf(resource);if(index>=0)list.splice(index,1);});bubbleModels.delete(id);}
      for(const item of snapshot.items||[]){const group=bubbleModels.get(item.id)?.group||bubble(item);group.position.set(item.x,1.05+Math.sin(time*2.8+item.id)*.16,item.z);group.rotation.y=time*.5;}

      const crabs=snapshot.crabs||[],blend=1-Math.exp(-16*dt);
      for(const {inst,pose} of parts){inst.visible=!sprites.visible||inst===crabShadow;if(!inst.visible)continue;inst.count=crabs.length;for(let i=0;i<crabs.length;i++){
        const c=crabs[i],prev=old.get(c.id)||{x:c.x,z:c.z,angle:c.angle};
        // All parts use the same interpolated transform, committed after the loop.
        const x=prev.x+(c.x-prev.x)*blend,z=prev.z+(c.z-prev.z)*blend,angle=prev.angle+Math.atan2(Math.sin(c.angle-prev.angle),Math.cos(c.angle-prev.angle))*blend;
        const [px,py,pz,sx,sy,sz,rx,ry,rz]=pose(time+c.id*.73);
        const size=1.25;dummy.position.set(x+size*(px*Math.cos(angle)+pz*Math.sin(angle)),py*size+(c.mode==='projectile'?.3:0),z+size*(-px*Math.sin(angle)+pz*Math.cos(angle)));dummy.scale.set(sx*size,sy*size,sz*size);dummy.rotation.set(rx,ry+angle,rz);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);
        if(inst===body){color.set(c.mode==='projectile'?'#ffce61':c.mode==='patrol'?'#ff983b':c.mode==='chase'?'#ff4b23':'#ff7330');inst.setColorAt(i,color);}
      }inst.instanceMatrix.needsUpdate=true;if(inst===body&&inst.instanceColor)inst.instanceColor.needsUpdate=true;}
      sprites.count=crabs.length;
      for(let i=0;i<crabs.length;i++){const c=crabs[i],prev=old.get(c.id)||c,x=prev.x+(c.x-prev.x)*blend,z=prev.z+(c.z-prev.z)*blend,angle=prev.angle+Math.atan2(Math.sin(c.angle-prev.angle),Math.cos(c.angle-prev.angle))*blend;
        dummy.position.set(x,.08+(c.mode==='projectile'?.35:0)+Math.abs(Math.sin(time*12+c.id))*.025,z);dummy.rotation.set(-Math.PI/2,0,Math.PI+angle+Math.sin(time*10+c.id)*.035);dummy.scale.set(1+Math.sin(time*12+c.id)*.025,1,1);dummy.updateMatrix();sprites.setMatrixAt(i,dummy.matrix);
      }sprites.instanceMatrix.needsUpdate=true;
      for(const c of crabs){const prev=old.get(c.id)||{x:c.x,z:c.z,angle:c.angle};old.set(c.id,{x:prev.x+(c.x-prev.x)*blend,z:prev.z+(c.z-prev.z)*blend,angle:prev.angle+Math.atan2(Math.sin(c.angle-prev.angle),Math.cos(c.angle-prev.angle))*blend});}
    },
    dispose(){disposed=true;root.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());parts.forEach(p=>p.inst.dispose());printMesh.dispose();sparkles.dispose();arrivals.dispose();sprites.dispose();}
  };
}
