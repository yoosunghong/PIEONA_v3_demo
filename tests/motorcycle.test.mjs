import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3,Group,Vector3,TextureLoader,Texture} from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {characters} from '../shared/world.mjs';
import {createMotorcycleRide} from '../src/motorcycle.mjs';
import {createSitMotion} from '../src/benchMotion.mjs';

test('all four FBX riders reach the grips and pegs, sit on the saddle, and restore for bench use',()=>{
  const load=TextureLoader.prototype.load,previousWindow=globalThis.window;
  globalThis.window={URL};TextureLoader.prototype.load=()=>new Texture();
  try{for(const character of characters){
    const buffer=readFileSync(`resource/${character.folder}/${character.model}`);
    const avatar=new FBXLoader().parse(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
    avatar.children.filter(child=>child.name==='Icosphere').forEach(child=>child.removeFromParent());
    avatar.scale.setScalar(2.65/new Box3().setFromObject(avatar).getSize(new Vector3()).y);
    const bounds=new Box3().setFromObject(avatar),center=bounds.getCenter(new Vector3());avatar.position.set(-center.x,-bounds.min.y,-center.z);
    const root=new Group();root.add(avatar);root.position.set(3,.39,-2);root.rotation.y=1.2;
    const original=avatar.position.clone(),rest=[];avatar.traverse(bone=>{if(bone.isBone)rest.push([bone,bone.quaternion.clone()]);});
    const find=name=>rest.find(([bone])=>bone.name.endsWith(name))[0];
    const local=name=>{root.updateMatrixWorld(true);return root.worldToLocal(find(name).getWorldPosition(new Vector3()));};
    const sit=createSitMotion(avatar),ride=createMotorcycleRide(avatar);
    ride.update(.1,false);assert.ok(local('Hips').distanceTo(new Vector3(0,1.08,-.15))<1e-5,character.id+' saddle');
    for(const [side,sign] of [['Left',1],['Right',-1]]){
      assert.ok(local(side+'Hand').distanceTo(new Vector3(sign*.34,1.4,.35))<.025,character.id+' grip '+JSON.stringify(local(side+'Hand')));
      assert.ok(local(side+'Foot').distanceTo(new Vector3(sign*.34,.72,.12))<.025,character.id+' peg '+JSON.stringify(local(side+'Foot')));
      assert.ok(local(side+'Leg').z>local(side+'UpLeg').z,character.id+' bent knee');
    }
    ride.update(.1,false,false);assert.equal(ride.bike.visible,false);assert.ok(avatar.position.distanceTo(original)<1e-6);
    for(const [bone,q] of rest)assert.ok(bone.quaternion.angleTo(q)<1e-6,character.id+' restored '+bone.name);
    root.position.y=.39+sit.update(.75,true,.68,true);assert.ok(Math.abs(find('Hips').getWorldPosition(new Vector3()).y-.77)<1e-5);
    sit.update(.75,false,.68,true);ride.update(.1,false);assert.ok(local('Hips').distanceTo(new Vector3(0,1.08,-.15))<1e-5);
  }}finally{TextureLoader.prototype.load=load;globalThis.window=previousWindow;}
});

test('exhaust emits from the rear only in motion, stays in world space on turns and expires in a bounded pool',()=>{
  const root=new Group(),avatar=new Group();root.add(avatar);const ride=createMotorcycleRide(avatar);
  ride.update(.1,false);assert.equal(ride.smoke.children.filter(p=>p.visible).length,0);
  ride.update(.065,true);const puff=ride.smoke.children.find(p=>p.visible);assert.ok(puff);assert.ok(puff.position.z<-1);
  root.updateMatrixWorld(true);const before=puff.getWorldPosition(new Vector3());root.position.x=10;root.rotation.y=Math.PI;
  ride.update(.01,false);root.updateMatrixWorld(true);assert.ok(puff.getWorldPosition(new Vector3()).distanceTo(before)<.02);
  for(let i=0;i<50;i++)ride.update(.05,true);assert.equal(ride.smoke.children.length,24);
  for(let i=0;i<30;i++)ride.update(.05,false);assert.equal(ride.smoke.children.filter(p=>p.visible).length,0);
  ride.update(.1,true,false);assert.equal(ride.smoke.children.filter(p=>p.visible).length,0);
  ride.update(.1,true,true,true);assert.equal(ride.smoke.children.filter(p=>p.visible).length,0);
});
