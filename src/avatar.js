import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import {characters} from '../shared/world.mjs';
import {prepareCharacterAnimations} from './characterAnimations.mjs';
const assets=new Map();
// Texture filenames are reused; bust the server's immutable cache on replacement.
const assetVersion='merged-20261027';
export function loadAsset(character='pio'){
  const entry=characters.find(c=>c.id===character)||characters[0];
  const base='/resource/'+entry.folder+'/',prefix=entry.folder;
  if(!assets.has(entry.id))assets.set(entry.id,new Promise((resolve,reject)=>{
    // FBX's original absolute texture paths are remapped to the provided PBR textures.
    const manager=new THREE.LoadingManager();
    manager.setURLModifier(url=>{if(/\.(png|jpg|jpeg|tga)$/i.test(url)&&!url.startsWith('blob:')){const file=url.split(/[\\/]/).at(-1);return base+(file.includes('normal')?prefix+'_texture_0_normal.png':file.includes('roughness')?prefix+'_texture_0_roughness.png':file.includes('metallic')?prefix+'_texture_0_metallic.png':prefix+'_texture_0.png')+'?v='+assetVersion;}return url;});
    new FBXLoader(manager).load(base+entry.model,async fbx=>{try{
      const loader=new THREE.TextureLoader();
      const [map,normalMap,roughnessMap,metalnessMap]=await Promise.all(['.png','_normal.png','_roughness.png','_metallic.png'].map(suffix=>loader.loadAsync(base+prefix+'_texture_0'+suffix+'?v='+assetVersion)));map.colorSpace=THREE.SRGBColorSpace;
      const mat=new THREE.MeshStandardMaterial({map,normalMap,roughnessMap,metalnessMap,metalness:.15,roughness:.85});
      // Meshy export includes an unrigged Icosphere helper. It is not part of the character.
      const helpers=[];fbx.traverse(o=>{if(o.isMesh&&o.name==='Icosphere')helpers.push(o);else if(o.isMesh){o.material=mat;o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});helpers.forEach(o=>o.removeFromParent());
      resolve(prepareCharacterAnimations(fbx));
    }catch(error){assets.delete(entry.id);reject(error);}},undefined,e=>{assets.delete(entry.id);reject(e);});
  }));return assets.get(entry.id);
}
