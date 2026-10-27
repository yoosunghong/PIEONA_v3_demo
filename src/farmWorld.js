import * as T from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {GARDEN_BEDS,cropGrowth} from '../shared/garden.mjs';
import {loadAsset} from './avatar';

export function createFarmWorld(host,{getPlots,appearance={},onProject,onPlot}){
  const scene=new T.Scene();scene.background=new T.Color('#d7e7dc');
  const renderer=new T.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','울타리와 과일나무로 둘러싸인 아홉 개의 3D 농장 텃밭');
  const camera=new T.OrthographicCamera(-8,8,6,-6,.1,80);camera.position.set(8,11,13);camera.lookAt(0,0,0);
  scene.add(new T.HemisphereLight('#fff8e5','#8ba79a',2.2));
  const sun=new T.DirectionalLight('#fff4dc',3);sun.position.set(-7,14,4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-9,right:9,top:9,bottom:-9});sun.shadow.normalBias=.035;sun.shadow.bias=-.0003;scene.add(sun);
  const geometries=[],materials=[],plants=[],cache=new Map();
  function mat(color){if(!cache.has(color)){const m=new T.MeshStandardMaterial({color,roughness:.88});cache.set(color,m);materials.push(m);}return cache.get(color);}
  function mesh(g,color,x,y,z,parent=scene){geometries.push(g);const o=new T.Mesh(g,mat(color));o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  const box=(c,x,y,z,w,h,d,p)=>mesh(new T.BoxGeometry(w,h,d),c,x,y,z,p);
  const ball=(c,x,y,z,r,p)=>mesh(new T.IcosahedronGeometry(r,2),c,x,y,z,p);
  const cyl=(c,x,y,z,r,h,p)=>mesh(new T.CylinderGeometry(r,r*1.07,h,12),c,x,y,z,p);
  const land=cyl('#b9ce91',0,-.3,0,6.7,.65);land.scale.z=.91;
  const edge=cyl('#e7d8ae',0,-.67,0,6.75,.25);edge.scale.z=.91;
  const sea=cyl('#a4d8db',0,-1.15,0,24,.5);sea.receiveShadow=false;
  box('#ecdfbc',0,.07,0,6.7,.15,6.3);
  for(let i=0;i<8;i++){box('#eee4c6',-.18+Math.sin(i)*.13,.13,3.1+i*.38,.56,.14,.27);}
  for(const side of [-1,1])for(let i=0;i<8;i++){
    const x=side*3.5,z=-3.4+i*.94;box('#c6a77c',x,.57,z,.14,1,.14);box('#e6c99b',x,.5,z+.4,.1,.15,.9);box('#e6c99b',x,.88,z+.4,.1,.13,.9);
  }
  for(let i=0;i<8;i++){const x=-3.5+i;box('#c6a77c',x,.57,-3.4,.14,1,.14);box('#e6c99b',x+.45,.5,-3.4,1,.15,.1);box('#e6c99b',x+.45,.88,-3.4,1,.13,.1);}
  let seed=826;const rand=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};
  for(const [x,z,pink] of [[-4.7,-2,1],[-3.5,-4.5,0],[.1,-4.9,1],[4.8,-2.8,0],[-4.9,1.8,0],[4.8,2.8,1],[-2.5,4.6,0]]){
    cyl('#b8946a',x,.75,z,.16,1.7);const canopy=ball(pink?'#efc1cc':'#91b281',x,2.05,z,1.1);canopy.scale.set(1,1.05,.9);ball(pink?'#f4d4d7':'#b5cc9c',x-.35,2.4,z+.1,.7);
    for(let i=0;i<6;i++)ball('#fff3d8',x+(rand()-.5)*1.35,2.1+rand()*.8,z+.65,.06);
  }
  for(let i=0;i<55;i++){const a=rand()*Math.PI*2,r=4.2+rand()*1.65,x=Math.cos(a)*r,z=Math.sin(a)*r;if(z>4&&Math.abs(x)<1)continue;const bush=ball(i%3?'#a5bd85':'#c1d39b',x,.25,z,.22+rand()*.22);bush.scale.y=.7;if(i%3===0)ball('#fff0d5',x,.48,z,.06);}
  // A little potting stand behind the field.
  box('#d7bc94',2.9,.67,-3.6,1.65,.12,.75);for(const x of [2.25,3.55])box('#b79b77',x,.34,-3.6,.13,.7,.55);
  for(let i=0;i<3;i++){cyl('#bd9171',2.4+i*.5,.88,-3.6,.17,.27);ball('#8cab70',2.4+i*.5,1.1,-3.6,.2);}
  for(const bed of GARDEN_BEDS){
    const g=new T.Group();g.position.set(bed.x,0,bed.z);g.userData.plotId=bed.id;scene.add(g);
    box('#b88a61',0,.16,0,1.42,.2,1.36,g);box('#806147',0,.28,0,1.26,.07,1.2,g);
    for(const z of [-.35,0,.35])box('#957153',0,.32,z,1.14,.025,.035,g);
    const plant=new T.Group(),fruit=new T.Group();g.add(plant);plant.add(fruit);
    for(const x of [-.32,.32])for(const z of [-.3,.3]){
      cyl('#779557',x,.62,z,.035,.57,plant);
      for(const side of [-1,1]){const leaf=ball('#8eb365',x+side*.13,.66,z,.2,plant);leaf.scale.set(1,.35,.65);leaf.rotation.z=side*.4;}
      ball('#dc7864',x,.89,z,.15,fruit);
    }
    plants.push({id:bed.id,plant,fruit});
    box('#dbc499',.54,.45,.54,.08,.5,.07,g);
  }
  const player=new T.Group();player.position.set(.3,.15,3.1);player.rotation.y=-.4;scene.add(player);
  let dead=false,frame,avatarMaterials=[];
  loadAsset(appearance.character||'pio').then(asset=>{
    if(dead)return;const avatar=clone(asset);const bounds=new T.Box3().setFromObject(avatar),size=bounds.getSize(new T.Vector3());avatar.scale.setScalar(1.35/size.y);const b=new T.Box3().setFromObject(avatar),center=b.getCenter(new T.Vector3());avatar.position.set(-center.x,-b.min.y,-center.z);avatar.traverse(o=>{if(o.isMesh){o.material=o.material.clone();avatarMaterials.push(o.material);}});player.add(avatar);
  }).catch(()=>{if(!dead){ball('#fff3d6',0,.6,0,.45,player);ball('#6e825a',0,.17,0,.2,player);}});
  const raycaster=new T.Raycaster();
  function plotAt(event){const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new T.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);for(const hit of raycaster.intersectObjects(scene.children,true)){for(let o=hit.object;o;o=o.parent)if(o.userData.plotId)return o.userData.plotId;}return null;}
  const click=event=>{const id=plotAt(event);if(id)onPlot?.(id);},hover=event=>{renderer.domElement.style.cursor=plotAt(event)?'pointer':'default';};
  renderer.domElement.addEventListener('click',click);renderer.domElement.addEventListener('pointermove',hover);
  function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);const aspect=w/h,mobile=w<=650,half=mobile?4/aspect:Math.max(5.8,6.6/aspect);camera.position.set(mobile?0:8,mobile?15:11,mobile?10:13);camera.lookAt(0,0,0);camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  function render(){if(dead)return;frame=requestAnimationFrame(render);
    const plots=getPlots();
    for(const {id,plant,fruit} of plants){const plot=plots.find(p=>p.id===id),growth=cropGrowth(plot||{},Date.now());plant.visible=!!plot?.cropId;if(!plot?.cropId)continue;plant.scale.setScalar([.45,.45,.72,1][growth.stage]);fruit.visible=growth.stage===3;for(const f of fruit.children)f.material=mat(growth.state!=='Ready'?'#a6b872':plot.cropId==='APPLE'?'#df8775':plot.cropId==='STRAWBERRY'?'#e1717d':plot.cropId==='TOMATO'?'#e69561':plot.cropId==='FLOWER'?'#edd69b':'#8baa68');}
    camera.updateMatrixWorld();const points={};for(const bed of GARDEN_BEDS){const p=new T.Vector3(bed.x,1.15,bed.z).project(camera);points[bed.id]={left:(p.x+1)*50,top:(1-p.y)*50};}onProject(points);renderer.render(scene,camera);
  }render();
  return {dispose(){dead=true;cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener('click',click);renderer.domElement.removeEventListener('pointermove',hover);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());avatarMaterials.forEach(m=>m.dispose());sun.shadow.map?.dispose();renderer.dispose();renderer.domElement.remove();}};
}
