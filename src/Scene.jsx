import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {loadAsset} from './avatar';
import {createRunMotion} from './avatarMotion.mjs';
import {villageDirection,villageMovementKey,villagePlayers,showVillageStandIn,villageJumpHeight} from './villageMovement.mjs';
import {villageThemes} from '../shared/world.mjs';
import {createDecoration,dressAvatar,disposeObject} from './worldAssets';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const themes={sage:{accent:0xc2ddec,flowers:0xe4d4ec},rose:{accent:0xdfc7e1,flowers:0xf5dbe5},ocean:{accent:0xbddded,flowers:0xd3d2f1},sunset:{accent:0xe8d7c5,flowers:0xeed2d9}};

export default function Scene({captureRef,movementInput,jumpInput,mode='home',theme='sage',emotion='calm',sceneType='garden',onInteract,onReady,villageMembers=[],viewerId,viewerNickname,onPositionChange,ownerId,ownerNickname,appearance={},ownerAppearance={},village={items:[]},inputEnabled=true,portrait=false,paused=false}){
  const mount=useRef(),rendererRef=useRef();const callbacks=useRef({onInteract,onReady,onPositionChange,movementInput});callbacks.current={onInteract,onReady,onPositionChange,movementInput};
  const state=useRef();const [error,setError]=useState('');const [loading,setLoading]=useState(true);
  useEffect(()=>{if(state.current){state.current.mode=mode;state.current.emotion=emotion;state.current.villageMembers=villageMembers;state.current.viewerId=viewerId;state.current.viewerNickname=viewerNickname;state.current.inputEnabled=inputEnabled;state.current.paused=paused;}},[mode,emotion,villageMembers,viewerId,viewerNickname,inputEnabled,paused]);
  // Keep one WebGL context for this mounted scene, including all look previews.
  useEffect(()=>()=>{
    const renderer=rendererRef.current;rendererRef.current=null;
    if(renderer){renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}
  },[]);
  useEffect(()=>{
    const el=mount.current;if(!el)return;let disposed=false;let frame;setLoading(true);setError('');
    const palette=themes[theme]||themes.sage;
    const mood=villageThemes.find(t=>t.id===village.theme)||villageThemes[0];
    let renderer;try{renderer=rendererRef.current??new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});rendererRef.current=renderer;}catch{setError('3D 화면을 시작할 수 없어요. 브라우저의 하드웨어 가속을 켜주세요.');setLoading(false);return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;el.appendChild(renderer.domElement);
    const world=new THREE.Scene();world.background=new THREE.Color(mood.sky);world.fog=new THREE.FogExp2(mood.sky,.021);
    const camera=new THREE.PerspectiveCamera(38,1,.1,120);camera.position.set(...(portrait?[0,1.65,5.4]:mood.id==='cafe'?[1,4.5,9]:[4.7,3.25,8]));
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.enableZoom=true;controls.minDistance=portrait?3:5;controls.maxDistance=26;controls.minPolarAngle=.18;controls.maxPolarAngle=Math.PI*.49;controls.target.set(...(portrait?[0,1.65,0]:mood.id==='cafe'?[-1.9,1,0]:[0,1.45,0]));
    world.add(new THREE.HemisphereLight(mood.sky,0xabc0d0,mood.ambient));
    const sun=new THREE.DirectionalLight(0xfff3e6,2.8);sun.position.set(-5,12,7);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:1,far:40});sun.shadow.normalBias=.025;sun.shadow.intensity=.55;world.add(sun);
    const rim=new THREE.DirectionalLight(0xcce5ff,1.5);rim.position.set(5,6,-5);world.add(rim);
    sun.color.setHex(mood.light);sun.intensity=mood.intensity;
    const materials=[];const geometries=[];
    const mat=(color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.85,...extra});materials.push(m);return m;};
    const green=mat(mood.ground),earth=mat(0xb2cbdc),stone=mat(0xd5e5ee),bark=mat(0xbba995),leaf=mat(palette.accent),petal=mat(palette.flowers),cream=mat(0xfff7ee),wood=mat(0xb79984),roof=mat(0xa3c4dc),glow=mat(0xffe7b9,{emissive:0xffd6a1,emissiveIntensity:.45});
    function mesh(geometry,material,x=0,y=0,z=0,parent=world){geometries.push(geometry);const o=new THREE.Mesh(geometry,material);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
    function box(w,h,d,m,x,y,z,parent){return mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z,parent);}
    function ball(r,m,x,y,z,parent){return mesh(new THREE.SphereGeometry(r,24,16),m,x,y,z,parent);}
    function cyl(rt,rb,h,m,x,y,z,parent){return mesh(new THREE.CylinderGeometry(rt,rb,h,64),m,x,y,z,parent);}
    cyl(7,6.5,.7,earth,0,-.5,0);cyl(6.95,7,.22,stone,0,-.12,0);cyl(6.78,6.87,.22,green,0,.03,0);
    const underRing=mesh(new THREE.TorusGeometry(6.45,.035,8,120),mat(0x8cceb8,{emissive:0x5aaf9d,emissiveIntensity:2}),0,-.5,0);underRing.rotation.x=Math.PI/2;
    // Circular stone stage and illuminated perimeter.
    cyl(2.1,2.2,.22,stone,0,.23,0);cyl(1.95,1.95,.03,mat(0xf2f7fc),0,.36,0);
    const stageRing=mesh(new THREE.TorusGeometry(2.05,.025,8,100),mat(0xc9e3ae,{emissive:0xa9d988,emissiveIntensity:.65}),0,.38,0);stageRing.rotation.x=Math.PI/2;
    for(let i=0;i<12;i++){const a=i*Math.PI/6;const tile=box(.55,.08,.48,stone,Math.sin(a)*2.5,.18,Math.cos(a)*2.5);tile.rotation.y=a;}
    for(let i=0;i<6;i++){const x=-.25+Math.sin(i)*.13;box(.88,.08,.48,stone,x,.17,2.9+i*.5);}
    function tree(x,z,size=1,blossom=false){const g=new THREE.Group();g.position.set(x,.12,z);world.add(g);cyl(.12,.2,1.8,bark,0,.9,0,g);const branch=cyl(.06,.09,.9,bark,.25,1.55,0,g);branch.rotation.z=-.5;for(const [a,b,c,r] of [[0,2,0,.85],[-.6,1.8,.2,.65],[.6,2.1,.1,.7],[0,2.4,-.3,.65]])ball(r,blossom?petal:leaf,a,b,c,g);g.scale.setScalar(size);return g;}
    tree(-3.7,-2.4,1.25,true);tree(3.8,-2.7,1.3);tree(-5,1.5,1.05);tree(4.8,1.3,.95,true);tree(1,-5.1,1.05);tree(-2,-5.2,.9);
    for(let i=0;i<17;i++){const a=i*2.39996;const r=4.6+Math.sin(i*4)*.8;if(i%5===0)continue;ball(.45,leaf,Math.cos(a)*r,.33,Math.sin(a)*r).scale.set(1.5,.7,1);}
    // A miniature cafe: glass windows, striped awning, counter and outdoor tables.
    const cafe=new THREE.Group();cafe.position.set(-3.65,.15,-.2);cafe.rotation.y=.4;world.add(cafe);cafe.userData.action='cafe';
    box(2.3,1.55,1.8,cream,0,.78,0,cafe);box(2.55,.22,2.05,roof,0,1.64,0,cafe);
    const roofTop=mesh(new THREE.ConeGeometry(1.85,.8,4),roof,0,2.12,0,cafe);roofTop.rotation.y=Math.PI/4;roofTop.scale.z=.88;
    box(.55,1.25,.05,wood,.65,.68, .93,cafe);box(.37,.75,.06,glow,.65,.9,.97,cafe);box(1.05,.72,.05,glow,-.35,.92,.93,cafe);
    box(1.25,.08,.08,wood,-.35,.9,.97,cafe);box(.08,.84,.08,wood,-.35,.92,.97,cafe);
    for(let i=0;i<7;i++){const aw=box(.3,.07,.7,i%2?cream:leaf,-.9+i*.3,1.5,1.2,cafe);aw.rotation.x=.2;}
    box(1.2,.28,.07,wood,0,1.94,1,cafe);box(.9,.06,.08,glow,0,1.94,1.05,cafe);
    for(const [x,z] of [[-2.7,2],[-4.3,2.1]]){cyl(.48,.48,.08,wood,x,.8,z);cyl(.055,.09,.7,wood,x,.4,z);for(let i=0;i<2;i++){cyl(.2,.2,.08,cream,x+(i?-.65:.65),.48,z);cyl(.04,.06,.4,wood,x+(i?-.65:.65),.24,z);}cyl(.08,.06,.13,cream,x,.92,z);}
    // Pond with water highlights and stepping stones.
    const water=mat(0xa8d6ed,{metalness:.3,roughness:.17,transparent:true,opacity:.88});const pond=cyl(1.22,1.25,.06,water,3.35,.18,1.2);pond.scale.z=1.45;
    const pondRing=mesh(new THREE.TorusGeometry(1.26,.1,8,64),stone,3.35,.17,1.2);pondRing.rotation.x=Math.PI/2;pondRing.scale.y=1.45;
    for(let i=0;i<4;i++){const lily=cyl(.18,.18,.02,leaf,3.1+Math.sin(i*3)*.7,.23,1+Math.cos(i*2)*.9);if(i%2===0)ball(.09,petal,lily.position.x,.3,lily.position.z);}
    // Campfire and benches.
    const fireGroup=new THREE.Group();fireGroup.position.set(...(mood.id==='campfire'?[1.2,.39,.8]:[2.1,.13,-3.5]));fireGroup.userData.action='campfire';world.add(fireGroup);
    for(let i=0;i<8;i++){const a=i*Math.PI/4;ball(.16,stone,Math.sin(a)*.5,.12,Math.cos(a)*.5,fireGroup);}for(let i=0;i<3;i++){const log=cyl(.08,.08,.75,bark,0,.16,0,fireGroup);log.rotation.z=Math.PI/2;log.rotation.y=i*1.1;}
    const flame=mesh(new THREE.ConeGeometry(.2,.65,7),glow,0,.47,0,fireGroup);const flameLight=new THREE.PointLight(0xffc075,3,5);flameLight.position.copy(fireGroup.position).add(new THREE.Vector3(0,.9,0));world.add(flameLight);
    const night=['campfire','twilight'].includes(mood.id);
    const fireMat=mat(0xff9c37,{emissive:0xff6c20,emissiveIntensity:2,transparent:true,opacity:.85});
    const fireCore=mesh(new THREE.ConeGeometry(.13,.5,8),fireMat,.05,.43,0,fireGroup);
    const embers=Array.from({length:14},(_,i)=>ball(.018,fireMat,Math.sin(i*2.4)*.22,.6+(i/14)*1.1,Math.cos(i*2.4)*.22,fireGroup));
    let moon;
    if(night){
      moon=ball(.62,mat(0xffefce,{emissive:0xffe3b2,emissiveIntensity:1.5}),-4,5,-6);moon.castShadow=false;
      const starMaterial=mat(0xfff3cf,{emissive:0xffefbd,emissiveIntensity:2});
      for(let i=0;i<55;i++){const a=i*2.39996;ball(.025+(i%3)*.012,starMaterial,Math.sin(a)*14,5+(i%11)*.45,Math.cos(a)*14);}
    }
    for(let i=0;i<2;i++){const bench=box(1,.14,.4,wood,2.1+(i?-.9:.9),.4,-2.6);bench.rotation.y=i?-.5:.5;}
    for(const [x,z] of [[-1.4,3.4],[1.4,3.4],[-5,-2],[4,-1.3]]){cyl(.035,.06,1.65,bark,x,.95,z);box(.22,.34,.22,glow,x,1.9,z);box(.32,.06,.32,roof,x,2.1,z);const l=new THREE.PointLight(0xffd79d,1.5,4);l.position.set(x,1.8,z);world.add(l);}
    function placeMoon(){if(moon){moon.position.set(-.85,.75,.995).unproject(camera).sub(camera.position).normalize().multiplyScalar(40).add(camera.position);}}
    // Seeded planting keeps the island stable between views.
    let seed=42;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
    const flowerGeo=new THREE.IcosahedronGeometry(.045,0);geometries.push(flowerGeo);const flowers=new THREE.InstancedMesh(flowerGeo,petal,230);const dummy=new THREE.Object3D();let n=0;for(let i=0;i<600&&n<230;i++){const x=(rand()-.5)*12,z=(rand()-.5)*12;if(x*x+z*z>40||x*x+z*z<8||Math.abs(x)<.8&&z>0||x<-2&&z<1||x>2&&z<3)continue;dummy.position.set(x,.2+rand()*.16,z);dummy.scale.setScalar(.7+rand());dummy.updateMatrix();flowers.setMatrixAt(n++,dummy.matrix);}flowers.count=n;world.add(flowers);
    const particleGeo=new THREE.BufferGeometry();const positions=new Float32Array(90*3);for(let i=0;i<90;i++){positions[i*3]=(rand()-.5)*20;positions[i*3+1]=rand()*8;positions[i*3+2]=(rand()-.5)*18;}particleGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));geometries.push(particleGeo);const particleMat=new THREE.PointsMaterial({color:0xf8e7ba,size:.045,transparent:true,opacity:.65,depthWrite:false});materials.push(particleMat);const particles=new THREE.Points(particleGeo,particleMat);world.add(particles);
    const avatarRoot=new THREE.Group();avatarRoot.position.set(0,.39,0);avatarRoot.userData.action='avatar';world.add(avatarRoot);let mixer,action,characterAsset,hostTag;const remoteCharacters=new Map(),characterAssets=new Map(),pendingCharacters=new Set();
    function addNameTag(parent,name){
      const label=String(name||'이웃').slice(0,20),canvas=document.createElement('canvas');
      const ctx=canvas.getContext('2d');ctx.font='600 30px sans-serif';
      canvas.width=Math.min(768,Math.max(100,Math.ceil(ctx.measureText(label).width)+32));canvas.height=80;
      ctx.font='600 30px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.shadowColor='rgba(255,255,255,.95)';ctx.shadowBlur=12;ctx.fillStyle='#284f7d';
      ctx.fillText(label,canvas.width/2,40,canvas.width-24);
      const texture=new THREE.CanvasTexture(canvas);
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,toneMapped:false}));
      sprite.scale.set(canvas.width/200,.4,1);sprite.position.y=2.95;parent.add(sprite);return sprite;
    }
    function disposeCharacter(root){root.traverse(o=>{if(o.isSprite){o.material.map?.dispose();o.material.dispose();}if(o.userData.generated)disposeObject(o);});}
    function buildRemote(member,asset){const root=new THREE.Group();root.position.set(member.x??0,.39,member.z??0);root.rotation.y=member.rotation||0;const avatar=clone(asset);const bounds=new THREE.Box3().setFromObject(avatar);const size=bounds.getSize(new THREE.Vector3());avatar.scale.setScalar(2.65/Math.max(size.y,.001));const b=new THREE.Box3().setFromObject(avatar);const center=b.getCenter(new THREE.Vector3());avatar.position.set(-center.x,-b.min.y,-center.z);root.add(avatar);dressAvatar(avatar,member.appearance||appearance);addNameTag(root,member.nickname);root.userData.look=JSON.stringify(member.appearance||appearance);const runMotion=createRunMotion(avatar);let mixer,idleAction;if(asset.animations.length){mixer=new THREE.AnimationMixer(avatar);idleAction=mixer.clipAction(asset.animations[0]);idleAction.play();idleAction.timeScale=.45;}world.add(root);return{root,mixer,idleAction,runMotion,moving:false};}
    loadAsset(ownerAppearance.character).then(asset=>{if(disposed)return;characterAsset=asset;characterAssets.set(ownerAppearance.character||'pio',asset);const avatar=clone(asset);const bounds=new THREE.Box3().setFromObject(avatar);const size=bounds.getSize(new THREE.Vector3());const scale=2.65/Math.max(size.y,.001);avatar.scale.setScalar(scale);const b=new THREE.Box3().setFromObject(avatar);const center=b.getCenter(new THREE.Vector3());avatar.position.set(-center.x,-b.min.y,-center.z);avatarRoot.add(avatar);dressAvatar(avatar,ownerAppearance);hostTag=addNameTag(avatarRoot,ownerNickname||viewerNickname||'피오');if(asset.animations.length){mixer=new THREE.AnimationMixer(avatar);action=mixer.clipAction(asset.animations[0]);action.play();action.timeScale=.55;}setLoading(false);if(captureRef)captureRef.current=()=>{placeMoon();renderer.render(world,camera);return renderer.domElement.toDataURL('image/png');};callbacks.current.onReady?.();}).catch(()=>{if(!disposed){setError('캐릭터를 불러오지 못했어요. 새로고침으로 다시 시도해주세요.');setLoading(false);}});
    const decorationRoot=new THREE.Group();world.add(decorationRoot);
    for(const item of village.items||[]){const model=createDecoration(item.type);model.position.set(item.x,.15,item.z);model.rotation.y=item.rotation*Math.PI/2;decorationRoot.add(model);}
    const raycaster=new THREE.Raycaster();let pointerDown;
    function down(e){pointerDown={x:e.clientX,y:e.clientY};}
    function click(e){if(!pointerDown||Math.hypot(pointerDown.x-e.clientX,pointerDown.y-e.clientY)>6)return;const rect=el.getBoundingClientRect();const p=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(p,camera);for(const hit of raycaster.intersectObjects(world.children,true)){let obj=hit.object;while(obj){if(!obj.visible)break;if(obj.userData.action){callbacks.current.onInteract?.(obj.userData.action);return;}obj=obj.parent;}}}
    renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',click);
    let previousMode;let transitioning=true;let transitionTarget=new THREE.Vector3();let transitionLook=new THREE.Vector3();
    state.current={mode,emotion,villageMembers,viewerId,viewerNickname,inputEnabled,paused};
    const heldKeys=new Set(),direction=new THREE.Vector3();let lastSent=0,jumpRequested=false;
    function keydown(e){
      const s=state.current,key=villageMovementKey(e);
      if(!key||!s?.inputEnabled||s.paused)return;
      if(s.mode!=='village'&&ownerId!==s.viewerId)return;
      e.preventDefault();if(key===' '){if(!e.repeat)jumpRequested=true;}else heldKeys.add(key);
    }
    function keyup(e){heldKeys.delete((e.code?.startsWith('Key')?e.code.slice(3):e.key).toLowerCase());}
    function clearKeys(){heldKeys.clear();jumpRequested=false;if(jumpInput)jumpInput.current=false;if(callbacks.current.movementInput)callbacks.current.movementInput.current={x:0,y:0};const entry=remoteCharacters.get(state.current?.viewerId);if(entry?.moving){entry.moving=false;entry.runMotion.update(0,false);entry.idleAction?.reset().play();callbacks.current.onPositionChange?.({x:entry.root.position.x,z:entry.root.position.z,rotation:entry.root.rotation.y,moving:false,jumpStarted:entry.jumpStarted||0});}}
    function visibilityChanged(){if(document.hidden)clearKeys();}
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',clearKeys);document.addEventListener('visibilitychange',visibilityChanged);
    const observer=new ResizeObserver(()=>{const {width,height}=el.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();});observer.observe(el);
    const clock=new THREE.Clock();let lastPausedRender=-1;
    function render(){if(disposed)return;frame=requestAnimationFrame(render);const dt=Math.min(clock.getDelta(),.05),time=clock.elapsedTime;const s=state.current;if(s.paused){clearKeys();if(time-lastPausedRender>.1){lastPausedRender=time;controls.update();placeMoon();renderer.render(world,camera);}return;}
      if(s.mode!==previousMode){previousMode=s.mode;transitioning=true;if(s.mode!=='village')heldKeys.clear();if(s.mode==='village'){transitionTarget.set(11,17,14);transitionLook.set(0,0,0);}else if(!portrait&&mood.id==='cafe'){transitionTarget.set(1,4.5,9);transitionLook.set(-1.9,1,0);}else{transitionTarget.set(...(portrait?[0,1.65,5.4]:[4.7,3.25,8]));transitionLook.set(0,portrait?1.65:1.45,0);}}
      if(transitioning){const blend=1-Math.exp(-3.4*dt);camera.position.lerp(transitionTarget,blend);controls.target.lerp(transitionLook,blend);if(camera.position.distanceTo(transitionTarget)<.03)transitioning=false;}
      controls.update();
      const players=villagePlayers(s.villageMembers,ownerId,s.viewerId,s.viewerNickname,appearance);
      avatarRoot.visible=showVillageStandIn(s.mode,ownerId,players,s.viewerId);
      if(hostTag)hostTag.visible=true;avatarRoot.position.set(0,.39,0);avatarRoot.rotation.y=.55+Math.sin(time*.25)*.12;
      if(!s.inputEnabled||document.activeElement?.isContentEditable||document.activeElement?.closest?.('input,textarea,select,[role="textbox"]'))heldKeys.clear();
      if(characterAsset){
        const members=s.mode==='village'||ownerId===s.viewerId?players:[];
        const desired=new Set(members.map(m=>m.userId));
        for(const [id,entry] of remoteCharacters){if(!desired.has(id)){world.remove(entry.root);disposeCharacter(entry.root);entry.mixer?.stopAllAction();entry.mixer?.uncacheRoot(entry.mixer.getRoot());remoteCharacters.delete(id);}}
        for(const member of members){
          let entry=remoteCharacters.get(member.userId);
          if(entry&&entry.root.userData.look!==JSON.stringify(member.appearance||appearance)){world.remove(entry.root);disposeCharacter(entry.root);entry.mixer?.stopAllAction();entry.mixer?.uncacheRoot(entry.mixer.getRoot());remoteCharacters.delete(member.userId);entry=null;}
          if(!entry){
            const character=(member.appearance||appearance).character||'pio';
            if(!characterAssets.has(character)){
              if(!pendingCharacters.has(character)){
                pendingCharacters.add(character);
                loadAsset(character).then(asset=>{if(!disposed)characterAssets.set(character,asset);}).catch(()=>{if(!disposed)setError('캐릭터를 불러오지 못했어요. 새로고침으로 다시 시도해주세요.');});
              }
              continue;
            }
            entry=buildRemote(member,characterAssets.get(character));if(member.userId===s.viewerId&&ownerId===s.viewerId&&s.mode!=='village'){entry.root.position.set(0,.39,0);entry.root.rotation.y=.4;}remoteCharacters.set(member.userId,entry);if(member.userId===s.viewerId)callbacks.current.onPositionChange?.({x:entry.root.position.x,z:entry.root.position.z,rotation:entry.root.rotation.y,moving:false});}
          entry.root.visible=true;
          if(member.userId===ownerId)entry.root.userData.action='avatar';
          const previousX=entry.root.position.x,previousZ=entry.root.position.z;
          let jumped=false;
          if(member.userId!==s.viewerId){entry.root.position.x+=(member.x-entry.root.position.x)*Math.min(1,dt*12);entry.root.position.z+=(member.z-entry.root.position.z)*Math.min(1,dt*12);entry.root.rotation.y+=Math.atan2(Math.sin((member.rotation||0)-entry.root.rotation.y),Math.cos((member.rotation||0)-entry.root.rotation.y))*Math.min(1,dt*12);}
          else{
            const active=s.inputEnabled&&(s.mode==='village'||ownerId===s.viewerId);
            if(active&&(jumpRequested||jumpInput?.current)&&(!entry.jumpStarted||Date.now()-entry.jumpStarted>=720)){entry.jumpStarted=Date.now();jumped=true;}
            jumpRequested=false;if(jumpInput)jumpInput.current=false;
            villageDirection(active?heldKeys:new Set(),camera,direction,active?(callbacks.current.movementInput?.current||{x:0,y:0}):{x:0,y:0});
            if(direction.lengthSq()){
              entry.root.position.addScaledVector(direction,3.2*dt);
              const radius=Math.hypot(entry.root.position.x,entry.root.position.z);
              if(radius>5.8){entry.root.position.x*=5.8/radius;entry.root.position.z*=5.8/radius;}
              entry.root.rotation.y=Math.atan2(direction.x,direction.z);
            }
          }
          const dx=entry.root.position.x-previousX,dz=entry.root.position.z-previousZ;
          const moving=member.userId===s.viewerId?Math.hypot(dx,dz)>.0001:member.moving||Math.hypot(member.x-entry.root.position.x,member.z-entry.root.position.z)>.025;
          if(member.userId===s.viewerId&&(jumped||(moving&&time-lastSent>.1)||(!moving&&entry.moving))){lastSent=time;callbacks.current.onPositionChange?.({x:entry.root.position.x,z:entry.root.position.z,rotation:entry.root.rotation.y,moving,jumpStarted:entry.jumpStarted||0});}
          if(moving!==entry.moving){
            if(moving)entry.idleAction?.stop();
            else{entry.runMotion.update(0,false);entry.idleAction?.reset().play();}
            entry.moving=moving;
          }
          entry.mixer?.update(dt);
          entry.root.position.y=.39+(moving?entry.runMotion.update(time,true):0)+villageJumpHeight(member.userId===s.viewerId?entry.jumpStarted:member.jumpStarted);
        }
      }
      if(mixer){mixer.update(dt);if(action)action.timeScale=s.emotion==='excited'||s.emotion==='happy'?.8:.32;}

      particles.rotation.y=time*.018;particles.position.y=Math.sin(time*.3)*.3;flame.scale.set(1+Math.sin(time*8)*.12,1+Math.sin(time*11)*.1,1);flameLight.intensity=3+Math.sin(time*9)*.5;
      fireCore.scale.y=1+Math.sin(time*13)*.17;embers.forEach((ember,i)=>{ember.position.y=.55+((time*.6+i/14)%1)*1.4;ember.position.x=Math.sin(time*2+i*2.4)*.23;ember.scale.setScalar(1-(ember.position.y-.55)/1.7);});
      placeMoon();renderer.render(world,camera);
    }render();
    return()=>{if(captureRef)captureRef.current=null;disposed=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',clearKeys);document.removeEventListener('visibilitychange',visibilityChanged);disposeObject(decorationRoot);disposeCharacter(avatarRoot);remoteCharacters.forEach(({root,mixer:remoteMixer})=>{world.remove(root);disposeCharacter(root);remoteMixer?.stopAllAction();remoteMixer?.uncacheRoot(remoteMixer.getRoot());});renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',click);mixer?.stopAllAction();mixer?.uncacheRoot(mixer.getRoot());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());sun.dispose();renderer.renderLists.dispose();renderer.domElement.remove();state.current=null;};
  },[theme,sceneType,portrait,ownerId,ownerNickname,JSON.stringify(ownerAppearance),JSON.stringify(appearance),JSON.stringify(village)]);
  return <div className="scene-wrap"><div className="scene-canvas" ref={mount}/><div className="scene-vignette"/>{loading&&<div className="scene-loading"><span className="spinner"/>정원에 햇살을 들이는 중…</div>}{error&&<div className="scene-error">{error}</div>}</div>;
}
