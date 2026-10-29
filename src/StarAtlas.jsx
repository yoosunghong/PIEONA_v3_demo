import React,{useEffect,useRef,useState} from 'react';
import {ArrowUpRight,MapPin,Orbit,X} from 'lucide-react';
import * as THREE from 'three';
import {createDecoration,disposeObject} from './worldAssets';
import {createFacilityOutline} from './facilityOutline.mjs';
import {platformColor as resolvePlatformColor} from '../shared/platform.mjs';
import {createDioramaPlatform,createSpaceBackdrop,setPlatformColor} from './spaceWorld';
import {playerStars,starName} from '../shared/stars.mjs';
import {sceneGraphicsQuality} from './sceneViewport.mjs';
import './space.css';

function miniature(kind,small=false){
  const root=createDioramaPlatform({radius:4,color:kind==='farm'?0x90ad83:kind==='fishing'?0x9bbdd1:0xaaa2bf});
  const add=(type,x,z,size=1)=>{const item=createDecoration(type);item.position.set(x,.13,z);item.scale.setScalar(size);root.add(item);return item;};
  for(let i=0;i<(small?4:10);i++){const a=i*2.4;add(i%3===0?'cherry':'bush',Math.cos(a)*3.1,Math.sin(a)*3.1,i%3===0?.8:1.05);}
  if(small){add(kind==='farm'?'mushroom':'crystal',0,0,1);return root;}
  for(let i=0;i<6;i++)add('lantern',Math.cos(i*Math.PI/3)*2.8,Math.sin(i*Math.PI/3)*2.8,.55);
  if(kind==='farm'){
    add('mushroom',.2,-2.2,1.15);
    for(let row=0;row<3;row++)for(let col=0;col<4;col++){
      const soil=new THREE.Mesh(new THREE.BoxGeometry(.8,.11,.65),new THREE.MeshStandardMaterial({color:0x80614e}));soil.position.set((col-1.5)*.93,.2,row*.77-.7);root.add(soil);add('planter',soil.position.x,soil.position.z,.4);
    }
  }else if(kind==='fishing'){
    const pond=new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.5,.06,64),new THREE.MeshStandardMaterial({color:0x70c8e9,metalness:.5,roughness:.2,emissive:0x2d729e,emissiveIntensity:.35}));pond.position.y=.17;pond.scale.z=.75;root.add(pond);
    add('gazebo',-1.8,-1.8,.8);add('bench',1.5,1.8,.8);add('crystal',2.5,-.6,.75);
    const deck=new THREE.Mesh(new THREE.BoxGeometry(1.4,.12,1.6),new THREE.MeshStandardMaterial({color:0xb29182}));deck.position.set(.5,.25,1.5);root.add(deck);
  }else{
    add('fountain',0,0,.85);add('cart',-2,1.1,.7);add('bench',1.2,1.5,.8);add('sign',2,-.6,.9);add('cherry',0,-2.2,1.15);
    for(let i=0;i<5;i++)add('path',Math.sin(i)*.15,1+i*.38,.65);
  }
  return root;
}

