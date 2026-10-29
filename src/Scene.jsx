import {createDioramaPlatform,createSpaceBackdrop,setPlatformColor} from './spaceWorld';
import {platformColor} from '../shared/platform.mjs';
import {fishingDuelView,fishLabel} from '../shared/fishingDuel.mjs';
import {communityPlacements,POLLBOX_ID,CHALKBOARD_ID} from '../shared/communityObjects.mjs';
import {createChalkboard} from './chalkboardModel';
import {createCompanionPet} from './companionPet.mjs';
import {createFacilityOutline,selectedFacility} from './facilityOutline.mjs';
import {facilityStep,isClickFacility} from './lifeNavigation.mjs';
import {createVillageTapGesture,villageTapDestination,villageTapStep} from './villageTapMovement.mjs';
import {VILLAGE_SCALE,VILLAGE_RADIUS,WALK_RADIUS,SCENERY_RADIUS} from '../shared/villageSize.mjs';
import {villageScenery,isScenery,isPinkPebble,pinkPebbles} from '../shared/scenery.mjs';
import React, { useEffect, useRef, useState } from 'react';
import {MessageCircle} from 'lucide-react';
import * as THREE from 'three';
import {loadAsset} from './avatar';
import {createRunMotion} from './avatarMotion.mjs';
import {createSitMotion} from './benchMotion.mjs';
import {createFishingMotion} from './fishingMotion.mjs';
import {createAvatarRide} from './dragonRide.mjs';
import {DRAGON_FLIGHT_HEIGHT} from '../shared/dragonMount.mjs';
import {villageBenches,nearestBench,benchExit,benchCameraView,benchInteractionKey} from '../shared/benches.mjs';
import './bench.css';
import {WALK_SPEED,MOTORCYCLE_SPEED,villageDirection,villageMovementKey,villagePlayers,showVillageStandIn,villageJumpHeight} from './villageMovement.mjs';
import {sceneMood,sceneView,avatarChatView,cameraPose,startCameraTransition,advanceCameraTransition,configureScenePanning,constrainScenePanning} from './sceneCamera.mjs';
import {createSceneViewport,sceneGraphicsQuality,sceneFrameDue} from './sceneViewport.mjs';
import {isFoldViewport,villageFieldOfView} from './foldViewport.mjs';
import {editorGridStyle} from './sceneGrid.mjs';
import {canPlaceDecoration,snapPosition} from './villageEditorState.mjs';
import {createGardenDetails} from './gardenDetails';
import {registerScenery as registerSceneryObject,registerGardenDetails} from './sceneryObjects';
import {createDecoration,dressAvatar,disposeObject} from './worldAssets';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {SIGN_ID,villageSign,signPlacementItem,signCameraView} from '../shared/sign.mjs';
import {createVillageSign} from './signModel';
import {GUESTBOOK_ID,villageGuestbook,guestbookPlacementItem,guestbookCameraView} from '../shared/guestbook.mjs';
import {createVillageGuestbook} from './guestbookModel';
import {guestbookOccluders} from './guestbookVisibility.mjs';
import {modelThumbnails} from './modelThumbnails';
import {INTERACTION_REACH,nearestLifeInteraction,lifeInteractionKey,fishingCameraView,inLifeArea} from '../shared/life.mjs';
import {villageLife,lifeInteractionObjects,isLifeScenery} from '../shared/lifeLayout.mjs';
import {createLifeWorld,createFacilityLabel} from './lifeWorld';
import {isLifeFocus,lifeFocusView,lifeFocusOccluders} from './lifeFocus.mjs';

const themes={sage:{accent:0x70a9ad,flowers:0xce87bc},rose:{accent:0xdfc7e1,flowers:0xf5dbe5},ocean:{accent:0xbddded,flowers:0xd3d2f1},sunset:{accent:0xe8d7c5,flowers:0xeed2d9}};

