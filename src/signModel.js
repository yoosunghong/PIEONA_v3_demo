import * as THREE from 'three';
import {renderSign} from './signDrawing.mjs';
export function createVillageSign(sign){
  const root=new THREE.Group();root.userData.action='sign';
  const canvas=document.createElement('canvas');renderSign(canvas,sign);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const front=new THREE.Mesh(new THREE.PlaneGeometry(2.2,2.2),new THREE.MeshStandardMaterial({map:texture,transparent:true,alphaTest:.05,roughness:.88,side:THREE.DoubleSide}));front.position.set(0,1.1,.12);root.add(front);
  const wood=new THREE.MeshStandardMaterial({color:sign.shape==='hanging'?'#ac7954':'#e9c39f',roughness:.9});
  const post=new THREE.Mesh(new THREE.BoxGeometry(.27,2,.2),wood);post.position.y=1;post.castShadow=true;root.add(post);
  const back=new THREE.Mesh(new THREE.BoxGeometry(sign.shape==='arrow'?1.35:1.85,sign.shape==='arrow'?.83:1.28,.15),wood);back.position.set(sign.shape==='arrow'?-.15:0,1.1,0);back.castShadow=true;root.add(back);
  root.position.set(sign.x,.15,sign.z);root.rotation.y=sign.rotation*Math.PI/2;return root;
}
