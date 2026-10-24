import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {io} from 'socket.io-client';
import {Vector3} from 'three';
import {villageScenery} from '../shared/scenery.mjs';
import {isLifeScenery,villageLife,lifeDefinitions} from '../shared/lifeLayout.mjs';
import {nearestLifeInteraction,inLifeArea,FISHING_ANCHORS} from '../shared/life.mjs';
import {canPlaceDecoration,editorHistory} from '../src/villageEditorState.mjs';
import {lifeFocusView} from '../src/lifeFocus.mjs';
import {createLifeWorld} from '../src/lifeWorld.js';
import {disposeObject} from '../src/worldAssets.js';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';

function layout(){
  const positions={'life-storage':[-5,0,1],'life-garden-0':[-3.5,-3.5,1],'life-kitchen':[4,-4,2],'life-fishing':[0,-5,2]};
  return {sign:{hidden:true},guestbook:{hidden:true},scenery:villageScenery({}).map(({id,x,z,rotation})=>{id=id.slice(8);const point=positions[id];return {id,x:point?.[0]??x,z:point?.[1]??z,rotation:point?.[2]??rotation,hidden:!isLifeScenery(id)};})};
}

test('facility layouts retain stable identities and transform interactions, work approaches and cameras',()=>{
  const village=layout(),life=villageLife(village);
  assert.deepEqual(life.storage,{id:'storage',x:-5,z:0,rotation:Math.PI/2});
  assert.ok(Math.abs(life.beds[0].approach.x+4.35)<1e-8);assert.equal(life.beds[0].approach.z,-3.5);
  assert.ok(Math.abs(life.kitchen.approach.z+3.05)<1e-8);
  for(const object of [life.storage,...life.beds,life.kitchen,...life.anchors])assert.equal(nearestLifeInteraction(object,[],'me',village).id,object.id);
  assert.equal(nearestLifeInteraction(FISHING_ANCHORS[0],[],'me',village),null);
  assert.equal(inLifeArea(-5,0,village),true);assert.equal(inLifeArea(-1.75,4.65,village),false);
  assert.deepEqual(lifeFocusView('storage',null,1,village).target,[-5,.55,0]);
  assert.deepEqual(lifeFocusView('garden','garden:0',1,village).target,[-3.5,.55,-3.5]);
  const items=villageScenery(village);
  for(const def of lifeDefinitions)assert.equal(canPlaceDecoration(items,items.find(i=>i.id==='scenery:'+def.id).x,items.find(i=>i.id==='scenery:'+def.id).z,'scenery:'+def.id),true,def.id);
  assert.equal(canPlaceDecoration(items,8,0,'scenery:life-kitchen'),false);
  assert.equal(canPlaceDecoration(items,-5,0,'scenery:life-garden-0'),false);
  const state={past:[],present:villageScenery({}),future:[]},changed=editorHistory(state,{type:'change',items});
  assert.deepEqual(editorHistory(changed,{type:'undo'}).present,state.present);
  assert.deepEqual(editorHistory(editorHistory(changed,{type:'undo'}),{type:'redo'}).present,items);
});

test('facility meshes, crops, all four docks and fishing equipment share each editable transform',()=>{
  const world=createLifeWorld(),village=layout(),life=villageLife(village);
  try{
    for(const item of villageScenery(village).filter(i=>isLifeScenery(i.id))){const root=world.facilities.get(item.id);assert.ok(root);root.position.set(item.x,0,item.z);root.rotation.y=item.rotation*Math.PI/2;}
    world.root.updateMatrixWorld(true);
    for(const anchor of life.anchors){
      let deck,rod;world.root.traverse(part=>{if(part.userData.action===anchor.id)deck=part;if(part.userData.lifeAction===anchor.id)rod=part;});
      assert.equal(deck.parent,world.facilities.get('scenery:life-fishing'));
      const point=rod.getWorldPosition(new Vector3());assert.ok(Math.hypot(point.x-anchor.x,point.z-anchor.z)<1e-8);
    }
    let crop;world.root.traverse(part=>{if(part.userData.action==='garden:0')crop=part;});
    const point=crop.getWorldPosition(new Vector3());assert.equal(point.x,life.beds[0].x);assert.equal(point.z,life.beds[0].z);
  }finally{disposeObject(world.root);}
});

