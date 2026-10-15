import * as THREE from 'three';
import {decorations} from '../shared/world.mjs';
import {createDecoration,disposeObject} from './worldAssets';

let cached;
// One temporary renderer produces the whole catalog. Cards themselves are images,
// so scrolling does not allocate dozens of WebGL contexts or animation loops.
export function decorationThumbnails(){
  if(cached)return cached;
  cached=Promise.resolve().then(()=>{
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
    try{
      renderer.setSize(200,180);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
      const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0xc3b2d7,3));
      const light=new THREE.DirectionalLight(0xfff3e3,3);light.position.set(-3,6,5);scene.add(light);
      const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,100),images={};
      for(const item of decorations){
        const model=createDecoration(item.id);scene.add(model);
        try{
          const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
          const fit=Math.max(size.y*.7,size.x*.68,size.z*.68,.45)*1.35;
          camera.left=-fit*200/180;camera.right=fit*200/180;camera.top=fit;camera.bottom=-fit;
          camera.position.copy(center).add(new THREE.Vector3(3,2.3,4));camera.lookAt(center);camera.updateProjectionMatrix();
          renderer.render(scene,camera);images[item.id]=renderer.domElement.toDataURL('image/png');
        }finally{scene.remove(model);disposeObject(model);}
      }
      return images;
    }finally{renderer.dispose();renderer.forceContextLoss();}
  }).catch(error=>{cached=null;throw error;});
  return cached;
}
