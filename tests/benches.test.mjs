import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Group,Vector3,Quaternion,Box3,Texture,TextureLoader} from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {characters} from '../shared/world.mjs';
import {villageBenches,nearestBench,benchExit,benchCameraView,benchInteractionKey} from '../shared/benches.mjs';
import {createSitMotion} from '../src/benchMotion.mjs';
import {constrainScenePanning} from '../src/sceneCamera.mjs';

test('bench interactions follow saved positions, rotations and storage visibility',()=>{
  const village={scenery:[{id:'bench-0',x:-4,z:2,rotation:1},{id:'bench-1',hidden:true}],items:[{id:'placed',type:'bench',x:3,z:3,rotation:2},{id:'stored',type:'bench',hidden:true},{id:'plant',type:'planter'}]};
  const benches=villageBenches(village);
  assert.equal(benches.length,2);assert.equal(benches[0].rotation,Math.PI/2+.5);
  assert.equal(nearestBench(benches,{x:-4,z:2.8}).id,'scenery:bench-0');
  assert.equal(nearestBench(benches,{x:0,z:0}),null);
  assert.equal(nearestBench(benches,{x:3,z:3},[{userId:'other',seatId:'placed'}],'me'),null);
  assert.equal(nearestBench(benches,{x:3,z:3},[{userId:'me',seatId:'placed'}],'me').id,'placed');
  const edge=benchExit({x:6.5,z:0,rotation:Math.PI/2});assert.ok(Math.hypot(edge.x,edge.z)<=5.8);
  const bench=benches[1],view=benchCameraView(bench);
  assert.equal(view.target[0],3);assert.ok(Math.abs(view.target[1]-1.58)<1e-6);assert.equal(view.target[2],3);assert.ok(Math.hypot(...view.position.map((v,i)=>v-view.target[i]))<7);
});

test('C uses the physical Korean keyboard key and ignores text entry, key repeat and shortcuts',()=>{
  assert.equal(benchInteractionKey({code:'KeyC',key:'ㅊ'}),true);
  assert.equal(benchInteractionKey({key:'C'}),true);
  for(const flag of ['repeat','defaultPrevented','isComposing','ctrlKey','altKey','metaKey'])assert.equal(benchInteractionKey({code:'KeyC',[flag]:true}),false);
  assert.equal(benchInteractionKey({code:'KeyC',target:{isContentEditable:true}}),false);
  assert.equal(benchInteractionKey({code:'KeyC',target:{closest:()=>({})}}),false);
});

test('seated camera panning preserves elevated framing and remains movable after zooming',()=>{
  const target=new Vector3(3,1.68,3),position=new Vector3(5,4,7),camera={position,updateMatrixWorld(){}};
  constrainScenePanning(camera,{target},'village',{panCenter:[3,1.68,3]});
  assert.equal(target.y,1.68);assert.deepEqual(position.toArray(),[5,4,7]);
  target.x+=1;position.x+=1;constrainScenePanning(camera,{target},'village',{panCenter:[3,1.68,3]});
  assert.equal(target.x,4);assert.equal(position.x,6);
});

test('all four actual character rigs bend thighs forward and knees down, align hips to the seat, and restore their pose',()=>{
  const load=TextureLoader.prototype.load,previousWindow=globalThis.window;
  globalThis.window={URL};TextureLoader.prototype.load=()=>new Texture();
  try{for(const character of characters){
    const file=`resource/${character.folder}/${character.folder}_Animation_${character.animation}_withSkin.fbx`,buffer=readFileSync(file);
    const avatar=new FBXLoader().parse(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
    avatar.children.filter(child=>child.name==='Icosphere').forEach(child=>child.removeFromParent());
    const size=new Box3().setFromObject(avatar).getSize(new Vector3());avatar.scale.setScalar(2.65/size.y);
    const bounds=new Box3().setFromObject(avatar),center=bounds.getCenter(new Vector3());avatar.position.set(-center.x,-bounds.min.y,-center.z);
    const root=new Group();root.add(avatar);root.rotation.y=1.2;root.position.set(3,.39,-2);
    const find=name=>{let result;avatar.traverse(bone=>{if(bone.name==='mixamorig'+name)result=bone;});return result;};
    const rest=[];avatar.traverse(bone=>{if(bone.isBone)rest.push([bone,bone.quaternion.clone(),bone.position.clone()]);});
    const original=avatar.position.clone(),motion=createSitMotion(avatar);
    const offset=motion.update(.375,true,.68);assert.ok(motion.blend>.4&&motion.blend<.6);
    root.position.y=.39+motion.update(.375,true,.68);root.updateMatrixWorld(true);
    assert.ok(Math.abs(find('Hips').getWorldPosition(new Vector3()).y-.77)<1e-5,character.id);
    for(const side of ['Left','Right']){
      const hip=find(side+'UpLeg').getWorldPosition(new Vector3()),knee=find(side+'Leg').getWorldPosition(new Vector3()),foot=find(side+'Foot').getWorldPosition(new Vector3());
      const thigh=knee.clone().sub(hip).normalize().applyQuaternion(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-1.2));
      assert.ok(thigh.z>.95,character.id+' thigh');assert.ok(foot.y<knee.y-.15,character.id+' knee');
    }
    for(let i=0;i<20;i++)motion.update(.05,true,.68);
    motion.update(.75,false,.68);assert.equal(motion.active,false);assert.ok(avatar.position.distanceTo(original)<1e-6);
    for(const [bone,q,p] of rest){assert.ok(bone.quaternion.angleTo(q)<1e-6,character.id+' '+bone.name);assert.ok(bone.position.distanceTo(p)<1e-6);}
  }}finally{TextureLoader.prototype.load=load;globalThis.window=previousWindow;}
});
