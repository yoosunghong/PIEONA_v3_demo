import test from 'node:test';
import assert from 'node:assert/strict';
import {Bone,Group,PerspectiveCamera,Vector3,AnimationMixer,AnimationClip,NumberKeyframeTrack} from 'three';
import {createRunMotion} from '../src/avatarMotion.mjs';
import {villageDirection,villageMovementKey,villagePlayers,showVillageStandIn,joystickAxis,villageJumpHeight} from '../src/villageMovement.mjs';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);

test('village jumps land after one arc and space never interrupts text input',()=>{
  const started=1000;
  near(villageJumpHeight(started,1000),0);
  near(villageJumpHeight(started,1360),1.15);
  near(villageJumpHeight(started,1720),0);
  near(villageJumpHeight(started,2000),0);
  near(villageJumpHeight(undefined,1360),0);
  assert.equal(villageMovementKey({key:' ',code:'Space'}),' ');
  assert.equal(villageMovementKey({key:' ',target:{closest:()=>({})}}),null);
  assert.equal(villageMovementKey({key:' ',target:{closest:selector=>selector.includes('button')?{}:null}}),null);
});

test('AI avatar stays beside the owner and yields only to its active companion actor',()=>{
  const visitor={userId:'guest'},owner={userId:'owner'};
  assert.equal(showVillageStandIn('village','owner',[visitor]),true);
  assert.equal(showVillageStandIn('village','owner',[visitor,owner]),true);
  assert.equal(showVillageStandIn('village','owner',[]),true);
  assert.equal(showVillageStandIn('village','owner',villagePlayers([],'owner','owner','나',{})),true);
  assert.equal(showVillageStandIn('village','owner',[owner,{userId:'companion',actorKind:'COMPANION'}]),false);
  assert.equal(showVillageStandIn('topic','owner',[{actorKind:'COMPANION'}]),true);
  assert.equal(showVillageStandIn('home','owner',[{actorKind:'COMPANION'}],'visitor'),true);
  assert.equal(showVillageStandIn('home','owner',[owner,visitor]),true);
  assert.equal(showVillageStandIn('home','owner',[owner,visitor],'owner'),true);
  assert.equal(showVillageStandIn('home','owner',[owner,visitor],'guest'),true);
  assert.equal(showVillageStandIn('home','owner',[],'guest'),true);
});

test('touch stick has a dead zone and bounded analog speed in camera space',()=>{
  assert.deepEqual(joystickAxis(2,-2),{x:0,y:0});
  assert.deepEqual(joystickAxis(22,0),{x:.5,y:0});
  const diagonal=joystickAxis(1000,-1000);near(Math.hypot(diagonal.x,diagonal.y),1);
  const camera=new PerspectiveCamera();camera.position.set(11,17,14);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const half=villageDirection(new Set(),camera,new Vector3(),joystickAxis(22,0));near(half.length(),.5);
  const keyboard=villageDirection(new Set(['d']),camera);
  near(half.clone().normalize().dot(keyboard),1);
  near(villageDirection(new Set(['d']),camera,new Vector3(),diagonal).length(),1);
  near(villageDirection(new Set(),camera,new Vector3(),joystickAxis(0,0)).length(),0);
});

test('walking ignores text editing, composition and browser shortcuts',()=>{
  assert.equal(villageMovementKey({key:'W'}),'w');
  assert.equal(villageMovementKey({key:'ㅈ',code:'KeyW'}),'w');
  assert.equal(villageMovementKey({key:'ArrowLeft'}),'arrowleft');
  assert.equal(villageMovementKey({key:'Enter'}),null);
  for(const flag of ['defaultPrevented','isComposing','ctrlKey','metaKey','altKey']){
    assert.equal(villageMovementKey({key:'w',[flag]:true}),null);
  }
  assert.equal(villageMovementKey({key:'w',target:{isContentEditable:true}}),null);
  assert.equal(villageMovementKey({key:'w',target:{closest:()=>({})}}),null);
});

test('owner can walk before connecting and reconnection never duplicates the player',()=>{
  const look={hat:'beret'},visitor={userId:'visitor',x:1,z:2};
  const members=villagePlayers([visitor],'owner','owner','나',look);
  assert.equal(members.length,2);
  assert.deepEqual(members[1],{userId:'owner',nickname:'나',appearance:look,x:0,z:3});
  assert.equal(villagePlayers(members,'owner','owner','나',look),members);
  assert.deepEqual(villagePlayers([],'owner','visitor','손님',look),[]);
  assert.deepEqual(villagePlayers([],undefined,undefined),[]);
});

test('single direction keys follow the screen axes at default and orbited camera angles',()=>{
  for(const [x,y,z] of [[11,17,14],[-14,8,11],[0,20,-10]]){
    const camera=new PerspectiveCamera(38,1,.1,120);camera.position.set(x,y,z);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const origin=new Vector3().project(camera);
    for(const key of ['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']){
      const direction=villageDirection(new Set([key]),camera);
      near(direction.length(),1);near(direction.y,0);
      const screen=direction.clone().project(camera).sub(origin);
      if(['w','s','arrowup','arrowdown'].includes(key)){
        near(screen.x,0);assert.equal(screen.y>0,['w','arrowup'].includes(key));
      }else{
        near(screen.y,0);assert.equal(screen.x>0,['d','arrowright'].includes(key));
      }
    }
    near(villageDirection(new Set(['w','d']),camera).length(),1);
    near(villageDirection(new Set(['w','s','a','d']),camera).length(),0);
    near(villageDirection(new Set(),camera).length(),0);
  }
});

test('shared run cycle swings opposite limbs without accumulating rotation and restores idle',()=>{
  const avatar=new Group();
  const parts=['LeftUpLeg','RightUpLeg','LeftArm','RightArm','LeftForeArm'].map(name=>{
    const bone=new Bone();bone.name=name;bone.rotation.set(.1,.2,.3);avatar.add(bone);return bone;
  });
  const run=createRunMotion(avatar),time=Math.PI/36;
  near(run.update(time,true),.09);
  const expected=[.8,-.6,-.45,.65,.1];
  for(let repeat=0;repeat<5;repeat++){
    run.update(time,true);
    parts.forEach((bone,i)=>{near(bone.rotation.x,expected[i]);near(bone.rotation.y,.2);near(bone.rotation.z,.3);});
  }
  near(run.update(0,false),0);parts.forEach(bone=>near(bone.rotation.x,.1));
});

test('idle mixer can stop for running and resume without overriding the run pose',()=>{
  const avatar=new Group(),leg=new Bone();leg.name='LeftUpLeg';avatar.add(leg);
  const run=createRunMotion(avatar),mixer=new AnimationMixer(avatar);
  const idle=mixer.clipAction(new AnimationClip('idle',1,[new NumberKeyframeTrack('LeftUpLeg.rotation[x]',[0,1],[.2,.4])]));
  idle.play();mixer.update(.25);near(leg.rotation.x,.25);
  idle.stop();mixer.update(.1);run.update(Math.PI/36,true);near(leg.rotation.x,.7);
  run.update(0,false);idle.reset().play();mixer.update(.25);near(leg.rotation.x,.25);
  mixer.stopAllAction();mixer.uncacheRoot(avatar);
});
