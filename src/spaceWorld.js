import * as THREE from 'three';
import {DEFAULT_PLATFORM_COLOR} from '../shared/platform.mjs';
import {normalizeVillageTheme} from '../shared/world.mjs';

export const SPACE_BACKDROP='/images/space/milky-way-quiet-v1.png';
export const spaceBackdropPath=theme=>normalizeVillageTheme(theme)==='sunset'?'/images/space/solar-dusk-quiet-v1.png':theme==='cafe'?'/images/space/aurora-quiet-v1.png':theme==='twilight'?'/images/space/blue-nebula-soft.png':SPACE_BACKDROP;
export function setPlatformColor(root,color=DEFAULT_PLATFORM_COLOR){root.getObjectByName('platform-surface')?.material.color.set(color);}
// One floating diorama silhouette is shared by the plaza, farm and star atlas.
export function createDioramaPlatform({radius=8,color=DEFAULT_PLATFORM_COLOR}={}){
  const root=new THREE.Group();root.name='star-diorama-platform';
  const mesh=(geometry,color,y,extra={})=>{const o=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.86,...extra}));o.position.y=y;o.receiveShadow=true;root.add(o);return o;};
  mesh(new THREE.CylinderGeometry(radius,radius*.94,.26,96),0xc5bbd8,-.12);
  mesh(new THREE.CylinderGeometry(radius*.977,radius*.977,.12,96),color,.06).name='platform-surface';
  mesh(new THREE.CylinderGeometry(radius*.94,radius*.68,.8,48),0x827a9d,-.64,{emissive:0x484366,emissiveIntensity:.24});
  mesh(new THREE.CylinderGeometry(radius*.68,radius*.18,1.5,11),0x827794,-1.78,{emissive:0x484366,emissiveIntensity:.3});
  for(let i=0;i<9;i++){const a=i*Math.PI*2/9,rock=mesh(new THREE.DodecahedronGeometry(radius*.15,0),i%2?0x8d83a3:0x958ba8,-radius*.16-.7-(i%3)*.15,{emissive:0x484366,emissiveIntensity:.2});rock.position.x=Math.cos(a)*radius*.72;rock.position.z=Math.sin(a)*radius*.72;rock.scale.set(1,.8+(i%3)*.2,1);}
  const ring=mesh(new THREE.TorusGeometry(radius*1.075,.025,8,128),0x89cfff,-.64,{emissive:0x4fafff,emissiveIntensity:2,transparent:true,opacity:.7});ring.rotation.x=Math.PI/2;
  const halo=mesh(new THREE.RingGeometry(radius*1.03,radius*1.14,128),0x78bbff,-.65,{emissive:0x4b9bff,emissiveIntensity:1,side:THREE.DoubleSide,transparent:true,opacity:.12,depthWrite:false});halo.rotation.x=-Math.PI/2;
  return root;
}

export function createSpaceBackdrop(scene,{theme='milkyway'}={}){
  const root=new THREE.Group();root.name='space-atmosphere';scene.add(root);scene.fog=null;
  const path=spaceBackdropPath(theme);
  let aspect=16/9;
  const fit=()=>{const image=texture.image;if(!image)return;const source=image.width/image.height,x=Math.min(1,aspect/source),y=Math.min(1,source/aspect);texture.repeat.set(x,y);texture.offset.set((1-x)/2,(1-y)/2);texture.updateMatrix();};
  let loaded;const ready=new Promise(resolve=>{loaded=resolve;});
  const texture=new THREE.TextureLoader().load(path,()=>{fit();loaded();},undefined,loaded);texture.colorSpace=THREE.SRGBColorSpace;
  scene.background=texture;
  scene.backgroundIntensity=theme==='sunset'?.8:theme==='twilight'?.86:.85;
  const tint=theme==='sunset'?0xe8a6b6:theme==='cafe'?0x98cfc7:0xffffff;
  const priorColor=scene.backgroundBlurriness;scene.backgroundBlurriness=.025;
  const positions=[];let seed=76;const random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};
  for(let i=0;i<260;i++)positions.push((random()-.5)*130,(random()-.4)*85,(random()-.5)*130);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const material=new THREE.PointsMaterial({color:tint,size:.055,transparent:true,opacity:.7,depthWrite:false,fog:false});
  const stars=new THREE.Points(geometry,material);root.add(stars);
  return {root,ready,resize(width,height){if(width>0&&height>0){aspect=width/height;fit();}},update(time){stars.rotation.y=Math.sin(time*.009)*.035;material.opacity=.58+Math.sin(time*.4)*.09;},dispose(){scene.remove(root);geometry.dispose();material.dispose();texture.dispose();scene.backgroundBlurriness=priorColor;}};
}