test('saved facilities reach visitors and server fishing, planting and cooking use their moved coordinates',async()=>{
  let time=Date.now();const runtime=createApp({testing:true,store:openStore(':memory:'),lifeClock:()=>time});let socket;
  try{
    await new Promise(resolve=>runtime.server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${runtime.server.address().port}`;
    const registration=await fetch(url+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'movable_life_owner',password:'test-facility-password'})});
    assert.equal(registration.status,201);const cookie=registration.headers.get('set-cookie').split(';')[0],user=(await registration.json()).user;
    const request=async(path,body,method=body?'POST':'GET')=>{const r=await fetch(url+'/api'+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};};
    const village=layout(),life=villageLife(village),save=body=>request('/me/world',{village:body},'PATCH');
    assert.equal((await save({scenery:[{id:'life-storage',x:-1.75,z:4.65,rotation:1}]})).status,200);
    // Existing scenery suppressed by the original facilities must not block a small move.
    assert.equal(canPlaceDecoration(villageScenery({}),-4.25,4,'scenery:life-garden-0'),true);
    const smallMove=await save({scenery:[{id:'life-garden-0',x:-4.25,z:4,rotation:0}]});assert.equal(smallMove.status,200,JSON.stringify(smallMove.body));
    const saved=await save(village);assert.equal(saved.status,200,JSON.stringify(saved.body));assert.deepEqual((await request('/users/'+user.id)).body.user.village.scenery,village.scenery);
    socket=io(url,{transports:['websocket'],extraHeaders:{Cookie:cookie},forceNew:true});await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
    const emit=(event,data={})=>new Promise((resolve,reject)=>socket.timeout(3000).emit(event,data,(error,result)=>error?reject(error):resolve(result)));
    assert.equal((await emit('village:join',{villageId:user.id})).ok,true);
    const move=async point=>{socket.emit('village:move',{villageId:user.id,x:point.x,z:point.z,rotation:0,moving:false,seatId:null,jumpStarted:0});await emit('village:join',{villageId:user.id});};
    await move(FISHING_ANCHORS[0]);assert.equal((await emit('life:start',{anchorId:'fishing:0'})).ok,false);
    await move(life.anchors[0]);assert.equal((await emit('life:start',{anchorId:'fishing:0'})).ok,true);
    let member=(await emit('village:join',{villageId:user.id})).members.find(m=>m.userId===user.id);
    assert.ok(Math.hypot(member.x-life.anchors[0].x,member.z-life.anchors[0].z)<1e-8);assert.equal(member.rotation,Math.PI);
    const changed={scenery:village.scenery.map(item=>item.id==='life-storage'?{...item,x:-5.25}:item)};
    assert.equal((await save(changed)).status,409);assert.equal((await save(village)).status,200);
    await emit('life:stop');
    const action=action=>request('/me/life/actions',{requestId:randomUUID(),action});
    let result=await action({intent:'PLANT_SEED',actor:'COMPANION',plot:'garden:0',crop:'HERB'});assert.equal(result.body.ok,true,JSON.stringify(result.body));
    let plan=JSON.parse(runtime.store.one("SELECT plan FROM life_operations WHERE owner_id=? AND status='pending'",user.id).plan);assert.deepEqual(plan.target,life.beds[0].approach);
    time+=15000;runtime.life.tick();assert.equal((await request('/me/life')).body.garden.plots.find(p=>p.id==='garden:0').cropId,'HERB');
    runtime.store.run('INSERT INTO inventory_entries VALUES(?,?,?)',user.id,'TOMATO',2);
    result=await action({intent:'COOK_FOOD',actor:'COMPANION',recipe:'TOMATO_SALAD'});assert.equal(result.body.ok,true,JSON.stringify(result.body));
    plan=JSON.parse(runtime.store.one("SELECT plan FROM life_operations WHERE owner_id=? AND status='pending'",user.id).plan);assert.deepEqual(plan.target,life.kitchen.approach);
    time+=15000;runtime.life.tick();
    assert.equal((await save(changed)).status,200);
    assert.equal((await save({scenery:[{id:'life-storage',x:0,z:0,rotation:0}]})).status,400);
    assert.equal((await save({scenery:[{id:'life-storage',x:-5,z:0,rotation:0,hidden:true}]})).status,400);
  }finally{socket?.disconnect();await runtime.close();}
});


test('compact fishing docks can be placed at the village edge in every orientation',()=>{
  for(const [x,z,rotation] of [[0,7,0],[7,0,1],[0,-7,2],[-7,0,3]]){
    const items=villageScenery({scenery:[{id:'life-fishing',x,z,rotation}]}).map(item=>({...item,hidden:item.id!=='scenery:life-fishing'}));
    assert.equal(canPlaceDecoration(items,x,z,'scenery:life-fishing'),true);
  }
});
