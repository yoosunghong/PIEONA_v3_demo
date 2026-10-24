import * as THREE from 'three';
import {renderChalkboard} from './chalkboardDrawing.mjs';
export function createChalkboard(item,strokes=[]){
  const root=new THREE.Group();root.userData.action='chalkboard';
  const wood=new THREE.MeshStandardMaterial({color:'#bc9369',roughness:.9});
  const box=(w,h,d,x,y,z)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),wood);mesh.position.set(x,y,z);mesh.castShadow=true;root.add(mesh);};
  // The sign's visible board is 1.85 × 1.28; this board is twice as wide and tall.
  box(3.9,2.76,.16,0,2.05,0);
  for(const x of [-1.5,1.5])box(.16,3.45,.2,x,1.725,-.04);
  box(3.9,.12,.38,0,.68,.13);
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;renderChalkboard(canvas,strokes);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const face=new THREE.Mesh(new THREE.PlaneGeometry(3.7,2.56),new THREE.MeshStandardMaterial({map:texture,roughness:1}));face.position.set(0,2.05,.09);root.add(face);
  root.position.set(item.x,.15,item.z);root.rotation.y=item.rotation*Math.PI/2;return root;
}
