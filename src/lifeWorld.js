import * as THREE from 'three';
import {lifeDefinitions} from '../shared/lifeLayout.mjs';
import {FISHING_ANCHORS,STORAGE} from '../shared/life.mjs';
import {GARDEN_BEDS,KITCHEN,cropState} from '../shared/garden.mjs';

export function createLifeWorld(){
  const root=new THREE.Group(),rods=[],beds=[];
  const material=color=>new THREE.MeshStandardMaterial({color,roughness:.75});
  const wood=material(0xb78c60),trim=material(0xf0d3a1),metal=material(0x567b7d);
  function box(w,h,d,mat,x,y,z,parent=root){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  const sea=new THREE.Mesh(new THREE.RingGeometry(7.05,28,128),new THREE.MeshStandardMaterial({color:0x72becb,roughness:.28,metalness:.2,side:THREE.DoubleSide}));sea.rotation.x=-Math.PI/2;sea.position.y=-.72;root.add(sea);
  for(const anchor of FISHING_ANCHORS){
    const deck=new THREE.Group();deck.userData.action=anchor.id;root.add(deck);
    for(let i=0;i<7;i++)box(.84,.12,.18,i%2?wood:trim,anchor.x,.47,5.75+i*.2,deck);
    box(.1,.8,.1,wood,anchor.x-.34,.02,6.7,deck);box(.1,.8,.1,wood,anchor.x+.34,.02,6.7,deck);
    const rod=new THREE.Group();rod.userData.lifeAction=anchor.id;rod.position.set(anchor.x,.62,anchor.z);root.add(rod);
    const start=new THREE.Vector3(.18,.35,.4),end=new THREE.Vector3(.18,1.6,2.05),delta=end.clone().sub(start);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.012,.028,delta.length(),8),metal);pole.position.copy(start).addScaledVector(delta,.5);pole.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());rod.add(pole);
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([end,new THREE.Vector3(.18,-1.28,3.3)]),new THREE.LineBasicMaterial({color:0xf2f4e4,transparent:true,opacity:.85}));rod.add(line);
    const bobber=new THREE.Mesh(new THREE.SphereGeometry(.065,12,8),material(0xf3a28a));bobber.position.set(.18,-1.28,3.3);rod.add(bobber);
    const ripple=new THREE.Mesh(new THREE.RingGeometry(.16,.18,32),new THREE.MeshBasicMaterial({color:0xe0ffff,transparent:true,opacity:.5,side:THREE.DoubleSide}));ripple.rotation.x=-Math.PI/2;ripple.position.copy(bobber.position);rod.add(ripple);
    rod.visible=false;rods.push({anchor,rod,pole,line,bobber,ripple,since:null});
  }
  const chest=new THREE.Group();chest.position.set(STORAGE.x,.2,STORAGE.z);chest.userData.action='storage';root.add(chest);
  box(.9,.6,.62,wood,0,.3,0,chest);box(1,.13,.7,trim,0,.65,0,chest);box(.12,.24,.05,metal,0,.51,.34,chest);
  for(const x of [-.32,.32])box(.06,.63,.64,metal,x,.32,0,chest);
  for(const bed of GARDEN_BEDS){
    const group=new THREE.Group();group.position.set(bed.x,.28,bed.z);group.userData.action=bed.id;root.add(group);
    box(.93,.16,.85,wood,0,0,0,group);box(.8,.06,.72,material(0x644d3c),0,.1,0,group);
    const plant=new THREE.Group();group.add(plant);
    for(const x of [-.22,.22])for(const z of [-.2,.2]){
      box(.045,.45,.045,material(0x6e9851),x,.32,z,plant);
      for(const side of [-1,1]){const leaf=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),material(0x88b85e));leaf.scale.set(1,.3,.65);leaf.position.set(x+side*.09,.4,z);leaf.rotation.z=side*.4;plant.add(leaf);}
      const fruit=new THREE.Mesh(new THREE.SphereGeometry(.095,10,8),material(0xe7bf55));fruit.position.set(x,.56,z);plant.add(fruit);fruit.userData.fruit=true;
    }
    beds.push({bed,plant});
  }
  const kitchen=new THREE.Group();kitchen.position.set(KITCHEN.x,.28,KITCHEN.z);kitchen.userData.action='kitchen';root.add(kitchen);
  box(1.4,.12,.8,trim,0,.7,0,kitchen);for(const x of [-.55,.55])box(.12,.7,.6,wood,x,.3,0,kitchen);
  const pot=new THREE.Mesh(new THREE.CylinderGeometry(.25,.2,.24,16),metal);pot.position.set(-.3,.88,0);kitchen.add(pot);
  box(.38,.04,.4,wood,.4,.79,0,kitchen);
  root.remove(chest,kitchen);
  const facilities=new Map();
  for(const def of lifeDefinitions){
    if(['life-storage','life-kitchen'].includes(def.id))continue;
    const parts=root.children.filter(part=>{const action=part.userData.action||part.userData.lifeAction;return def.action==='fishing'?action?.startsWith('fishing:'):action===def.action;});
    const group=new THREE.Group();group.position.set(def.x,0,def.z);group.userData.itemId='scenery:'+def.id;root.add(group);root.updateMatrixWorld(true);parts.forEach(part=>group.attach(part));facilities.set(group.userData.itemId,group);
    if(typeof document==='undefined')continue;
    const label=createFacilityLabel(def.name);label.position.y=def.action==='kitchen'?1.5:1.25;group.add(label);
  }
  return {root,facilities,update(time,members,garden){
    const now=(garden?.serverTime||Date.now())+Math.max(0,Date.now()-(garden?.receivedAt||Date.now()));
    for(const {bed,plant} of beds){const plot=garden?.plots?.find(p=>p.id===bed.id);plant.visible=!!plot?.cropId;if(!plant.visible)continue;const ready=cropState(plot,now)==='Ready';plant.scale.y=ready?1:.35+.55*Math.min(1,(now-plot.plantedAt)/(plot.readyAt-plot.plantedAt));for(const child of plant.children)if(child.userData.fruit){child.visible=ready;child.material.color.setHex(plot.cropId==='TOMATO'?0xe87556:plot.cropId==='FLOWER'?0xf6c45a:0x75a65c);}}
    for(const entry of rods){
      const active=members.some(m=>m.seatId===entry.anchor.id);
      if(active&&!entry.rod.visible)entry.since=time;
      entry.rod.visible=active;if(!active)continue;
      const cast=Math.min(1,(time-entry.since)/1.1);
      entry.rod.scale.z=.15+.85*cast;entry.pole.rotation.z=Math.sin(time*2)*.025;
      entry.bobber.position.y=-1.28+Math.sin(time*2.5)*.035;
      entry.ripple.scale.setScalar(1+(time%2)*.6);entry.ripple.material.opacity=.5*(1-time%2/2);
    }
  }};
}

export function createFacilityLabel(name){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;
  const context=canvas.getContext('2d');context.fillStyle='rgba(20,35,48,.58)';context.fillRect(0,0,256,64);
  context.font='500 30px sans-serif';context.fillStyle='#fff';context.textAlign='center';context.textBaseline='middle';context.fillText(name,128,32);
  const label=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthTest:false,toneMapped:false}));
  label.name='facility-label';label.scale.set(1.15,.29,1);label.renderOrder=5;return label;
}
