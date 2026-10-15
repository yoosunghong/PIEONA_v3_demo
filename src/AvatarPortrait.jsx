import React,{useEffect,useState} from 'react';
import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {loadAsset} from './avatar';
import {dressAvatar,disposeObject} from './worldAssets';
import {AvatarBadge} from './Panels';

// Render each look once; list rows display images instead of running more scenes.
const portraits=new Map();
let queue=Promise.resolve();
function portraitFor(appearance){
  const key=JSON.stringify(appearance||{});
  if(portraits.has(key))return portraits.get(key);
  const result=queue.then(async()=>{
    const asset=await loadAsset(appearance?.character);
    const textures=new Set();
    asset.traverse(node=>{if(node.isMesh)for(const material of [node.material].flat())for(const map of ['map','normalMap','roughnessMap','metalnessMap'])if(material[map])textures.add(material[map]);});
    await Promise.all([...textures].map(texture=>{
      const image=texture.image;
      if(image?.complete)return Promise.resolve();
      return new Promise(resolve=>{
        if(image){image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});}
        else setTimeout(resolve,1500);
      });
    }));
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
    const avatar=clone(asset),scene=new THREE.Scene();
    try{
      renderer.setSize(128,128);renderer.setPixelRatio(1);
      renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
      const size=new THREE.Box3().setFromObject(avatar).getSize(new THREE.Vector3());
      avatar.scale.setScalar(2.65/size.y);
      const bounds=new THREE.Box3().setFromObject(avatar),center=bounds.getCenter(new THREE.Vector3());
      avatar.position.set(-center.x,-bounds.min.y,-center.z);avatar.rotation.y=.12;scene.add(avatar);
      dressAvatar(avatar,appearance);
      scene.add(new THREE.HemisphereLight(0xf5fbff,0xabc0d0,2.5));
      const light=new THREE.DirectionalLight(0xfff3e6,3);light.position.set(-3,5,5);scene.add(light);
      const camera=new THREE.OrthographicCamera(-.86,.86,2.96,1.24,.1,20);camera.position.set(0,0,5);camera.lookAt(0,0,0);
      renderer.render(scene,camera);
      return renderer.domElement.toDataURL('image/png');
    }finally{
      avatar.traverse(node=>{if(node.userData.generated)disposeObject(node);});
      renderer.dispose();renderer.forceContextLoss();
    }
  });
  queue=result.catch(()=>{});portraits.set(key,result);
  result.catch(()=>portraits.delete(key));
  return result;
}

export default function AvatarPortrait({user}){
  const [src,setSrc]=useState(null),look=JSON.stringify(user.appearance||{});
  useEffect(()=>{let active=true;setSrc(null);portraitFor(user.appearance).then(value=>{if(active)setSrc(value);}).catch(()=>{});return()=>{active=false;};},[look]);
  return src?<span className="avatar-badge avatar-portrait"><img src={src} alt=""/></span>:<AvatarBadge user={user}/>;
}
