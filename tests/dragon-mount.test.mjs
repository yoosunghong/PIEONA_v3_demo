import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3,Group,Vector3,TextureLoader,Texture} from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {characters} from '../shared/world.mjs';
import {SURVEY_REWARD} from '../shared/surveyRewards.mjs';
import {DRAGON_FLIGHT_HEIGHT} from '../shared/dragonMount.mjs';
import {createDragonRide,createAvatarRide} from '../src/dragonRide.mjs';
import {harness} from './runtimeHarness.mjs';

test('each player sits on the dragon, keeps a fixed flight height, and restores on landing',()=>{
  const load=TextureLoader.prototype.load,previousWindow=globalThis.window;
  globalThis.window={URL};TextureLoader.prototype.load=()=>new Texture();
  try{for(const character of characters){
    const buffer=readFileSync(`resource/${character.folder}/${character.model}`);
    const avatar=new FBXLoader().parse(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
    avatar.children.filter(child=>child.name==='Icosphere').forEach(child=>child.removeFromParent());
    avatar.scale.setScalar(2.65/new Box3().setFromObject(avatar).getSize(new Vector3()).y);
    const bounds=new Box3().setFromObject(avatar),center=bounds.getCenter(new Vector3());avatar.position.set(-center.x,-bounds.min.y,-center.z);
    const root=new Group();root.add(avatar);root.position.set(3,.39+DRAGON_FLIGHT_HEIGHT,-2);root.rotation.y=1.2;
    const original=avatar.position.clone(),rest=[];avatar.traverse(bone=>{if(bone.isBone)rest.push([bone,bone.quaternion.clone()]);});
    const hips=rest.find(([bone])=>bone.name.endsWith('Hips'))[0];
    const ride=createDragonRide(avatar);
    for(let i=0;i<120;i++)ride.update(1/60,true,true,true);
    root.updateMatrixWorld(true);
    assert.ok(root.worldToLocal(hips.getWorldPosition(new Vector3())).distanceTo(new Vector3(...ride.dragon.mountSeat))<1e-5,character.id+' saddle');
    assert.equal(root.position.y,.39+DRAGON_FLIGHT_HEIGHT);
    assert.equal(ride.dragon.root.userData.source,'Meshy_AI_Character_output.glb');
    ride.update(.1,false,false);assert.equal(ride.dragon.root.visible,false);assert.ok(avatar.position.distanceTo(original)<1e-6);
    for(const [bone,q] of rest)assert.ok(bone.quaternion.angleTo(q)<1e-6,character.id+' restored '+bone.name);
  }}finally{TextureLoader.prototype.load=load;globalThis.window=previousWindow;}
});

test('legacy dragon colors survive mounting, wardrobe selection, remounting and visitor snapshots',async()=>{
  const h=await harness();try{
    const user=await h.register('dragon_color'),visitor=await h.register('dragon_color_guest');
    h.runtime.store.run('INSERT INTO account_rewards(user_id,reward_id) VALUES(?,?)',user.id,SURVEY_REWARD);
    // Reproduce an older account: only the companion appearance has a chosen color.
    assert.equal((await h.request('/me/pet/appearance',user,{petType:'babyDragon',petColor:'#514475'},'PATCH')).status,200);
    const socket=await h.connect(user),guest=await h.connect(visitor,user.id);h.advance(100);
    let snapshot=await h.emit(guest,'village:join',{villageId:user.id});
    const unmounted=snapshot.members.find(m=>m.actorKind==='MOUNT'&&m.ownerId===user.id);
    assert.equal(unmounted.appearance.petColor,'#514475');
    socket.emit('village:move',{villageId:user.id,x:unmounted.x,z:unmounted.z,rotation:0,moving:false,seatId:null});
    await h.emit(socket,'village:join',{villageId:user.id});
    const body={riding:true,villageId:user.id};
    const mounted=await h.request('/me/mount',user,body);assert.equal(mounted.status,200);
    assert.equal(mounted.body.user.appearance.petColor,'#514475');
    assert.equal(JSON.parse(h.runtime.store.one('SELECT appearance FROM users WHERE id=?',user.id).appearance).petColor,'#514475');
    snapshot=await h.emit(guest,'village:join',{villageId:user.id});
    const rider=snapshot.members.find(m=>m.userId===user.id);
    const avatar=new Group();new Group().add(avatar);
    assert.equal(createAvatarRide(avatar,rider.appearance).dragon.root.getObjectByName('coat').material.color.getHexString(),'514475');
    assert.equal((await h.request('/me/mount',user,{...body,riding:false})).status,200);
    assert.equal((await h.request('/me/mount',user,body)).body.user.appearance.petColor,'#514475');
    // Wardrobe selection without a color must preserve the current dragon color.
    const outfit={hat:'none',accessory:'none',color:'#88b5d7',ride:'babyDragon'};
    assert.equal((await h.request('/me/world',user,{appearance:outfit},'PATCH')).body.user.appearance.petColor,'#514475');
    // A new explicit mount color takes priority over the old companion color.
    assert.equal((await h.request('/me/world',user,{appearance:{...outfit,petColor:'#f5bdce'}},'PATCH')).status,200);
    await h.request('/me/mount',user,{...body,riding:false});
    snapshot=await h.emit(guest,'village:join',{villageId:user.id});
    assert.equal(snapshot.members.find(m=>m.actorKind==='MOUNT'&&m.ownerId===user.id).appearance.petColor,'#f5bdce');
    assert.equal((await h.request('/me/mount',user,body)).body.user.appearance.petColor,'#f5bdce');
    // Existing already-mounted records also resolve their legacy color on load.
    h.runtime.store.run('UPDATE users SET appearance=? WHERE id=?',JSON.stringify(outfit),user.id);
    assert.equal((await h.request('/me',user)).body.user.appearance.petColor,'#514475');
  }finally{await h.close();}
});

test('dragon mount checks rewards and proximity, synchronizes riding and returns beside the player',async()=>{
  const h=await harness();try{
    const user=await h.register('crystal_rider'),visitor=await h.register('crystal_guest');
    const socket=await h.connect(user),guest=await h.connect(visitor,user.id);
    const body={riding:true,villageId:user.id};
    const look={hat:'none',accessory:'none',color:'#88b5d7',ride:'babyDragon'};
    assert.equal((await h.request('/me/mount',null,body)).status,401);
    assert.equal((await h.request('/me/mount',user,body)).status,403);
    for(const forged of [{appearance:look},{characterLooks:{pio:look}},{avatarAppearance:look}])assert.equal((await h.request('/me/world',user,forged,'PATCH')).status,403);
    h.runtime.store.run('INSERT INTO account_rewards(user_id,reward_id) VALUES(?,?)',user.id,SURVEY_REWARD);
    h.advance(100);
    let dragon=h.runtime.life.petMembers(user.id).find(m=>m.actorKind==='MOUNT'&&m.ownerId===user.id);
    assert.ok(dragon);assert.equal(h.runtime.life.petMembers(user.id).filter(m=>m.actorKind==='PET').length,2);
    socket.emit('village:move',{villageId:user.id,x:-8,z:-8,rotation:0,moving:false,seatId:null});
    await h.emit(socket,'village:join',{villageId:user.id});
    assert.equal((await h.request('/me/mount',user,body)).status,409,'remote mount cannot be stolen from across the village');
    socket.emit('village:move',{villageId:user.id,x:dragon.x,z:dragon.z,rotation:0,moving:false,seatId:null});
    await h.emit(socket,'village:join',{villageId:user.id});
    const mounted=await h.request('/me/mount',user,body);assert.equal(mounted.status,200);assert.equal(mounted.body.user.appearance.ride,'babyDragon');
    let snapshot=await h.emit(guest,'village:join',{villageId:user.id});
    assert.equal(snapshot.members.find(m=>m.userId===user.id).appearance.ride,'babyDragon');
    assert.equal(snapshot.members.filter(m=>m.actorKind==='MOUNT'&&m.ownerId===user.id).length,0,'no duplicate dragon while riding');
    socket.emit('village:move',{villageId:user.id,x:4,z:3,rotation:1,moving:false,seatId:null});await h.emit(socket,'village:join',{villageId:user.id});
    assert.equal((await h.request('/me/mount',user,{...body,riding:false})).status,200);
    dragon=h.runtime.life.petMembers(user.id).find(m=>m.actorKind==='MOUNT'&&m.ownerId===user.id);
    assert.ok(Math.hypot(dragon.x-4,dragon.z-3)<1,'dragon reappears beside its rider');
    snapshot=await h.emit(guest,'village:join',{villageId:user.id});
    assert.equal(snapshot.members.find(m=>m.userId===user.id).appearance.ride,'none');
    assert.equal(snapshot.members.find(m=>m.actorKind==='MOUNT').appearance.petType,'babyDragon');
    assert.equal((await h.request('/me/mount',visitor,body)).status,403);
    assert.deepEqual((await h.request('/me',user)).body.user.rewards,[SURVEY_REWARD]);
  }finally{await h.close();}
});
