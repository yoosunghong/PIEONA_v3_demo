import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import * as THREE from 'three';
import {io} from 'socket.io-client';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {defaultGuestbook,villageGuestbook,guestbookPlacementItem,guestbookCameraView,GUESTBOOK_ID,GUESTBOOK_PAGE_SIZE} from '../shared/guestbook.mjs';
import {villageSign,signPlacementItem} from '../shared/sign.mjs';
import {canPlaceDecoration} from '../src/villageEditorState.mjs';
import {createVillageGuestbook} from '../src/guestbookModel.js';
import {disposeObject} from '../src/worldAssets.js';
import {guestbookOccluders} from '../src/guestbookVisibility.mjs';

let runtime,url,owner,visitor,other;
async function request(path,user,body,method=body?'POST':'GET',base=url){
  const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return{status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function register(username,base=url){const result=await request('/auth/register',null,{username,password:'guestbook-test-only'},'POST',base);assert.equal(result.status,201);await request('/me',{cookie:result.cookie},{nickname:username},'PATCH',base);return{...result.body.user,cookie:result.cookie};}
const book=user=>'/villages/'+user.id+'/guestbook';
before(async()=>{runtime=createApp({testing:true,store:openStore(':memory:')});await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${runtime.server.address().port}`;owner=await register('book_owner');visitor=await register('book_visitor');other=await register('book_other');});
after(async()=>runtime.close());

test('legacy villages get exactly one book away from furniture and the sign',()=>{
  assert.deepEqual(villageGuestbook({}),defaultGuestbook);
  const village={items:[{id:'bench',...defaultGuestbook}]},guestbook=villageGuestbook(village);
  assert.deepEqual(villageGuestbook(village),guestbook);
  const occupied=[...village.items,signPlacementItem(villageSign(village))];
  assert.equal(canPlaceDecoration(occupied,guestbook.x,guestbook.z),true);
  const item=guestbookPlacementItem(guestbook);assert.equal(item.id,GUESTBOOK_ID);
  assert.equal(canPlaceDecoration([item],item.x,item.z),false);assert.equal(canPlaceDecoration([item],item.x,item.z,item.id),true);
});
test('the book is a visible interactive 3D model and camera focus follows its placement and rotation',()=>{
  for(let rotation=0;rotation<4;rotation++){
    const placement={x:3,z:3,rotation},model=createVillageGuestbook(placement),bounds=new THREE.Box3().setFromObject(model);
    assert.equal(model.userData.action,'guestbook');assert.equal(bounds.isEmpty(),false);
    assert.ok(bounds.getSize(new THREE.Vector3()).y>1);
    const view=guestbookCameraView(placement);
    assert.deepEqual(view.target,[3,1.35,3]);
    assert.ok(Math.abs(view.position[0]-3-Math.sin(rotation*Math.PI/2)*4.7)<1e-9);
    assert.ok(Math.abs(view.position[2]-3-Math.cos(rotation*Math.PI/2)*4.7)<1e-9);
    disposeObject(model);
  }
});
test('foreground scenery can be suppressed for reading without hiding the book or changing village visibility',()=>{
  const world=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),book=createVillageGuestbook(defaultGuestbook);
  book.userData.itemId=GUESTBOOK_ID;world.add(book);
  const view=guestbookCameraView(defaultGuestbook);camera.position.fromArray(view.position);camera.lookAt(...view.target);
  const tree=new THREE.Group(),leaf=new THREE.Mesh(new THREE.BoxGeometry(2,3,.5),new THREE.MeshBasicMaterial());
  tree.position.set(defaultGuestbook.x,1.5,defaultGuestbook.z+2);tree.add(leaf);world.add(tree);
  const nameTag=new THREE.Sprite(new THREE.SpriteMaterial());nameTag.position.set(defaultGuestbook.x,1.5,defaultGuestbook.z+1);world.add(nameTag);
  const blockers=guestbookOccluders(world,camera,defaultGuestbook);
  assert.equal(blockers.includes(tree),true);assert.equal(blockers.includes(book),false);assert.equal(tree.visible,true);assert.equal(leaf.visible,true);
  disposeObject(world);
});
test('book placement is owner scoped, preserves other village fields and rejects collisions and duplicates',async()=>{
  const guestbook={x:2.75,z:4,rotation:3};
  assert.equal((await request('/me/world',null,{village:{guestbook}},'PATCH')).status,401);
  assert.equal((await request('/me/world',owner,{village:{guestbook}},'PATCH')).status,200);
  const visible=(await request('/users/'+owner.id,visitor)).body.user.village;
  assert.deepEqual(visible.guestbook,guestbook);
  await request('/me/world',owner,{village:{theme:'twilight',items:[]}},'PATCH');
  assert.deepEqual((await request('/me',owner)).body.user.village.guestbook,guestbook);
  for(const invalid of [{x:0,z:0},{rotation:4},{rotation:.5},[guestbook,guestbook],{ownerId:visitor.id}])assert.equal((await request('/me/world',owner,{village:{guestbook:invalid}},'PATCH')).status,400);
  assert.equal((await request('/me/world',owner,{village:{sign:{x:guestbook.x,z:guestbook.z}}},'PATCH')).status,400);
  assert.equal((await request('/me/world',owner,{village:{items:[{id:crypto.randomUUID(),type:'bench',...guestbook}]}},'PATCH')).status,400);
  assert.equal((await request('/me/world',visitor,{targetId:owner.id,village:{guestbook}},'PATCH')).status,400);
});
test('authentication and a trimmed 200 Unicode character limit are enforced by the server',async()=>{
  assert.equal((await request(book(owner),null)).status,401);
  assert.equal((await request(book(owner),null,{content:'hello'})).status,401);
  for(const body of [{content:''},{content:' \n '},{content:'가'.repeat(201)},{content:'🌷'.repeat(201)},{content:'hello',anonymous:'true'},{content:'hello',visibility:'close'},{content:'hello',authorId:owner.id}])assert.equal((await request(book(owner),visitor,body)).status,400);
  assert.equal((await request(book(owner),visitor,{content:'🌷'.repeat(200)})).status,201);
  assert.equal((await request(book(owner),visitor,{content:'  안녕하세요\n좋은 마을이에요!  '})).status,201);
  assert.equal((await request(book(owner),other)).body.entries[0].content,'안녕하세요\n좋은 마을이에요!');
});
test('public entries are shared, private entries are owner-only, anonymous names and IDs never leak',async()=>{
  const host=await register('private_host');
  await request(book(host),visitor,{content:'공개 인사',anonymous:true});
  await request(book(host),other,{content:'비밀 인사',anonymous:true,visibility:'private'});
  await request(book(host),host,{content:'주인의 인사'});
  const publicPage=(await request(book(host),visitor)).body,ownerPage=(await request(book(host),host)).body;
  assert.equal(publicPage.total,2);assert.equal(ownerPage.total,3);
  assert.equal((await request(book(host),other)).body.total,2); // Even the author cannot read an owner-only entry.
  const anonymous=ownerPage.entries.find(e=>e.content==='공개 인사');
  assert.equal(anonymous.authorName,'익명');assert.equal(anonymous.isOwner,false);
  assert.equal(JSON.stringify(ownerPage).includes(visitor.id),false);assert.equal(JSON.stringify(ownerPage).includes('book_visitor'),false);
  assert.equal(JSON.stringify(publicPage).includes('비밀 인사'),false);
  assert.equal(ownerPage.entries.find(e=>e.content==='주인의 인사').isOwner,true);
  assert.equal(JSON.stringify((await request('/users/'+host.id,visitor)).body).includes('비밀 인사'),false);
  assert.equal((await request(book(other),visitor)).body.total,0);
});
test('new guestbook entries notify only the owner, preserve anonymity and support read receipts',async()=>{
  const host=await register('notification_host');
  const socket=io(url,{extraHeaders:{Cookie:host.cookie},transports:['websocket'],forceNew:true});
  try{
    await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
    const refreshed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Missing owner refresh')),2000);socket.once('refresh',()=>{clearTimeout(timer);resolve();});});
    assert.equal((await request(book(host),visitor,{content:'비밀 내용은 알림에 넣지 않아요',anonymous:true,visibility:'private'})).status,201);
    await refreshed;
    let activities=(await request('/activities',host)).body.activities;
    assert.equal(activities.length,1);
    const item=activities[0];assert.equal(item.type,'guestbook');assert.equal(item.actor_id,null);assert.equal(item.nickname,'익명의 이웃');assert.equal(item.is_read,0);
    assert.ok(!JSON.stringify(item).includes('비밀 내용'));assert.ok(!JSON.stringify(item).includes(visitor.id));
    assert.equal((await request('/activities/read',visitor,{ids:[item.id]})).status,200);
    assert.equal((await request('/activities',host)).body.activities[0].is_read,0);
    await request('/activities/read',host,{ids:[item.id]});
    assert.equal((await request('/activities',host)).body.activities[0].is_read,1);
    await request(book(host),host,{content:'나의 글'});
    assert.equal((await request('/activities',host)).body.activities.length,1);
    await request(book(host),other,{content:'공개 인사'});
    activities=(await request('/activities',host)).body.activities;
    assert.equal(activities.length,2);assert.ok(activities.some(a=>a.actor_id===other.id&&a.type==='guestbook'));
  }finally{socket.disconnect();}
});

test('pages count only visible entries, are newest first, and clamp after owner deletion',async()=>{
  const host=await register('pages_host');
  for(let n=0;n<GUESTBOOK_PAGE_SIZE+1;n++)await request(book(host),visitor,{content:'글 '+n});
  await request(book(host),other,{content:'숨김 글',visibility:'private'});
  const first=(await request(book(host),visitor)).body,last=(await request(book(host)+'?page=2',visitor)).body;
  assert.equal(first.total,5);assert.equal(first.pages,2);assert.equal(first.entries.length,4);assert.equal(first.entries[0].content,'글 4');assert.equal(last.entries[0].content,'글 0');
  assert.equal((await request(book(host)+'?page=999',visitor)).body.page,2);
  for(const page of ['0','-1','1.5','abc'])assert.equal((await request(book(host)+'?page='+page,visitor)).status,400);
  const entry=first.entries[0];
  assert.equal((await request(book(host)+'/'+entry.id,visitor,undefined,'DELETE')).status,403);
  assert.equal((await request(book(other)+'/'+entry.id,other,undefined,'DELETE')).status,404);
  assert.equal((await request(book(host)+'/'+entry.id,host,undefined,'DELETE')).status,200);
  assert.equal((await request(book(host)+'?page=2',visitor)).body.page,1);
  assert.equal((await request(book(host)+'/'+entry.id,host,undefined,'DELETE')).status,404);
});
test('blocks and closed villages prevent reading and writing; blocked authors are filtered from visitor counts',async()=>{
  const host=await register('blocked_host'),reader=await register('blocked_reader');
  await request(book(host),visitor,{content:'숨겨질 글',anonymous:true});
  await request('/blocks/'+visitor.id,reader,{});
  assert.equal((await request(book(host),reader)).body.total,0);
  assert.equal((await request(book(host),host)).body.total,1);
  await request('/blocks/'+visitor.id,host,{});
  assert.equal((await request(book(host),visitor)).status,403);assert.equal((await request(book(host),visitor,{content:'금지'})).status,403);
  await request('/me',host,{settings:{allowVisitors:false}},'PATCH');
  assert.equal((await request(book(host),other)).status,403);assert.equal((await request(book(host),other,{content:'금지'})).status,403);
  assert.equal((await request(book(host),host,{content:'주인은 작성 가능'})).status,201);
});
test('live invalidation contains only the village ID and deletion also notifies viewers',async()=>{
  const socket=io(url,{extraHeaders:{Cookie:visitor.cookie},transports:['websocket'],forceNew:true});
  try{
    await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
    await socket.timeout(2000).emitWithAck('village:join',{villageId:owner.id});
    const next=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Missing guestbook notification')),2000);socket.once('guestbook:changed',data=>{clearTimeout(timer);resolve(data);});});
    let changed=next();await request(book(owner),other,{content:'실시간 비밀',anonymous:true,visibility:'private'});
    assert.deepEqual(await changed,{villageId:owner.id});
    const entry=(await request(book(owner),owner)).body.entries[0];changed=next();
    await request(book(owner)+'/'+entry.id,owner,undefined,'DELETE');assert.deepEqual(await changed,{villageId:owner.id});
  }finally{socket.disconnect();}
});
test('entries and placement survive a database restart and remain independent of avatar slots',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pieona-book-')),file=join(dir,'book.sqlite');let instance;
  try{
    instance=createApp({testing:true,store:openStore(file)});await new Promise(r=>instance.server.listen(0,'127.0.0.1',r));let base=`http://127.0.0.1:${instance.server.address().port}`;
    const user=await register('persist_book',base),guestbook={x:3,z:3.75,rotation:2};
    await request('/me/world',user,{village:{guestbook}},'PATCH',base);await request(book(user),user,{content:'오래 남길 인사'},'POST',base);
    const slot=(await request('/slots',user,{nickname:'다른 자아'},'POST',base)).body;
    await request('/slots/'+slot.id+'/activate',user,{},'POST',base);
    await instance.close();instance=null;
    instance=createApp({testing:true,store:openStore(file)});await new Promise(r=>instance.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${instance.server.address().port}`;
    assert.deepEqual((await request('/me',user,undefined,'GET',base)).body.user.village.guestbook,guestbook);
    assert.equal((await request(book(user),user,undefined,'GET',base)).body.entries[0].content,'오래 남길 인사');
  }finally{if(instance)await instance.close();rmSync(dir,{recursive:true,force:true});}
});