export default function Scene({dioramaRef,starId='plaza',onOverview,fishingDuel=null,chalkStrokes=[],pollActive=false,onPollClick,villageSpeech=[],topicGuest=null,topicLine=null,captureRef,movementInput,jumpInput,mode='home',chatFocusToken=0,chatActive=false,questionPending=false,onQuestionClick,lifeObjectId=null,theme='sage',emotion='calm',sceneType='garden',onInteract,onWalk,onReady,villageMembers=[],gardenData=null,viewerId,viewerNickname,onPositionChange,ownerId,ownerNickname,appearance={},ownerAppearance={},village={items:[]},inputEnabled=true,portrait=false,petPreview=false,paused=false,renderSuspended=false,readingDialogue=false,editor=null}){
  const humanoidPortrait=!petPreview;
  const community=communityPlacements(village),communityKey=JSON.stringify(community);
  const signData=villageSign(village),signKey=JSON.stringify(signData);
  const guestbookData=villageGuestbook(village),guestbookKey=JSON.stringify(guestbookData);
  const speechNodes=useRef(new Map()),pollNotice=useRef();
  const questionBubble=useRef(),petPromptRef=useRef(false),mountPromptRef=useRef('');
  const [petNearby,setPetNearby]=useState(false);
  const [avatarSelected,setAvatarSelected]=useState(false);
  const avatarPrompt=useRef();
  useEffect(()=>{setAvatarSelected(false);},[mode,chatActive,ownerId,paused]);
  const [mountPrompt,setMountPrompt]=useState('');
  const topicBubble=useRef(),benchToggle=useRef(),benchPromptRef=useRef('');
  const [benchPrompt,setBenchPrompt]=useState('');
  const [lifePrompt,setLifePrompt]=useState('');
  const lifePromptRef=useRef(''),lifeToggle=useRef();
  const mount=useRef(),rendererRef=useRef(),worldRef=useRef();const callbacks=useRef();callbacks.current={village,topicGuest,topicLine,onInteract,onWalk,onReady,onPositionChange,movementInput,editor,benches:villageBenches(village),sign:signData,guestbook:guestbookData,items:[...villageScenery(village),...(village.items||[]),signPlacementItem(signData),guestbookPlacementItem(guestbookData),...community]};
  callbacks.current.onOverview=onOverview;callbacks.current.fishingDuel=fishingDuel;callbacks.current.pollActive=pollActive;callbacks.current.onPollClick=onPollClick;callbacks.current.villageSpeech=villageSpeech;callbacks.current.lifeObjectId=lifeObjectId;callbacks.current.questionPending=questionPending;callbacks.current.chatFocusToken=chatFocusToken;callbacks.current.chatActive=chatActive;callbacks.current.avatarSelected=avatarSelected;
  const state=useRef();const [error,setError]=useState('');const [loading,setLoading]=useState(true);
  useEffect(()=>{if(state.current){state.current.mode=mode;state.current.emotion=emotion;state.current.villageMembers=villageMembers;state.current.gardenData=gardenData;state.current.viewerId=viewerId;state.current.viewerNickname=viewerNickname;state.current.inputEnabled=inputEnabled;state.current.paused=paused;state.current.renderSuspended=renderSuspended;state.current.readingDialogue=readingDialogue;}},[mode,emotion,villageMembers,gardenData,viewerId,viewerNickname,inputEnabled,paused,renderSuspended,readingDialogue]);
  // Keep one WebGL context for this mounted scene, including all look previews.
  useEffect(()=>()=>{
    const renderer=rendererRef.current;rendererRef.current=null;
    if(renderer){renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}
  },[]);
  useEffect(()=>{
    const el=mount.current;if(!el)return;let disposed=false;let frame;setLoading(true);setError('');
    const palette=themes[theme]||themes.sage;
    const mood=sceneMood(village.theme);
    let renderer;try{renderer=rendererRef.current??new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});rendererRef.current=renderer;}catch{setError('3D 화면을 시작할 수 없어요. 브라우저의 하드웨어 가속을 켜주세요.');setLoading(false);return;}
    const quality=sceneGraphicsQuality(renderer.getContext(),window.devicePixelRatio);
    renderer.setPixelRatio(quality.pixelRatio);renderer.shadowMap.enabled=quality.shadows;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=mood.id==='default'?1:1.12;el.appendChild(renderer.domElement);
    renderer.domElement.dataset.graphicsMode=quality.software?'software':'hardware';
    const world=new THREE.Scene();world.background=new THREE.Color(mood.sky);world.fog=new THREE.FogExp2(mood.sky,mood.id==='default'?.012:.021);
    renderer.domElement.dataset.worldId=crypto.randomUUID();renderer.domElement.dataset.villageTheme=mood.id;
    const space=portrait?null:createSpaceBackdrop(world,{theme:village.theme});
    const camera=new THREE.PerspectiveCamera(38,1,.1,180);camera.position.set(...(portrait?(petPreview?[0,1.15,3.4]:[0,1.65,5.4]):mood.id==='cafe'?[1,4.5,9]:[4.7,3.25,8]));
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.enableZoom=true;controls.minDistance=portrait||callbacks.current.chatActive?3:5;controls.maxDistance=26;controls.minPolarAngle=.18;controls.maxPolarAngle=Math.PI*.49;controls.target.set(...(portrait?(petPreview?[0,.9,0]:[0,1.65,0]):mood.id==='cafe'?[-1.9,1,0]:[0,1.45,0]));
    world.add(new THREE.HemisphereLight(mood.sky,0xabc0d0,mood.ambient));
    const sun=new THREE.DirectionalLight(0xfff3e6,2.8);sun.position.set(-5,12,7);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:1,far:40});sun.shadow.normalBias=.025;sun.shadow.intensity=.55;world.add(sun);
    const rim=new THREE.DirectionalLight(0xcce5ff,mood.id==='default'?.75:1.5);rim.position.set(5,6,-5);world.add(rim);
    sun.color.setHex(mood.light);sun.intensity=mood.intensity;
    const materials=[];const geometries=[];
    const mat=(color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.85,...extra});materials.push(m);return m;};
    const green=mat(mood.ground),earth=mat(0xb2cbdc),stone=mat(0xd5e5ee),bark=mat(0xbba995),leaf=mat(palette.accent),petal=mat(palette.flowers),cream=mat(0xfff7ee),wood=mat(0xb79984),roof=mat(0xa3c4dc),glow=mat(0xffe7b9,{emissive:0xffd6a1,emissiveIntensity:.45});
    function mesh(geometry,material,x=0,y=0,z=0,parent=world){geometries.push(geometry);const o=new THREE.Mesh(geometry,material);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
    function box(w,h,d,m,x,y,z,parent){return mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z,parent);}
    function ball(r,m,x,y,z,parent){return mesh(new THREE.SphereGeometry(r,24,16),m,x,y,z,parent);}
    function cyl(rt,rb,h,m,x,y,z,parent){return mesh(new THREE.CylinderGeometry(rt,rb,h,64),m,x,y,z,parent);}
    const platform=createDioramaPlatform({radius:VILLAGE_RADIUS,color:platformColor(village)});world.add(platform);
    const centralStart=world.children.length,centralParts=[];
    // Circular stone stage and illuminated perimeter.
    cyl(2.1,2.2,.22,stone,0,.23,0);cyl(1.95,1.95,.03,mat(0xf2f7fc),0,.36,0);
    const stageRing=mesh(new THREE.TorusGeometry(2.05,.025,8,100),mat(0xc9e3ae,{emissive:0xa9d988,emissiveIntensity:.65}),0,.38,0);stageRing.rotation.x=Math.PI/2;
    centralParts.push(...world.children.slice(centralStart));
    const stoneParts=[];
    for(let i=0;i<12;i++){const a=i*Math.PI/6;const tile=box(.55,.08,.48,stone,Math.sin(a)*2.5,.18,Math.cos(a)*2.5);tile.rotation.y=a;stoneParts.push([`stage-stone-${i}`,tile,tile.position.x,tile.position.z]);}
    for(let i=0;i<6;i++){const x=-.25+Math.sin(i)*.13;const tile=box(.88,.08,.48,stone,x,.17,2.9+i*.5);stoneParts.push([`path-stone-${i}`,tile,x,2.9+i*.5]);}
    const pollBox=new THREE.Group();pollBox.position.set(2.6,.16,3.3);pollBox.userData.action='poll';pollBox.userData.itemId=POLLBOX_ID;world.add(pollBox);
    const pollLabel=createFacilityLabel('투표함');pollLabel.position.y=1.5;pollBox.add(pollLabel);
    box(.8,.85,.7,mat(0xe9c5aa),0,.48,0,pollBox);box(.91,.1,.81,mat(0xc49476),0,.95,0,pollBox);box(.42,.02,.065,mat(0x6e5350),0,1.015,0,pollBox);
    const ballot=box(.24,.28,.025,cream,.1,1.14,0,pollBox);ballot.rotation.z=-.2;
    const pollOutlineMaterial=mat(0xffd33f,{emissive:0xffc928,emissiveIntensity:1.5,transparent:true,opacity:.85});
    const pollRing=mesh(new THREE.TorusGeometry(.7,.035,8,48),pollOutlineMaterial,0,.05,0,pollBox);pollRing.rotation.x=Math.PI/2;
    const pollOutlineShape=new THREE.BoxGeometry(.86,.92,.76),pollEdgesGeometry=new THREE.EdgesGeometry(pollOutlineShape);pollOutlineShape.dispose();geometries.push(pollEdgesGeometry);
    const pollLineMaterial=new THREE.LineBasicMaterial({color:0xffde45,transparent:true,opacity:1});materials.push(pollLineMaterial);
    const pollEdges=new THREE.LineSegments(pollEdgesGeometry,pollLineMaterial);pollEdges.position.y=.5;pollBox.add(pollEdges);
    const sceneryRoots=new Map();
    const lifeWorld=createLifeWorld({starId});world.add(lifeWorld.root);
    const facilityOutline=createFacilityOutline(renderer,world,camera);for(const [id,root] of lifeWorld.facilities)sceneryRoots.set(id,root);
    const registerScenery=(id,objects,x,z)=>registerSceneryObject(world,sceneryRoots,id,objects,x,z);
    registerScenery('central-stage',centralParts,0,0);
    stoneParts.forEach(([id,tile,x,z])=>registerScenery(id,[tile],x,z));
    function tree(x,z,size=1,blossom=false){
      const g=new THREE.Group();g.position.set(x,.12,z);world.add(g);
      cyl(.12,.2,1.8,bark,0,.9,0,g);const branch=cyl(.06,.09,.9,bark,.25,1.55,0,g);branch.rotation.z=-.5;
      const bloomPositions=[];
      for(let i=0;i<15;i++){
        const a=i*2.39996,r=.3+(i%3)*.19,tx=Math.cos(a)*r,ty=1.8+(i%4)*.23,tz=Math.sin(a)*r;
        mesh(new THREE.IcosahedronGeometry(.48+(i%3)*.08,1),blossom?petal:leaf,tx,ty,tz,g);
        if(i%2===0)bloomPositions.push([tx+.18,ty+.4,tz+.22]);
      }
      const bloomGeo=new THREE.IcosahedronGeometry(.055,1);geometries.push(bloomGeo);
      const blooms=new THREE.InstancedMesh(bloomGeo,cream,bloomPositions.length*5),transform=new THREE.Object3D();
      bloomPositions.forEach(([x,y,z],index)=>{for(let i=0;i<5;i++){const a=i*Math.PI*2/5;transform.position.set(x+Math.cos(a)*.07,y,z+Math.sin(a)*.07);transform.scale.set(1,.5,1);transform.updateMatrix();blooms.setMatrixAt(index*5+i,transform.matrix);}});g.add(blooms);
      g.scale.setScalar(size);return g;
    }
    [[-3.7,-2.4,1.25,true],[3.8,-2.7,1.3],[-5,1.5,1.05],[4.8,1.3,.95,true],[1,-5.1,1.05],[-2,-5.2,.9]].forEach(([x,z,size,bloom],i)=>registerScenery('tree-'+i,[tree(x,z,size,bloom)],x,z));
    for(let i=0;i<17;i++){const a=i*2.39996;const r=4.6+Math.sin(i*4)*.8;if(i%5===0)continue;const bush=ball(.45,leaf,Math.cos(a)*r,.33,Math.sin(a)*r);bush.scale.set(1.5,.7,1);registerScenery('bush-'+i,[bush],Math.cos(a)*r,Math.sin(a)*r);}
    // A miniature cafe: glass windows, striped awning, counter and outdoor tables.
    const cafe=new THREE.Group();cafe.position.set(-3.65,.15,-.2);cafe.rotation.y=.4;world.add(cafe);cafe.userData.action='cafe';
    box(2.3,1.55,1.8,cream,0,.78,0,cafe);box(2.55,.22,2.05,roof,0,1.64,0,cafe);
    const roofTop=mesh(new THREE.ConeGeometry(1.85,.8,4),roof,0,2.12,0,cafe);roofTop.rotation.y=Math.PI/4;roofTop.scale.z=.88;
    box(.55,1.25,.05,wood,.65,.68, .93,cafe);box(.37,.75,.06,glow,.65,.9,.97,cafe);box(1.05,.72,.05,glow,-.35,.92,.93,cafe);
    box(1.25,.08,.08,wood,-.35,.9,.97,cafe);box(.08,.84,.08,wood,-.35,.92,.97,cafe);
    for(let i=0;i<7;i++){const aw=box(.3,.07,.7,i%2?cream:leaf,-.9+i*.3,1.5,1.2,cafe);aw.rotation.x=.2;}
    box(1.2,.28,.07,wood,0,1.94,1,cafe);box(.9,.06,.08,glow,0,1.94,1.05,cafe);
    registerScenery('cafe',[cafe],-3.65,-.2);
    const cafeTables=new THREE.Group();world.add(cafeTables);
    for(const [x,z] of [[-2.7,2],[-4.3,2.1]]){const table=createDecoration('parasol');table.position.set(x,.15,z);table.scale.setScalar(.8);cafeTables.add(table);registerScenery('table-'+(x===-2.7?0:1),[table],x,z);}
    // Pond with water highlights and stepping stones.
    const pondStart=world.children.length;
    const water=mat(0xa8d6ed,{metalness:.3,roughness:.17,transparent:true,opacity:.88});const pond=cyl(1.22,1.25,.06,water,3.35,.18,1.2);pond.scale.z=1.45;
    const pondRing=mesh(new THREE.TorusGeometry(1.26,.1,8,64),stone,3.35,.17,1.2);pondRing.rotation.x=Math.PI/2;pondRing.scale.y=1.45;
    for(let i=0;i<4;i++){const lily=cyl(.18,.18,.02,leaf,3.1+Math.sin(i*3)*.7,.23,1+Math.cos(i*2)*.9);if(i%2===0)ball(.09,petal,lily.position.x,.3,lily.position.z);}
    registerScenery('pond',world.children.slice(pondStart),3.35,1.2);
    if(starId==='fishing'){const pool=cyl(3.2,3.2,.055,water,0,.19,4.8);pool.scale.z=.62;const poolRim=mesh(new THREE.TorusGeometry(3.24,.1,8,80),stone,0,.18,4.8);poolRim.rotation.x=Math.PI/2;poolRim.scale.y=.62;cafe.visible=false;}
    const gardenDetails=createGardenDetails(),gardenDetailParts=[...gardenDetails.children];registerGardenDetails(world,sceneryRoots,gardenDetails);
    // Campfire and benches.
    const fireGroup=new THREE.Group();fireGroup.position.set(...(mood.id==='campfire'?[1.2,.39,.8]:[2.1,.13,-3.5]));fireGroup.userData.action='campfire';world.add(fireGroup);
    for(let i=0;i<8;i++){const a=i*Math.PI/4;ball(.16,stone,Math.sin(a)*.5,.12,Math.cos(a)*.5,fireGroup);}for(let i=0;i<3;i++){const log=cyl(.08,.08,.75,bark,0,.16,0,fireGroup);log.rotation.z=Math.PI/2;log.rotation.y=i*1.1;}
    const flame=mesh(new THREE.ConeGeometry(.2,.65,7),glow,0,.47,0,fireGroup);const flameLight=new THREE.PointLight(0xffc075,3,5);flameLight.position.copy(fireGroup.position).add(new THREE.Vector3(0,.9,0));world.add(flameLight);
    const night=['campfire','twilight'].includes(mood.id);
    const fireMat=mat(0xff9c37,{emissive:0xff6c20,emissiveIntensity:2,transparent:true,opacity:.85});
    const fireCore=mesh(new THREE.ConeGeometry(.13,.5,8),fireMat,.05,.43,0,fireGroup);
    const embers=Array.from({length:14},(_,i)=>ball(.018,fireMat,Math.sin(i*2.4)*.22,.6+(i/14)*1.1,Math.cos(i*2.4)*.22,fireGroup));
    registerScenery('campfire',[fireGroup,flameLight],fireGroup.position.x,fireGroup.position.z);
    if(night){
      const starMaterial=mat(0xfff3cf,{emissive:0xffefbd,emissiveIntensity:2});
      for(let i=0;i<55;i++){const a=i*2.39996;ball(.025+(i%3)*.012,starMaterial,Math.sin(a)*14,5+(i%11)*.45,Math.cos(a)*14);}
    }
    for(let i=0;i<2;i++){const bench=box(1,.14,.4,wood,2.1+(i?-.9:.9),.4,-2.6);bench.rotation.y=i?-.5:.5;registerScenery('bench-'+i,[bench],bench.position.x,bench.position.z);}
    for(const [x,z] of [[-1.4,3.4],[1.4,3.4],[-5,-2],[4,-1.3]]){const lampStart=world.children.length;cyl(.035,.06,1.65,bark,x,.95,z);box(.22,.34,.22,glow,x,1.9,z);box(.32,.06,.32,roof,x,2.1,z);const l=new THREE.PointLight(0xffd79d,1.5,4);l.position.set(x,1.8,z);world.add(l);registerScenery('lamp-'+([[-1.4,3.4],[1.4,3.4],[-5,-2],[4,-1.3]].findIndex(p=>p[0]===x&&p[1]===z)),world.children.slice(lampStart),x,z);}
    // Seeded planting keeps the island stable between views.
    let seed=42;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
    const flowerGeo=new THREE.IcosahedronGeometry(.045,0);geometries.push(flowerGeo);
    for(const cluster of pinkPebbles){
      const parts=cluster.stones.map(pebble=>{const part=new THREE.Mesh(flowerGeo,petal);part.position.set(cluster.x+pebble.x,pebble.y,cluster.z+pebble.z);part.scale.setScalar(pebble.scale);world.add(part);return part;});
      registerScenery(cluster.id,parts,cluster.x,cluster.z);
    }

    const particleGeo=new THREE.BufferGeometry();const positions=new Float32Array(90*3);for(let i=0;i<90;i++){positions[i*3]=(rand()-.5)*20;positions[i*3+1]=rand()*8;positions[i*3+2]=(rand()-.5)*18;}particleGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));geometries.push(particleGeo);const particleMat=new THREE.PointsMaterial({color:0xf8e7ba,size:.045,transparent:true,opacity:.65,depthWrite:false});materials.push(particleMat);const particles=new THREE.Points(particleGeo,particleMat);world.add(particles);
    if(portrait){world.background=new THREE.Color(0xeaf5ff);world.fog=null;const pedestal=cyl(1.8,1.9,.12,mat(0xd6e9f9),0,.30,0);pedestal.userData.previewStage=true;}
    const avatarRoot=new THREE.Group();avatarRoot.position.set(0,.39,0);avatarRoot.userData.action='avatar';world.add(avatarRoot);
    const selectionRing=mesh(new THREE.TorusGeometry(.65,.025,12,80),mat(0xffffff,{emissive:0x8dcfff,emissiveIntensity:3,transparent:true,opacity:.95,depthWrite:false}),0,.42,0);selectionRing.rotation.x=Math.PI/2;selectionRing.visible=false;
    const selectionHalo=mesh(new THREE.RingGeometry(.66,.84,80),mat(0xa8d9ff,{emissive:0x80bfff,emissiveIntensity:1.5,transparent:true,opacity:.24,side:THREE.DoubleSide,depthWrite:false}),0,.415,0);selectionHalo.rotation.x=-Math.PI/2;selectionHalo.visible=false;let mixer,action,characterAsset,hostTag,hostRide,hostPet;const remoteCharacters=new Map(),characterAssets=new Map(),pendingCharacters=new Set();
    function addNameTag(parent,name){
      const label=String(name??'').trim().slice(0,20),canvas=document.createElement('canvas');
      const ctx=canvas.getContext('2d');ctx.font='600 30px sans-serif';
      canvas.width=Math.min(768,Math.max(100,Math.ceil(ctx.measureText(label).width)+32));canvas.height=80;
      ctx.font='600 30px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.shadowColor='rgba(255,255,255,.95)';ctx.shadowBlur=12;ctx.fillStyle='#284f7d';
      ctx.fillText(label,canvas.width/2,40,canvas.width-24);
      const texture=new THREE.CanvasTexture(canvas);
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,toneMapped:false,fog:false}));
      sprite.scale.set(canvas.width/200,.4,1);sprite.position.y=2.95;sprite.userData.hasName=!!label;parent.add(sprite);return sprite;
    }
    function disposeCharacter(root){root.traverse(o=>{if(o.isSprite){o.material.map?.dispose();o.material.dispose();}if(o.userData.generated)disposeObject(o);});}
    function buildRemote(member,asset){
      if(['PET','MOUNT'].includes(member.actorKind)){
        const pet=createCompanionPet(member.appearance),root=new THREE.Group();root.position.set(member.x??0,.39,member.z??0);root.rotation.y=member.rotation||0;root.add(pet.root);
        const nameTag=addNameTag(root,member.actorKind==='PET'?member.appearance?.petName:member.nickname);nameTag.position.y=pet.flight?3:1.35;root.userData.look=JSON.stringify(member.appearance||appearance);world.add(root);
        return {root,nameTag,pet,runMotion:pet.runMotion,sitMotion:pet.sitMotion,moving:false,seatId:member.seatId||null};
      }
      const root=new THREE.Group();root.position.set(member.x??0,.39,member.z??0);root.rotation.y=member.rotation||0;const avatar=clone(asset);const bounds=new THREE.Box3().setFromObject(avatar);const size=bounds.getSize(new THREE.Vector3());avatar.scale.setScalar(2.65/Math.max(size.y,.001));const b=new THREE.Box3().setFromObject(avatar);const center=b.getCenter(new THREE.Vector3());avatar.position.set(-center.x,-b.min.y,-center.z);root.add(avatar);dressAvatar(avatar,member.appearance||appearance);const nameTag=addNameTag(root,member.nickname);root.userData.look=JSON.stringify(member.appearance||appearance);const runMotion=createRunMotion(avatar,{clip:'Walking',idle:false}),sitMotion=createSitMotion(avatar),ride=createAvatarRide(avatar,member.appearance||appearance),fishingMotion=createFishingMotion(avatar);let mixer,idleAction;if(asset.animations.length){mixer=new THREE.AnimationMixer(avatar);idleAction=mixer.clipAction(asset.animations.find(clip=>clip.name==='Mirror_Viewing'));idleAction.play();idleAction.timeScale=1;}world.add(root);return{root,nameTag,mixer,idleAction,runMotion,sitMotion,ride,fishingMotion,moving:false,seatId:member.userId===state.current?.viewerId?null:member.seatId||null};}
    (humanoidPortrait?loadAsset(ownerAppearance.character):Promise.resolve({animations:[]})).then(async asset=>{if(disposed)return;characterAsset=asset;if(humanoidPortrait)characterAssets.set(ownerAppearance.character||'pio',asset);const avatar=humanoidPortrait?clone(asset):(hostPet=createCompanionPet(ownerAppearance)).root;const bounds=new THREE.Box3().setFromObject(avatar);const size=bounds.getSize(new THREE.Vector3());if(humanoidPortrait)avatar.scale.setScalar(2.65/Math.max(size.y,.001));const b=new THREE.Box3().setFromObject(avatar);const center=b.getCenter(new THREE.Vector3());avatar.position.set(-center.x,-b.min.y,-center.z);avatarRoot.add(avatar);if(humanoidPortrait)dressAvatar(avatar,ownerAppearance);hostRide=humanoidPortrait?createAvatarRide(avatar,ownerAppearance):null;if(hostRide?.flight)hostRide.dragon.root.userData.action=`mount:${ownerId}`;hostTag=addNameTag(avatarRoot,portrait?'꾸미기 미리보기':humanoidPortrait?`${ownerNickname||viewerNickname||'피오'} · AI`:ownerAppearance.petName);if(!humanoidPortrait)hostTag.position.y=1.35;if(asset.animations.length){mixer=new THREE.AnimationMixer(avatar);action=mixer.clipAction(asset.animations.find(clip=>clip.name==='Mirror_Viewing'));action.play();action.timeScale=1;}setLoading(false);if(captureRef)captureRef.current=()=>{drawFrame();return renderer.domElement.toDataURL('image/png');};await renderer.compileAsync(world,camera);if(disposed)return;drawFrame();callbacks.current.onReady?.();}).catch(()=>{if(!disposed){setError('캐릭터를 불러오지 못했어요. 새로고침으로 다시 시도해주세요.');setLoading(false);}});
    const decorationRoot=new THREE.Group();world.add(decorationRoot);
    const signRoot=new THREE.Group();world.add(signRoot);
    const previewRoot=new THREE.Group();world.add(previewRoot);
    const gridPoints=[];
    for(let i=-16;i<=16;i++){
      const axis=i*.5,edge=Math.sqrt(SCENERY_RADIUS**2-axis**2);
      gridPoints.push(axis,0,-edge,axis,0,edge,-edge,0,axis,edge,0,axis);
    }
    const gridStyle=editorGridStyle({...mood,ground:platformColor(village)});
    const grid=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(gridPoints,3)),new THREE.LineDashedMaterial({color:gridStyle.color,transparent:true,opacity:0,dashSize:.075,gapSize:.04,depthWrite:false,toneMapped:false,fog:false}));grid.computeLineDistances();grid.position.y=.165;grid.visible=!!editor;world.add(grid);
    // Item updates are independent of the scene, so editing never resets the camera.
    worldRef.current={platform,grid,gridStyle,pollBox,sceneryRoots,decorationRoot,signRoot,previewRoot,world,controls,camera};
    if(dioramaRef)dioramaRef.current=()=>{
      const snapshot=new THREE.Group();snapshot.userData.borrowed=true;snapshot.userData.sourceView=cameraPose(camera,controls);
      for(const root of [platform,...sceneryRoots.values(),decorationRoot,signRoot,pollBox,avatarRoot,...[...remoteCharacters.values()].map(entry=>entry.root)])if(root.visible)snapshot.add(clone(root));
      snapshot.scale.setScalar(4/VILLAGE_RADIUS);return snapshot;
    };
    const raycaster=new THREE.Raycaster(),groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-.16),tapGesture=createVillageTapGesture();let pointerDown,dragged=null;
    const walkMarker=mesh(new THREE.RingGeometry(.17,.25,32),mat(0x9ecfff,{emissive:0x6ba9e0,emissiveIntensity:.6,transparent:true,opacity:.9,depthWrite:false}),0,.41,0);
    walkMarker.rotation.x=-Math.PI/2;walkMarker.visible=false;
    function ray(e){const rect=el.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);}
    function ground(e){ray(e);const point=raycaster.ray.intersectPlane(groundPlane,new THREE.Vector3());return point?{x:snapPosition(point.x),z:snapPosition(point.z)}:null;}
    function itemHit(e){ray(e);for(const hit of raycaster.intersectObjects([...sceneryRoots.values(),...decorationRoot.children,...signRoot.children,pollBox],true)){let obj=hit.object;while(obj){if(obj.userData.itemId){if(obj.visible)return obj;break;}obj=obj.parent;}}return null;}
    function down(e){
      tapGesture.down(e);
      if(e.button!==0)return;pointerDown={x:e.clientX,y:e.clientY,id:e.pointerId};
      const edit=callbacks.current.editor;if(!edit||edit.busy)return;
      const model=itemHit(e);
      // A selected gravel cluster can be moved by clicking its destination,
      // including ground occupied by another object that gravel may overlap.
      if(isPinkPebble(edit.selected)&&model?.userData.itemId!==edit.selected)return;
      if(model){dragged={model,id:model.userData.itemId,start:model.position.clone(),anchor:ground(e),point:{x:model.position.x,z:model.position.z}};controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);edit.onSelect(model.userData.itemId);}
    }
    function move(e){
      tapGesture.move(e);
      const edit=callbacks.current.editor;if(!edit||edit.busy)return;
      const point=ground(e);if(!point)return;
      if(dragged?.anchor){point.x=snapPosition(point.x+dragged.start.x-dragged.anchor.x);point.z=snapPosition(point.z+dragged.start.z-dragged.anchor.z);}
      const valid=canPlaceDecoration(callbacks.current.items,point.x,point.z,dragged?.id||edit.selected||null);
      const preview=previewRoot.children[0];
      if(dragged&&pointerDown&&e.pointerId===pointerDown.id){
        if(Math.hypot(pointerDown.x-e.clientX,pointerDown.y-e.clientY)<5)return;
        dragged.point=point;dragged.moved=true;dragged.model.position.set(point.x,dragged.start.y,point.z);
        if(preview){preview.position.set(point.x,.17,point.z);preview.userData.tint?.(valid);}
      }else if(edit.tool&&preview){preview.visible=true;preview.position.set(point.x,.17,point.z);preview.userData.tint?.(valid);renderer.domElement.style.cursor=valid?'copy':'not-allowed';}
    }
    function finishDrag(e,cancel=false){
      if(!dragged)return false;const current=dragged;dragged=null;controls.enabled=true;
      if(renderer.domElement.hasPointerCapture(e.pointerId))renderer.domElement.releasePointerCapture(e.pointerId);
      current.model.position.copy(current.start);
      if(current.moved&&!cancel&&current.point)callbacks.current.editor?.onMove(current.id,current.point);
      return true;
    }
    function click(e){
      const tapped=tapGesture.up(e);
      if(finishDrag(e))return;
      if(!callbacks.current.editor&&(!state.current?.inputEnabled||state.current?.paused))return;
      if(e.button!==0||!pointerDown||!tapped)return;
      const edit=callbacks.current.editor;
      if(edit){if(edit.busy)return;const point=ground(e);if(edit.tool&&point)edit.onPlace(point);else if(isPinkPebble(edit.selected)&&point)edit.onMove(edit.selected,point);else edit.onSelect(null);return;}
      ray(e);for(const hit of raycaster.intersectObjects(world.children,true)){let ancestor=hit.object,visible=true;while(ancestor){if(!ancestor.visible){visible=false;break;}ancestor=ancestor.parent;}if(!visible)continue;let obj=hit.object;while(obj){if(!obj.visible)break;if(obj.userData.action){if(obj.userData.action==='storage'||obj.userData.action==='kitchen'||obj.userData.action.startsWith('garden:')||obj.userData.action.startsWith('fishing:'))lifeToggle.current?.(obj.userData.action);else if(obj.userData.action==='avatar'&&['home','village','chat'].includes(state.current.mode)&&!callbacks.current.chatActive)setAvatarSelected(value=>!value);else callbacks.current.onInteract?.(obj.userData.action);return;}obj=obj.parent;}}
      setAvatarSelected(false);
      const s=state.current;
      if(portrait||!['home','village'].includes(s.mode)||!(e.pointerType==='touch'||isFoldViewport(window.innerWidth,window.innerHeight)||window.matchMedia('(max-width: 800px), (pointer: coarse)').matches))return;
      if(s.mode!=='village'&&ownerId!==s.viewerId)return;
      const point=villageTapDestination(raycaster.ray.intersectPlane(groundPlane,new THREE.Vector3()));if(!point)return;
      const entry=remoteCharacters.get(s.viewerId);if(!entry)return;
      if(entry.seatId)stand(entry);
      else if(s.villageMembers.some(member=>member.userId===s.viewerId&&['Moving','Gardening','Cooking'].includes(member.activityState)))callbacks.current.onInteract?.('life:stop');
      facilityDestination=null;groundDestination=point;heldKeys.clear();
      walkMarker.position.set(point.x,.41,point.z);walkMarker.visible=true;
      if(s.mode==='home')callbacks.current.onWalk?.();
    }
    function cancel(e){tapGesture.cancel(e);finishDrag(e,true);pointerDown=null;}
    function leave(){if(!dragged&&callbacks.current.editor?.tool&&previewRoot.children[0])previewRoot.children[0].visible=false;}
    function context(e){if(callbacks.current.editor){e.preventDefault();callbacks.current.editor.onCancel();}}
    function dragover(e){if(callbacks.current.editor&&!callbacks.current.editor.busy){e.preventDefault();e.dataTransfer.dropEffect='copy';move(e);}}
    function drop(e){const edit=callbacks.current.editor;if(!edit||edit.busy)return;e.preventDefault();const point=ground(e),type=e.dataTransfer.getData('application/pieona-decoration');if(point&&type)edit.onPlace(point,type);}
    const pointerEvents={pointerdown:down,pointermove:move,pointerup:click,pointercancel:cancel,pointerleave:leave,contextmenu:context,dragover,drop};
    for(const [name,handler] of Object.entries(pointerEvents))renderer.domElement.addEventListener(name,handler);
    let focusedToken=callbacks.current.chatFocusToken,wasChatActive=false,chatReturnPose=null;
    let previousMode=mode,previousSignPose='',cameraTransition=null,returnPose=null,gridOpacity=mode==='edit'?gridStyle.opacity:0,focusedDuel=null;
    worldRef.current.cancelCameraTransition=()=>{cameraTransition=null;};
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
    const initialView=isLifeFocus(mode)?lifeFocusView(mode,callbacks.current.lifeObjectId,camera.aspect,callbacks.current.village):mode==='guestbook'?guestbookCameraView(callbacks.current.guestbook):mode==='sign'?signCameraView(callbacks.current.sign):sceneView(mode,{portrait,petPreview,dragonRide:ownerAppearance.ride==='babyDragon',mood:mood.id});camera.position.fromArray(initialView.position);controls.target.fromArray(initialView.target);controls.update();
    controls.addEventListener('start',()=>{cameraTransition=null;});
    state.current={mode,emotion,villageMembers,gardenData,viewerId,viewerNickname,inputEnabled,paused,renderSuspended,readingDialogue};
    function constrainCameraPan(){
      const entry=remoteCharacters.get(state.current?.viewerId),seat=entry?.seatId&&entry.seat;
      if(!cameraTransition&&state.current?.mode===previousMode)constrainScenePanning(camera,controls,state.current.mode,{portrait:portrait||callbacks.current.chatActive,mood:mood.id,panCenter:seat?benchCameraView(seat).target:undefined});
    }
    controls.addEventListener('change',constrainCameraPan);
    const heldKeys=new Set(),direction=new THREE.Vector3();let lastSent=0,jumpRequested=false,seatedReturnPose=null,facilityDestination=null,groundDestination=null;
    lifeToggle.current=(requested)=>{
      const s=state.current,entry=remoteCharacters.get(s?.viewerId);
      if(!s?.inputEnabled||s.paused||starId!=='fishing')return;
      groundDestination=null;walkMarker.visible=false;
      if(s.mode!=='village'||!entry){callbacks.current.onWalk?.();return;}
      const target=requested?lifeInteractionObjects(callbacks.current.village).find(a=>a.id===requested):nearestLifeInteraction(entry.root.position,s.villageMembers,s.viewerId,callbacks.current.village);
      if(requested&&target&&isClickFacility(target.id)){
        if(entry.seatId?.startsWith('fishing:'))callbacks.current.onInteract?.('life:stop');
        else if(entry.seatId)stand(entry);
        heldKeys.clear();jumpRequested=false;if(jumpInput)jumpInput.current=false;
        if(callbacks.current.movementInput)callbacks.current.movementInput.current={x:0,y:0};
        if(s.villageMembers.some(member=>member.userId===s.viewerId&&['Moving','Gardening','Cooking'].includes(member.activityState)))callbacks.current.onInteract?.('life:stop');
        facilityDestination=target.id;return;
      }
      const opponent=target&&s.villageMembers.find(m=>m.userId!==s.viewerId&&m.seatId===target.id&&m.activityState==='Fishing');
      if(opponent&&Math.hypot(target.x-entry.root.position.x,target.z-entry.root.position.z)<=2.2){callbacks.current.onInteract?.(`fishing:challenge:${opponent.userId}`);return;}
      if(entry.seatId?.startsWith('fishing:')){callbacks.current.onInteract?.('life:stop');return;}
      if(entry.seatId||entry.sitMotion.active||villageJumpHeight(entry.jumpStarted))return;
      if(!target||Math.hypot(target.x-entry.root.position.x,target.z-entry.root.position.z)>INTERACTION_REACH){callbacks.current.onInteract?.('life:approach');return;}
      heldKeys.clear();callbacks.current.onInteract?.(target.id);
    };
    function publishEntry(entry){callbacks.current.onPositionChange?.({x:entry.root.position.x,z:entry.root.position.z,rotation:entry.root.rotation.y,moving:entry.moving,jumpStarted:entry.jumpStarted||0,seatId:entry.seatId||null});}
    function stand(entry,restoreCamera=true){
      if(!entry?.seatId)return;
      if(entry.seatId.startsWith('fishing:')){callbacks.current.onInteract?.('life:stop');return;}
      entry.seatId=null;entry.exit=benchExit(entry.seat);entry.jumpStarted=0;
      const exit=entry.exit;
      callbacks.current.onPositionChange?.({x:exit.x,z:exit.z,rotation:entry.root.rotation.y,moving:false,jumpStarted:0,seatId:null});
      if(restoreCamera&&seatedReturnPose)cameraTransition=startCameraTransition(camera,controls,seatedReturnPose,reducedMotion.matches?0:1.1);
      seatedReturnPose=null;
    }
    benchToggle.current=()=>{
      const s=state.current,entry=remoteCharacters.get(s?.viewerId);
      if(!entry||s.mode!=='village'||!s.inputEnabled||s.paused)return;
      groundDestination=null;walkMarker.visible=false;
      heldKeys.clear();jumpRequested=false;if(jumpInput)jumpInput.current=false;
      if(callbacks.current.movementInput)callbacks.current.movementInput.current={x:0,y:0};
      if(entry.seatId){stand(entry);return;}
      if(entry.sitMotion.active||villageJumpHeight(entry.jumpStarted)>0)return;
      const bench=nearestBench(callbacks.current.benches,entry.root.position,s.villageMembers,s.viewerId);if(!bench)return;
      entry.seat=bench;entry.seatId=bench.id;entry.exit=null;entry.jumpStarted=0;entry.moving=false;
      entry.idleAction?.stop();entry.runMotion.update(0,false);
      seatedReturnPose=cameraPose(camera,controls);
      controls.enableDamping=false;controls.update();controls.enableDamping=true;
      cameraTransition=startCameraTransition(camera,controls,benchCameraView(bench),reducedMotion.matches?0:1.1);
      callbacks.current.onPositionChange?.({x:bench.x,z:bench.z,rotation:bench.rotation,moving:false,jumpStarted:0,seatId:bench.id});
    };
    function keydown(e){
      const current=state.current,keyName=(e.code||e.key||'').toLowerCase();
      const typing=e.target?.isContentEditable||e.target?.closest?.('input,textarea,select,[role="textbox"]');
      if(!typing&&!e.defaultPrevented&&!e.isComposing&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&current?.inputEnabled&&!current.paused&&(current.mode==='home'||current.mode==='village')){
        if((keyName==='keyf'||keyName==='f')&&mountPromptRef.current){e.preventDefault();if(!e.repeat)callbacks.current.onInteract?.('mount:toggle');return;}
        if(keyName==='keyr'||keyName==='r'){e.preventDefault();if(!e.repeat)callbacks.current.onInteract?.('pet:call');return;}
        if((keyName==='keye'||keyName==='e')&&petPromptRef.current){e.preventDefault();if(!e.repeat)callbacks.current.onInteract?.('pet:pet');return;}
      }

      if(lifeInteractionKey(e)&&state.current?.mode==='village'&&state.current.inputEnabled&&!state.current.paused){e.preventDefault();lifeToggle.current?.();return;}
      if(benchInteractionKey(e)&&state.current?.mode==='village'&&state.current.inputEnabled&&!state.current.paused){e.preventDefault();benchToggle.current?.();return;}
      const s=state.current,key=villageMovementKey(e);
      if(!key||!s?.inputEnabled||s.paused)return;
      if(s.mode!=='village'&&ownerId!==s.viewerId)return;
      const member=s.villageMembers.find(member=>member.userId===s.viewerId);
      if(s.mode==='village'&&(member?.seatId?.startsWith('fishing:')||['Moving','Gardening','Cooking'].includes(member?.activityState))){
        // A quick tap can end before the next frame samples heldKeys.
        e.preventDefault();if(!e.repeat)callbacks.current.onInteract?.('life:stop');return;
      }
      if(s.mode==='home')callbacks.current.onWalk?.();
      e.preventDefault();if(key===' '){if(!e.repeat)jumpRequested=true;}else heldKeys.add(key);
    }
    function keyup(e){heldKeys.delete((e.code?.startsWith('Key')?e.code.slice(3):e.key).toLowerCase());}
    function clearKeys(){facilityDestination=null;groundDestination=null;walkMarker.visible=false;tapGesture.reset();heldKeys.clear();jumpRequested=false;if(jumpInput)jumpInput.current=false;if(callbacks.current.movementInput)callbacks.current.movementInput.current={x:0,y:0};const entry=remoteCharacters.get(state.current?.viewerId);if(entry?.moving){entry.moving=false;entry.runMotion.update(0,false);entry.idleAction?.reset().play();publishEntry(entry);}}
    function visibilityChanged(){if(document.hidden)clearKeys();}
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',clearKeys);document.addEventListener('visibilitychange',visibilityChanged);
    const viewport=createSceneViewport(renderer,camera,{getFieldOfView:()=>villageFieldOfView(window.innerWidth,window.innerHeight,{mode:state.current?.mode,portrait,chatActive:callbacks.current.chatActive})});
    const resize=()=>{const {width,height}=el.getBoundingClientRect();viewport.resize(width,height);space?.resize(width,height);};
    const observer=new ResizeObserver(resize);observer.observe(el);resize();
    let bookOccluders=[],nextOcclusionCheck=0;
    function renderWorld(){
      const selected=isLifeFocus(state.current?.mode)?callbacks.current.lifeObjectId:facilityDestination;
      const host=remoteCharacters.get(ownerId)?.root||avatarRoot;
      const selecting=callbacks.current.avatarSelected&&!callbacks.current.chatActive&&!state.current?.paused&&['home','village','chat'].includes(state.current?.mode);
      selectionRing.visible=selectionHalo.visible=selecting&&host.visible;
      if(selecting){selectionRing.position.set(host.position.x,.42,host.position.z);selectionHalo.position.copy(selectionRing.position);selectionHalo.position.y-=.005;}
      facilityOutline.render(selecting?host:selectedFacility(lifeWorld.facilities,selected));
    }
    function drawFrame(){viewport.draw(()=>{
      if(portrait)for(const child of world.children)child.visible=child===avatarRoot||child.isLight||!!child.userData.previewStage;
      // Home already identifies the avatar in its heading/card. A world-space
      // nickname can drift under the toolbar after walking or camera changes.
      // Apply on paused and capture draws too, so old labels cannot return.
      const showNames=state.current?.mode==='village'||state.current?.mode==='topic';
      if(hostTag)hostTag.visible=showNames&&hostTag.userData.hasName;
      for(const entry of remoteCharacters.values())entry.nameTag.visible=showNames&&entry.nameTag.userData.hasName;
      if(state.current?.mode==='topic'&&!cameraTransition){camera.position.set(0,4.3,Math.max(10,6/camera.aspect));controls.target.set(0,1.8,0);controls.update();}
      const question=questionBubble.current,host=remoteCharacters.get(ownerId)?.root||avatarRoot;
      const prompt=avatarPrompt.current;
      if(prompt){const point=host.position.clone().add(new THREE.Vector3(1.15,2.1,0)).project(camera);prompt.style.left=`${Math.max(85,Math.min(el.clientWidth-85,(point.x+1)*.5*el.clientWidth))}px`;prompt.style.top=`${Math.max(45,Math.min(el.clientHeight-45,(1-point.y)*.5*el.clientHeight))}px`;prompt.style.visibility=host.visible&&point.z>=-1&&point.z<=1&&Math.abs(point.x)<1&&Math.abs(point.y)<1?'visible':'hidden';}
      if(question){
        const point=host.position.clone().add(new THREE.Vector3(0,3.5,0)).project(camera);
        question.style.visibility=point.z>=-1&&point.z<=1?'visible':'hidden';
        question.style.left=`${Math.max(110,Math.min(el.clientWidth-110,(point.x+1)*.5*el.clientWidth))}px`;
        question.style.top=`${Math.max(55,(1-point.y)*.5*el.clientHeight)}px`;
      }
      for(const line of callbacks.current.villageSpeech){
        const node=speechNodes.current.get(line.id);if(!node)continue;
        const actor=remoteCharacters.get(line.userId)?.root||(line.userId===ownerId?avatarRoot:null);
        if(!actor||!actor.visible||!['home','village'].includes(state.current?.mode)){node.style.visibility='hidden';continue;}
        const point=actor.position.clone().add(new THREE.Vector3(0,3.8,0)).project(camera);
        const anchor=(point.x+1)*.5*el.clientWidth,half=node.offsetWidth/2;
        const pair=callbacks.current.villageSpeech.some(other=>other.userId===line.userId&&other.role!==line.role);
        const left=Math.max(half+8,Math.min(el.clientWidth-half-8,anchor+(pair?(line.role==='user'?-half-8:half+8):0)));
        node.style.visibility=point.z>=-1&&point.z<=1&&Math.abs(point.x)<1.2&&Math.abs(point.y)<1.2?'visible':'hidden';
        node.style.left=`${left}px`;node.style.top=`${Math.max(node.offsetHeight+12,(1-point.y)*.5*el.clientHeight)}px`;
        node.style.setProperty('--speech-tail',`${Math.max(12,Math.min(node.offsetWidth-12,half+anchor-left))}px`);
      }
      const bubble=topicBubble.current,line=callbacks.current.topicLine;
      if(bubble&&line){
        const point=new THREE.Vector3(line.speakerId===ownerId?-1.15:1.15,3.2,0).project(camera);
        const anchor=(point.x+1)*.5*el.clientWidth,half=bubble.offsetWidth/2;
        const left=Math.max(half+12,Math.min(el.clientWidth-half-12,anchor));
        bubble.style.left=`${left}px`;bubble.style.top=`${(1-point.y)*50}%`;
        bubble.style.setProperty('--speech-tail',`${half+anchor-left}px`);
      }
      if(state.current?.mode==='guestbook'||isLifeFocus(state.current?.mode)){
        if(performance.now()>=nextOcclusionCheck){bookOccluders=isLifeFocus(state.current.mode)?lifeFocusOccluders(world,camera,lifeFocusView(state.current.mode,callbacks.current.lifeObjectId,camera.aspect,callbacks.current.village).target,lifeWorld.root,callbacks.current.lifeObjectId):guestbookOccluders(world,camera,callbacks.current.guestbook);nextOcclusionCheck=performance.now()+150;}
        const visibility=bookOccluders.map(object=>object.visible);
        bookOccluders.forEach(object=>{object.visible=false;});
        renderWorld();
        bookOccluders.forEach((object,index)=>{object.visible=visibility[index];});
      }else{nextOcclusionCheck=0;renderWorld();}
    });}
    const clock=new THREE.Clock();let lastPausedRender=-1,lastSceneRender=-1;
    function updateBenchPrompt(value){if(benchPromptRef.current!==value){benchPromptRef.current=value;setBenchPrompt(value);}}
    function render(){if(disposed)return;frame=requestAnimationFrame(render);const dt=Math.min(clock.getDelta(),.05),time=clock.elapsedTime;const s=state.current;
      // A covered scene must not compete with modal input or the foreground game.
      // Leave pending viewport changes intact so resuming draws the correct size.
      // Honor reduced motion while reading on CPU renderers; DOM input and
      // dialogue acknowledgement still use the browser's normal animation frames.
      renderer.domElement.dataset.readingPaused=String(quality.software&&reducedMotion.matches&&!!s.readingDialogue);
      if(s.renderSuspended||(quality.software&&reducedMotion.matches&&s.readingDialogue&&!viewport.needsDraw)){clearKeys();updateBenchPrompt('');return;}
      pollRing.visible=pollEdges.visible=!!callbacks.current.pollActive;pollOutlineMaterial.emissiveIntensity=1.5+Math.sin(time*3)*.5;
      const notice=pollNotice.current;if(notice){const point=pollBox.position.clone().add(new THREE.Vector3(0,1.9,0)).project(camera);notice.style.left=`${Math.max(90,Math.min(el.clientWidth-90,(point.x+1)*.5*el.clientWidth))}px`;notice.style.top=`${Math.max(50,(1-point.y)*.5*el.clientHeight)}px`;notice.style.visibility=pollBox.visible&&point.z>=-1&&point.z<=1&&['home','village'].includes(s.mode)&&!s.paused?'visible':'hidden';}
      lifeWorld.update(time,s.villageMembers,s.gardenData);if(!s.inputEnabled||s.mode!=='village')facilityDestination=null;
      if(!s.inputEnabled||!['home','village'].includes(s.mode)){groundDestination=null;walkMarker.visible=false;}
      if(s.paused){clearKeys();updateBenchPrompt('');if(viewport.needsDraw||time-lastPausedRender>(quality.software?.2:.1)){lastPausedRender=time;controls.update();constrainCameraPan();drawFrame();}return;}
      if(s.mode==='home'&&s.inputEnabled&&ownerId===s.viewerId&&Math.hypot(callbacks.current.movementInput?.current?.x||0,callbacks.current.movementInput?.current?.y||0)>.01)callbacks.current.onWalk?.();
      const lifeFocused=isLifeFocus(s.mode);
      const modeChanged=s.mode!==previousMode,focus=s.mode==='guestbook'?callbacks.current.guestbook:callbacks.current.sign,signPose=lifeFocused?callbacks.current.lifeObjectId:[focus.x,focus.z,focus.rotation].join(',');
      const detail=s.mode==='sign'||s.mode==='guestbook'||lifeFocused;
      const localEntry=remoteCharacters.get(s.viewerId),standingView=localEntry?.seatId?seatedReturnPose:null;
      if(localEntry?.seatId&&!localEntry.seatId.startsWith('fishing:')&&(s.mode!=='village'||!callbacks.current.benches.some(bench=>bench.id===localEntry.seatId)))stand(localEntry,!modeChanged);
      if(modeChanged||detail&&signPose!==previousSignPose){
        const leavingDetail=previousMode==='edit'||previousMode==='sign'||previousMode==='guestbook'||isLifeFocus(previousMode);
        if(modeChanged&&(s.mode==='edit'||detail)&&!leavingDetail)returnPose=standingView||cameraPose(camera,controls);
        const view=lifeFocused?lifeFocusView(s.mode,callbacks.current.lifeObjectId,camera.aspect,callbacks.current.village):s.mode==='guestbook'?guestbookCameraView(focus):s.mode==='sign'?signCameraView(focus):leavingDetail&&returnPose?returnPose:sceneView(s.mode,{portrait,petPreview,dragonRide:ownerAppearance.ride==='babyDragon',mood:mood.id});
        // Drain orbit damping before beginning the cinematic from the current view.
        controls.enableDamping=false;controls.update();controls.enableDamping=true;
        cameraTransition=startCameraTransition(camera,controls,view,reducedMotion.matches?0:1.1);
        previousMode=s.mode;previousSignPose=signPose;if(s.mode!=='village')heldKeys.clear();
      }
      if(wasChatActive&&!callbacks.current.chatActive){if(!modeChanged&&chatReturnPose)cameraTransition=startCameraTransition(camera,controls,chatReturnPose,reducedMotion.matches?0:.65);chatReturnPose=null;}
      wasChatActive=callbacks.current.chatActive;
      if(callbacks.current.chatFocusToken!==focusedToken){
        focusedToken=callbacks.current.chatFocusToken;
        if(callbacks.current.chatActive&&!detail){
          const host=remoteCharacters.get(ownerId)?.root||avatarRoot;
          if(!chatReturnPose)chatReturnPose=cameraPose(camera,controls);
          controls.enableDamping=false;controls.update();controls.enableDamping=true;
          cameraTransition=startCameraTransition(camera,controls,avatarChatView(host.position,host.rotation.y),reducedMotion.matches?0:.65);
        }
      }
      const editing=s.mode==='edit';controls.enabled=s.mode!=='topic'&&!detail&&!dragged&&!cameraTransition;controls.minDistance=detail?1:localEntry?.seatId||localEntry?.sitMotion.active?2.5:portrait||callbacks.current.chatActive?3:5;controls.maxDistance=portrait?26:editing?30:55;configureScenePanning(controls,s.mode,{portrait});
      if(cameraTransition&&lifeFocused){const view=lifeFocusView(s.mode,callbacks.current.lifeObjectId,camera.aspect,callbacks.current.village);cameraTransition.to.fromArray(view.position);cameraTransition.toTarget.fromArray(view.target);}
      if(cameraTransition&&advanceCameraTransition(cameraTransition,camera,controls,dt))cameraTransition=null;
      if(lifeFocused&&!cameraTransition){const view=lifeFocusView(s.mode,callbacks.current.lifeObjectId,camera.aspect,callbacks.current.village);camera.position.fromArray(view.position);controls.target.fromArray(view.target);}
      gridOpacity+=((editing?gridStyle.opacity:0)-gridOpacity)*Math.min(1,dt*6);grid.visible=gridOpacity>.002;grid.material.opacity=gridOpacity;
      controls.update();
      space?.update(time);
      renderer.domElement.dataset.starId=starId;renderer.domElement.dataset.platformColor='#'+platform.getObjectByName('platform-surface').material.color.getHexString();
      constrainCameraPan();
      const players=s.mode==='topic'&&callbacks.current.topicGuest?[{userId:callbacks.current.topicGuest.id,nickname:callbacks.current.topicGuest.nickname,actorKind:'AVATAR',appearance:callbacks.current.topicGuest.appearance,x:1.15,z:0,rotation:-Math.PI/2}]:villagePlayers(s.villageMembers,ownerId,s.viewerId,s.viewerNickname,appearance);
      avatarRoot.visible=s.mode==='topic'||showVillageStandIn(s.mode,ownerId,players,s.viewerId);
      avatarRoot.position.set(0,.39,0);avatarRoot.rotation.y=.55+Math.sin(time*.25)*.12;if(s.mode==='topic'){avatarRoot.position.x=-1.15;avatarRoot.rotation.y=Math.PI/2;}
      if(!s.inputEnabled||document.activeElement?.isContentEditable||document.activeElement?.closest?.('input,textarea,select,[role="textbox"]'))heldKeys.clear();
      if(characterAsset){
        const members=s.mode==='topic'||s.mode==='village'||ownerId===s.viewerId?players:[];
        const desired=new Set(members.map(m=>m.userId));
        for(const [id,entry] of remoteCharacters){if(!desired.has(id)){if(id===s.viewerId&&entry.seatId)stand(entry);world.remove(entry.root);disposeCharacter(entry.root);entry.mixer?.stopAllAction();entry.mixer?.uncacheRoot(entry.mixer.getRoot());remoteCharacters.delete(id);}}
        for(const member of members){
          let entry=remoteCharacters.get(member.userId);
          if(entry&&entry.root.userData.look!==JSON.stringify(member.appearance||appearance)){world.remove(entry.root);disposeCharacter(entry.root);entry.mixer?.stopAllAction();entry.mixer?.uncacheRoot(entry.mixer.getRoot());remoteCharacters.delete(member.userId);entry=null;}
          if(!entry){
            const character=(member.appearance||appearance).character||'pio';
            if(!['PET','MOUNT'].includes(member.actorKind)&&!characterAssets.has(character)){
              if(!pendingCharacters.has(character)){
                pendingCharacters.add(character);
                loadAsset(character).then(asset=>{if(!disposed)characterAssets.set(character,asset);}).catch(()=>{if(!disposed)setError('캐릭터를 불러오지 못했어요. 새로고침으로 다시 시도해주세요.');});
              }
              continue;
            }
            entry=buildRemote(member,characterAssets.get(character));if(member.userId===s.viewerId&&ownerId===s.viewerId&&s.mode!=='village'){entry.root.position.set(1.4,.39,2.7);entry.root.rotation.y=.4;}remoteCharacters.set(member.userId,entry);if(s.mode!=='topic'&&member.userId===s.viewerId&&!member.seatId?.startsWith('fishing:'))callbacks.current.onPositionChange?.({x:entry.root.position.x,z:entry.root.position.z,rotation:entry.root.rotation.y,moving:false,seatId:null});}
          const fishing=member.activityState==='Fishing',countKey=fishing?String(member.fishingCaught||0):null;
          if(entry.fishingCountKey!==countKey){
            if(entry.fishingCountTag){entry.root.remove(entry.fishingCountTag);entry.fishingCountTag.material.map?.dispose();entry.fishingCountTag.material.dispose();entry.fishingCountTag=null;}
            if(fishing){entry.fishingCountTag=addNameTag(entry.root,`🐟 ${member.fishingCaught||0}마리`);entry.fishingCountTag.position.y=3.4;}
            entry.fishingCountKey=countKey;
          }
          const caught=member.fishingCatch;
          if(caught&&entry.lastFishingCatch!==caught.id){
            entry.lastFishingCatch=caught.id;
            if(entry.catchEffect){entry.root.remove(entry.catchEffect);entry.catchEffect.material.map?.dispose();entry.catchEffect.material.dispose();}
            entry.catchEffect=addNameTag(entry.root,`✨ ${fishLabel(caught.itemId)} +1`);entry.catchEffectAt=performance.now();entry.catchEffect.position.y=3.9;
          }
          if(entry.catchEffect){const progress=(performance.now()-entry.catchEffectAt)/2400;entry.catchEffect.position.y=3.9+(reducedMotion.matches?0:progress*.9);entry.catchEffect.material.opacity=Math.max(0,1-progress);if(progress>=1){entry.root.remove(entry.catchEffect);entry.catchEffect.material.map?.dispose();entry.catchEffect.material.dispose();entry.catchEffect=null;}}
          entry.root.visible=true;
          if(['PET','MOUNT'].includes(member.actorKind))entry.root.userData.action=member.actorKind==='MOUNT'?`mount:${member.ownerId}`:`pet:${member.ownerId||member.userId}`;else if(member.userId===ownerId)entry.root.userData.action='avatar';
          if(entry.ride?.flight)entry.ride.dragon.root.userData.action=`mount:${member.userId}`;
          const previousX=entry.root.position.x,previousZ=entry.root.position.z;
          const local=member.userId===s.viewerId;
          const walkingToFish=local&&['Moving','Gardening','Cooking'].includes(member.activityState);
          if(walkingToFish){
            entry.exit=null;entry.seatId=null;
            if(s.inputEnabled&&(heldKeys.size||Math.hypot(callbacks.current.movementInput?.current?.x||0,callbacks.current.movementInput?.current?.y||0)>.1||jumpRequested||jumpInput?.current)){
              heldKeys.clear();jumpRequested=false;if(jumpInput)jumpInput.current=false;if(callbacks.current.movementInput)callbacks.current.movementInput.current={x:0,y:0};callbacks.current.onInteract?.('life:stop');
            }
          }
          const fishingAnchor=villageLife(callbacks.current.village).anchors.find(anchor=>anchor.id===member.seatId);
          if(local&&fishingAnchor){
            if(entry.seatId!==fishingAnchor.id){seatedReturnPose=cameraPose(camera,controls);if(s.mode==='village'&&callbacks.current.fishingDuel?.status!=='active')cameraTransition=startCameraTransition(camera,controls,fishingCameraView(fishingAnchor,camera.aspect),reducedMotion.matches?0:1.1);}
            entry.seatId=fishingAnchor.id;entry.seat=fishingAnchor;entry.exit=null;entry.jumpStarted=0;
            const walking=s.inputEnabled&&(heldKeys.size||Math.hypot(callbacks.current.movementInput?.current?.x||0,callbacks.current.movementInput?.current?.y||0)>.1||jumpRequested||jumpInput?.current);
            if(walking){heldKeys.clear();if(callbacks.current.movementInput)callbacks.current.movementInput.current={x:0,y:0};callbacks.current.onInteract?.('life:stop');}
          }else if(local&&entry.seatId?.startsWith('fishing:')){
            entry.seatId=null;entry.exit={x:member.x,z:member.z};
            if(seatedReturnPose&&s.mode==='village')cameraTransition=startCameraTransition(camera,controls,seatedReturnPose,reducedMotion.matches?0:1.1);seatedReturnPose=null;
          }
          if(!local){
            entry.seatId=member.seatId||null;
            if(entry.seatId)entry.seat=villageLife(callbacks.current.village).anchors.find(anchor=>anchor.id===entry.seatId)||callbacks.current.benches.find(bench=>bench.id===entry.seatId)||entry.seat;
          }
          if(entry.seatId){
            const bench=callbacks.current.benches.find(bench=>bench.id===entry.seatId);
            if(bench)entry.seat=bench;
            if(!entry.seat)entry.seatId=null;
          }
          const posing=!!entry.seatId||entry.sitMotion.active;
          if(posing){entry.ride?.update(0,false,false);entry.idleAction?.stop();entry.runMotion.update(0,false);}
          let jumped=false;
          if(member.userId!==s.viewerId||walkingToFish){entry.root.position.x+=(member.x-entry.root.position.x)*Math.min(1,dt*12);entry.root.position.z+=(member.z-entry.root.position.z)*Math.min(1,dt*12);entry.root.rotation.y+=Math.atan2(Math.sin((member.rotation||0)-entry.root.rotation.y),Math.cos((member.rotation||0)-entry.root.rotation.y))*Math.min(1,dt*12);}
          else{
            const active=s.inputEnabled&&!entry.seatId&&!entry.sitMotion.active&&(s.mode==='village'||ownerId===s.viewerId);
            if(active&&!entry.ride?.flight&&(jumpRequested||jumpInput?.current)&&(!entry.jumpStarted||Date.now()-entry.jumpStarted>=720)){entry.jumpStarted=Date.now();jumped=true;}
            jumpRequested=false;if(jumpInput)jumpInput.current=false;
            villageDirection(active?heldKeys:new Set(),camera,direction,active?(callbacks.current.movementInput?.current||{x:0,y:0}):{x:0,y:0});
            if(direction.lengthSq()||jumped){facilityDestination=null;groundDestination=null;walkMarker.visible=false;}
            if(!s.inputEnabled){groundDestination=null;walkMarker.visible=false;}
            if(active&&groundDestination){
              const next=villageTapStep(entry.root.position,groundDestination,entry.ride?(entry.ride.speed||MOTORCYCLE_SPEED):WALK_SPEED,dt);
              entry.root.position.x=next.x;entry.root.position.z=next.z;entry.root.rotation.y=next.rotation;
              if(next.arrived){groundDestination=null;walkMarker.visible=false;}
            }
            if(active&&facilityDestination){
              const target=lifeInteractionObjects(callbacks.current.village).find(item=>item.id===facilityDestination);
              if(!target)facilityDestination=null;
              else{
                const next=facilityStep(entry.root.position,target,entry.ride?(entry.ride.speed||MOTORCYCLE_SPEED):WALK_SPEED,dt);
                entry.root.position.x=next.x;entry.root.position.z=next.z;entry.root.rotation.y=next.rotation;
                if(next.arrived){const id=facilityDestination;facilityDestination=null;entry.moving=false;publishEntry(entry);callbacks.current.onInteract?.(id);}
              }
            }
            if(direction.lengthSq()){
              entry.root.position.addScaledVector(direction,(entry.ride?(entry.ride.speed||MOTORCYCLE_SPEED):WALK_SPEED)*dt);
              const radius=Math.hypot(entry.root.position.x,entry.root.position.z);
              if(radius>WALK_RADIUS){entry.root.position.x*=WALK_RADIUS/radius;entry.root.position.z*=WALK_RADIUS/radius;}
              entry.root.rotation.y=Math.atan2(direction.x,direction.z);
            }
          }
          if(local&&posing){
            const target=entry.seatId?entry.seat:entry.exit,approach=reducedMotion.matches?1:Math.min(1,dt*12);
            if(target){entry.root.position.x+=(target.x-entry.root.position.x)*approach;entry.root.position.z+=(target.z-entry.root.position.z)*approach;}
            if(entry.seatId)entry.root.rotation.y+=Math.atan2(Math.sin(entry.seat.rotation-entry.root.rotation.y),Math.cos(entry.seat.rotation-entry.root.rotation.y))*Math.min(1,dt*12);
          }
          if(posing)entry.ride?.update(dt,false,false,reducedMotion.matches);
          const dx=entry.root.position.x-previousX,dz=entry.root.position.z-previousZ;
          const moving=!posing&&(local?Math.hypot(dx,dz)>.0001:member.moving||Math.hypot(member.x-entry.root.position.x,member.z-entry.root.position.z)>.025);
          if(member.userId===s.viewerId&&!walkingToFish&&(jumped||(moving&&time-lastSent>.1)||(!moving&&entry.moving))){lastSent=time;callbacks.current.onPositionChange?.({x:entry.root.position.x,z:entry.root.position.z,rotation:entry.root.rotation.y,moving,jumpStarted:entry.jumpStarted||0,seatId:entry.seatId||null});}
          if(moving!==entry.moving){
            if(moving)entry.idleAction?.stop();
            else if(!posing){entry.runMotion.update(0,false);entry.idleAction?.reset().play();}
            entry.moving=moving;
          }
          if(entry.pet){entry.pet.setInteraction(member.interaction);entry.pet.runMotion.update(time,moving,reducedMotion.matches);}
          if(posing){
            const offset=entry.sitMotion.update(dt,!!entry.seatId,entry.seat?.height,reducedMotion.matches);
            entry.root.position.y=.39+offset;
            if(!entry.sitMotion.active&&!entry.seatId){entry.idleAction?.reset().play();if(local&&entry.exit){entry.root.position.x=entry.exit.x;entry.root.position.z=entry.exit.z;entry.exit=null;publishEntry(entry);}}
          }else if(entry.ride){
            entry.idleAction?.stop();entry.root.position.y=.39+(entry.ride.height||0)+(entry.ride.flight?0:villageJumpHeight(local?entry.jumpStarted:member.jumpStarted));
            entry.ride.update(dt,moving,true,reducedMotion.matches,dt>0?Math.hypot(dx,dz)/dt:0);
          }else{
            entry.mixer?.update(dt);
            entry.root.position.y=.39+(entry.pet?.flight?DRAGON_FLIGHT_HEIGHT+entry.pet.runMotion.update(time,moving,reducedMotion.matches):(moving?entry.runMotion.update(time,true,reducedMotion.matches):0))+villageJumpHeight(local?entry.jumpStarted:member.jumpStarted);
          }
          entry.fishingMotion?.update(time,posing&&fishing,reducedMotion.matches,!!member.fishingCatch&&Date.now()-member.fishingCatch.at<1200);
        }
      }
      const duel=callbacks.current.fishingDuel;
      const fishingLabel=sceneryRoots.get('scenery:life-fishing')?.getObjectByName('facility-label');if(fishingLabel)fishingLabel.visible=duel?.status!=='active';
      if(s.mode==='village'&&duel?.status==='active'&&duel.villageId===ownerId&&duel.id!==focusedDuel){
        const pair=duel.players.map(p=>s.villageMembers.find(m=>m.userId===p.userId)).filter(Boolean);
        if(pair.length===2&&pair.every(p=>p.activityState==='Fishing')){cameraTransition=startCameraTransition(camera,controls,fishingDuelView(pair,camera.aspect),reducedMotion.matches?0:1.1);focusedDuel=duel.id;}
      }
      if(duel?.status!=='active')focusedDuel=null;
      const player=remoteCharacters.get(s.viewerId);
      const pet=s.villageMembers.find(member=>member.actorKind==='PET'&&member.ownerId===s.viewerId);
      const dragon=s.villageMembers.find(member=>member.actorKind==='MOUNT'&&member.ownerId===s.viewerId);
      const nextMountPrompt=player&&!player.seatId&&!player.sitMotion.active?(player.ride?.flight?'dismount':dragon&&Math.hypot(player.root.position.x-dragon.x,player.root.position.z-dragon.z)<=2.6?'mount':''):'';
      if(nextMountPrompt!==mountPromptRef.current){mountPromptRef.current=nextMountPrompt;setMountPrompt(nextMountPrompt);}
      const near=!!(player&&pet&&Math.hypot(player.root.position.x-pet.x,player.root.position.z-pet.z)<=2.6);
      if(near!==petPromptRef.current){petPromptRef.current=near;setPetNearby(near);}


      const interaction=starId==='fishing'&&s.mode==='village'&&s.inputEnabled&&!s.paused&&player&&!player.seatId&&!player.sitMotion.active&&!villageJumpHeight(player.jumpStarted)?nearestLifeInteraction(player.root.position,s.villageMembers,s.viewerId,callbacks.current.village):null;
      const nextPrompt=interaction&&!isClickFacility(interaction.id)?interaction.id:'';
      if(lifePromptRef.current!==nextPrompt){lifePromptRef.current=nextPrompt;setLifePrompt(nextPrompt);}
      const benchAvailable=s.mode==='village'&&s.inputEnabled&&!s.paused&&player;
      updateBenchPrompt(benchAvailable&&!player.seatId?.startsWith('fishing:')?(player.seatId?'stand':!player.sitMotion.active&&!villageJumpHeight(player.jumpStarted)&&nearestBench(callbacks.current.benches,player.root.position,s.villageMembers,s.viewerId)?'sit':''):'');
      if(hostPet){hostPet.setInteraction(null);hostPet.runMotion.update(time,false,reducedMotion.matches);}
      if(hostRide){avatarRoot.position.y=.39+(hostRide.height||0);action?.stop();hostRide.update(dt,false,true,reducedMotion.matches);}
      else if(mixer){mixer.update(dt);if(action)action.timeScale=1;}

      particles.rotation.y=time*.018;particles.position.y=Math.sin(time*.3)*.3;flame.scale.set(1+Math.sin(time*8)*.12,1+Math.sin(time*11)*.1,1);flameLight.intensity=3+Math.sin(time*9)*.5;
      fireCore.scale.y=1+Math.sin(time*13)*.17;embers.forEach((ember,i)=>{ember.position.y=.55+((time*.6+i/14)%1)*1.4;ember.position.x=Math.sin(time*2+i*2.4)*.23;ember.scale.setScalar(1-(ember.position.y-.55)/1.7);});
      if(sceneFrameDue(quality.software,lastSceneRender,time,viewport.needsDraw)){lastSceneRender=time;drawFrame();}
    }render();
    return()=>{const local=remoteCharacters.get(state.current?.viewerId);if(local?.seatId&&!local.seatId.startsWith('fishing:'))stand(local,false);if(dioramaRef)dioramaRef.current=null;space?.dispose();disposeObject(platform);facilityOutline.dispose();disposeObject(lifeWorld.root);lifeToggle.current=null;lifePromptRef.current='';setLifePrompt('');benchToggle.current=null;benchPromptRef.current='';setBenchPrompt('');if(captureRef)captureRef.current=null;disposed=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',clearKeys);document.removeEventListener('visibilitychange',visibilityChanged);disposeObject(decorationRoot);disposeObject(signRoot);disposeObject(previewRoot);gardenDetailParts.forEach(disposeObject);disposeObject(gardenDetails);disposeObject(cafeTables);for(const [id,root] of sceneryRoots){if(id.includes('table-'))disposeObject(root);}grid.geometry.dispose();grid.material.dispose();disposeCharacter(avatarRoot);remoteCharacters.forEach(({root,mixer:remoteMixer})=>{world.remove(root);disposeCharacter(root);remoteMixer?.stopAllAction();remoteMixer?.uncacheRoot(remoteMixer.getRoot());});for(const [name,handler] of Object.entries(pointerEvents))renderer.domElement.removeEventListener(name,handler);mixer?.stopAllAction();mixer?.uncacheRoot(mixer.getRoot());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());sun.dispose();renderer.renderLists.dispose();renderer.domElement.remove();state.current=null;worldRef.current=null;};
  },[starId,theme,sceneType,portrait,petPreview,ownerId,ownerNickname,JSON.stringify(ownerAppearance),JSON.stringify(appearance),village.theme]);
  useEffect(()=>{const scene=worldRef.current;if(scene){setPlatformColor(scene.platform,platformColor(village));Object.assign(scene.gridStyle,editorGridStyle({...sceneMood(village.theme),ground:platformColor(village)}));scene.grid.material.color.setHex(scene.gridStyle.color);}},[village.platformColor,starId,village.theme]);
  useEffect(()=>{
    const scene=worldRef.current;if(!scene||!editor?.onThumbnails)return;
    const book=createVillageGuestbook({x:0,z:0,rotation:0});
    const board=createChalkboard({x:0,z:0,rotation:0});
    try{editor.onThumbnails(modelThumbnails([...scene.sceneryRoots,[GUESTBOOK_ID,book],[CHALKBOARD_ID,board],[POLLBOX_ID,scene.pollBox]]));}
    catch{editor.onThumbnails(null);}
    finally{disposeObject(book);disposeObject(board);}
  },[editor?.onThumbnails,village.theme,theme,sceneType,portrait,petPreview,ownerId,ownerNickname,JSON.stringify(ownerAppearance),JSON.stringify(appearance)]);
  useEffect(()=>{
    const scene=worldRef.current;if(!scene)return;
    for(const item of villageScenery(village)){
      const root=scene.sceneryRoots.get(item.id);if(!root)continue;
      root.visible=(starId!=='fishing'||!['scenery:cafe','scenery:central-stage','scenery:pond'].includes(item.id))&&(starId!=='fishing'||isLifeScenery(item.id)||Math.hypot(item.x,(item.z-4.8)/.62)>3.4)&&(item.id!=='scenery:life-fishing'||starId==='fishing')&&!item.hidden&&(isLifeScenery(item.id)||isPinkPebble(item.id)||/^scenery:(central-stage|stage-stone-|path-stone-)/.test(item.id)||!inLifeArea(item.x,item.z,village));root.position.set(item.x,0,item.z);root.rotation.y=item.rotation*Math.PI/2;
    }
  },[starId,JSON.stringify(village.scenery),village.theme,theme,sceneType,portrait,petPreview,ownerId,ownerNickname,JSON.stringify(ownerAppearance),JSON.stringify(appearance)]);
  useEffect(()=>{
    const scene=worldRef.current;if(!scene)return;
    const {decorationRoot}=scene;
    disposeObject(decorationRoot);decorationRoot.clear();
    for(const item of (village.items||[]).filter(item=>!item.hidden)){const model=createDecoration(item.type);model.userData.itemId=item.id;model.position.set(item.x,.15,item.z);model.rotation.y=item.rotation*Math.PI/2;decorationRoot.add(model);}
  },[starId,JSON.stringify(village.scenery),JSON.stringify(village.items),village.theme,theme,sceneType,portrait,petPreview,ownerId,ownerNickname,JSON.stringify(ownerAppearance),JSON.stringify(appearance)]);
  useEffect(()=>{
    const scene=worldRef.current;if(!scene)return;
    disposeObject(scene.signRoot);scene.signRoot.clear();
    const model=createVillageSign(villageSign(village));model.userData.itemId=SIGN_ID;if(!signData.hidden)scene.signRoot.add(model);else disposeObject(model);
    const poll=community.find(item=>item.id===POLLBOX_ID);scene.pollBox.position.set(poll.x,.16,poll.z);scene.pollBox.rotation.y=poll.rotation*Math.PI/2;scene.pollBox.visible=!poll.hidden;
    const board=community.find(item=>item.id===CHALKBOARD_ID);if(!board.hidden){const model=createChalkboard(board,chalkStrokes);model.userData.itemId=CHALKBOARD_ID;scene.signRoot.add(model);}
    const book=createVillageGuestbook(villageGuestbook(village));book.userData.itemId=GUESTBOOK_ID;if(!guestbookData.hidden)scene.signRoot.add(book);else disposeObject(book);
  },[starId,signKey,guestbookKey,communityKey,JSON.stringify(chalkStrokes),village.theme,theme,sceneType,portrait,petPreview,ownerId,ownerNickname,JSON.stringify(ownerAppearance),JSON.stringify(appearance)]);
  useEffect(()=>{
    const scene=worldRef.current;if(!scene)return;
    const {previewRoot}=scene;
    disposeObject(previewRoot);previewRoot.clear();
    if(!editor)return;
    const chosen=[...villageScenery(village),...(village.items||[]),signPlacementItem(villageSign(village)),guestbookPlacementItem(villageGuestbook(village)),...community].find(item=>item.id===editor.selected),type=chosen?.type||editor.tool;
    if(!type)return;
    const preview=new THREE.Group();preview.position.set(chosen?.x||0,.17,chosen?.z||0);preview.visible=!!chosen;
    const sample=isScenery(chosen?.id)?new THREE.Mesh(new THREE.BoxGeometry(1.4,.1,1.4),new THREE.MeshBasicMaterial()):type==='chalkboard'?createChalkboard({x:0,z:0,rotation:0}):type==='pollbox'?new THREE.Mesh(new THREE.BoxGeometry(.91,1.3,.81),new THREE.MeshBasicMaterial()):type==='villageGuestbook'?createVillageGuestbook({x:0,z:0,rotation:0}):type==='villageSign'?createVillageSign({...villageSign(village),x:0,z:0,rotation:0}):createDecoration(type);sample.rotation.y=(chosen?.rotation??editor.rotation??0)*Math.PI/2;
    const bounds=new THREE.Box3().setFromObject(isScenery(chosen?.id)?scene.sceneryRoots.get(chosen.id):sample),size=bounds.getSize(new THREE.Vector3());
    const w=Math.max(.425,(size.x+.15)*.5),d=Math.max(.425,(size.z+.15)*.5);
    if(!chosen){sample.traverse(o=>{if(o.isMesh){o.material.transparent=true;o.material.opacity=.55;o.castShadow=false;}});preview.add(sample);}else disposeObject(sample);
    const color=0x72f0aa,lineMat=new THREE.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.95});
    const outline=new THREE.BoxGeometry(w,.07,d),edges=new THREE.LineSegments(new THREE.EdgesGeometry(outline),lineMat);outline.dispose();edges.position.y=.06;edges.renderOrder=20;preview.add(edges);
    const base=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.15,depthWrite:false,side:THREE.DoubleSide}));base.rotation.x=-Math.PI/2;base.position.y=.025;preview.add(base);
    for(const [x,z] of [[1,0],[-1,0],[0,1],[0,-1]]){const arrow=new THREE.ArrowHelper(new THREE.Vector3(x,0,z),new THREE.Vector3(x*w*.5,.1,z*d*.5),.42,color,.16,.13);arrow.line.material.depthTest=false;arrow.cone.material.depthTest=false;arrow.renderOrder=21;preview.add(arrow);}
    preview.userData.tint=valid=>{lineMat.color.setHex(valid?color:0xff8394);base.material.color.copy(lineMat.color);};
    previewRoot.add(preview);
  },[starId,JSON.stringify(village.scenery),JSON.stringify(village.items),village.theme,theme,sceneType,portrait,petPreview,ownerId,ownerNickname,JSON.stringify(ownerAppearance),JSON.stringify(appearance),JSON.stringify(village.sign),guestbookKey,communityKey,!!editor,editor?.selected,editor?.tool,editor?.rotation]);
  useEffect(()=>{
    const scene=worldRef.current,action=editor?.cameraAction;if(!scene||!action)return;
    const {camera,controls}=scene;
    scene.cancelCameraTransition();
    if(action.type==='reset'){camera.position.set(1,17,12.5);controls.target.set(0,.1,0);}
    else{const offset=camera.position.clone().sub(controls.target),distance=THREE.MathUtils.clamp(offset.length()*(action.type==='in'?.8:1.25),controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(offset.setLength(distance));}
    controls.update();
  },[editor?.cameraAction]);
  return <div className="scene-wrap">{avatarSelected&&!chatActive&&!paused&&['home','village','chat'].includes(mode)&&<button ref={avatarPrompt} className="avatar-chat-prompt" onClick={()=>onInteract?.('avatar:chat')}><span aria-hidden="true"><MessageCircle size={20}/></span>대화하기</button>}{pollActive&&<button ref={pollNotice} className="poll-world-notice" onClick={onPollClick}>🗳️ 투표가 있습니다</button>}{villageSpeech.map(line=><div key={line.id} ref={node=>{if(node)speechNodes.current.set(line.id,node);else speechNodes.current.delete(line.id);}} className={"village-speech "+line.role} role="status"><strong>{line.speaker} · {line.role==='user'?'질문':'AI 답변'}</strong><p>{line.text}</p></div>)}{questionPending&&!paused&&!isLifeFocus(mode)&&mode!=='edit'&&<button ref={questionBubble} className="avatar-question-notice" onClick={onQuestionClick} aria-label="도착한 아바타 질문 보기"><b>!</b><span>질문이 도착했어요</span></button>}{mountPrompt&&inputEnabled&&!paused&&(mode==='home'||mode==='village')&&<div className="dragon-mount-prompt"><button type="button" onClick={()=>onInteract?.('mount:toggle')}><kbd>F</kbd> {mountPrompt==='dismount'?'아기용에서 내리기':'아기용 타고 비행'}</button></div>}<div className="scene-canvas" ref={mount}/><div className="scene-vignette"/>{lifePrompt&&mode==='village'&&inputEnabled&&!paused&&<div className="life-prompt"><button onClick={()=>lifeToggle.current?.(lifePrompt)}><kbd>E</kbd>{lifePrompt==='storage'?'보관함 열기':lifePrompt==='kitchen'?'요리하기':lifePrompt.startsWith('garden:')?'텃밭 살펴보기':'낚시하기'}</button></div>}{benchPrompt&&mode==='village'&&inputEnabled&&!paused&&<div className={'bench-prompt'+(benchPrompt==='stand'?' is-seated':'')} aria-live="polite"><button type="button" onClick={()=>benchToggle.current?.()}><kbd>C</kbd><span>{benchPrompt==='stand'?'일어나기':'눌러 앉기'}</span></button>{benchPrompt==='stand'&&<small>드래그로 둘러보기 · 휠로 거리 조절</small>}</div>}{mode==='topic'&&topicLine&&<div ref={topicBubble} className="topic-speech" role="status" aria-live="polite" key={topicLine.speakerId+topicLine.text}><strong>{topicLine.speaker} · AI</strong><p>{topicLine.text}</p></div>}{loading&&<div className="scene-loading"><span className="spinner"/>별빛을 모으는 중…</div>}{error&&<div className="scene-error">{error}</div>}</div>;
}
