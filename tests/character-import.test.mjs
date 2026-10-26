import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {Box3,Vector3,Group,TextureLoader,Texture,AnimationMixer} from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {characters} from '../shared/world.mjs';
import {prepareCharacterAnimations} from '../src/characterAnimations.mjs';
import {createRunMotion} from '../src/avatarMotion.mjs';
import {createSitMotion} from '../src/benchMotion.mjs';
import {createFishingMotion} from '../src/fishingMotion.mjs';
import {createLifeWorld} from '../src/lifeWorld.js';
import {FISHING_ANCHORS} from '../shared/life.mjs';
import {disposeObject} from '../src/worldAssets.js';

function withAvatars(check){
  const load=TextureLoader.prototype.load,previousWindow=globalThis.window;
  globalThis.window={URL};TextureLoader.prototype.load=()=>new Texture();
  try{for(const character of characters){
    const buffer=readFileSync(`resource/${character.folder}/${character.model}`);
    const avatar=prepareCharacterAnimations(new FBXLoader().parse(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),''));
    avatar.children.filter(child=>child.name==='Icosphere').forEach(child=>child.removeFromParent());
    avatar.scale.setScalar(2.65/new Box3().setFromObject(avatar).getSize(new Vector3()).y);
    const bounds=new Box3().setFromObject(avatar),center=bounds.getCenter(new Vector3());avatar.position.set(-center.x,-bounds.min.y,-center.z);
    const root=new Group();root.add(avatar);root.rotation.y=1.2;root.position.set(3,.39,-2);
    check(avatar,root,character);
  }}finally{TextureLoader.prototype.load=load;globalThis.window=previousWindow;}
}

test('all new rigs bind every clip, preserve gameplay transforms and loop without horizontal root drift',()=>{
  withAvatars((avatar,root,character)=>{
    assert.deepEqual(avatar.animations.map(c=>c.name),['Mirror_Viewing','Walking','Running']);
    const bones=new Map();avatar.traverse(b=>{if(b.isBone)bones.set(b.name,b);});
    const hips=bones.get('mixamorigHips'),hipPosition=hips.position.clone(),scale=avatar.scale.clone(),position=avatar.position.clone();
    const mixer=new AnimationMixer(avatar);
    for(const clip of avatar.animations){
      for(const track of clip.tracks)assert.ok(bones.has(track.name.split('.')[0]),character.id+' '+track.name);
      mixer.clipAction(clip).play();
      let changed=false;const rest=[...bones.values()].map(b=>b.quaternion.clone());
      for(let frame=0;frame<180;frame++){
        mixer.update(1/30);assert.ok(avatar.scale.distanceTo(scale)<1e-8);assert.ok(avatar.position.distanceTo(position)<1e-8);
        assert.ok(Math.abs(hips.position.x-hipPosition.x)<1e-6);assert.ok(Math.abs(hips.position.z-hipPosition.z)<1e-6);
        changed||=[...bones.values()].some((b,i)=>b.quaternion.angleTo(rest[i])>.1);
      }
      assert.ok(changed,character.id+' '+clip.name+' moves bones');mixer.stopAllAction();
    }
    for(const clip of ['Walking','Running']){
      const motion=createRunMotion(avatar,{clip}),rest=hips.position.clone();
      motion.update(2,true);motion.update(2.25,true);motion.update(0,false);
      assert.ok(hips.position.distanceTo(rest)<1e-6,character.id+' stop restores animated hip position');
    }
  });
});

test('fishing animates both arms on every new rig, follows rotation, and releases back to sitting and standing',()=>{
  withAvatars((avatar,root,character)=>{
    const bones=[];avatar.traverse(b=>{if(b.isBone)bones.push(b);});
    const rest=bones.map(b=>b.quaternion.clone()),sit=createSitMotion(avatar),fish=createFishingMotion(avatar);
    const hand=side=>bones.find(b=>b.name.endsWith(side+'Hand'));
    const local=b=>{root.updateMatrixWorld(true);return root.worldToLocal(b.getWorldPosition(new Vector3()));};
    let first;
    for(let i=0;i<90;i++){
      root.position.y=.39+sit.update(1/30,true,.68,true);fish.update(i/30,true,false,i>75);
      assert.equal(fish.props.visible,true);
      for(const side of ['Left','Right']){const p=local(hand(side));assert.ok(p.toArray().every(Number.isFinite));assert.ok(p.z>.1,character.id+' hands forward');}
      if(i===0)first=local(hand('Right'));
    }
    assert.ok(first.distanceTo(local(hand('Right')))>.1,character.id+' casting changes hands');
    const rod=fish.props.children[0],start=rod.localToWorld(new Vector3(0,-.5,0));
    assert.ok(start.distanceTo(hand('Right').getWorldPosition(new Vector3()))<1e-5,character.id+' rod stays in hand');
    fish.update(4,false);assert.equal(fish.props.visible,false);sit.update(1,false,.68,true);
    bones.forEach((b,i)=>assert.ok(b.quaternion.angleTo(rest[i])<1e-6,character.id+' restores '+b.name));
  });
});

test('only replacement FBXs and all four PBR textures remain in character asset folders',()=>{
  assert.equal(existsSync('resource/Meshy_AI_biped'),false);
  for(const character of characters){
    const files=readdirSync(`resource/${character.folder}`);
    assert.deepEqual(files.filter(f=>f.endsWith('.fbx')),[character.model]);
    for(const suffix of ['','_normal','_roughness','_metallic'])assert.ok(files.includes(`${character.folder}_texture_0${suffix}.png`));
  }
});

test('a fishing player has one handheld rod while companions keep their facility rod',()=>{
  const world=createLifeWorld(),root=new Group(),avatar=new Group();root.add(avatar);
  const motion=createFishingMotion(avatar),seatId=FISHING_ANCHORS[0].id,rods=[];
  world.root.traverse(part=>{if(part.userData.lifeAction)rods.push(part);});
  const visibleCount=()=>rods.filter(rod=>rod.visible).length+Number(motion.props.visible);
  try{
    for(const actorKind of [undefined,'PLAYER']){
      world.update(1,[{userId:'player',seatId,actorKind}]);motion.update(1,true);
      assert.equal(visibleCount(),1);assert.equal(motion.props.visible,true);
    }
    for(const actorKind of ['PET','MOUNT']){
      motion.update(2,false);world.update(2,[{userId:'companion',seatId,actorKind}]);
      assert.equal(visibleCount(),1);assert.equal(motion.props.visible,false);
    }
    world.update(3,[]);assert.equal(visibleCount(),0);
  }finally{disposeObject(world.root);disposeObject(motion.props);}
});
