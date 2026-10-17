import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {thumbnailModel} from '../src/modelThumbnails.js';
import {createGardenDetails} from '../src/gardenDetails.js';
import {registerGardenDetails} from '../src/sceneryObjects.js';
import {createVillageGuestbook} from '../src/guestbookModel.js';
import {disposeObject} from '../src/worldAssets.js';

test('stored and moved village models produce visible thumbnails without changing the village',()=>{
  const world=new THREE.Scene(),roots=new Map();
  registerGardenDetails(world,roots,createGardenDetails());
  roots.set('guestbook',createVillageGuestbook({x:4,z:-3,rotation:2}));
  try{
    for(const [id,source] of roots){
      source.visible=false;source.rotation.y=Math.PI/2;
      const parent=source.parent,position=source.position.clone(),rotation=source.rotation.clone();
      const model=thumbnailModel(source);
      assert.equal(model.visible,true,id);
      assert.deepEqual(model.position.toArray(),[0,0,0],id);
      assert.equal(model.rotation.y,0,id);
      const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
      assert.ok([size.x,size.y,size.z].every(value=>Number.isFinite(value)&&value>0),id);
      assert.equal(source.visible,false,id);
      assert.equal(source.parent,parent,id);
      assert.deepEqual(source.position,position,id);
      assert.deepEqual(source.rotation.toArray(),rotation.toArray(),id);
      model.traverse(object=>{if(object.isInstancedMesh)object.dispose();});
    }
  }finally{disposeObject(world);disposeObject(roots.get('guestbook'));}
});
