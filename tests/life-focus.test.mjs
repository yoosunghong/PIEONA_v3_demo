import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {isLifeFocus,lifeFocusView,lifePanelTabs,lifeFocusOccluders} from '../src/lifeFocus.mjs';
import {createLifeWorld} from '../src/lifeWorld.js';
import {STORAGE,FISHING_ANCHORS,INTERACTION_REACH,nearestLifeInteraction} from '../shared/life.mjs';
import {GARDEN_BEDS,KITCHEN} from '../shared/garden.mjs';
import {cameraPose,startCameraTransition,advanceCameraTransition} from '../src/sceneCamera.mjs';

test('every content camera targets the selected object and fits narrow and wide viewports',()=>{
  for(const [mode,objects] of [['storage',[STORAGE]],['garden',GARDEN_BEDS],['kitchen',[KITCHEN]]]){
    assert.equal(isLifeFocus(mode),true);
    for(const object of objects)for(const aspect of [.45,.8,1,1.8,2.5]){
      const view=lifeFocusView(mode,object.id,aspect),camera=new THREE.PerspectiveCamera(38,aspect,.1,120);
      assert.equal(view.target[0],object.x);assert.equal(view.target[2],object.z);
      camera.position.fromArray(view.position);camera.lookAt(...view.target);camera.updateMatrixWorld();
      for(const x of [-.7,.7])for(const y of [0,1.2])for(const z of [-.45,.45]){
        const point=new THREE.Vector3(object.x+x,y,object.z+z).project(camera);
        assert.ok(Math.abs(point.x)<.95&&Math.abs(point.y)<.95,`${mode} ${object.id} aspect ${aspect}`);
      }
    }
  }
  for(const mode of [null,'village','home','autonomy','sign','guestbook'])assert.equal(isLifeFocus(mode),false);
});

test('content cameras ease from the current view, reverse mid-flight and restore the exact view',()=>{
  const camera=new THREE.PerspectiveCamera(),controls={target:new THREE.Vector3(-2,.6,1)};
  camera.position.set(7,13,9);const original=cameraPose(camera,controls);
  for(const mode of ['storage','garden','kitchen']){
    const view=lifeFocusView(mode,'garden:0',1.3),enter=startCameraTransition(camera,controls,view);
    advanceCameraTransition(enter,camera,controls,.3);
    const halfway=cameraPose(camera,controls),reverse=startCameraTransition(camera,controls,original);
    advanceCameraTransition(reverse,camera,controls,0);assert.deepEqual(cameraPose(camera,controls),halfway);
    advanceCameraTransition(reverse,camera,controls,1.1);assert.deepEqual(cameraPose(camera,controls),original);
    advanceCameraTransition(startCameraTransition(camera,controls,view),camera,controls,1.1);
    assert.deepEqual(cameraPose(camera,controls),view);
    advanceCameraTransition(startCameraTransition(camera,controls,original),camera,controls,1.1);
    assert.deepEqual(cameraPose(camera,controls),original);
  }
});

test('facilities have clickable geometry without permanent world-space UI and prompts require proximity',()=>{
  const {root}=createLifeWorld(),actions=new Map();
  try{
    root.traverse(object=>{
      assert.equal(!!object.isSprite,false);
      if(object.userData.action)actions.set(object.userData.action,object);
    });
    for(const object of [STORAGE,KITCHEN,...GARDEN_BEDS,...FISHING_ANCHORS]){
      assert.ok(actions.has(object.id));
      assert.equal(nearestLifeInteraction(object).id,object.id);
    }
    for(const point of [{x:0,z:0},{x:0,z:-4},{x:5,z:0}]){
      assert.ok([STORAGE,KITCHEN,...GARDEN_BEDS,...FISHING_ANCHORS].every(object=>Math.hypot(object.x-point.x,object.z-point.z)>INTERACTION_REACH));
      assert.equal(nearestLifeInteraction(point),null);
    }
  }finally{root.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});}
});

test('each facility exposes only its own content; AI settings cannot bypass object access',()=>{
  assert.deepEqual(lifePanelTabs('storage',2,7),[['storage','보관함'],['collection','도감 2/7']]);
  assert.deepEqual(lifePanelTabs('garden',2,7),[['garden','텃밭']]);
  assert.deepEqual(lifePanelTabs('kitchen',2,7),[['kitchen','요리']]);
  assert.deepEqual(lifePanelTabs('autonomy',2,7),[]);
});

test('focus occlusion preserves the selected facility and saved visibility while hiding foreground objects',()=>{
  const world=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,120),lifeRoot=new THREE.Group();world.add(lifeRoot);
  camera.position.set(0,2,7);camera.lookAt(0,.6,0);
  const geometry=new THREE.BoxGeometry(2,2,1),material=new THREE.MeshBasicMaterial();
  const facility=new THREE.Mesh(geometry,material);facility.userData.action='garden:0';facility.position.y=.6;lifeRoot.add(facility);
  const chest=new THREE.Group(),chestMesh=new THREE.Mesh(geometry,material);chest.userData.action='storage';chest.add(chestMesh);chest.position.set(0,1,4);lifeRoot.add(chest);
  const tree=new THREE.Group(),canopy=new THREE.Mesh(geometry,material);tree.add(canopy);tree.position.set(0,1.2,3);world.add(tree);
  const behind=new THREE.Mesh(geometry,material);behind.position.set(0,.6,-3);world.add(behind);
  const occluders=lifeFocusOccluders(world,camera,[0,.6,0],lifeRoot,'garden:0');
  assert.ok(occluders.includes(tree));assert.ok(occluders.includes(chest));assert.ok(!occluders.includes(behind));assert.ok(!occluders.includes(facility));assert.ok(!occluders.includes(lifeRoot));
  assert.equal(tree.visible,true);assert.equal(facility.visible,true);assert.equal(behind.visible,true);
  geometry.dispose();material.dispose();
});
