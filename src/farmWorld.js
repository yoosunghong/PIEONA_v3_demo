import * as T from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {GARDEN_BEDS,cropGrowth} from '../shared/garden.mjs';
import {loadAsset} from './avatar';

// Ground anchors match the nine independent beds in the reference environment.
// Scenery is an art plate; crops, lighting, shadows and the player's avatar render live.
export const FARM_ART='/images/farm/farm-reference-environment-v2.png';
export const FARM_SIZE={width:1670,height:942};
export const FARM_PLOTS=[[800,411],[885,453],[977,498],[709,447],[795,489],[885,539],[622,483],[700,530],[786,581]];
export function createFarmWorld(host,{getPlots,appearance={},onProject,onPlot,onReady}){
  const {width,height}=FARM_SIZE,scene=new T.Scene();
  const renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.setSize(width,height);renderer.setClearColor(0,0);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','참고 이미지의 농장 위에서 실제로 성장하는 3D 작물과 나의 캐릭터');
  const unit=71,camera=new T.OrthographicCamera(-width/unit/2,width/unit/2,height/unit/2,-height/unit/2,.1,100);camera.position.set(8,11,10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  scene.add(new T.HemisphereLight('#fff6df','#8f997b',2.45));
  const sun=new T.DirectionalLight('#fff1db',2.5);sun.position.set(-8,17,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12});sun.shadow.normalBias=.03;sun.shadow.bias=-.0002;sun.shadow.intensity=.24;scene.add(sun);
  const geometries=[],materials=[],plants=[],cache=new Map(),ray=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0),0);
  function ground([x,y]){ray.setFromCamera(new T.Vector2(x/width*2-1,1-y/height*2),camera);return ray.ray.intersectPlane(plane,new T.Vector3());}
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
    const anchor=ground(FARM_PLOTS[index]),group=new T.Group();group.position.copy(anchor);group.userData.plotId=bed.id;scene.add(group);
    const hit=new T.Mesh(new T.PlaneGeometry(1.5,1.05),new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide}));hit.rotation.x=-Math.PI/2;group.add(hit);geometries.push(hit.geometry);materials.push(hit.material);
    plants.push({id:bed.id,index,group,anchor,model:null,cropId:null});
  }
  const shadow=new T.Mesh(new T.PlaneGeometry(35,30),new T.ShadowMaterial({opacity:.14}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-.015;shadow.receiveShadow=true;scene.add(shadow);geometries.push(shadow.geometry);materials.push(shadow.material);
  const player=new T.Group();player.position.copy(ground([850,578]));player.rotation.y=3.6;scene.add(player);
  let dead=false,frame,avatarMaterials=[];
  loadAsset(appearance.character||'pio').then(asset=>{
    if(dead)return;const avatar=clone(asset);const bounds=new T.Box3().setFromObject(avatar),size=bounds.getSize(new T.Vector3());avatar.scale.setScalar(2.05/size.y);const b=new T.Box3().setFromObject(avatar),center=b.getCenter(new T.Vector3());avatar.position.set(-center.x,-b.min.y,-center.z);avatar.traverse(o=>{if(o.isMesh){o.material=o.material.clone();avatarMaterials.push(o.material);}});player.add(avatar);onReady?.();
  }).catch(()=>{if(!dead){ball('#fff6e6',0,.72,0,.4,player);ball('#8e9b66',0,.23,0,.2,player);onReady?.();}});
  function plotAt(event){const rect=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new T.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);for(const hit of ray.intersectObjects(plants.map(p=>p.group),true)){for(let o=hit.object;o;o=o.parent)if(o.userData.plotId)return o.userData.plotId;}return null;}
  const click=event=>{const id=plotAt(event);if(id)onPlot?.(id);},hover=event=>{renderer.domElement.style.cursor=plotAt(event)?'pointer':'default';};renderer.domElement.addEventListener('click',click);renderer.domElement.addEventListener('pointermove',hover);
  function render(){if(dead)return;frame=requestAnimationFrame(render);const plots=getPlots(),time=performance.now()/1000;
    for(const p of plants){const plot=plots.find(plot=>plot.id===p.id),growth=cropGrowth(plot||{},Date.now());
      if(p.cropId!==plot?.cropId){if(p.model)p.group.remove(p.model.root);p.model=plot?.cropId?cropModel(plot.cropId):null;if(p.model)p.group.add(p.model.root);p.cropId=plot?.cropId;}
      if(p.model){p.model.root.scale.setScalar([.38,.38,.68,1][growth.stage]);p.model.root.rotation.z=Math.sin(time*1.4+p.index)*.012;p.model.fruit.visible=growth.stage===3;p.model.fruit.traverse(o=>{if(o.userData.fruit)o.material=mat(growth.state==='Ready'?(plot.cropId==='APPLE'?'#dd897b':plot.cropId==='STRAWBERRY'?'#e17b83':plot.cropId==='FLOWER'?'#f5dba0':'#e7a15f'):plot.cropId==='TOMATO'?'#dfb46f':plot.cropId==='STRAWBERRY'?'#dfb68b':'#a4b779');});}
    }
    onProject(Object.fromEntries(plants.map(p=>[p.id,{left:FARM_PLOTS[p.index][0]/width*100,top:FARM_PLOTS[p.index][1]/height*100}])));renderer.render(scene,camera);
  }render();
  return {capture(){renderer.render(scene,camera);return renderer.domElement;},dispose(){dead=true;cancelAnimationFrame(frame);renderer.domElement.removeEventListener('click',click);renderer.domElement.removeEventListener('pointermove',hover);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());avatarMaterials.forEach(m=>m.dispose());sun.shadow.map?.dispose();renderer.dispose();renderer.domElement.remove();}};
}
