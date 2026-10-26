import {Group,Mesh,CylinderGeometry,MeshStandardMaterial,Vector3,Quaternion,BufferGeometry,Line,LineBasicMaterial} from 'three';

// Solve in world space so every supplied rig uses its own limb lengths and axes.
export function createFishingMotion(avatar){
  const root=avatar.parent,bones=new Map();avatar.traverse(b=>{if(b.isBone)bones.set(b.name,b);});
  const find=suffix=>[...bones.values()].find(b=>b.name.endsWith(suffix));
  const pos=b=>b.getWorldPosition(new Vector3());
  function aim(bone,child,target){
    avatar.updateWorldMatrix(true,true);
    const delta=new Quaternion().setFromUnitVectors(pos(child).sub(pos(bone)).normalize(),target.clone().sub(pos(bone)).normalize());
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(delta).multiply(bone.getWorldQuaternion(new Quaternion())));
    avatar.updateWorldMatrix(true,true);
  }
  function arm(side,target){
    const a=find(side+'Arm'),b=find(side+'ForeArm'),c=find(side+'Hand');if(!a||!b||!c)return;
    avatar.updateWorldMatrix(true,true);
    const start=pos(a),goal=root.localToWorld(target.clone()),l1=start.distanceTo(pos(b)),l2=pos(b).distanceTo(pos(c));
    const dir=goal.clone().sub(start).normalize(),d=Math.max(Math.abs(l1-l2)+.0001,Math.min(l1+l2-.0001,start.distanceTo(goal)));
    const along=(l1*l1-l2*l2+d*d)/(2*d);
    const pole=root.localToWorld(new Vector3(side==='Left'?.8:-.8,target.y-.5,.65)).sub(start);
    pole.addScaledVector(dir,-pole.dot(dir)).normalize();
    aim(a,b,start.clone().addScaledVector(dir,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along))));
    aim(b,c,start.clone().addScaledVector(dir,d));
  }
  const props=new Group();props.userData.generated=true;props.visible=false;root.add(props);
  const rod=new Mesh(new CylinderGeometry(.014,.025,1,8),new MeshStandardMaterial({color:'#987447',roughness:.7}));props.add(rod);
  const line=new Line(new BufferGeometry().setFromPoints([new Vector3(),new Vector3()]),new LineBasicMaterial({color:'#cbdce4',transparent:true,opacity:.8}));props.add(line);
  let castStarted=0,wasActive=false;
  return {props,update(time,active,reduced=false,caught=false){
    props.visible=active;
    if(!active){wasActive=false;return;}
    if(!wasActive)castStarted=time;wasActive=true;
    const cast=reduced?0:Math.max(0,1-(time-castStarted)/.8);
    const lift=reduced?0:Math.sin(time*1.8)*.025+(caught ? .16 : 0);
    const hip=find('Hips'),height=hip?root.worldToLocal(pos(hip)).y:.7;
    const grip=new Vector3(-.12,height+.45+lift,.58-cast*.28);
    const rodDirection=new Vector3(.1,.75+cast*.7,1.6-cast*1.4);
    arm('Right',grip);
    const hand=find('RightHand'),start=hand?root.worldToLocal(pos(hand)):grip;
    arm('Left',start.clone().addScaledVector(rodDirection.clone().normalize(),.18));
    const tip=start.clone().add(rodDirection);
    rod.position.copy(start).add(tip).multiplyScalar(.5);rod.scale.y=start.distanceTo(tip);
    rod.quaternion.setFromUnitVectors(new Vector3(0,1,0),tip.clone().sub(start).normalize());
    const water=new Vector3(tip.x,-.28,2.6);
    const points=line.geometry.attributes.position;points.setXYZ(0,...tip.toArray());points.setXYZ(1,...water.toArray());points.needsUpdate=true;line.geometry.computeBoundingSphere();
  }};
}
