import React,{useEffect,useState} from 'react';
import * as THREE from 'three';
import {loadAsset} from './avatar';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {dressAvatar,disposeObject} from './worldAssets';
import {AvatarBadge} from './Panels';

// Render each look once; list rows display images instead of running more scenes.
const portraits=new Map();
let queue=Promise.resolve();
function portraitFor(appearance,headshot=false,resolution=128){
  const key=JSON.stringify({appearance:appearance||{},headshot,resolution});
  if(portraits.has(key))return portraits.get(key);
  const result=queue.then(async()=>{
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
    const avatar=clone(await loadAsset(appearance?.character)),scene=new THREE.Scene();
    if(headshot)avatar.scale.multiplyScalar(2.65/new THREE.Box3().setFromObject(avatar).getSize(new THREE.Vector3()).y);
    dressAvatar(avatar,appearance||{});
    try{
      renderer.setSize(resolution,resolution);renderer.setPixelRatio(1);
      renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
      const size=new THREE.Box3().setFromObject(avatar).getSize(new THREE.Vector3());
      if(!headshot)avatar.scale.multiplyScalar(1.5/size.y);
      const bounds=new THREE.Box3().setFromObject(avatar),center=bounds.getCenter(new THREE.Vector3());
      avatar.position.set(-center.x,-bounds.min.y,-center.z);avatar.rotation.y=.12;scene.add(avatar);
      scene.add(new THREE.HemisphereLight(0xf5fbff,0xabc0d0,2.5));
      const light=new THREE.DirectionalLight(0xfff3e6,3);light.position.set(-3,5,5);scene.add(light);
      const camera=headshot?new THREE.OrthographicCamera(-.85,.85,2.75,1.05,.1,20):new THREE.OrthographicCamera(-1,1,1.7,-.3,.1,20);camera.position.set(0,0,5);camera.lookAt(0,0,0);
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

export default function AvatarPortrait({user,headshot=false,resolution=128}){
  const [src,setSrc]=useState(null),look=JSON.stringify(user.appearance||{});
  useEffect(()=>{let active=true;setSrc(null);portraitFor(user.appearance,headshot,resolution).then(value=>{if(active)setSrc(value);}).catch(()=>{});return()=>{active=false;};},[look,headshot,resolution]);
  return src?<span className="avatar-badge avatar-portrait"><img src={src} alt=""/></span>:<AvatarBadge user={user}/>;
}
