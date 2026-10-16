import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCrabWorld} from '../src/crabWorld.js';
import {newCrabGame,crabSnapshot} from '../shared/crab.mjs';

test('the beach keeps a bounded draw budget with a hundred crabs and no moving shadow casters',()=>{
  const oldDocument=globalThis.document;
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){}})})};
  const scene=new THREE.Scene();let world;
  try{
    world=createCrabWorld(scene);const snapshot=crabSnapshot(newCrabGame(['a']));
    while(snapshot.crabs.length<100)snapshot.crabs.push({...snapshot.crabs[0],id:snapshot.crabs.length+200});
    world.update(snapshot,1,1/60);let draws=0,movingShadows=0,instances=0;
    scene.traverse(o=>{if(o.isMesh)draws++;if(o.isInstancedMesh){instances+=o.count;if(o.instanceMatrix.usage===THREE.DynamicDrawUsage&&o.castShadow)movingShadows++;}});
    assert.ok(draws<=65,`beach draws ${draws} meshes`);assert.ok(instances>2000);assert.equal(movingShadows,0);
    world.dispose();world=null;assert.equal(scene.children.length,0);
  }finally{world?.dispose();if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});
