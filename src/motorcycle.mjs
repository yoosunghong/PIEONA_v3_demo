import * as THREE from 'three';
import {MOTORCYCLE_SPEED} from './villageMovement.mjs';

// Vehicle coordinates match the avatar: +Z forward, ground at the character root.
export function createMotorcycle(color='#88b5d7'){
  const root=new THREE.Group();root.userData.generated=true;
  const paint=new THREE.MeshStandardMaterial({color,metalness:.3,roughness:.4});
  const metal=new THREE.MeshStandardMaterial({color:'#ccd5df',metalness:.75,roughness:.3});
  const rubber=new THREE.MeshStandardMaterial({color:'#303341',roughness:.9});
  const lamp=new THREE.MeshStandardMaterial({color:'#fff2c6',emissive:'#ffe3a0',emissiveIntensity:.7});
  const wheels=[];
  function mesh(geometry,material,x,y,z){const part=new THREE.Mesh(geometry,material);part.position.set(x,y,z);part.castShadow=true;root.add(part);return part;}
  function bar(a,b,r=.045,material=metal){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);const part=mesh(new THREE.CylinderGeometry(r,r,delta.length(),10),material,...start.add(end).multiplyScalar(.5).toArray());part.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());}
  for(const z of [-.85,.95]){
    const wheel=new THREE.Group();wheel.position.set(0,.38,z);root.add(wheel);wheels.push(wheel);
    const tire=new THREE.Mesh(new THREE.TorusGeometry(.29,.095,10,24),rubber);tire.rotation.y=Math.PI/2;wheel.add(tire);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.19,.19,.17,16),metal);hub.rotation.z=Math.PI/2;wheel.add(hub);
    for(let i=0;i<6;i++){const spoke=new THREE.Mesh(new THREE.BoxGeometry(.05,.38,.035),rubber);spoke.rotation.x=i*Math.PI/3;wheel.add(spoke);}
  }
  for(const x of [-.16,.16]){
    bar([x,.38,-.85],[x,.83,-.12]);bar([x,.83,-.12],[x,.38,.95]);bar([x,.38,.95],[x,1.3,.72]);
  }
  mesh(new THREE.BoxGeometry(.52,.36,.56),metal,0,.61,.05);
  const tank=mesh(new THREE.SphereGeometry(.38,20,12),paint,0,1.04,.42);tank.scale.set(.8,.65,1.25);
  mesh(new THREE.BoxGeometry(.62,.16,.67),rubber,0,.96,-.15);
  mesh(new THREE.BoxGeometry(.56,.15,.5),paint,0,.85,-.63);
  mesh(new THREE.SphereGeometry(.16,16,12),lamp,0,1.26,.94);
  const tail=mesh(new THREE.BoxGeometry(.22,.1,.07),new THREE.MeshStandardMaterial({color:'#ef777e',emissive:'#a92535'}),0,.91,-.91);
  tail.name='tail-light';
  bar([0,1.3,.72],[0,1.4,.35]);
  bar([-.4,1.4,.35],[.4,1.4,.35],.04);
  for(const x of [-.34,.34]){bar([x,1.4,.23],[x,1.4,.48],.055,rubber);bar([x,.65,.12],[x*.45,.65,.12],.045);}
  bar([.32,.51,.08],[.39,.43,-1.03],.085);
  // Open, dark end makes the exhaust outlet visible from behind.
  const outlet=mesh(new THREE.CircleGeometry(.065,12),rubber,.39,.43,-1.035);outlet.rotation.y=Math.PI;
  root.userData.wheels=wheels;
  root.userData.exhaust=new THREE.Vector3(.39,.43,-1.07);
  return root;
}

