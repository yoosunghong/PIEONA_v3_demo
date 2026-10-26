import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createBabyDragon} from '../src/dragonModels.mjs';

test('Crystalwing source uses normalized four-weight skin and an independent 47 bone rig',()=>{
 const a=createBabyDragon(),b=createBabyDragon();const mesh=a.root.getObjectByName('coat');
 assert.equal(mesh.isSkinnedMesh,true);assert.equal(mesh.skeleton.bones.length,47);
 assert.notEqual(mesh.skeleton,b.root.getObjectByName('coat').skeleton);
 const otherPose=b.root.getObjectByName('coat').skeleton.bones.map(bone=>bone.quaternion.toArray());
 const weights=mesh.geometry.attributes.skinWeight;
 for(let i=0;i<weights.count;i++)assert.ok(Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1)<.00001);
 const before=[];for(let i=0;i<weights.count;i+=97)before.push(mesh.getVertexPosition(i,new Vector3()).clone());
 a.runMotion.update(.13,true);a.root.updateMatrixWorld(true);mesh.skeleton.update();
 let changed=0;for(let i=0,j=0;i<weights.count;i+=97,j++)if(mesh.getVertexPosition(i,new Vector3()).distanceTo(before[j])>.0001)changed++;
 assert.ok(changed>10,'animation must deform the imported mesh');
 assert.deepEqual(b.root.getObjectByName('coat').skeleton.bones.map(bone=>bone.quaternion.toArray()),otherPose,'animating one dragon must preserve the other skeleton pose');
 a.runMotion.update(1,false,true);a.root.updateMatrixWorld(true);
 const still=[];for(let i=0;i<weights.count;i+=97)still.push(mesh.getVertexPosition(i,new Vector3()).clone());
 a.runMotion.update(100,false,true);a.root.updateMatrixWorld(true);
 for(let i=0,j=0;i<weights.count;i+=97,j++)assert.ok(mesh.getVertexPosition(i,new Vector3()).distanceTo(still[j])<.00001,'reduced motion holds a stable flight pose');
});
