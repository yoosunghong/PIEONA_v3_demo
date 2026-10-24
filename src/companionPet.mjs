import * as THREE from 'three';
import {petAppearance} from '../shared/pets.mjs';
import {createBabyDragon} from './dragonModels.mjs';

// Smooth stylized companion animals: independent of the player's humanoid assets and rig.
export function createCompanionPet(appearance={}){
  const {petType,petColor}=petAppearance(appearance),cat=petType==='cat',rabbit=petType==='rabbit';
  if(petType==='babyDragon')return createBabyDragon(petColor);
  const root=new THREE.Group();root.name=`AI ${petType}`;root.userData.petType=petType;root.scale.setScalar(.65);root.userData.generated=true;
  const coat=new THREE.MeshStandardMaterial({color:petColor,roughness:.78});
  const cream=new THREE.MeshStandardMaterial({color:0xfff2da,roughness:.9});
  const dark=new THREE.MeshStandardMaterial({color:0x392d32,roughness:.65});
  const pink=new THREE.MeshStandardMaterial({color:0xef9da5,roughness:.8});
  const collar=new THREE.MeshStandardMaterial({color:0x78afa5,roughness:.7});
  function oval(parent,name,material,x,y,z,sx,sy,sz){
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,32,24),material);
    mesh.name=name;mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  const body=new THREE.Group();body.name='body';root.add(body);
  oval(body,'coat',coat,0,.55,-.12,.285,.285,.46);
  oval(body,'chest',cream,0,.64,.25,.22,.24,.10);
  const head=new THREE.Group();head.position.set(0,.96,.29);body.add(head);
  oval(head,'head',coat,0,0,0,.335,.305,.285);
  oval(head,'muzzle',cream,0,-.105,.235,cat?.16:rabbit?.17:.20,.105,.105);
  oval(head,'nose',dark,0,-.08,.35,rabbit?.045:.065,.045,.035);
  for(const sign of [-1,1]){
    oval(head,'eye',dark,sign*.14,.025,.25,.037,.048,.025);
    oval(head,'eye sparkle',cream,sign*.14-.01,.041,.272,.011,.013,.008);
    if(cat){
      const shape=new THREE.Shape();shape.moveTo(-.13,0);shape.quadraticCurveTo(-.15,.03,-.025,.25);shape.quadraticCurveTo(0,.28,.025,.25);shape.quadraticCurveTo(.15,.03,.13,0);shape.closePath();
      const ear=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.07,bevelEnabled:true,bevelThickness:.018,bevelSize:.018,bevelSegments:4,curveSegments:12,steps:1}),coat);ear.name='pointed ear';ear.position.set(sign*.23,.18,-.06);ear.rotation.z=-sign*.18;head.add(ear);
      oval(head,'inner ear',pink,sign*.24,.33,.055,.044,.09,.018);
    }else if(rabbit){
      const ear=oval(head,'long ear',coat,sign*.14,.45,-.03,.09,.34,.075);ear.rotation.z=-sign*.13;
      const inner=oval(head,'inner ear',pink,sign*.15,.46,.03,.045,.25,.025);inner.rotation.z=-sign*.13;
    }else{const ear=oval(head,'floppy ear',coat,sign*.30,-.09,-.02,.11,.24,.095);ear.rotation.z=sign*.18;}
    oval(head,'cheek',pink,sign*.21,-.10,.235,.045,.022,.014);
  }
  if(!cat&&!rabbit)oval(head,'tongue',pink,0,-.20,.29,.035,.04,.02);
  if(cat)for(const sign of [-1,1])for(const y of [-.08,-.13]){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(sign*.18,y,.29),new THREE.Vector3(sign*.38,y+.025,.24)]),new THREE.LineBasicMaterial({color:0x665e59}));head.add(line);}
  const band=new THREE.Mesh(new THREE.TorusGeometry(.21,.025,6,20),collar);band.position.set(0,.78,.26);band.rotation.x=Math.PI/2;body.add(band);
  oval(body,'tag',cream,0,.71,.36,.04,.05,.018);
  const legs=[];
  for(const x of [-.20,.20])for(const z of [-.40,.21]){
    const leg=new THREE.Group();leg.position.set(x,.33,z);body.add(leg);legs.push(leg);
    oval(leg,'leg',coat,0,-.065,0,.082,.20,.09);
    oval(leg,'paw',cream,0,-.245,.035,.095,.075,.13);
  }
  const tail=new THREE.Group();tail.position.set(0,.65,-.53);body.add(tail);
  if(rabbit)oval(tail,'tail',cream,0,.01,-.03,.105,.105,.105);
  else{const curve=new THREE.CatmullRomCurve3(cat?[new THREE.Vector3(0,0,0),new THREE.Vector3(0,.14,-.12),new THREE.Vector3(.02,.39,-.18),new THREE.Vector3(.11,.46,-.14)]:[new THREE.Vector3(0,0,0),new THREE.Vector3(0,.16,-.13),new THREE.Vector3(.015,.29,-.08),new THREE.Vector3(.06,.27,.015)]);const tip=new THREE.Mesh(new THREE.TubeGeometry(curve,24,cat?.047:.065,12,false),coat);tip.name='tail';tip.castShadow=true;tail.add(tip);}
  const mouth=new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.06,-.15,.323),new THREE.Vector3(0,-.19,.34),new THREE.Vector3(.06,-.15,.323)).getPoints(20)),new THREE.LineBasicMaterial({color:0x75584d}));head.add(mouth);
  const hearts=new THREE.Group();hearts.name='affection';hearts.position.set(0,1.55,0);root.add(hearts);hearts.visible=false;
  const heartShape=new THREE.Shape();heartShape.moveTo(0,-.08);heartShape.bezierCurveTo(-.20,.04,-.11,.18,0,.09);heartShape.bezierCurveTo(.11,.18,.20,.04,0,-.08);
  const heartMaterial=new THREE.MeshStandardMaterial({color:0xee8f9d,roughness:.6,side:THREE.DoubleSide});
  for(const x of [-.18,.15]){const heart=new THREE.Mesh(new THREE.ShapeGeometry(heartShape,20),heartMaterial);heart.position.x=x;heart.scale.setScalar(.65);hearts.add(heart);}
  let interaction=null;
  let progress=0;
  const runMotion={update(time,moving,reduced=false){
    const stride=moving&&!reduced?Math.sin(time*13)*.55:0;
    legs.forEach((leg,i)=>{leg.rotation.x=stride*(i===0||i===3?1:-1);});
    tail.rotation.z=reduced?0:Math.sin(time*(moving?12:5))*.35;
    const reacting=interaction&&Date.now()<interaction.until;
    const petted=reacting&&interaction.kind==='pet';
    hearts.visible=!!petted;
    head.rotation.z=petted?.14+(reduced?0:Math.sin(time*4)*.035):reduced?0:Math.sin(time*1.8)*.025;
    head.rotation.x=0;
    hearts.position.y=1.5+(reduced?0:Math.sin(time*3)*.08);
    if(petted&&!reduced)tail.rotation.z=Math.sin(time*12)*.5;
    head.children.filter(o=>o.name==='eye').forEach(o=>{o.scale.y=petted?.023:.048;});
    return moving&&!reduced?Math.abs(stride)*.035:0;
  }};
  const sitMotion={get active(){return progress>0;},update(dt,seated,height=.58,reduced=false){
    progress=reduced?Number(seated):THREE.MathUtils.clamp(progress+(seated?1:-1)*dt*4,0,1);
    body.rotation.x=-.15*progress;body.position.y=-.13*progress;
    legs.forEach((leg,i)=>{leg.rotation.x=i%2===0?-.9*progress:0;});
    return (height-.39)*progress;
  }};
  return {root,runMotion,sitMotion,setInteraction:value=>{interaction=value||null;}};
}
