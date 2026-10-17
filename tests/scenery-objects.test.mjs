import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createGardenDetails} from '../src/gardenDetails.js';
import {registerGardenDetails,registerScenery} from '../src/sceneryObjects.js';
import {perimeterRocks,sceneryDefinitions,villageScenery,validSceneryPlacement} from '../shared/scenery.mjs';
import {disposeObject} from '../src/worldAssets.js';

function rig(){
  const world=new THREE.Scene(),roots=new Map(),water=new THREE.Mesh(new THREE.CircleGeometry(1),new THREE.MeshBasicMaterial());
  water.position.set(3.35,.18,1.2);
  world.add(water);
  const pond=registerScenery(world,roots,'pond',[water],3.35,1.2);
  const details=createGardenDetails(),parts=[...details.children];
  registerGardenDetails(world,roots,details);
  return{world,roots,pond,water,parts,details};
}

test('every perimeter rock, shrub and pink tree has a registered and persistent editable identity',()=>{
  const {world,roots,parts,details}=rig();
  assert.equal(details.children.length,0);
  assert.equal(roots.size,42+14+4+1);
  for(const part of parts){
    const id=part.userData.sceneryId,root=roots.get('scenery:'+id);
    assert.equal(part.parent,root,id);
    assert.ok(sceneryDefinitions.some(item=>item.id===id),id);
    assert.ok(root.children.some(child=>child===part));
  }
  for(const item of perimeterRocks)assert.ok(validSceneryPlacement(item.x,item.z),item.id);
  const stored=villageScenery({scenery:[{id:'edge-tree-0',x:-4,z:4,rotation:2,hidden:true}]});
  assert.equal(stored.find(item=>item.id==='scenery:edge-tree-0').hidden,true);
  disposeObject(world);
});

test('pond water, stone border, waterfall and ripples move, rotate and hide as one object',()=>{
  const {world,pond,water,parts}=rig(),detail=parts.find(part=>part.userData.sceneryId==='pond');
  assert.equal(detail.parent,pond);assert.equal(water.parent,pond);
  assert.ok(detail.children.length>=30);
  const border=detail.children[0],fall=detail.children.find(child=>child.geometry?.type==='TubeGeometry');
  assert.ok(fall);
  world.updateMatrixWorld(true);
  const targets=[water,border,fall],before=targets.map(part=>part.getWorldPosition(new THREE.Vector3()));
  pond.position.x+=1;pond.position.z-=2;world.updateMatrixWorld(true);
  targets.forEach((part,i)=>assert.ok(part.getWorldPosition(new THREE.Vector3()).distanceTo(before[i].clone().add(new THREE.Vector3(1,0,-2)))<1e-8));
  pond.rotation.y=Math.PI/2;world.updateMatrixWorld(true);
  assert.ok(border.getWorldPosition(new THREE.Vector3()).distanceTo(before[1].clone().add(new THREE.Vector3(1,0,-2)))>.1);
  pond.visible=false;
  for(const part of targets){let object=part;while(object.parent&&object!==pond)object=object.parent;assert.equal(object,pond);assert.equal(object.visible,false);}
  disposeObject(world);
});
