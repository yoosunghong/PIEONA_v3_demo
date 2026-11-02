import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {io} from 'socket.io-client';
import * as THREE from 'three';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {defaultSign,villageSign,signCameraView,signPlacementItem,SIGN_ID,MAX_SIGN_POINTS,MAX_SIGN_STROKES} from '../shared/sign.mjs';
import {canPlaceDecoration,editorHistory} from '../src/villageEditorState.mjs';
import {cameraPose,startCameraTransition,advanceCameraTransition} from '../src/sceneCamera.mjs';
import {insideBoard} from '../src/signDrawing.mjs';

let runtime,url,owner,visitor;
const ink=()=>({tool:'draw',color:'#20364c',size:14,points:[[.3,.4],[.5,.6]]});
async function request(path,user,body,method=body?'PATCH':'GET',base=url){
  const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return{status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function register(username,base=url){const result=await request('/auth/register',null,{username,password:'test-sign-only'},'POST',base);assert.equal(result.status,201);return{...result.body.user,cookie:result.cookie};}
before(async()=>{runtime=createApp({testing:true,store:openStore(':memory:')});await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${runtime.server.address().port}`;owner=await register('sign_owner');visitor=await register('sign_visitor');});
after(async()=>runtime.close());

test('every legacy village gets one stable sign in a free position without consuming a furniture slot',()=>{
  assert.deepEqual(villageSign({items:[]}),defaultSign);
  const occupied={items:[{id:'bench',x:defaultSign.x,z:defaultSign.z}]},sign=villageSign(occupied);
  assert.ok(canPlaceDecoration(occupied.items,sign.x,sign.z));assert.deepEqual(villageSign(occupied),sign);
  const item=signPlacementItem(sign);assert.equal(item.id,SIGN_ID);
  assert.equal(canPlaceDecoration([item],sign.x,sign.z),false);
  assert.equal(canPlaceDecoration([item],sign.x,sign.z,SIGN_ID),true);
  let history={past:[],present:[item],future:[]};
  history=editorHistory(history,{type:'change',items:[{...item,x:sign.x+.25,rotation:1}]});
  assert.deepEqual(editorHistory(history,{type:'undo'}).present,[item]);
});
test('focus follows every sign rotation and interpolates back to the actual previous camera',()=>{
  for(let rotation=0;rotation<4;rotation++){
    const sign={...defaultSign,rotation},view=signCameraView(sign),offset=new THREE.Vector3(...view.position).sub(new THREE.Vector3(...view.target));
    assert.ok(Math.abs(offset.x-Math.sin(rotation*Math.PI/2)*4.7)<1e-9);
    assert.ok(Math.abs(offset.z-Math.cos(rotation*Math.PI/2)*4.7)<1e-9);
    const camera=new THREE.PerspectiveCamera(),controls={target:new THREE.Vector3(0,1,0)};camera.position.set(7,8,9);const original=cameraPose(camera,controls);
    const entering=startCameraTransition(camera,controls,view);advanceCameraTransition(entering,camera,controls,.55);
    assert.notDeepEqual(cameraPose(camera,controls),view);advanceCameraTransition(entering,camera,controls,.55);assert.deepEqual(cameraPose(camera,controls),view);
    advanceCameraTransition(startCameraTransition(camera,controls,original),camera,controls,1.1);assert.deepEqual(cameraPose(camera,controls),original);
  }
  assert.equal(insideBoard(.5,.4,'planks'),true);assert.equal(insideBoard(.5,.1,'planks'),false);
  assert.equal(insideBoard(.85,.4875,'arrow'),true);assert.equal(insideBoard(.85,.75,'arrow'),false);
});
test('only the authenticated village owner saves a single public sign',async()=>{
  assert.equal((await request('/me/world',null,{village:{sign:{strokes:[ink()]}}})).status,401);
  const saved=await request('/me/world',owner,{village:{sign:{shape:'planks',strokes:[ink()]}}});assert.equal(saved.status,200);
  const sign=saved.body.user.village.sign;assert.equal(sign.strokes.length,1);
  assert.deepEqual((await request('/users/'+owner.id,visitor)).body.user.village.sign,sign);
  assert.equal((await request('/me/world',visitor,{targetId:owner.id,village:{sign:{strokes:[]}}})).status,400);
  assert.deepEqual((await request('/me',owner)).body.user.village.sign,sign);
  assert.equal((await request('/me/world',owner,{village:{sign:[sign,sign]}})).status,400);
});
test('drawing, placement, theme and furniture updates merge without discarding each other',async()=>{
  const art=[ink(),{...ink(),tool:'erase',size:20}];
  await request('/me/world',owner,{village:{sign:{shape:'arrow',strokes:art}}});
  await request('/me/world',owner,{village:{sign:{x:-3,z:-3.5,rotation:2}}});
  await request('/me/world',owner,{village:{items:[],theme:'twilight'}});
  const sign=(await request('/me',owner)).body.user.village.sign;
  assert.deepEqual(sign,{x:-3,z:-3.5,rotation:2,shape:'arrow',strokes:art});
  assert.equal((await request('/me/world',owner,{village:{sign:{x:20,z:0}}})).status,400);
  const item={id:crypto.randomUUID(),type:'bench',x:-3,z:-3.5,rotation:0};
  assert.equal((await request('/me/world',owner,{village:{items:[item]}})).status,400);
  assert.deepEqual((await request('/me',owner)).body.user.village.sign,sign);
});
test('malformed, excessive or executable drawing data is rejected',async()=>{
  for(const stroke of [{...ink(),color:'url(evil)'},{...ink(),size:99},{...ink(),points:[[Infinity,.5]]},{...ink(),points:[[1.1,.5]]},{...ink(),points:[]},{...ink(),script:'alert(1)'}])assert.equal((await request('/me/world',owner,{village:{sign:{strokes:[stroke]}}})).status,400);
  for(const sign of [{shape:'evil'},{rotation:.5},{x:100},{strokes:Array.from({length:MAX_SIGN_STROKES+1},ink)},{strokes:Array.from({length:MAX_SIGN_POINTS/2000+1},()=>({...ink(),points:Array.from({length:2000},()=>[.5,.5])}))}])assert.equal((await request('/me/world',owner,{village:{sign}})).status,400);
});
test('a bounded drawing larger than 20kb saves and notifies connected visitors',async()=>{
  const socket=io(url,{extraHeaders:{Cookie:visitor.cookie},transports:['websocket'],forceNew:true});
  try{
    await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
    const changed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Missing world update')),2000);socket.once('world:changed',()=>{clearTimeout(timer);resolve();});});
    const strokes=Array.from({length:MAX_SIGN_POINTS/2000},()=>({...ink(),points:Array.from({length:2000},(_,i)=>[.25+i*.0001,.5])}));
    assert.equal(strokes.reduce((sum,s)=>sum+s.points.length,0),MAX_SIGN_POINTS);assert.ok(JSON.stringify(strokes).length>20000);
    assert.equal((await request('/me/world',owner,{village:{sign:{strokes}}})).status,200);await changed;
    assert.deepEqual((await request('/users/'+owner.id,visitor)).body.user.village.sign.strokes,strokes);
  }finally{socket.disconnect();}
});
test('the artwork and sign placement survive a SQLite server restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pieona-sign-')),file=join(dir,'sign.sqlite');let instance;
  try{
    instance=createApp({testing:true,store:openStore(file)});await new Promise(r=>instance.server.listen(0,'127.0.0.1',r));let base=`http://127.0.0.1:${instance.server.address().port}`;
    const user=await register('sign_persist',base),sign={...defaultSign,shape:'hanging',rotation:3,strokes:[ink()]};
    assert.equal((await request('/me/world',user,{village:{sign}},'PATCH',base)).status,200);
    await instance.close();instance=null;
    instance=createApp({testing:true,store:openStore(file)});await new Promise(r=>instance.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${instance.server.address().port}`;
    assert.deepEqual((await request('/me',user,undefined,'GET',base)).body.user.village.sign,sign);
  }finally{if(instance)await instance.close();rmSync(dir,{recursive:true,force:true});}
});

import {rgbaSignColor,isSignColor,MAX_CUSTOM_SIGN_COLORS} from '../shared/sign.mjs';
test('RGBA colors normalize to bounded canvas colors with alpha',()=>{
  assert.equal(rgbaSignColor(255,128,0,.5),'#ff800080');
  assert.equal(rgbaSignColor(0,0,0,0),'#00000000');
  assert.equal(rgbaSignColor(255,255,255,1),'#ffffffff');
  for(const values of [[256,0,0,1],[-1,0,0,1],[1.5,0,0,1],[0,0,0,2],[0,0,0,NaN]])assert.equal(rgbaSignColor(...values),null);
  assert.equal(isSignColor('#aAbBcC80'),true);
  for(const value of ['red','url(evil)','#12345g','#123456789'])assert.equal(isSignColor(value),false);
});
test('custom RGBA palette and transparent strokes persist; deleting swatches preserves artwork',async()=>{
  const strokes=[{...ink(),color:'#12345680'}];
  const customColors=['#12345680','#ff000000'];
  const saved=await request('/me/world',owner,{village:{sign:{strokes,customColors}}});
  assert.equal(saved.status,200,JSON.stringify(saved.body));
  assert.deepEqual(saved.body.user.village.sign.customColors,customColors);
  assert.deepEqual((await request('/users/'+owner.id,visitor)).body.user.village.sign.strokes,strokes);
  const deleted=await request('/me/world',owner,{village:{sign:{customColors:[]}}});
  assert.equal(deleted.status,200);
  assert.deepEqual(deleted.body.user.village.sign.strokes,strokes);
  assert.deepEqual((await request('/me',owner)).body.user.village.sign.customColors,[]);
  for(const colors of [['url(evil)'],['#123456789'],Array(MAX_CUSTOM_SIGN_COLORS+1).fill('#123456')]){
    assert.equal((await request('/me/world',owner,{village:{sign:{customColors:colors}}})).status,400);
  }
});
