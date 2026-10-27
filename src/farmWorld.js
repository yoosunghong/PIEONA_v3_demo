import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createRunMotion} from './avatarMotion.mjs';
import {WALK_SPEED,villageDirection,villageMovementKey} from './villageMovement.mjs';
import {createVillageTapGesture} from './villageTapMovement.mjs';
import {dressAvatar} from './worldAssets';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {GARDEN_BEDS,cropGrowth} from '../shared/garden.mjs';
import {loadAsset} from './avatar';

// Plot controls track their 3D ground anchors as the camera moves.
export function createFarmWorld(host,{getPlots,appearance={},onProject,onPlot,onReady,onAvatar,onPlayerProject,getInput=()=>({})}){
  const scene=new T.Scene();scene.background=new T.Color('#c5e1ed');scene.fog=new T.Fog('#c5e1ed',28,65);
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','3D 농장 · 드래그로 회전, 오른쪽 드래그로 이동, 휠로 확대 · WASD 또는 바닥 터치로 걷기');renderer.domElement.tabIndex=0;
  const camera=new T.PerspectiveCamera(42,1,.1,100);camera.position.set(11,14,17);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.enableDamping=true;controls.minDistance=8;controls.maxDistance=32;controls.maxPolarAngle=Math.PI*.46;controls.minPolarAngle=.2;controls.update();
  const resize=()=>{const width=host.clientWidth||1,height=host.clientHeight||1;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  scene.add(new T.HemisphereLight('#fff6df','#8f997b',2.45));
  const sun=new T.DirectionalLight('#fff1db',2.5);sun.position.set(-8,17,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12});sun.shadow.normalBias=.03;sun.shadow.bias=-.0002;sun.shadow.intensity=.24;scene.add(sun);
  const geometries=[],materials=[],plants=[],cache=new Map(),ray=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0),0);
  function mat(color){if(!cache.has(color)){const m=new T.MeshStandardMaterial({color,roughness:.95});cache.set(color,m);materials.push(m);}return cache.get(color);}
  function mesh(g,color,x,y,z,parent){geometries.push(g);const o=new T.Mesh(g,mat(color));o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  const ball=(c,x,y,z,r,p)=>mesh(new T.SphereGeometry(r,12,9),c,x,y,z,p);
  const fruitBall=(...args)=>{const o=ball(...args);o.userData.fruit=true;return o;};
  const stem=(x,y,z,h,parent)=>mesh(new T.CylinderGeometry(.018,.026,h,7),'#7e9e59',x,y,z,parent);
  function leaf(x,y,z,side,p,size=.16){const o=ball('#89ad66',x+side*size*.5,y,z,size,p);o.scale.set(1,.3,.58);o.rotation.z=side*.4;return o;}
  function cropModel(id){
    const root=new T.Group(),fruit=new T.Group();root.add(fruit);
    if(id==='HERB'){
      for(const [x,z] of [[-.3,-.18],[.28,-.18],[0,.25]]){for(let i=0;i<7;i++){const a=i*Math.PI*2/7,o=ball(i%2?'#9db779':'#8ba76b',x+Math.cos(a)*.12,.18+Math.sin(i)*.025,z+Math.sin(a)*.12,.16,root);o.scale.y=1.05;}ball('#bdce92',x,.27,z,.12,root);}
    }else if(id==='FLOWER'){
      for(const x of [-.24,.24]){stem(x,.3,0,.6,root);leaf(x,.24,0,-1,root);for(let i=0;i<6;i++){const a=i*Math.PI/3;ball('#fff2cc',x+Math.cos(a)*.12,.63,Math.sin(a)*.12,.085,fruit);}ball('#e3bf6d',x,.66,0,.08,fruit);}
    }else if(id==='APPLE'){
      stem(0,.55,0,1.1,root);for(const [x,y,z] of [[-.22,.82,.08],[.24,.9,-.08],[0,1.15,0]]){const o=ball('#9bb77d',x,y,z,.32,root);o.scale.y=.85;}
      for(const [x,y,z] of [[-.27,.85,.29],[.28,.98,.18],[.05,1.14,.28],[-.09,.72,.32]])fruitBall('#db8471',x,y,z,.12,fruit);
    }else if(id==='STRAWBERRY'){
      for(const [x,z] of [[-.26,-.2],[.26,-.2],[0,.25]]){stem(x,.18,z,.35,root);for(const side of [-1,1])leaf(x,.25,z,side,root,.18);const berry=fruitBall('#de7d80',x,.22,z+.14,.12,fruit);berry.scale.y=1.18;for(const side of [-1,1])leaf(x,.34,z+.14,side,fruit,.065);}
    }else{
      // Thin wooden supports and branching vines match the reference's tallest crop.
      for(const x of [-.4,.4])mesh(new T.CylinderGeometry(.026,.032,1.45,7),'#c7ab82',x,.72,-.2,root);
      for(const y of [.65,1.18]){const rail=mesh(new T.CylinderGeometry(.016,.016,.85,6),'#cfb78e',0,y,-.2,root);rail.rotation.z=Math.PI/2;}
      for(const [x,z] of [[-.28,-.15],[.28,-.15],[.02,.24]]){
        stem(x,.58,z,1.16,root);
        for(let i=0;i<4;i++){const y=.25+i*.25,side=i%2?-1:1;leaf(x,y,z,side,root,.18);leaf(x,y+.06,z-.06,-side,root,.12);}
        for(const [dx,y,dz] of [[-.12,.38,.07],[.13,.72,.03],[-.08,.96,.08]])fruitBall('#e8a465',x+dx,y,z+dz,.105,fruit);
      }
    }
    return {root,fruit};
  }
  for(const [index,bed] of GARDEN_BEDS.entries()){
    const anchor=new T.Vector3((index%3-1)*2.35,0,(Math.floor(index/3)-1)*2.1),group=new T.Group();group.position.copy(anchor);group.userData.plotId=bed.id;scene.add(group);
    mesh(new T.BoxGeometry(1.95,.22,1.65),'#af825e',0,-.02,0,group);
    for(const z of [-.8,.8])mesh(new T.BoxGeometry(2.05,.19,.08),'#d4b18b',0,.12,z,group);
    const hit=new T.Mesh(new T.PlaneGeometry(1.5,1.05),new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide}));hit.rotation.x=-Math.PI/2;group.add(hit);geometries.push(hit.geometry);materials.push(hit.material);
    plants.push({id:bed.id,index,group,anchor,model:null,cropId:null});
  }
  mesh(new T.CylinderGeometry(14,14.5,.6,64),'#a8c58c',0,-.4,0,scene);
  mesh(new T.BoxGeometry(3,.04,23),'#dfceb0',5,-.07,0,scene);
  mesh(new T.BoxGeometry(22,.04,1.6),'#dfceb0',0,-.06,4.5,scene);
  for(let i=-6;i<=6;i++)for(const z of [-11,11])mesh(new T.BoxGeometry(.16,1,.16),'#e7d4b3',i*1.65,.4,z,scene);
  for(const z of [-11,11])for(const y of [.35,.75])mesh(new T.BoxGeometry(20,.13,.12),'#e7d4b3',0,y,z,scene);
  for(const [x,z] of [[-8,-6],[-9,-1],[-8,6],[8,-7],[9,5]]){mesh(new T.CylinderGeometry(.16,.24,1.8,8),'#9a795d',x,.8,z,scene);ball('#7eac79',x,2.4,z,1.35,scene);ball('#a0bf80',x+.5,2.9,z,.9,scene);}
  mesh(new T.BoxGeometry(3,2.5,2.8),'#e5d2aa',-5,1.15,-7,scene);
  const roof=mesh(new T.ConeGeometry(2.7,1.6,4),'#879fac',-5,3.1,-7,scene);roof.rotation.y=Math.PI/4;
  mesh(new T.BoxGeometry(.8,1.7,.1),'#9d8267',-5,.8,-5.55,scene);
  const player=new T.Group();player.position.set(2,0,5);player.rotation.y=3.6;scene.add(player);
  let dead=false,frame,avatarMaterials=[],motion,last=performance.now(),destination=null;
  const keys=new Set(),direction=new T.Vector3(),gesture=createVillageTapGesture();
  loadAsset(appearance.character||'pio').then(asset=>{
    if(dead)return;const avatar=clone(asset);const bounds=new T.Box3().setFromObject(avatar),size=bounds.getSize(new T.Vector3());avatar.scale.setScalar(2.05/size.y);const b=new T.Box3().setFromObject(avatar),center=b.getCenter(new T.Vector3());avatar.position.set(-center.x,-b.min.y,-center.z);avatar.traverse(o=>{if(o.isMesh){o.material=o.material.clone();avatarMaterials.push(o.material);}});dressAvatar(avatar,appearance);player.add(avatar);motion=createRunMotion(avatar,{clip:'Walking'});onReady?.();
  }).catch(()=>{if(!dead){ball('#fff6e6',0,.72,0,.4,player);ball('#8e9b66',0,.23,0,.2,player);onReady?.();}});
  function plotAt(event){const rect=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new T.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);for(const hit of ray.intersectObjects(plants.map(p=>p.group),true)){for(let o=hit.object;o;o=o.parent)if(o.userData.plotId)return o.userData.plotId;}return null;}
  function setRay(event){const rect=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new T.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);}
  const pointerDown=event=>{gesture.down(event);renderer.domElement.focus({preventScroll:true});};
  const pointerMove=event=>gesture.move(event);
  const pointerCancel=event=>gesture.cancel(event);
  const pointerUp=event=>{if(!gesture.up(event)||getInput().blocked)return;setRay(event);
    if(ray.intersectObject(player,true).length){onAvatar?.();return;}
    const id=plotAt(event);if(id){onPlot?.(id);return;}
    const point=ray.ray.intersectPlane(plane,new T.Vector3());if(point){const radius=Math.hypot(point.x,point.z);if(radius>12)point.multiplyScalar(12/radius);destination=point;}
  };
  const keyDown=event=>{if(getInput().blocked||!host.closest('.farm-screen')?.contains(document.activeElement))return;const key=villageMovementKey(event);if(key){keys.add(key);destination=null;event.preventDefault();}};
  const keyUp=event=>{keys.delete((event.code?.startsWith('Key')?event.code.slice(3):event.key).toLowerCase());};
  const blur=()=>{keys.clear();gesture.reset();};
  renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('pointercancel',pointerCancel);renderer.domElement.addEventListener('contextmenu',event=>event.preventDefault());
  window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);window.addEventListener('blur',blur);
  const project=point=>{const p=point.clone().project(camera);return {left:(p.x+1)*50,top:(1-p.y)*50,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<1&&Math.abs(p.y)<1};};
  function render(){if(dead)return;frame=requestAnimationFrame(render);const stamp=performance.now(),dt=Math.min((stamp-last)/1000,.05);last=stamp;const plots=getPlots(),time=stamp/1000,input=getInput();
    controls.enabled=!input.blocked;controls.update();
    if(input.blocked){keys.clear();destination=null;}
    villageDirection(keys,camera,direction,input.stick||{x:0,y:0});
    if(!direction.lengthSq()&&destination){direction.subVectors(destination,player.position);direction.y=0;if(direction.length()<.12){destination=null;direction.set(0,0,0);}else direction.normalize();}
    const moving=!input.blocked&&direction.lengthSq()>0;
    if(moving){player.position.addScaledVector(direction,WALK_SPEED*dt);const radius=Math.hypot(player.position.x,player.position.z);if(radius>12)player.position.multiplyScalar(12/radius);player.rotation.y=Math.atan2(direction.x,direction.z);}
    motion?.update(time,moving);
    renderer.domElement.dataset.playerPosition=JSON.stringify({x:player.position.x,z:player.position.z});
    renderer.domElement.dataset.cameraPosition=JSON.stringify(camera.position.toArray());
    onPlayerProject?.(project(player.position.clone().add(new T.Vector3(0,2.5,0))));
    renderer.domElement.dataset.playerScreen=JSON.stringify(project(player.position.clone().add(new T.Vector3(0,1,0))));
    for(const p of plants){const plot=plots.find(plot=>plot.id===p.id),growth=cropGrowth(plot||{},Date.now());
      if(p.cropId!==plot?.cropId){if(p.model)p.group.remove(p.model.root);p.model=plot?.cropId?cropModel(plot.cropId):null;if(p.model)p.group.add(p.model.root);p.cropId=plot?.cropId;}
      if(p.model){p.model.root.scale.setScalar([.38,.38,.68,1][growth.stage]);p.model.root.rotation.z=Math.sin(time*1.4+p.index)*.012;p.model.fruit.visible=growth.stage===3;p.model.fruit.traverse(o=>{if(o.userData.fruit)o.material=mat(growth.state==='Ready'?(plot.cropId==='APPLE'?'#dd897b':plot.cropId==='STRAWBERRY'?'#e17b83':plot.cropId==='FLOWER'?'#f5dba0':'#e7a15f'):plot.cropId==='TOMATO'?'#dfb46f':plot.cropId==='STRAWBERRY'?'#dfb68b':'#a4b779');});}
    }
    onProject(Object.fromEntries(plants.map(p=>[p.id,project(p.anchor)])));renderer.render(scene,camera);
  }render();
  return {capture(){renderer.render(scene,camera);return renderer.domElement;},dispose(){dead=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',blur);renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointermove',pointerMove);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('pointercancel',pointerCancel);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());avatarMaterials.forEach(m=>m.dispose());sun.shadow.map?.dispose();renderer.dispose();renderer.domElement.remove();}};
}