// Solve each two-bone limb in world space; the FBX exports use different local axes.
export function createRidePose(avatar){
  const bones=[];avatar.traverse(bone=>{if(bone.isBone)bones.push({bone,q:bone.quaternion.clone()});});
  const original=avatar.position.clone(),root=avatar.parent;
  const find=name=>bones.find(({bone})=>bone.name.toLowerCase().endsWith(name.toLowerCase()))?.bone;
  const position=bone=>bone.getWorldPosition(new THREE.Vector3());
  function aim(bone,child,target){
    avatar.updateWorldMatrix(true,true);
    const from=position(child).sub(position(bone)).normalize(),to=target.clone().sub(position(bone)).normalize();
    const q=bone.getWorldQuaternion(new THREE.Quaternion()),parentQ=bone.parent.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(parentQ.invert().multiply(new THREE.Quaternion().setFromUnitVectors(from,to)).multiply(q));
    avatar.updateWorldMatrix(true,true);
  }
  function limb(a,b,c,target,pole){
    const first=find(a),middle=find(b),end=find(c);if(!first||!middle||!end)return;
    avatar.updateWorldMatrix(true,true);
    const start=position(first),l1=start.distanceTo(position(middle)),l2=position(middle).distanceTo(position(end));
    const goal=root.localToWorld(new THREE.Vector3(...target)),direction=goal.clone().sub(start).normalize();
    const distance=THREE.MathUtils.clamp(start.distanceTo(goal),Math.abs(l1-l2)+.001,l1+l2-.001);
    const along=(l1*l1-l2*l2+distance*distance)/(2*distance);
    const bend=root.localToWorld(new THREE.Vector3(...pole)).sub(start);bend.addScaledVector(direction,-bend.dot(direction)).normalize();
    const joint=start.clone().addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)));
    aim(first,middle,joint);aim(middle,end,start.clone().addScaledVector(direction,distance));
  }
  const hips=find('Hips'),spine=find('Spine');
  if(hips&&spine){
    aim(hips,spine,position(hips).add(new THREE.Vector3(0,1,.16).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()))));
    const pelvis=root.worldToLocal(position(hips));avatar.position.add(new THREE.Vector3(0,1.08,-.15).sub(pelvis));
  }
  for(const [side,sign] of [['Left',1],['Right',-1]]){
    limb(side+'UpLeg',side+'Leg',side+'Foot',[sign*.34,.72,.12],[sign*.75,.8,1.2]);
    limb(side+'Arm',side+'ForeArm',side+'Hand',[sign*.34,1.4,.35],[sign*.95,1.1,.3]);
    const foot=find(side+'Foot'),toe=find(side+'ToeBase');if(foot&&toe)aim(foot,toe,position(foot).add(new THREE.Vector3(0,-.08,.3).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()))));
  }
  const seated=avatar.position.clone();bones.forEach(part=>{part.ride=part.bone.quaternion.clone();part.bone.quaternion.copy(part.q);});avatar.position.copy(original);
  let active=false;
  return {update(riding){if(riding||active){bones.forEach(part=>part.bone.quaternion.copy(riding?part.ride:part.q));avatar.position.copy(riding?seated:original);}active=riding;}};
}

export function createMotorcycleRide(avatar,color){
  const root=avatar.parent,bike=createMotorcycle(color),pose=createRidePose(avatar);root.add(bike);
  const smoke=new THREE.Group();smoke.userData.generated=true;root.add(smoke);
  const geometry=new THREE.IcosahedronGeometry(1,1),puffs=[];
  for(let i=0;i<24;i++){
    const puff=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:'#c7cbd1',transparent:true,opacity:0,depthWrite:false}));
    puff.visible=false;smoke.add(puff);puffs.push({mesh:puff,age:2,world:new THREE.Vector3(),velocity:new THREE.Vector3()});
  }
  let elapsed=0,index=0;
  return {bike,smoke,update(dt,moving,riding=true,reducedMotion=false,speed=MOTORCYCLE_SPEED){
    bike.visible=riding;pose.update(riding);elapsed=moving&&riding&&!reducedMotion?elapsed+dt:0;
    root.updateWorldMatrix(true,true);
    while(elapsed>=.065){elapsed-=.065;const puff=puffs[index++%puffs.length];puff.age=0;puff.world.copy(bike.localToWorld(bike.userData.exhaust.clone()));puff.velocity.set((Math.random()-.5)*.12,.3,-.6).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));}
    for(const puff of puffs){
      puff.age+=dt;puff.mesh.visible=puff.age<1.25&&!reducedMotion;
      if(!puff.mesh.visible)continue;
      puff.world.addScaledVector(puff.velocity,dt);puff.world.y+=dt*.16;
      puff.mesh.position.copy(smoke.worldToLocal(puff.world.clone()));puff.mesh.scale.setScalar(.055+puff.age*.19);puff.mesh.material.opacity=.32*(1-puff.age/1.25);
    }
    if(moving&&riding)bike.userData.wheels.forEach(wheel=>{wheel.rotation.x+=dt*speed/.38;});
  }};
}
