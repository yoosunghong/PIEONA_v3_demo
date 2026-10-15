import test from 'node:test';
import assert from 'node:assert/strict';
import {Bone,Group,PerspectiveCamera,Vector3,AnimationMixer,AnimationClip,NumberKeyframeTrack} from 'three';
import {createRunMotion} from '../src/avatarMotion.mjs';
import {villageDirection} from '../src/villageMovement.mjs';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);

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
