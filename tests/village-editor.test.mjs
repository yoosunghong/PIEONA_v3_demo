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
import {villageScenery,sceneryDefinitions} from '../shared/scenery.mjs';

test('existing scenery has stable IDs and saved placements survive without changing untouched scenery',()=>{
  const original=villageScenery({});
  assert.equal(original.length,sceneryDefinitions.length);
  assert.equal(new Set(original.map(item=>item.id)).size,original.length);
  const moved=villageScenery({scenery:[{id:'tree-0',x:-4,z:3.5,rotation:2}]});
  assert.deepEqual(moved.find(item=>item.id==='scenery:tree-0'),{...original[0],x:-4,z:3.5,rotation:2});
  assert.deepEqual(moved.slice(1),original.slice(1));
  assert.equal(villageScenery({theme:'campfire'}).find(item=>item.id==='scenery:campfire').x,1.2);
});

test('scenery movement protects stage, paths and neighbors and participates in undo/redo',()=>{
  const items=villageScenery({}),id='scenery:tree-0';
  assert.equal(canPlaceDecoration(items,0,0,id),false);
  assert.equal(canPlaceDecoration(items,0,4,id),false);
  assert.equal(canPlaceDecoration(items,8,0,id),false);
  assert.equal(canPlaceDecoration(items,3.8,-2.7,id),false);
  assert.equal(canPlaceDecoration(items,-5,0,id),true);
  const next=items.map(item=>item.id===id?{...item,x:-5,z:0,rotation:1}:item);
  const state=editorHistory({past:[],present:items,future:[]},{type:'change',items:next});
  assert.deepEqual(editorHistory(state,{type:'undo'}).present,items);
  assert.deepEqual(editorHistory(editorHistory(state,{type:'undo'}),{type:'redo'}).present,next);
});

test('stored scenery and furniture free their positions and storage can be undone',()=>{
  const furniture={id:'bench',type:'bench',x:-3,z:3.5,rotation:2};
  const stored=[{...furniture,hidden:true},...villageScenery({}).map(item=>({...item,hidden:true}))];
  assert.equal(canPlaceDecoration(stored,furniture.x,furniture.z),true);
  assert.equal(canPlaceDecoration(stored,3.35,1.2),true);
  const history=editorHistory({past:[],present:[furniture],future:[]},{type:'change',items:[stored[0]]});
  assert.deepEqual(editorHistory(history,{type:'undo'}).present,[furniture]);
  assert.deepEqual(editorHistory(editorHistory(history,{type:'undo'}),{type:'redo'}).present,[stored[0]]);
  const tree=villageScenery({scenery:[{id:'tree-0',x:-5,z:0,rotation:2,hidden:true}]}).find(item=>item.id==='scenery:tree-0');
  assert.equal(tree.hidden,true);assert.equal(tree.rotation,2);
});

import {remainingDecoration} from '../shared/world.mjs';
test('decoration stock starts at ten and follows placement, storage and undo',()=>{
  assert.ok(decorations.every(entry=>entry.quantity===10));
  assert.equal(remainingDecoration([],'bench'),10);
  const placed=Array.from({length:10},(_,i)=>({id:String(i),type:'bench'}));
  assert.equal(remainingDecoration(placed,'bench'),0);
  assert.equal(remainingDecoration(placed,'lantern'),10);
  const stored=placed.map((item,i)=>i===0?{...item,hidden:true}:item);
  assert.equal(remainingDecoration(stored,'bench'),1);
  const history=editorHistory({past:[],present:stored,future:[]},{type:'change',items:placed});
  assert.equal(remainingDecoration(editorHistory(history,{type:'undo'}).present,'bench'),1);
  assert.equal(remainingDecoration(editorHistory(editorHistory(history,{type:'undo'}),{type:'redo'}).present,'bench'),0);
  assert.equal(remainingDecoration(placed,'unknown'),0);
});