export default function StarAtlas({open=false,active='plaza',theme='milkyway',village,onTravel,onExited,onPhaseChange,captureRef,dioramaRef}){
  const host=useRef(),nodes=useRef(new Map()),current=useRef(),engine=useRef(),[selected,setSelected]=useState(null),[hovered,setHovered]=useState(null),[phase,setPhase]=useState('closed'),[failed,setFailed]=useState(false);
  current.current={active,onTravel,onExited,onPhaseChange,open,hovered,captureRef,dioramaRef,village};
  useEffect(()=>{
    const el=host.current;let renderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:false});}catch{setFailed(true);return;}
    const quality=sceneGraphicsQuality(renderer.getContext(),devicePixelRatio),motionPreference=matchMedia('(prefers-reduced-motion: reduce)');let reduced=motionPreference.matches;
    const preferenceChanged=event=>{reduced=event.matches;};motionPreference.addEventListener('change',preferenceChanged);
    renderer.setPixelRatio(quality.pixelRatio);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label','내 별 지도 · 별을 클릭하여 이동');renderer.domElement.dataset.atlasRenderer=crypto.randomUUID();
    const world=new THREE.Scene(),space=createSpaceBackdrop(world,{theme}),camera=new THREE.PerspectiveCamera(38,1,.1,220);
    world.add(new THREE.HemisphereLight(0xd6ddff,0x676085,1.65));const light=new THREE.DirectionalLight(0xffe5d7,2.4);light.position.set(-15,30,25);world.add(light);
    const roots=playerStars.map((star,i)=>{const root=miniature(star.id);root.position.set(...[[0,-.4,5],[-18,-.2,-3],[14,1,-3]][i]);if(star.id==='plaza')root.scale.multiplyScalar(1.5);root.userData.starId=star.id;world.add(root);return {star,root,y:root.position.y};});
    const distant=[];for(let i=0;i<12;i++){const root=miniature(['plaza','fishing','farm'][i%3],true);root.scale.setScalar(.15+(i%3)*.055);root.position.set(Math.sin(i*2.4)*23,-2+(i%4)*3,-16-(i%5)*3);root.rotation.y=i;root.traverse(o=>{if(o.isMesh){o.material.transparent=true;o.material.opacity=.26+(i%3)*.1;}});world.add(root);distant.push(root);}
    const outline=createFacilityOutline(renderer,world,camera,{glow:.75}),ray=new THREE.Raycaster();
    let down=null,dead=false,frame,last=0,visible=false,preparing=false,motion=null,flight=null,fade=null,phaseValue='closed',previousCapture,fadeTimer;
    const target=new THREE.Vector3(),widePosition=new THREE.Vector3(),wideTarget=new THREE.Vector3();
    const setPhaseValue=value=>{phaseValue=value;setPhase(value);renderer.domElement.dataset.atlasPhase=value;current.current.onPhaseChange?.(value);};
    const release=root=>{root.traverse(o=>o.skeleton?.dispose());disposeObject(root);};
    const refreshCurrent=()=>{
      for(const entry of roots){const color=resolvePlatformColor(current.current.village);setPlatformColor(entry.root,color);}
      const entry=roots.find(entry=>entry.star.id===current.current.active),source=current.current.active!=='farm'&&current.current.dioramaRef?.current?.();if(!entry||!source)return;
      // Own GPU resources so preparing the destination cannot invalidate the departing snapshot.
      const geometries=new Map(),materials=new Map(),textures=new Map();source.traverse(o=>{if(o.geometry){if(!geometries.has(o.geometry))geometries.set(o.geometry,o.geometry.clone());o.geometry=geometries.get(o.geometry);}if(o.material){const copy=original=>{if(!materials.has(original)){const material=original.clone();for(const key of Object.keys(material))if(material[key]?.isTexture){const old=material[key];if(!textures.has(old))textures.set(old,old.clone());material[key]=textures.get(old);}materials.set(original,material);}return materials.get(original);};o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);}});
      source.userData.borrowed=false;source.userData.snapshotOwned=true;source.userData.starId=entry.star.id;source.position.copy(entry.root.position);if(entry.star.id==='plaza')source.scale.multiplyScalar(1.5);world.remove(entry.root);release(entry.root);entry.root=source;world.add(source);
    };
    const pose=()=>({position:camera.position.clone(),target:target.clone()});
    const near=id=>{const entry=roots.find(e=>e.star.id===id),source=entry.root.userData.sourceView,scale=source?entry.root.scale.x:4/8.75*entry.root.scale.x;return {position:new THREE.Vector3(...(source?.position||[11,17,14])).multiplyScalar(scale).add(entry.root.position),target:new THREE.Vector3(...(source?.target||[0,0,0])).multiplyScalar(scale).add(entry.root.position)};};
    const move=(to,duration,done)=>{const from=pose();motion={from,to,duration:reduced?.12:duration,start:performance.now(),done};};
    const resize=()=>{const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;renderer.setSize(w,h);space.resize(w,h);camera.aspect=w/h;const mobile=w/h<1;widePosition.set(0,mobile?35:23,mobile?76:40);roots.forEach(({root},i)=>{root.position.x=[0,-18,14][i]*(mobile?.42:1);});if(phaseValue==='open'||!visible){camera.position.copy(widePosition);target.copy(wideTarget);}else if(phaseValue==='opening'&&motion){motion.to.position.copy(widePosition);}camera.lookAt(target);camera.updateProjectionMatrix();};
    const observer=new ResizeObserver(resize);observer.observe(el);resize();
    const atlasCapture=()=>{outline.render(null);return renderer.domElement.toDataURL('image/png');};
    const beginOpen=async()=>{if(visible||preparing)return;preparing=true;setSelected(null);setHovered(null);setPhaseValue('preparing');refreshCurrent();await space.ready;await renderer.compileAsync(world,camera);if(dead||!current.current.open){preparing=false;setPhaseValue('closed');return;}const start=near(current.current.active);camera.position.copy(start.position);target.copy(start.target);camera.lookAt(target);renderer.render(world,camera);visible=true;preparing=false;previousCapture=current.current.captureRef?.current;if(current.current.captureRef)current.current.captureRef.current=atlasCapture;setPhaseValue('opening');move({position:widePosition.clone(),target:wideTarget.clone()},1.2,()=>setPhaseValue('open'));};
    const finish=()=>{if(!visible)return;clearTimeout(fadeTimer);visible=false;flight=null;fade=null;setPhaseValue('closed');if(current.current.captureRef?.current===atlasCapture)current.current.captureRef.current=previousCapture;current.current.onExited?.();};
    const travel=id=>{if(phaseValue!=='open')return;setSelected(null);setHovered(null);setPhaseValue('traveling');let arrived;const arrival=new Promise(resolve=>{arrived=resolve;});move(near(id),1.1,arrived);flight=Promise.resolve(current.current.onTravel(id,arrival)).then(ok=>{if(dead)return;if(ok===false){setPhaseValue('opening');move({position:widePosition.clone(),target:wideTarget.clone()},.7,()=>setPhaseValue('open'));flight=null;return;}setPhaseValue('handoff');fade={start:performance.now(),duration:reduced?100:320};fadeTimer=setTimeout(()=>{if(!dead)finish();},fade.duration);}).catch(()=>{if(!dead){setPhaseValue('opening');move({position:widePosition.clone(),target:wideTarget.clone()},.7,()=>setPhaseValue('open'));flight=null;}});};
    const hit=e=>{const rect=el.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);for(const item of ray.intersectObjects(roots.map(e=>e.root),true)){let root=item.object;while(root&&!root.userData.starId)root=root.parent;if(root)return root.userData.starId;}return null;};
    const pointerDown=e=>{down={x:e.clientX,y:e.clientY};};
    const pointerMove=e=>{if(phaseValue!=='open')return;const id=hit(e);setHovered(id);renderer.domElement.style.cursor=id?'pointer':'default';};
    const pointerLeave=()=>setHovered(null);
    const click=e=>{if(phaseValue!=='open'||!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>8)return;down=null;setSelected(hit(e));};
    // Wheel and pinch stay local to each view; they never navigate between stars.
    const wheel=e=>e.preventDefault();
    renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',click);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointerleave',pointerLeave);renderer.domElement.addEventListener('wheel',wheel,{passive:false});
    engine.current={open:beginOpen,travel,colors(){for(const {root} of roots)setPlatformColor(root,resolvePlatformColor(current.current.village));}};
    const animate=stamp=>{if(dead)return;frame=requestAnimationFrame(animate);if(!visible)return;if(stamp-last<(quality.software?150:0))return;last=stamp;const time=reduced?0:stamp/1000;space.update(time);
      if(motion){const progress=Math.min(1,(stamp-motion.start)/(motion.duration*1000)),ease=progress*progress*(3-2*progress);camera.position.lerpVectors(motion.from.position,motion.to.position,ease);target.lerpVectors(motion.from.target,motion.to.target,ease);if(progress===1){const done=motion.done;motion=null;done?.();}}camera.lookAt(target);camera.updateMatrixWorld();renderer.domElement.dataset.cameraPosition=JSON.stringify(camera.position.toArray());
      for(const {star,root,y} of roots){root.position.y=y+(reduced||phaseValue!=='open'?0:Math.sin(time*.55+star.id.length)*.1);const p=new THREE.Vector3(root.position.x,y+3,root.position.z).project(camera),node=nodes.current.get(star.id);if(node){node.style.left=(p.x+1)*50+'%';node.style.top=(1-p.y)*50+'%';}}
      const hoveredRoot=phaseValue==='open'?roots.find(entry=>entry.star.id===current.current.hovered)?.root:null;renderer.domElement.dataset.hoveredStar=hoveredRoot?.userData.starId||'';outline.render(hoveredRoot||null);
      if(fade&&performance.now()-fade.start>=fade.duration)finish();
    };frame=requestAnimationFrame(animate);if(current.current.open)beginOpen();
    return()=>{dead=true;motionPreference.removeEventListener('change',preferenceChanged);clearTimeout(fadeTimer);engine.current=null;cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',click);renderer.domElement.removeEventListener('pointermove',pointerMove);renderer.domElement.removeEventListener('pointerleave',pointerLeave);renderer.domElement.removeEventListener('wheel',wheel);if(current.current.captureRef?.current===atlasCapture)current.current.captureRef.current=previousCapture;outline.dispose();space.dispose();roots.forEach(({root})=>release(root));distant.forEach(release);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
  },[theme]);
  useEffect(()=>{if(open){if(failed){setPhase('open');onPhaseChange?.('open');}else engine.current?.open();}},[open,theme,failed]);
  useEffect(()=>{engine.current?.colors();},[village?.platformColor]);
  useEffect(()=>{if(!open)return;const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(selected)setSelected(null);else engine.current?.travel(active);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[open,selected,active]);
  const interactive=phase==='open';
  return <section className={'star-atlas atlas-'+phase} aria-label="내 별 지도" aria-hidden={!open} inert={!interactive} data-phase={phase}><div className="star-atlas-canvas" ref={host}/><div className="star-atlas-haze" aria-hidden="true"/>
    <div className="star-atlas-destinations">{playerStars.map(star=><div key={star.id} ref={node=>{if(node)nodes.current.set(star.id,node);else nodes.current.delete(star.id);}} className={'star-destination'+(selected===star.id?' is-selected':'')+(active===star.id?' is-current':'')+(hovered===star.id?' is-hovered':'')}>
      <button className="star-marker" aria-label={star.name+' 선택'} aria-pressed={selected===star.id} onMouseEnter={()=>setHovered(star.id)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(star.id)} onBlur={()=>setHovered(null)} onClick={()=>setSelected(selected===star.id?null:star.id)} style={{'--star-color':star.color}}>{active===star.id?<MapPin size={23}/>:<span/>}<strong>{star.name}</strong></button>
      {selected===star.id&&<button className="avatar-chat-prompt star-travel-prompt" onClick={()=>engine.current?.travel(star.id)} aria-label={star.name+'로 이동'}><ArrowUpRight size={20}/><span>이동</span></button>}
    </div>)}</div>
    <div className="star-atlas-caption"><Orbit size={20}/><div><strong>나의 별자리</strong><span>{selected?playerStars.find(s=>s.id===selected)?.caption:phase==='traveling'?'별을 향해 이동하고 있어요':phase==='opening'?'나의 별자리를 펼치는 중':'별을 선택하고 이동해 보세요'}</span></div><small>보유한 별 3개</small></div>
    <button className="star-atlas-close" onClick={()=>engine.current?.travel(active)} aria-label={starName(active)+'로 돌아가기'}><X size={17}/><span>현재 별로</span></button>
    {failed&&open&&<div className="star-atlas-error" role="status">3D 지도를 표시할 수 없어요.{playerStars.map(star=><button key={star.id} onClick={async()=>{if(await onTravel(star.id,Promise.resolve())!==false)onExited();}}>{star.name}로 이동</button>)}</div>}
  </section>;
}
