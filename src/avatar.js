import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import {characters} from '../shared/world.mjs';
const assets=new Map();
export function loadAsset(character='pio'){
  const entry=characters.find(c=>c.id===character)||characters[0];
  const base='/resource/'+entry.folder+'/',prefix=entry.folder;
  if(!assets.has(entry.id))assets.set(entry.id,new Promise((resolve,reject)=>{
    // FBX's original absolute texture paths are remapped to the provided PBR textures.
    const manager=new THREE.LoadingManager();
    manager.setURLModifier(url=>{if(/\.(png|jpg|jpeg|tga)$/i.test(url)&&!url.startsWith('blob:')){const file=url.split(/[\\/]/).at(-1);return base+(file.includes('normal')?prefix+'_texture_0_normal.png':file.includes('roughness')?prefix+'_texture_0_roughness.png':file.includes('metallic')?prefix+'_texture_0_metallic.png':prefix+'_texture_0.png');}return url;});
    new FBXLoader(manager).load(base+prefix+'_Animation_'+entry.animation+'_withSkin.fbx',fbx=>{
      const loader=new THREE.TextureLoader();const map=loader.load(base+prefix+'_texture_0.png');map.colorSpace=THREE.SRGBColorSpace;
      const normalMap=loader.load(base+prefix+'_texture_0_normal.png');const roughnessMap=loader.load(base+prefix+'_texture_0_roughness.png');const metalnessMap=loader.load(base+prefix+'_texture_0_metallic.png');
      const mat=new THREE.MeshStandardMaterial({map,normalMap,roughnessMap,metalnessMap,metalness:.15,roughness:.85});
      // Meshy export includes an unrigged Icosphere helper. It is not part of the character.
      const helpers=[];fbx.traverse(o=>{if(o.isMesh&&o.name==='Icosphere')helpers.push(o);else if(o.isMesh){o.material=mat;o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});helpers.forEach(o=>o.removeFromParent());
      resolve(fbx);
    },undefined,e=>{assets.delete(entry.id);reject(e);});
  }));return assets.get(entry.id);
}
