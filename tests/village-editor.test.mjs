import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {decorations} from '../shared/world.mjs';
import {createDecoration,disposeObject} from '../src/worldAssets.js';
import {canPlaceDecoration,editorHistory,snapPosition} from '../src/villageEditorState.mjs';

test('every catalog entry has a finite, visible 3D model and a category',()=>{
  assert.equal(new Set(decorations.map(item=>item.id)).size,decorations.length);
  for(const entry of decorations){
    const model=createDecoration(entry.id),bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
    assert.ok(entry.category,entry.id);assert.ok(!bounds.isEmpty(),entry.id);
    assert.ok([size.x,size.y,size.z].every(value=>Number.isFinite(value)&&value>0),entry.id);
    disposeObject(model);
  }
});
test('placement protects the plaza, scenery, perimeter and other items while allowing moving itself',()=>{
  const items=[{id:'bench',type:'bench',x:-3,z:3.5,rotation:0}];
  assert.equal(canPlaceDecoration(items,0,0),false);
  assert.equal(canPlaceDecoration(items,0,4),false);
  assert.equal(canPlaceDecoration(items,3.35,1.2),false);
  assert.equal(canPlaceDecoration(items,10,10),false);
  assert.equal(canPlaceDecoration(items,-3,3.5),false);
  assert.equal(canPlaceDecoration(items,-3,3.5,'bench'),true);
  assert.equal(canPlaceDecoration(items,-3.75,3.5),false);
  assert.equal(canPlaceDecoration(items,-4,3.5),true);
  assert.equal(canPlaceDecoration(items,NaN,3),false);
  assert.equal(snapPosition(3.14),3.25);
});
test('undo and redo preserve placement, movement, rotation, deletion, and branch history',()=>{
  const original={id:'bench',type:'bench',x:-3,z:3.5,rotation:0};
  let history={past:[],present:[],future:[]};
  const changes=[[original],[{...original,x:-4}],[{...original,x:-4,rotation:1}],[]];
  for(const items of changes)history=editorHistory(history,{type:'change',items});
  for(let i=changes.length-2;i>=0;i--){history=editorHistory(history,{type:'undo'});assert.deepEqual(history.present,changes[i]);}
  history=editorHistory(history,{type:'undo'});assert.deepEqual(history.present,[]);
  for(const items of changes){history=editorHistory(history,{type:'redo'});assert.deepEqual(history.present,items);}
  history=editorHistory(history,{type:'undo'});
  history=editorHistory(history,{type:'change',items:[original]});
  assert.equal(history.future.length,0);
  assert.deepEqual(editorHistory(history,{type:'redo'}).present,[original]);
  assert.deepEqual(changes[0],[original]);
});
