import {FOREST_TRAILS} from '../shared/forestLayout.mjs';
import * as T from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {OutlinePass} from 'three/addons/postprocessing/OutlinePass.js';
import {loadAsset} from './avatar';
import {createRunMotion} from './avatarMotion.mjs';
import {dressAvatar,createDecoration} from './worldAssets';
import {canTraverse,walkable,WALK_SPEED,distance,FOREST_BOUNDS,companionPath} from '../shared/exploration.mjs';
import {reconcileExplorationPosition,withinExplorationPrediction} from './explorationMovement.mjs';

// A live 3D field with reference-matched tree cutouts. Gatherable objects, water,
// foliage and companions animate and remain independently selectable.
export function createExplorationWorld(host,{getState,onMove,onTarget,onFriend,onFriendDismiss,onInteract,onProject,onReady,onError,getBlocked,appearance={}}){
 let dead=false,frame,last=performance.now(),clock=0,moveSent=0,selected='tree-1',goal=null,zoom=1;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const scene=new T.Scene();scene.background=new T.Color('#a8c991');scene.fog=new T.Fog('#bdd7a2',55,100);
 const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;host.appendChild(renderer.domElement);
 renderer.domElement.setAttribute('aria-label','분홍 나무와 물길이 있는 초록 숲 3D 탐험');
 const camera=new T.OrthographicCamera(-12,12,6.75,-6.75,.1,100);camera.position.set(0,25,20);camera.lookAt(0,.3,-1);
 const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));const ao=new SSAOPass(scene,camera,640,360);ao.ssaoMaterial.defines.PERSPECTIVE_CAMERA=0;ao.depthRenderMaterial.defines.PERSPECTIVE_CAMERA=0;ao.kernelRadius=.55;ao.minDistance=.0005;ao.maxDistance=.03;composer.addPass(ao);const friendOutline=new OutlinePass(new T.Vector2(1,1),scene,camera);friendOutline.visibleEdgeColor.set('#ffffff');friendOutline.hiddenEdgeColor.set('#ffffff');friendOutline.edgeStrength=5;friendOutline.edgeThickness=2;friendOutline.edgeGlow=0;friendOutline.enabled=false;composer.addPass(friendOutline);composer.addPass(new OutputPass());
 scene.add(new T.HemisphereLight('#fff4e4','#758e82',1.55));
 const sun=new T.DirectionalLight('#fff1db',2.6);sun.position.set(-16,34,-12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-36,right:36,top:36,bottom:-36,near:1,far:85});sun.shadow.bias=-.00035;sun.shadow.normalBias=.035;sun.shadow.radius=4;sun.shadow.intensity=.45;scene.add(sun);
 const fill=new T.DirectionalLight('#d5eafb',.9);fill.position.set(6,9,9);scene.add(fill);
 const geometries=[],materials=[],textures=[],roots=new Map(),canopies=[],waters=[],petals=[],effects=[],treeViews=[];
 const mat=(color,extra={})=>{const m=new T.MeshStandardMaterial({color,roughness:.9,...extra});materials.push(m);return m;};
 const mats={grass:mat('#a3c96c'),bark:mat('#a58a66'),wood:mat('#b69878'),cut:mat('#e4c39a'),pink:mat('#ecc0d2'),pink2:mat('#e0aec6'),cream:mat('#fff9e5'),stone:mat('#8d969e',{flatShading:true}),rockLight:mat('#b0b5b5',{flatShading:true}),leaf:mat('#508b69'),darkLeaf:mat('#34715a'),flower:mat('#eee8d3'),purple:mat('#c4aad6'),mushroom:mat('#e98f9f'),dark:mat('#3d3e4a'),blush:mat('#eda5b5'),slime:mat('#f1d8d7'),gold:mat('#efd085',{metalness:.2,roughness:.4})};
 const sphere=new T.SphereGeometry(1,20,14),rockGeo=new T.IcosahedronGeometry(1,1),cylinder=new T.CylinderGeometry(1,1,1,12);geometries.push(sphere,rockGeo,cylinder);
 function mesh(geo,m,parent=scene,x=0,y=0,z=0,sx=1,sy=sx,sz=sx){const o=new T.Mesh(geo,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
 function ball(m,p,x,y,z,sx,sy=sx,sz=sx){return mesh(sphere,m,p,x,y,z,sx,sy,sz);}
 function box(m,p,x,y,z,w,h,d){const g=new T.BoxGeometry(w,h,d);geometries.push(g);return mesh(g,m,p,x,y,z);}
 function cyl(m,p,x,y,z,r,h,r2=r){const g=new T.CylinderGeometry(r,r2,h,14);geometries.push(g);return mesh(g,m,p,x,y,z);}
 function group(x=0,z=0){const g=new T.Group();g.position.set(x,0,z);scene.add(g);return g;}
 let seed=731;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
 const trailRoutes=FOREST_TRAILS;
 function groundTexture(){const c=document.createElement('canvas');c.width=c.height=2048;const ctx=c.getContext('2d');ctx.fillStyle='#99bd72';ctx.fillRect(0,0,2048,2048);
  for(let i=0;i<20000;i++){ctx.fillStyle=['#91b58130','#c4d79f45','#6e9c7640','#c5d6a225'][i%4];ctx.beginPath();ctx.ellipse(rand()*2048,rand()*2048,4+rand()*28,3+rand()*18,0,0,7);ctx.fill();}
  const point=(x,z)=>[(x+32)/64*2048,(z+32)/64*2048];
  function path(points,width){ctx.beginPath();points.forEach(([x,z],i)=>{const [a,b]=point(x,z);if(i===0)ctx.moveTo(a,b);else ctx.lineTo(a,b);});ctx.lineJoin=ctx.lineCap='round';ctx.strokeStyle='#c4c197';ctx.lineWidth=width+18;ctx.stroke();ctx.strokeStyle='#e4d1ac';ctx.lineWidth=width;ctx.stroke();}
  trailRoutes.forEach(route=>path(route.points,route.width*32));
  for(let i=0;i<50000;i++){ctx.fillStyle=i%2?'#fff8df14':'#48593e09';ctx.fillRect(rand()*2048,rand()*2048,1+rand()*4,1+rand()*4);}
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;textures.push(texture);return texture;}
 const groundMat=mat('#e3edcf',{map:groundTexture()});
 function groundPiece(x,z,w,d){const geo=new T.PlaneGeometry(w,d);const uv=geo.attributes.uv;for(let i=0;i<uv.count;i++){const px=geo.attributes.position.getX(i)+x,pz=-geo.attributes.position.getY(i)+z;uv.setXY(i,(px+32)/64,1-(pz+32)/64);}geometries.push(geo);const o=mesh(geo,groundMat,scene,x,0,z);o.rotation.x=-Math.PI/2;o.castShadow=false;return o;}
 groundPiece(-13.1,-3,37.8,58);groundPiece(21.1,-3,21.8,58);groundPiece(8,11.65,4.4,28.7);
 const pathMat=mat('#e9ce96');
 function trail(points,width){const curve=new T.CatmullRomCurve3(points.map(([x,z])=>new T.Vector3(x,.008,z))),samples=curve.getPoints(180),vertices=[],uvs=[],indices=[];for(let i=0;i<samples.length;i++){const tangent=curve.getTangent(i/(samples.length-1)),side=new T.Vector3(-tangent.z,0,tangent.x).normalize().multiplyScalar(width*.5);for(const sign of [-1,1]){const p=samples[i].clone().addScaledVector(side,sign);vertices.push(p.x,p.y,p.z);uvs.push(sign===-1?0:1,i/18);}if(i<samples.length-1){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();geometries.push(geo);const road=mesh(geo,pathMat);road.castShadow=false;}
 trailRoutes.forEach(route=>trail(route.points,route.width));
 // Broken stone riverbanks give the clearing a tangible miniature-diorama depth.
 const cliffMat=mat('#98a3ae',{flatShading:true});for(let i=0;i<46;i++){const z=-31+i*.62;const x=5.72+rand()*.25;const o=mesh(rockGeo,cliffMat,scene,x,-1.3,z,.72,1.5,.55);o.rotation.y=rand();ball(mats.grass,scene,x-.05,.02,z,.65,.13,.6);}
 for(let i=0;i<42;i++){const z=-31+i*.7;mesh(rockGeo,cliffMat,scene,10.1,-1.3,z,.7,1.5,.65);ball(mats.grass,scene,10.25,.03,z,.65,.13,.6);}
 const waterMat=mat('#8ecfdf',{metalness:.12,roughness:.24,transparent:true,opacity:.9});const water=box(waterMat,scene,8,-1.0,-17,4.4,.08,28.6);waters.push(water);
 const foam=mat('#e2f7ed',{transparent:true,opacity:.65});for(let i=0;i<75;i++){const x=6.2+rand()*3.6,z=-30+rand()*27;const o=ball(foam,scene,x,-.94,z,.05+rand()*.12,.008,.02+rand()*.07);waters.push(o);if(i%4===0)ball(mats.leaf,scene,x,-.9,z,.16,.02,.12);}
 // A spring spills from the upper terrace into the stream beyond the bridge.
 for(const x of [6.1,6.8,9.2,9.9]){mesh(rockGeo,cliffMat,scene,x,.25,-12.4,.65,1.65,1.1);ball(mats.grass,scene,x,1.55,-12.5,.75,.2,1);}
 box(waterMat,scene,8,.4,-12,1.9,3.05,.12);for(let i=0;i<9;i++){const strip=box(foam,scene,7.2+i*.2,.45+(i%3)*.05,-11.92,.035+(i%2)*.02,2.85,.025);waters.push(strip);}for(let i=0;i<12;i++)ball(foam,scene,7.2+rand()*1.6,-.9,-11.7+rand()*.4,.15,.05,.12);
 const bridge=group(8,-5.5);for(const z of [-1.05,1.05])for(const y of [.55,.9])box(mats.wood,bridge,0,y,z,5.25,.12,.12);for(let i=0;i<13;i++)box(i%2?mats.wood:mats.bark,bridge,-2.4+i*.4,.14,0,.39,.19,2.05);for(const x of [-2.5,-1.3,1.3,2.5])for(const z of [-1.12,1.12])box(mats.bark,bridge,x,-.05,z,.21,1.1,.21);
 function tree(x,z,size=1,id){const g=group(x,z);if(id){g.userData.nodeId=id;roots.set(id,g);}g.scale.setScalar(size);
  const trunk=cyl(mats.bark,g,0,1.32,0,.27,2.64,.48);trunk.rotation.z=.06;
  for(const [bx,bz,r]of [[-.4,.2,.16],[.37,.25,.15],[-.1,-.35,.13]]){const root=cyl(mats.bark,g,bx,.22,bz,r,.7,.26);root.rotation.z=-bx;}
  for(const [x,y,z,r]of [[-.62,2.9,.18,.92],[.48,3.1,.28,1.02],[-.15,3.7,-.2,1.1],[.92,3.58,-.1,.86],[-.84,3.55,-.3,.78],[.1,3.28,.7,.94]]){
   const b=ball(rand()>.5?mats.pink:mats.pink2,g,x,y,z,r*1.12,r*.99,r*.99);canopies.push({object:b,phase:rand()*7,base:b.position.clone()});
   const outline=new T.Mesh(sphere,new T.MeshBasicMaterial({color:'#fff5cd',side:T.BackSide,transparent:true,opacity:.7}));materials.push(outline.material);outline.scale.setScalar(1.025);outline.visible=id===selected;b.add(outline);outline.userData.outline=true;
   for(let j=0;j<7;j++){const a=rand()*6.28,bx=x+Math.cos(a)*r*.7,bz=z+Math.sin(a)*r*.65;ball(mats.cream,g,bx,y+r*.65+rand()*.12,bz,.04+rand()*.02,.055,.045);}
  }
  for(const sign of [-1,1]){const branch=cyl(mats.bark,g,sign*.35,2.1,0,.12,1.6,.2);branch.rotation.z=-sign*.48;}
  treeViews.push(g);return g;
 }
 const state=getState();state.nodes.filter(n=>n.type==='wood').forEach(n=>tree(n.x,n.z,n.id==='tree-1'?1.08:1,n.id));
 [[-9,6,1.2],[-13,-11,1.4],[2,-14,1.35],[12,-10,1.3],[11,4,1.15],[-7,-14,1.25]].forEach(p=>tree(...p));
 function pine(x,z,size=1){const g=group(x,z);g.scale.setScalar(size*1.3);cyl(mats.bark,g,0,.5,0,.1,1);for(let i=0;i<4;i++){const geo=new T.ConeGeometry(.68-i*.1,.92,8);geometries.push(geo);mesh(geo,i%2?mats.darkLeaf:mats.leaf,g,0,.7+i*.38,0);}return g;}
 [[-8,-2,.85],[-9.7,2.4,.65],[5,4.5,1],[4,-8,1],[2,-10,1.1],[-7,-6,.65],[9,0,.9],[-12,-7,1.6],[-11,8,1.3],[12,-6,1.5]].forEach(p=>pine(...p));
 // Mixed evergreen and blossom groves frame every route in the larger forest.
 for(let i=0;i<145;i++){const x=-30+rand()*60,z=-29+rand()*52;if(x>5.2&&x<10.8&&z<-2.2)continue;if(pathDistance(x,z)<2.3||state.nodes.some(n=>Math.hypot(n.x-x,n.z-z)<2.8))continue;if(i%4===0)tree(x,z,.72+rand()*.32);else pine(x,z,.85+rand()*.9);}
 // Two sheltered camps and warm lanterns create landmarks along the outer loop.
 for(const [x,z] of [[-22,9],[19,-19],[-13,-16]]){const g=group(x,z);for(let i=0;i<7;i++)box(mats.wood,g,0,.08,i*.32,3.1,.15,.3);for(const side of [-1,1]){box(mats.bark,g,side*1.3,.8,0,.12,1.6,.12);}const roof=box(mat('#d68580'),g,0,1.7,0,3.7,.15,2.7);roof.rotation.z=.06;}
 for(const [x,z] of [[-3,-6],[-20,7],[17,-17],[11,-5.5]]){const g=group(x,z);cyl(mats.bark,g,0,1,0,.065,2);box(mats.gold,g,0,2,0,.35,.5,.35);box(mat('#fff1b0',{emissive:'#ffbf65',emissiveIntensity:.8}),g,0,2,.19,.22,.32,.025);}
 function rock(x,z,id){const g=group(x,z);g.userData.nodeId=id;roots.set(id,g);const r=mesh(rockGeo,mats.stone,g,0,.8,0,1.13,1.55,.9);r.rotation.set(.2,.4,.2);for(let i=0;i<5;i++){const a=i*2.4;mesh(rockGeo,i%2?mats.stone:mats.rockLight,g,Math.cos(a)*.8,.2,Math.sin(a)*.7,.4,.45,.4);}return g;}
 state.nodes.filter(n=>n.type==='stone').forEach(n=>rock(n.x,n.z,n.id));
 function mushroom(x,z,id,rare=false){const g=group(x,z);g.userData.nodeId=id;roots.set(id,g);const capMat=rare?mat('#b7d7f0',{emissive:'#7aa9d4',emissiveIntensity:.5}):mats.mushroom;
  for(let i=0;i<3;i++){const s=i? .4+i*.1:1,px=i?Math.sin(i*4)*.64:0,pz=i?Math.cos(i*4)*.6:0;
   const stem=cyl(mats.cream,g,px,.42*s,pz,.13*s,.8*s,.19*s);stem.rotation.z=-.1;
   ball(capMat,g,px,.85*s,pz,.65*s,.32*s,.58*s);ball(mats.cream,g,px,.71*s,pz,.58*s,.07*s,.53*s);
   for(let j=0;j<7;j++){const a=j*2.4;ball(mats.pink,g,px+Math.cos(a)*.4*s,(1.04-Math.abs(Math.cos(a))*.06)*s,pz+Math.sin(a)*.35*s,.1*s,.025*s,.08*s);}
  }return g;
 }
 state.nodes.filter(n=>['mushroom','rare'].includes(n.type)).forEach(n=>mushroom(n.x,n.z,n.id,n.type==='rare'));
 // Stump, split logs, signpost and fences are scene dressing, not painted scenery.
 const stump=group(6.1,2.1);cyl(mats.bark,stump,0,.35,0,.48,.7,.68);cyl(mats.cut,stump,0,.715,0,.5,.025);for(let i=0;i<3;i++){const geo=new T.TorusGeometry(.15+i*.1,.006,4,40);geometries.push(geo);const ring=mesh(geo,mats.wood,stump,0,.733,0);ring.rotation.x=-Math.PI/2;}
 for(const [x,z,angle]of [[4.4,2.1,1.3],[4.7,3.2,1.8]]){const g=group(x,z);g.rotation.y=angle;const log=cyl(mats.bark,g,0,.2,0,.22,1.05);log.rotation.z=Math.PI/2;const end=cyl(mats.cut,g,.53,.2,0,.205,.02);end.rotation.z=Math.PI/2;}
 const sign=group(-.3,-5.8);cyl(mats.wood,sign,0,.8,0,.1,1.6);const board=box(mats.cut,sign,0,1.5,0,1.2,.45,.15);board.rotation.z=.08;for(let i=0;i<2;i++){const marker=box(mats.cream,sign,-.15+i*.3,1.52,.09,.12,.16,.02);marker.rotation.z=-.5;}
 for(const [x,z]of [[7.5,-1.7],[-8.3,-9.6]]){const g=group(x,z);for(const q of [-1,1])box(mats.bark,g,q,.53,0,.18,1.1,.18);for(const y of [.35,.75])box(mats.wood,g,0,y,0,2,.15,.1);}
 // Seeded instanced meadow: thousands of blades, clover and five-petal flowers.
 const bladeGeo=new T.ConeGeometry(.045,.2,3);geometries.push(bladeGeo);const blades=new T.InstancedMesh(bladeGeo,mats.leaf,3600);const d=new T.Object3D();let count=0;
 function pathDistance(x,z){let nearest=100;for(const {points} of trailRoutes)for(let i=0;i<points.length-1;i++){const [ax,az]=points[i],[bx,bz]=points[i+1],dx=bx-ax,dz=bz-az,t=T.MathUtils.clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1);nearest=Math.min(nearest,Math.hypot(x-ax-t*dx,z-az-t*dz));}return nearest;}
 for(let i=0;i<6000&&count<3600;i++){const x=-28+rand()*56,z=-27+rand()*49;if(!walkable(x,z)||pathDistance(x,z)<1.1)continue;d.position.set(x,.12,z);d.rotation.set((rand()-.5)*.3,rand()*7,(rand()-.5)*.4);d.scale.setScalar(.5+rand());d.updateMatrix();blades.setMatrixAt(count++,d.matrix);}blades.count=count;blades.castShadow=false;blades.receiveShadow=true;scene.add(blades);
 // Layer broad-leaf clover and rounded shrubs around the pathways. Leaves are
 // instanced to keep the lush field within a small number of draw calls.
 const shrubMats=[mat('#72976d'),mat('#7fa276'),mat('#9db986'),mat('#587e69')];
 const shrubs=shrubMats.map(m=>new T.InstancedMesh(sphere,m,2600)),shrubCounts=[0,0,0,0];
 for(let i=0;i<700;i++){const cx=-28+rand()*56,cz=-27+rand()*49;if(!walkable(cx,cz)||pathDistance(cx,cz)<1.55)continue;const size=.5+rand()*.7;for(let j=0;j<11;j++){const a=rand()*6.28,r=rand()*.5*size,mi=j%4;d.position.set(cx+Math.cos(a)*r,.1+rand()*.22*size,cz+Math.sin(a)*r);d.rotation.set(0,rand()*6.28,rand()*.25);d.scale.set((.15+rand()*.13)*size,(.12+rand()*.17)*size,(.13+rand()*.12)*size);d.updateMatrix();shrubs[mi].setMatrixAt(shrubCounts[mi]++,d.matrix);}}
 shrubs.forEach((o,i)=>{o.count=shrubCounts[i];o.castShadow=true;o.receiveShadow=true;scene.add(o);});
 const flowerGeo=new T.SphereGeometry(1,6,5);geometries.push(flowerGeo);const flowerMeshes=[mats.flower,mats.pink,mats.purple].map(m=>new T.InstancedMesh(flowerGeo,m,1800));const flowerCounts=[0,0,0];const centers=new T.InstancedMesh(sphere,mats.gold,900);let fc=0;
 for(let i=0;i<1100&&fc<900;i++){const x=-28+rand()*56,z=-27+rand()*49;if(!walkable(x,z)||pathDistance(x,z)<.85)continue;const type=Math.floor(rand()*3),s=.9+rand()*.9,fy=.12+rand()*.12;
  for(let j=0;j<5;j++){const a=j*6.28/5;d.position.set(x+Math.cos(a)*.075*s,fy,z+Math.sin(a)*.075*s);d.scale.set(.065*s,.035*s,.065*s);d.rotation.set(0,a,0);d.updateMatrix();if(flowerCounts[type]<1800)flowerMeshes[type].setMatrixAt(flowerCounts[type]++,d.matrix);}
  d.position.set(x,fy+.025,z);d.scale.setScalar(.038*s);d.updateMatrix();centers.setMatrixAt(fc++,d.matrix);
 }for(let i=0;i<3;i++){flowerMeshes[i].count=flowerCounts[i];scene.add(flowerMeshes[i]);}centers.count=fc;scene.add(centers);
 for(const node of state.nodes.filter(n=>n.type==='leaf')){const flowers=group(node.x,node.z);flowers.userData.nodeId=node.id;roots.set(node.id,flowers);for(let i=0;i<7;i++){const x=Math.sin(i*3)*.4,z=Math.cos(i*2)*.4;cyl(mats.leaf,flowers,x,.2,z,.018,.4);for(let j=0;j<5;j++)ball(mats.cream,flowers,x+Math.cos(j*1.256)*.1,.4,z+Math.sin(j*1.256)*.1,.07,.03,.07);ball(mats.gold,flowers,x,.43,z,.045);}}
 for(let i=0;i<90;i++){const p=ball(mats.pink,scene,(rand()-.5)*28,rand()*6,(rand()-.5)*25,.025,.012,.045);p.castShadow=false;petals.push({object:p,speed:.12+rand()*.2,phase:rand()*7});}
 const contactCanvas=document.createElement('canvas');contactCanvas.width=contactCanvas.height=64;const ctx=contactCanvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'rgba(43,70,53,.32)');gradient.addColorStop(1,'rgba(43,70,53,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);const shadowTexture=new T.CanvasTexture(contactCanvas);textures.push(shadowTexture);const shadowMat=new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false});materials.push(shadowMat);const shadowGeo=new T.PlaneGeometry(2,2);geometries.push(shadowGeo);
 function contact(g,size){const o=mesh(shadowGeo,shadowMat,g,0,.015,0,size, size,1);o.rotation.x=-Math.PI/2;o.castShadow=false;o.userData.contact=true;return o;}
 for(const [id,g]of roots)contact(g,id.startsWith('tree')?1.9:1);
 // Reference-matched textured tree cutouts are layered into the 3D scene. The
 // world, collisions, water, characters and resource state remain fully live.
 new T.TextureLoader().load('/images/exploration/cherry-tree-v2.png',texture=>{if(dead){texture.dispose();return;}texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;textures.push(texture);const aspect=texture.image.width/texture.image.height;
  const material=new T.SpriteMaterial({map:texture,transparent:true,alphaTest:.08,depthWrite:true});materials.push(material);
  const outlineMat=new T.SpriteMaterial({map:texture,transparent:true,alphaTest:.08,depthWrite:true});outlineMat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n diffuseColor.rgb=vec3(1.0,0.96,0.78);');};materials.push(outlineMat);
  for(const g of treeViews){g.traverse(o=>{if(o.isMesh&&!o.userData.contact)o.visible=false;});const sprite=new T.Sprite(material);sprite.center.set(.5,0);sprite.position.y=.04;sprite.scale.set(4.6*aspect,4.6,1);g.add(sprite);const outline=new T.Sprite(outlineMat);outline.center.set(.5,0);outline.position.set(0,.015,-.025);outline.scale.set(4.6*aspect*1.025,4.6*1.025,1);outline.visible=g.userData.nodeId===selected;g.add(outline);g.userData.treeSprite=sprite;g.userData.spriteOutline=outline;}
 });
 function sprout(color,slime=false){const g=new T.Group();const body=new T.Group();g.add(body);const coat=slime?mats.slime:mat(color);ball(coat,body,0,.48,0,.52,.5,.43);ball(coat,body,0,.25,.07,.55,.25,.43);
  for(const s of [-1,1]){ball(mats.dark,body,s*.17,.54,.39,.045,.065,.024);ball(mats.cream,body,s*.17-.012,.56,.414,.013,.018,.008);ball(mats.blush,body,s*.3,.4,.37,.065,.035,.018);if(!slime)ball(coat,body,s*.24,.1,.1,.13,.12,.16);const leaf=ball(mats.leaf,body,s*.17,1.02,0,.22,.07,.11);leaf.rotation.z=s*.4;}
  const mouth=new T.QuadraticBezierCurve3(new T.Vector3(-.055,.43,.425),new T.Vector3(0,.38,.44),new T.Vector3(.055,.43,.425));const geo=new T.TubeGeometry(mouth,10,.009,5,false);geometries.push(geo);mesh(geo,mats.dark,body);contact(g,.65);g.userData.body=body;return g;}
 const friend=new T.Group();scene.add(friend);friend.position.set(state.companion.x,0,state.companion.z);
 let friendAvatar=null,friendMotion=null,friendKey='';
 function syncFriend(s){const look=s.companion.profile?.appearance;if(!look)return;const key=JSON.stringify(look);if(key===friendKey)return;friendKey=key;
  loadAsset(look.character||'pio').then(asset=>{if(dead||friendKey!==key)return;if(friendAvatar)friend.remove(friendAvatar);friendAvatar=clone(asset);const size=new T.Box3().setFromObject(friendAvatar).getSize(new T.Vector3());friendAvatar.scale.multiplyScalar(2.15/size.y);const bounds=new T.Box3().setFromObject(friendAvatar),center=bounds.getCenter(new T.Vector3());friendAvatar.position.set(-center.x,-bounds.min.y,-center.z);friend.add(friendAvatar);dressAvatar(friendAvatar,look);friendMotion=createRunMotion(friendAvatar);}).catch(()=>{friendKey='';});
 }
 const friendRingGeo=new T.TorusGeometry(1.05,.035,8,80);geometries.push(friendRingGeo);const friendRing=mesh(friendRingGeo,new T.MeshBasicMaterial({color:'#eaf7ff'}),scene);materials.push(friendRing.material);friendRing.rotation.x=-Math.PI/2;friendRing.visible=false;
 const friendTool=new T.Group();friendTool.position.set(.6,1.25,.5);friend.add(friendTool);cyl(mats.bark,friendTool,0,.1,0,.045,.8);box(mats.stone,friendTool,.13,.5,0,.4,.28,.11);friendTool.visible=false;let friendSwingAt=-10;
 syncFriend(state);
 const slime=sprout('#f1d8d7',true);slime.userData.nodeId='slime-1';scene.add(slime);roots.set('slime-1',slime);
 const player=group(state.position.x,state.position.z);contact(player,.8);let motion=null,avatar=null,lastArea=state.area;
 const tool=new T.Group();tool.position.set(.6,1.25,.5);player.add(tool);tool.visible=false;const handle=cyl(mats.bark,tool,0,.1,0,.045,.8);handle.rotation.z=-.2;const blade=box(mats.stone,tool,.13,.5,0,.4,.28,.11);blade.rotation.z=-.15;
 const chips=Array.from({length:12},()=>{const o=mesh(rockGeo,mats.cut,scene);o.visible=false;o.castShadow=false;return o;});let swingAt=-10;
 // Loading the project's existing rig preserves the player's actual character.
 loadAsset(appearance.character||'pio').then(asset=>{if(dead)return;avatar=clone(asset);const bounds=new T.Box3().setFromObject(avatar),size=bounds.getSize(new T.Vector3());avatar.scale.multiplyScalar(2.15/size.y);const b=new T.Box3().setFromObject(avatar),center=b.getCenter(new T.Vector3());avatar.position.set(-center.x,-b.min.y,-center.z);player.add(avatar);dressAvatar(avatar,appearance);motion=createRunMotion(avatar);onReady?.();}).catch(()=>{if(dead)return;avatar=sprout('#fff8eb');avatar.scale.setScalar(1.6);player.add(avatar);onReady?.();});
 const ringGeo=new T.TorusGeometry(.7,.022,6,64);geometries.push(ringGeo);const ring=mesh(ringGeo,mat('#ffefb9',{emissive:'#f6d98a',emissiveIntensity:.6}),scene);ring.rotation.x=-Math.PI/2;
 const keys=new Set(),raycaster=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0),0),pointer=new T.Vector2();let joystick={x:0,z:0};const canWalk=(x,z)=>canTraverse(getState(),x,z)&&withinExplorationPrediction({x,z},getState().position);
 function isTyping(e){return /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)||e.target?.isContentEditable;}
 function keyDown(e){if(isTyping(e)||getBlocked())return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(e.code)){e.preventDefault();keys.add(e.code);goal=null;}}
 function keyUp(e){keys.delete(e.code);}const blur=()=>{keys.clear();joystick={x:0,z:0};};
 function pointerDown(e){if(getBlocked())return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);
  if(getState().companion.enabled&&raycaster.intersectObject(friend,true).length){goal=null;onFriend?.();return;}
  onFriendDismiss?.();
  const hit=raycaster.intersectObjects([...roots.values()],true).find(h=>{let o=h.object;while(o&&!o.userData.nodeId)o=o.parent;return o&&getState().nodes.find(n=>n.id===o.userData.nodeId&&n.hp>0);});
  if(hit){let o=hit.object;while(o&&!o.userData.nodeId)o=o.parent;selected=o.userData.nodeId;onTarget(selected);const n=getState().nodes.find(n=>n.id===selected);if(distance(player.position,n)<2.05)onInteract(selected);else goal={x:n.x,z:n.z,nodeId:n.id};}
  else{const p=new T.Vector3();if(raycaster.ray.intersectPlane(plane,p)&&walkable(p.x,p.z))goal={x:p.x,z:p.z};}
 }
 window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);window.addEventListener('blur',blur);renderer.domElement.addEventListener('pointerdown',pointerDown);
 function resize(){const {width,height}=host.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height);const half=10.5/zoom;camera.left=-half*width/height;camera.right=half*width/height;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();composer.setSize(width,height);ao.setSize(Math.ceil(width*.65),Math.ceil(height*.65));}const observer=new ResizeObserver(resize);observer.observe(host);resize();
 const project=(x,y,z)=>{const p=new T.Vector3(x,y,z).project(camera);return {x:(p.x*.5+.5)*100,y:(-p.y*.5+.5)*100};};
 let lastHit='',predictedFriend=null,friendSnapshot='';
 const peers=new Map();
 function syncPeers(s,dt){const live=s.party?.peers||[];for(const [id,p]of peers)if(!live.some(v=>v.id===id)){scene.remove(p.root);peers.delete(id);}for(const peer of live){let p=peers.get(peer.id);const look=JSON.stringify(peer.appearance);if(!p||p.look!==look){if(p)scene.remove(p.root);const root=group(peer.position.x,peer.position.z);p={root,look,key:look};peers.set(peer.id,p);loadAsset(peer.appearance.character||'pio').then(asset=>{if(dead||peers.get(peer.id)!==p)return;const model=clone(asset),size=new T.Box3().setFromObject(model).getSize(new T.Vector3());model.scale.multiplyScalar(2.15/size.y);const bounds=new T.Box3().setFromObject(model);model.position.y=-bounds.min.y;dressAvatar(model,peer.appearance);root.add(model);p.model=model;p.motion=createRunMotion(model);}).catch(()=>onError?.('친구 캐릭터를 불러오지 못했어요.'));const c=document.createElement('canvas');c.width=384;c.height=72;const ctx=c.getContext('2d');ctx.fillStyle='#fcfff5e8';ctx.beginPath();ctx.roundRect(0,0,384,72,32);ctx.fill();ctx.fillStyle='#3d6551';ctx.textAlign='center';ctx.font='bold 28px sans-serif';ctx.fillText(peer.nickname+' · 함께 탐험 중',192,47);const tex=new T.CanvasTexture(c);textures.push(tex);const material=new T.SpriteMaterial({map:tex,depthTest:false});materials.push(material);const label=new T.Sprite(material);label.position.y=2.6;label.scale.set(3,.56,1);root.add(label);}const dx=peer.position.x-p.root.position.x,dz=peer.position.z-p.root.position.z,moving=Math.hypot(dx,dz)>.03;p.root.position.x=T.MathUtils.damp(p.root.position.x,peer.position.x,12,dt);p.root.position.z=T.MathUtils.damp(p.root.position.z,peer.position.z,12,dt);if(moving)p.root.rotation.y=Math.atan2(dx,dz);if(p.motion)p.model.position.y=p.motion.update(clock,moving);}}
 function animate(now){if(dead)return;frame=requestAnimationFrame(animate);const dt=Math.min(.05,(now-last)/1000);last=now;clock+=dt;const s=getState(),active=s.area==='forest';
  if(s.area!==lastArea){lastArea=s.area;goal=null;keys.clear();if(active){player.position.set(s.position.x,0,s.position.z);player.rotation.y=0;friend.position.set(s.companion.x,0,s.companion.z);}}
  if(!active)return;
  let dx=joystick.x,dz=joystick.z;const blocked=getBlocked()||!active;
  if(!blocked){dx+=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);dz+=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0);
   if(goal){const dist=distance(player.position,goal);if(dist<(goal.nodeId?1.65:.1)){const n=goal.nodeId;goal=null;if(n)onInteract(n);}else{dx=goal.x-player.position.x;dz=goal.z-player.position.z;}}
  }else{dx=dz=0;keys.clear();}
  const len=Math.hypot(dx,dz),moving=len>.01;if(moving){dx/=len;dz/=len;const nx=player.position.x+dx*WALK_SPEED*dt,nz=player.position.z+dz*WALK_SPEED*dt;if(canWalk(nx,nz)){player.position.x=nx;player.position.z=nz;}else{if(canWalk(nx,player.position.z))player.position.x=nx;if(canWalk(player.position.x,nz))player.position.z=nz;}const facing=Math.atan2(dx,dz);player.rotation.y+=Math.atan2(Math.sin(facing-player.rotation.y),Math.cos(facing-player.rotation.y))*.2;if(now-moveSent>460){onMove({x:player.position.x,z:player.position.z});moveSent=now;}}
  // The final resting position is also synchronized, not just movement frames.
  if(!moving&&now-moveSent>320&&distance(player.position,s.position)>.035){onMove({x:player.position.x,z:player.position.z});moveSent=now;}
  if(motion&&avatar)avatar.position.y=motion.update(clock,moving);else if(avatar&&!reduced)avatar.position.y=Math.sin(clock*2)*.025;
  syncPeers(s,dt);friend.visible=s.companion.enabled&&active;friendRing.visible=friendOutline.enabled&&friend.visible;const snapshot=JSON.stringify([s.companion.x,s.companion.z,s.companion.mode,s.companion.targetId]);if(snapshot!==friendSnapshot){friendSnapshot=snapshot;predictedFriend=structuredClone(s);}if(predictedFriend){predictedFriend.position={x:player.position.x,z:player.position.z};const c=predictedFriend.companion,target=s.nodes.find(n=>n.id===c.targetId&&n.hp>0)||(['FOLLOW','RETURN'].includes(c.mode)?predictedFriend.position:null);if(target&&distance(c,target)>1.5){if(!c.visualPath?.length||distance(c.visualPath.at(-1),target)>1.7)c.visualPath=companionPath(s,c,target);let budget=dt*5.2;while(budget>0&&c.visualPath?.length){const p=c.visualPath[0],d=distance(c,p),step=Math.min(d,budget);if(d>.001){c.x+=(p.x-c.x)*step/d;c.z+=(p.z-c.z)*step/d;}budget-=step;if(d<step+.001)c.visualPath.shift();else break;}}}const fc=predictedFriend?.companion||s.companion;friend.position.x=T.MathUtils.damp(friend.position.x,fc.x,14,dt);friend.position.z=T.MathUtils.damp(friend.position.z,fc.z,14,dt);friendRing.position.set(friend.position.x,.05,friend.position.z);syncFriend(s);const friendMoving=Math.hypot(friend.position.x-fc.x,friend.position.z-fc.z)>.03;if(friendMoving)friend.rotation.y=Math.atan2(fc.x-friend.position.x,fc.z-friend.position.z);if(friendMotion&&friendAvatar)friendAvatar.position.y=friendMotion.update(clock,friendMoving);
  for(const n of s.nodes){const g=roots.get(n.id);if(!g)continue;g.visible=n.hp>0;if(n.type==='slime'){g.position.set(n.x,0,n.z);g.userData.body.scale.y=reduced?1:1+Math.sin(clock*2.4)*.055;g.userData.body.position.y=reduced?0:Math.max(0,Math.sin(clock*2.4))*.09;}}
  const target=s.nodes.find(n=>n.id===selected&&n.hp>0);ring.visible=!!target&&active;if(target)ring.position.set(target.x,.03,target.z);
  for(const {object,phase,base}of canopies){if(!reduced)object.position.x=base.x+Math.sin(clock*.7+phase)*.027;object.children.forEach(o=>{if(o.userData.outline){let p=object.parent;o.visible=p.userData.nodeId===selected;}});}
  for(const g of treeViews){if(g.userData.spriteOutline){g.userData.spriteOutline.visible=g.userData.nodeId===selected;const sway=reduced?0:Math.sin(clock*.65+g.id)*.018;g.userData.treeSprite.position.x=sway;g.userData.spriteOutline.position.x=sway;}}
  if(!reduced){for(const {object,speed,phase}of petals){object.position.y-=dt*speed;object.position.x+=Math.sin(clock*.6+phase)*dt*.15;object.rotation.z+=dt*.3;if(object.position.y<.05)object.position.y=6;}waters.forEach((o,i)=>{if(i)o.position.z+=Math.sin(clock*.7+i)*dt*.02;});}
  const hit=s.events.filter(e=>e.kind==='hit').at(-1);if(hit&&hit.id!==lastHit){lastHit=hit.id;const g=roots.get(hit.target);if(g){effects.push({g,start:clock,rotation:g.rotation.z});for(let i=0;i<chips.length;i++){const o=chips[i];o.visible=true;o.position.set(g.position.x,.6,g.position.z);o.scale.setScalar(.025+(i%3)*.012);o.userData={start:clock,x:g.position.x,z:g.position.z};}}if(hit.actor==='COMPANION'&&friendAvatar){friendAvatar.rotation.z=-.17;friendSwingAt=clock;}if(hit.actor==='PLAYER'&&avatar){avatar.rotation.z=-.17;swingAt=clock;}}
  tool.visible=clock-swingAt<.4;tool.rotation.z=-Math.sin((clock-swingAt)*Math.PI/.4)*1.5;
  for(let i=0;i<chips.length;i++){const o=chips[i],t=clock-(o.userData.start||-10);if(t>.6){o.visible=false;continue;}const a=i*2.399;o.position.set(o.userData.x+Math.cos(a)*t*2,.6+t*1.4-t*t*3,o.userData.z+Math.sin(a)*t*2);o.rotation.x+=dt*3;}
  for(let i=effects.length-1;i>=0;i--){const e=effects[i],t=clock-e.start;if(t>.4){e.g.rotation.z=e.rotation;effects.splice(i,1);}else if(!reduced){e.g.rotation.z=e.rotation+Math.sin(t*38)*.035*(1-t/.4);if(e.g.userData.treeSprite){e.g.userData.treeSprite.position.x+=Math.sin(t*38)*.08*(1-t/.4);e.g.userData.spriteOutline.position.x=e.g.userData.treeSprite.position.x;}}}
  friendTool.visible=clock-friendSwingAt<.35;friendTool.rotation.z=Math.sin((clock-friendSwingAt)*12)*.5;if(friendAvatar)friendAvatar.rotation.z=T.MathUtils.damp(friendAvatar.rotation.z,0,8,dt);
  if(avatar)avatar.rotation.z=T.MathUtils.damp(avatar.rotation.z,0,8,dt);
  // Soft camera follow keeps the entire clearing composed like the reference.
  const cx=T.MathUtils.clamp(player.position.x,FOREST_BOUNDS.minX+7,FOREST_BOUNDS.maxX-7),cz=T.MathUtils.clamp(player.position.z-2.9,FOREST_BOUNDS.minZ+7,FOREST_BOUNDS.maxZ-7);camera.position.x=T.MathUtils.damp(camera.position.x,cx,2,dt);camera.position.z=T.MathUtils.damp(camera.position.z,20+cz,2,dt);camera.lookAt(camera.position.x,.3,camera.position.z-21);
  onProject({nodes:Object.fromEntries(s.nodes.map(n=>[n.id,{label:project(n.x+(n.type==='wood'?.7:0),n.type==='wood'?4.5:n.type==='stone'?2.5:n.type==='slime'?2:1.7,n.z),prompt:project(n.x+(n.type==='wood'?1.1:n.type==='stone'?1.8:.8),n.type==='wood'?1.7:n.type==='stone'?.25:.5,n.z+.1)}])),player:project(player.position.x,2.7,player.position.z),friend:project(friend.position.x,1.9,friend.position.z)});
  composer.render();
 }
 frame=requestAnimationFrame(animate);
 return {reconcileMove(requested,confirmed){const corrected=reconcileExplorationPosition(player.position,requested,confirmed);player.position.x=corrected.x;player.position.z=corrected.z;},resetPosition(confirmed){player.position.x=confirmed.x;player.position.z=confirmed.z;goal=null;},setFriendSelected(value){friendOutline.selectedObjects=value?[friend]:[];friendOutline.enabled=!!value;friendRing.visible=!!value;},setTarget(id){selected=id;},setGoal(node){selected=node.id;goal={...node,nodeId:node.id};},setZoom(value){zoom=value;resize();},setJoystick(x,z){joystick={x,z};goal=null;},position:()=>({x:player.position.x,z:player.position.z}),dispose(){dead=true;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',blur);renderer.domElement.removeEventListener('pointerdown',pointerDown);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());ao.dispose();friendOutline.dispose();composer.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}};
}
