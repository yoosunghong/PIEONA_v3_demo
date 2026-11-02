import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {characters} from '../shared/world.mjs';
import {dressAvatar,disposeObject} from '../src/worldAssets.js';

test('every hat sits on the head top bone of each character',()=>{
  const previousWindow=globalThis.window,loadTexture=THREE.TextureLoader.prototype.load;
  globalThis.window={URL:{createObjectURL:()=>''}};
  THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
  try{
    for(const character of characters){
      const file=readFileSync(`resource/${character.folder}/${character.model}`);
      for(const hat of ['beret','crown','sprout','birthday','coffee']){
        const avatar=new FBXLoader().parse(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
        const helpers=[];avatar.traverse(o=>{if(o.isMesh&&o.name==='Icosphere')helpers.push(o);});helpers.forEach(o=>o.removeFromParent());
        const initial=new THREE.Box3().setFromObject(avatar);avatar.scale.setScalar(2.65/(initial.max.y-initial.min.y));
        const bounds=new THREE.Box3().setFromObject(avatar);dressAvatar(avatar,{hat});avatar.updateMatrixWorld(true);
        const wearable=avatar.getObjectByName('pieona-wearables');
        const bottom=new THREE.Box3().setFromObject(wearable).min.y;
        assert.ok(bottom>=bounds.max.y-.1&&bottom<=bounds.max.y+.3,`${character.id} ${hat}: ${bottom-bounds.max.y}`);
        assert.match(wearable.parent.name,/headtop_end$/i);
        avatar.traverse(o=>{if(o.userData.generated)disposeObject(o);});
      }
    }
  }finally{THREE.TextureLoader.prototype.load=loadTexture;if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;}
});
