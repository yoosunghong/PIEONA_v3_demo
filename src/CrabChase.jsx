import React,{useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {Timer,Footprints,Play,RotateCcw,Volume2,VolumeX,Trophy,Waves,Shell,Users,MoveUpRight,Heart,Home,BookOpen,Crown,Hand,Send,Zap} from 'lucide-react';
import {api} from './api';
import {loadAsset} from './avatar';
import {dressAvatar,disposeObject} from './worldAssets';
import {createRunMotion} from './avatarMotion.mjs';
import {useBackgroundMusic} from './BackgroundMusic';
import TouchJoystick from './TouchJoystick';
import GameReplay,{useGameRematch} from './GameReplay';
import {createCrabWorld} from './crabWorld';
import {createCrabAudio} from './crabAudio.mjs';
import {newCrabMotion,predictCrabMotion,reconcileCrabMotion,crabClientTime,syncCrabClock,crabCameraSize} from './crabMotion.mjs';
import {newCrabGame,crabSnapshot,crabSeconds,crabSpawnInterval} from '../shared/crab.mjs';
import './crab.css';

const ITEM_INFO={steal:{icon:Hand,label:'꼬리 강탈',copy:'상대의 마지막 게가 내 행렬에 합류해요'},launch:{icon:Send,label:'게 발사',copy:'내 꼬리의 게를 상대에게 빠르게 발사해요'},zigzag:{icon:Zap,label:'지그재그',copy:'7초 동안 모든 게 행렬이 지그재그로 움직여요'}};
const readBest=id=>{try{return Math.max(0,Number(localStorage.getItem(`pieona-crab-best:${id}`))||0);}catch{return 0;}};
const secondsLabel=seconds=>{const tenths=Math.floor(seconds*10+1e-7);return `${Math.floor(tenths/600).toString().padStart(2,'0')}:${((tenths%600)/10).toFixed(1).padStart(4,'0')}`;};
export default function CrabChase({target,me,notify,onReward,anonymous,socket,race,onHome,onSoloReplay,autoStart=false}){
  const mount=useRef(),stage=useRef(),mini=useRef(),stick=useRef({x:0,y:0}),keys=useRef(new Set()),engine=useRef({}),sound=useRef(),tags=useRef(new Map()),title=useRef(),bubbleTags=useRef(new Map());
  const [status,setStatus]=useState('ready'),[ready,setReady]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null),[hud,setHud]=useState(()=>crabSnapshot(newCrabGame([me.id])));
  const rematch=useGameRematch({race,socket,gameId:engine.current.game?.id,notify});
  const [help,setHelp]=useState(false),[mapExpanded,setMapExpanded]=useState(false),[best,setBest]=useState(()=>readBest(me.id));
  const music=useBackgroundMusic(),live=useRef({});live.current={me,race,status,music,notify,onReward};
  useEffect(()=>{if(result){const score=Math.max(readBest(me.id),result.score);setBest(score);try{localStorage.setItem(`pieona-crab-best:${me.id}`,String(score));}catch{}}},[result,me.id]);
  function axis(){const k=keys.current;let x=(k.has('KeyD')||k.has('ArrowRight')?1:0)-(k.has('KeyA')||k.has('ArrowLeft')?1:0),z=(k.has('KeyS')||k.has('ArrowDown')?1:0)-(k.has('KeyW')||k.has('ArrowUp')?1:0);if(!x&&!z){x=stick.current.x;z=stick.current.y;}const n=Math.max(1,Math.hypot(x,z));return{x:x/n,z:z/n};}
  function begin(g,sent){const now=performance.now(),elapsed=(g.serverTime-g.started)+(sent===undefined?0:(now-sent)/2),own=g.snapshot.players.find(p=>p.id===me.id);keys.current.clear();stick.current={x:0,y:0};Object.assign(engine.current,{game:g,snapshot:g.snapshot,received:now,clock:{start:now-elapsed,time:g.snapshot.elapsed},motion:newCrabMotion(own,g.snapshot.elapsed),seq:0,lastSend:-Infinity,lastAxis:{x:0,z:0},lastClockSync:-Infinity,finishing:false,finished:false,ending:false,interrupted:false});setHelp(false);setHud(g.snapshot);setResult(null);setStatus('playing');}
  async function start(){
    if(!socket?.connected){notify('별 연결이 준비되면 시작할 수 있어요.');return;}
    sound.current?.unlock();setStatus('loading');setError('');
    try{const sent=performance.now(),g=await api('/crab-games',{method:'POST',body:{targetId:target.id,anonymous}});if(!engine.current.active){api(`/crab-games/${g.id}/abandon`,{method:'POST'}).catch(()=>{});return;}begin(g,sent);}
    catch(e){if(engine.current.active){notify(e.message);setStatus('ready');}}
  }
  async function finish(){
    const e=engine.current;if(!e.game||e.finishing||e.finished)return;e.finishing=true;const gameId=e.game.id;
    try{const r=await api(`/crab-games/${gameId}/finish`,{method:'POST'});if(e.active&&e.game?.id===gameId){e.finished=true;setResult(r);setStatus('finished');live.current.onReward();}}
    catch(err){if(e.active){setStatus('settle');live.current.notify(err.message);}}
    finally{e.finishing=false;}
  }
  useEffect(()=>{
    engine.current.active=true;sound.current=createCrabAudio();
    return()=>{const e=engine.current;e.active=false;keys.current.clear();sound.current?.dispose();if(e.game&&!e.finished)api(`/crab-games/${e.game.id}/abandon`,{method:'POST'}).catch(()=>{});};
  },[]);
  useEffect(()=>{if(race?.game&&engine.current.game?.id!==race.game.id)begin(race.game);},[race?.game?.id]);
  useEffect(()=>{if(autoStart&&ready&&!race&&!engine.current.autoStarted){engine.current.autoStarted=true;start();}},[autoStart,ready]);
  useEffect(()=>{if(race&&ready)socket?.timeout(5000).emit('runner:ready',{id:race.id},(err,r)=>{if(err||!r?.ok)setError(r?.error||'준비 연결이 끊겼어요. 목록에서 다시 초대해주세요.');});},[race?.id,ready,socket]);
  useEffect(()=>{
    function receive(data){const e=engine.current;if(!e.game||data.roomId!==e.game.roomId||e.finished)return;
      if(e.snapshot&&data.elapsed<e.snapshot.elapsed)return;
      const previous=e.snapshot?.players.find(p=>p.id===me.id),own=data.players.find(p=>p.id===me.id);
      if(own?.chain.length>previous?.chain.length||own?.lastItem?.at!==previous?.lastItem?.at)sound.current?.tone('join');
      if(own&&previous&&own.lives<previous.lives)sound.current?.tone('hit');
      if(own&&e.motion)reconcileCrabMotion(e.motion,own,data.elapsed);
      e.snapshot=data;e.received=performance.now();if(data.ended||e.received-(e.lastHud||0)>=100){e.lastHud=e.received;setHud(data);}
      if(data.ended&&!e.ending){e.ending=true;setStatus('ending');sound.current?.tone('end');finish();}
    }
    function offline(){keys.current.clear();stick.current={x:0,y:0};if(engine.current.game&&!engine.current.finished){engine.current.interrupted=true;setStatus('interrupted');}}
    socket?.on('crab:snapshot',receive);socket?.on('disconnect',offline);
    return()=>{socket?.off('crab:snapshot',receive);socket?.off('disconnect',offline);};
  },[socket,me.id]);
  useEffect(()=>{
    if(status!=='playing')return;
    let polling=false;
    function send(force=false){const e=engine.current;if(!e.game||e.snapshot?.ended||!e.snapshot?.players.find(p=>p.id===me.id)?.alive||!socket?.connected)return;
      const now=performance.now(),input=axis(),changed=Math.abs(input.x-e.lastAxis.x)>.01||Math.abs(input.z-e.lastAxis.z)>.01;
      if(!force&&!changed&&now-e.lastSend<100)return;
      const at=crabClientTime(e.clock,now),seq=++e.seq,packet={id:e.game.id,...input,seq};e.lastSend=now;e.lastAxis=input;
      e.motion.pending.push({seq,at,input});
      if(now-e.lastClockSync>=200){e.lastClockSync=now;const gameId=e.game.id;socket.emit('crab:input',packet,response=>{if(e.active&&e.game?.id===gameId&&response?.ok&&Number.isFinite(response.elapsed))syncCrabClock(e.clock,response.elapsed,now,performance.now());});}
      else socket.emit('crab:input',packet);
    }
    engine.current.sendInput=send;
    const interval=setInterval(()=>send(),100);
    const poll=setInterval(async()=>{const e=engine.current;if(polling||!e.game||performance.now()-e.received<1800)return;polling=true;try{const g=await api(`/crab-games/${e.game.id}/state`);if(e.active&&g.id===e.game?.id){const own=g.snapshot.players.find(p=>p.id===me.id);if(own)reconcileCrabMotion(e.motion,own,g.snapshot.elapsed);e.snapshot=g.snapshot;e.received=performance.now();setHud(g.snapshot);if(g.snapshot.ended){setStatus('ending');finish();}}}catch(err){if(e.active)live.current.notify(err.message);}finally{polling=false;}},2000);
    function keydown(event){if(event.ctrlKey||event.metaKey||event.altKey||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)){event.preventDefault();keys.current.add(event.code);sound.current?.unlock();send();}}
    function keyup(event){keys.current.delete(event.code);send();}
    function reset(){keys.current.clear();stick.current={x:0,y:0};send();}
    function hidden(){if(document.hidden)reset();}
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',reset);document.addEventListener('visibilitychange',hidden);
    return()=>{engine.current.sendInput=null;clearInterval(interval);clearInterval(poll);keys.current.clear();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',hidden);};
  },[status,socket]);
  useEffect(()=>{sound.current?.set(music?.enabled??true,music?.volume??.3,status==='playing');},[status,music?.enabled,music?.volume]);
  useEffect(()=>{if(status==='playing'||status==='ending')stage.current?.scrollIntoView({block:'start',behavior:'instant'});if(['ending','finished','settle'].includes(status))title.current?.focus({preventScroll:true});},[status]);

  useEffect(()=>{
    const el=mount.current;let disposed=false,frame,renderer;const avatars=[],owned=[];setReady(false);setError('');
    try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch{setError('3D 화면을 열 수 없어요. 브라우저 하드웨어 가속을 확인해주세요.');return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;el.appendChild(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color('#72d2ca');scene.add(new THREE.HemisphereLight('#edfcff','#c79a60',2));
    const sun=new THREE.DirectionalLight('#fff0d3',3.2);sun.position.set(-18,30,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-29,right:29,top:29,bottom:-29,near:1,far:85});sun.shadow.bias=-.0006;scene.add(sun);
    const camera=new THREE.OrthographicCamera(-22,22,15,-15,.1,130);camera.position.set(0,48,27);camera.lookAt(0,0,0);
    const world=createCrabWorld(scene),players=race?.players||[{userId:me.id,nickname:me.nickname,appearance:me.appearance}];
    const ringGeometry=new THREE.RingGeometry(.62,.74,32),ringMaterials=[],contactGeometry=new THREE.CircleGeometry(.58,24),contactMaterial=new THREE.MeshBasicMaterial({color:'#775a3d',transparent:true,opacity:.2,depthWrite:false});
    for(const p of players){
      const group=new THREE.Group();scene.add(group);
      const material=new THREE.MeshBasicMaterial({color:p.userId===me.id?'#29c7ba':'#8982ff',side:THREE.DoubleSide,transparent:true,opacity:.9});ringMaterials.push(material);
      const ring=new THREE.Mesh(ringGeometry,material);ring.rotation.x=-Math.PI/2;ring.position.y=.025;group.add(ring);
      const contact=new THREE.Mesh(contactGeometry,contactMaterial);contact.rotation.x=-Math.PI/2;contact.position.y=.018;group.add(contact);
      avatars.push({group,p,ring,model:null,motion:null});
    }
    Promise.all([world.ready,...avatars.map(async a=>{
      try{const asset=await loadAsset(a.p.appearance?.character);if(disposed)return;const model=clone(asset),size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());model.scale.setScalar(2.25/size.y);const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());model.position.set(-center.x,-bounds.min.y,-center.z);dressAvatar(model,a.p.appearance);model.traverse(o=>{if(o.isMesh)o.castShadow=false;});a.group.add(model);a.model=model;a.motion=createRunMotion(model);}
      catch{if(disposed)return;const geo=new THREE.CapsuleGeometry(.4,.9,5,10),mat=new THREE.MeshStandardMaterial({color:a.p.userId===me.id?'#4fc9bc':'#a296ea'});owned.push(geo,mat);const model=new THREE.Mesh(geo,mat);model.position.y=.9;a.group.add(model);a.model=model;}
    })]).then(()=>{if(!disposed)setReady(true);}).catch(()=>{if(!disposed)setError('해변 그래픽을 불러오지 못했어요. 창을 닫고 다시 열어주세요.');});
    const mapImage=new Image();mapImage.src='/images/minigames/crab-beach-v2.png';
    const clock=new THREE.Clock(),projected=new THREE.Vector3(),center=new THREE.Vector3();let lastMini=0;
    const preview=crabSnapshot(newCrabGame(players.map(p=>p.userId)));
    function render(){
      if(disposed)return;frame=requestAnimationFrame(render);const dt=Math.min(clock.getDelta(),.05),time=clock.elapsedTime;if(document.hidden)return;
      const e=engine.current,snapshot=e.snapshot||preview;world.update(snapshot,time,dt);
      const input=axis(),playing=live.current.status==='playing'&&!snapshot.ended&&snapshot.players.find(p=>p.id===me.id)?.alive;
      if(playing)e.sendInput?.();
      const pose=playing&&e.motion?predictCrabMotion(e.motion,input,Math.min(crabClientTime(e.clock,performance.now()),snapshot.elapsed+500),dt):null;
      for(const a of avatars){
        const p=snapshot.players.find(p=>p.id===a.p.userId);if(!p)continue;
        const local=p.id===me.id&&pose,visual=local||p,blend=local?1:1-Math.exp(-20*dt),x=visual.x,z=visual.z;
        const moving=(local?Math.hypot(input.x,input.z)>.02&&snapshot.elapsed>=3000:Math.hypot(x-a.group.position.x,z-a.group.position.z)>.03)&&p.alive&&!snapshot.ended;
        a.group.position.x+=(x-a.group.position.x)*blend;a.group.position.z+=(z-a.group.position.z)*blend;
        a.group.rotation.y+=Math.atan2(Math.sin(visual.angle-a.group.rotation.y),Math.cos(visual.angle-a.group.rotation.y))*(1-Math.exp(-24*dt));
        const hop=a.motion?.update(time,moving)||0;if(a.model)a.model.position.y+=hop-(a.hop||0);a.hop=hop;
        const protectedNow=p.alive&&snapshot.elapsed<p.invulnerableUntil;
        a.ring.material.opacity=protectedNow?.45+Math.sin(time*18)*.4:p.alive?.95:.25;
        if(a.model)a.model.visible=!protectedNow||Math.sin(time*24)>-.35;
        if(a.model)a.model.rotation.z=p.alive?0:Math.PI*.4;
      }
      const followId=snapshot.players.find(p=>p.id===me.id)?.alive?me.id:snapshot.players.find(p=>p.alive)?.id;
      const own=avatars.find(a=>a.p.userId===followId)?.group.position;
      center.x+=((own?THREE.MathUtils.clamp(own.x,-16,16):0)-center.x)*(1-Math.exp(-10*dt));center.z+=((own?THREE.MathUtils.clamp(own.z,-16,16):0)-center.z)*(1-Math.exp(-10*dt));camera.position.set(center.x,48,center.z+27);camera.lookAt(center.x,0,center.z);camera.updateMatrixWorld();
      for(const a of avatars){const tag=tags.current.get(a.p.userId);if(tag){projected.set(a.group.position.x,2.8,a.group.position.z).project(camera);tag.style.left=`${(projected.x*.5+.5)*100}%`;tag.style.top=`${(-projected.y*.5+.5)*100}%`;tag.hidden=projected.x < -1||projected.x>1||projected.y < -1||projected.y>1;}}
      for(const item of snapshot.items||[]){const tag=bubbleTags.current.get(item.id);if(tag){projected.set(item.x,2,item.z).project(camera);tag.style.left=`${(projected.x*.5+.5)*100}%`;tag.style.top=`${(-projected.y*.5+.5)*100}%`;}}
      renderer.render(scene,camera);
      const context=mini.current?.getContext('2d');if(context&&time-lastMini>=.1){lastMini=time;context.clearRect(0,0,132,132);context.fillStyle='#f5dfb7';context.fillRect(0,0,132,132);if(mapImage.complete&&mapImage.naturalWidth)context.drawImage(mapImage,0,0,132,132);
        const mx=x=>(x+32)/64*132,mz=z=>(z+30)/60*132;
        for(const c of snapshot.crabs){context.fillStyle=c.mode==='projectile'?'#ffd24d':'#ff5d35';context.beginPath();context.arc(mx(c.x),mz(c.z),1.7,0,Math.PI*2);context.fill();}
        for(const item of snapshot.items||[]){context.fillStyle=item.type==='steal'?'#a66cff':item.type==='launch'?'#ffb442':'#00bfae';context.fillRect(mx(item.x)-2,mz(item.z)-2,4,4);}
        for(const p of snapshot.players){if(!p.alive)continue;context.fillStyle=p.id===me.id?'#00bce1':'#7363dc';context.beginPath();context.moveTo(mx(p.x),mz(p.z)-4.5);context.lineTo(mx(p.x)-3.5,mz(p.z)+3);context.lineTo(mx(p.x)+3.5,mz(p.z)+3);context.closePath();context.fill();context.strokeStyle='white';context.lineWidth=1.2;context.stroke();}

      }
    }
    const observer=new ResizeObserver(()=>{const {width,height}=el.getBoundingClientRect();if(width&&height){renderer.setSize(width,height);const {halfWidth,halfHeight}=crabCameraSize(width/height);camera.left=-halfWidth;camera.right=halfWidth;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();}});observer.observe(el);render();
    return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();world.dispose();ringGeometry.dispose();contactGeometry.dispose();contactMaterial.dispose();ringMaterials.forEach(m=>m.dispose());owned.forEach(o=>o.dispose());for(const a of avatars)a.model?.traverse(o=>{if(o.userData.generated)disposeObject(o);if(o.isSkinnedMesh)o.skeleton.dispose();});renderer.dispose();renderer.domElement.remove();};
  },[me.id,JSON.stringify(me.appearance),race?.id]);

  const own=hud.players.find(p=>p.id===me.id),seconds=crabSeconds({elapsed:own?.survived||hud.elapsed}),chain=own?.chain.length??2;
  const players=race?.players||[{userId:me.id,nickname:me.nickname}],ended=['ending','finished','settle'].includes(status),won=race&&hud.winner===me.id;
  const outcome=race?(won?'win':hud.winner?'lose':'draw'):'over',pace=crabSpawnInterval(crabSeconds(hud))/1000;
  const lastItem=own?.lastItem,itemInfo=lastItem&&ITEM_INFO[lastItem.type],zigzagLeft=Math.max(0,Math.ceil(((hud.zigzagUntil||0)-hud.elapsed)/1000));
  return <div className="panel-body crab-game" onPointerDownCapture={()=>sound.current?.unlock()}>
    <div className={'crab-stage'+(race?' is-duel':'')+(['ready','loading'].includes(status)?' is-intro':'')} ref={stage}>
      <div className="crab-viewport" ref={mount} aria-label="게 게 게 해변 탑뷰 게임 화면"/>
      <div className="crab-topbar"><div className="crab-brand"><span className="crab-brand-icon">🦀</span><div><b>게 게 게!</b><small>CRAB CHASE · {race?`${players.length} PLAYERS`:'SURVIVAL'}</small></div></div><div className="crab-timer"><Timer size={18}/><strong>{secondsLabel(seconds)}</strong><small>버틴 시간</small></div><div className="crab-mode">{race?<Users size={15}/>:<Waves size={15}/>}<span>{race?'마지막까지 살아남기':'끝없는 해변 추격전'}</span></div></div>
      <div className="crab-pressure" aria-label="시간에 따라 증가하는 게 출현 속도"><span>🦀 <b>{pace>2?'잔잔한 해변':pace>1.2?'몰려오는 게들':'대소동의 해변'}</b><small>{pace.toFixed(1)}초마다 등장</small></span><div><i style={{width:((2.8-pace)/2.1*100)+'%'}}/></div><small>시간이 지날수록 게가 더 빠르게 나타나요</small></div>
      <div className="crab-stats"><span className="crab-live-score"><Trophy size={17}/><b>{(own?.score||0).toLocaleString()}</b><small>현재 기록<span>최고 기록 {best.toLocaleString()}점</span></small></span><span>🦀 <b>{chain}</b><small>내 뒤의 게 · 보너스 +{own?.bonus||0}점</small></span><span>🦀 <b>{hud.crabs.length}</b><small>해변의 게</small></span><span className="crab-lives" aria-label={`남은 라이프 ${own?.lives??3}개`}><span>{[0,1,2].map(i=><Heart key={i} size={22} className={i<(own?.lives??3)?'is-full':'is-empty'}/>)}</span><small>{!own?.alive?(hud.ended?'하트를 모두 사용했어요':'탈락 · 남은 친구들을 관전 중'):hud.elapsed<(own?.invulnerableUntil||0)?'잠시 무적! 계속 움직이세요':'세 번의 기회'}</small></span></div>
      {players.map(p=><span key={p.userId} className={'crab-name '+(p.userId===me.id?'is-me':'')} ref={el=>{if(el)tags.current.set(p.userId,el);else tags.current.delete(p.userId);}}>{p.nickname}{p.userId===me.id?' · 나':''}</span>)}
      {race&&<div className="crab-duel-status">{players.map(p=>{const state=hud.players.find(v=>v.id===p.userId);return <span key={p.userId} className={p.userId===me.id?'is-me':''}><i className={state?.alive?'alive':'caught'}/><b>{p.nickname}{p.userId===me.id?' · 나':''}</b><small>{state?.alive?`♥ ${state.lives}`:'잡혔어요'}</small></span>;})}</div>}
      <div className={'crab-minimap'+(mapExpanded?' is-expanded':'')}><canvas ref={mini} width="132" height="132" aria-label="해변 지도: 청록색은 나, 보라색은 상대, 주황색과 빨간색은 게"/><small>N · BEACH MAP</small><button aria-label={mapExpanded?'미니맵 축소':'미니맵 확대'} onClick={()=>setMapExpanded(v=>!v)}>{mapExpanded?'−':'+'}</button></div>
      <div className="crab-legend"><span><i/>순찰</span><span><i/>추격</span><span><i/>행렬</span></div>
      {status==='playing'&&(hud.items||[]).map(item=>{const Icon=ITEM_INFO[item.type].icon;return <span key={item.id} className={'crab-bubble-label is-'+item.type} ref={el=>{if(el)bubbleTags.current.set(item.id,el);else bubbleTags.current.delete(item.id);}}><Icon size={17}/><small>{ITEM_INFO[item.type].label}</small></span>;})}
      {status==='playing'&&<div className="crab-item-guide"><span>버블을 먹으면 즉시 발동!</span>{Object.entries(ITEM_INFO).map(([type,info])=>{const Icon=info.icon;return <span key={type} className={'is-'+type}><Icon size={14}/>{info.label}</span>;})}</div>}
      {status==='playing'&&zigzagLeft>0&&<div className="crab-effect"><Zap size={17}/>지그재그 행렬 <b>{zigzagLeft}초</b></div>}
      {status==='playing'&&itemInfo&&hud.elapsed-lastItem.at<2400&&<div className="crab-pickup" role="status" key={lastItem.at}>{lastItem.applied?`${itemInfo.label} 발동!`:'사용할 수 있는 게가 없어요'}{lastItem.applied&&<small>{!race&&lastItem.type==='launch'?'내 꼬리의 게를 이동 방향으로 발사해요':!race&&lastItem.type==='steal'?'해변 게 한 마리가 내 행렬에 합류해요':itemInfo.copy}</small>}</div>}
      {status==='playing'&&<TouchJoystick input={stick} disabled={hud.ended||!own?.alive} label="해변 이동 조이스틱"/>}
      {status==='playing'&&hud.elapsed<3000&&<div className="crab-countdown" role="status"><strong>{Math.max(1,Math.ceil((3000-hud.elapsed)/1000))}</strong><span>뒤를 조심해요!</span></div>}
      {(['ready','loading'].includes(status))&&<div className="crab-intro"><div className="crab-intro-art"/><div className="crab-intro-copy"><span className="crab-eyebrow">A LITTLE TROUBLE IN PARADISE</span><h2><span>게, 게, <i>게!</i></span><em>뒤를 돌아보지 마세요.</em></h2><p>평화로운 해변, 끝없이 따라오는 게.<br/>내가 지나는 길이 가장 위험한 길이 돼요.</p><ol><li><b>01</b><Play/><span><strong>계속 움직이세요</strong>시작부터 게 두 마리가 따라와요.</span></li><li><b>02</b><Heart/><span><strong>세 번의 기회, 끝없는 추격</strong>게에 닿으면 하트가 하나씩 줄어요. 잠시 무적!</span></li><li><b>03</b><Crown/><span><strong>버블로 흐름을 뒤집으세요</strong>꼬리 강탈 · 게 발사 · 7초 지그재그, 먹자마자 발동!</span></li></ol>{race?<div className="crab-ready-status" role="status">{ready?'친구의 준비를 기다리고 있어요…':'해변을 준비하고 있어요…'}</div>:<button className="crab-start" disabled={!ready||status==='loading'||!!error} onClick={start}><Play size={24} fill="currentColor"/>{!ready?'해변을 준비하는 중…':status==='loading'?'출발 준비 중…':'해변으로 출발'}<span>→</span></button>}<div className="crab-intro-tools"><button onClick={()=>music?.toggle()}>{music?.enabled?<Volume2 size={16}/>:<VolumeX size={16}/>}해변 소리</button><span><Crown size={16}/>{best.toLocaleString()}점</span><button onClick={()=>setHelp(v=>!v)} aria-expanded={help}><BookOpen size={16}/>게임 방법</button></div><small className="crab-intro-controls">W A S D / 방향키 · 모바일은 조이스틱</small>{help&&<div className="crab-help" role="status"><b>오래 버틸수록 높은 점수!</b><p>기본 10점/초 + 추가 게 1마리당 2점/초. 모든 게를 피하세요. 하트 3개를 모두 잃으면 종료돼요. 보라 버블은 상대 꼬리 강탈, 주황은 내 꼬리 발사, 민트는 모든 행렬을 7초간 지그재그로 바꿔요. 솔로 강탈은 해변 게를 데려오고, 발사는 이동 방향으로 나가요.</p><button onClick={()=>setHelp(false)}>확인</button></div>}</div></div>}
      {error&&<div className="crab-error" role="alert">{error}</div>}
      {status==='interrupted'&&<div className="crab-result-overlay"><div className="crab-result"><Waves size={32}/><h3>별 연결이 끊겼어요</h3><p>연결이 돌아오면 새 게임을 시작할 수 있어요.</p>{!race&&<button className="crab-start" onClick={start}><RotateCcw size={17}/>다시 시작</button>}</div></div>}
      {ended&&<div className="crab-result-overlay"><div className={'crab-result is-'+outcome} role="dialog" aria-modal="true" aria-labelledby="crab-result-title"><div className="crab-result-art"/><div className="crab-outcome" role="status"><b>{outcome==='win'?'승리!':outcome==='lose'?'게임 오버!' :outcome==='draw'?'무승부':'게임 오버!'}</b><small>{outcome==='win'?'VICTORY':outcome==='lose'?'DEFEAT':outcome==='draw'?'DRAW':'GAME OVER'}</small></div><div className="crab-result-content"><span className="crab-eyebrow">{race?(won?'YOU SURVIVED':hud.winner?'CAUGHT BY A CRAB':'DRAW'):'CAUGHT BY A CRAB'}</span><h3 id="crab-result-title" ref={title} tabIndex={-1}>{race?(won?'해변의 마지막 생존자!':hud.winner?'이번엔 게가 더 빨랐어요':'동시에 잡혔어요!'):'앗, 게한테 잡혔다!'}</h3><p>{won?'끝까지 살아남았어요. 해변의 왕관은 당신의 것!':'조금만 더 빠르게 움직였다면…! 다음엔 더 오래 버텨보세요.'}</p><div className="crab-result-score"><span className="crab-score-caption"><Crown size={19}/>이번 점수</span><strong>{(result?.score??own?.score??0).toLocaleString()}<small>점</small></strong><span className="crab-record-badge">{(result?.score??own?.score??0)>0&&(result?.score??own?.score??0)>=best?'최고 기록 달성! 🏆':`최고 기록 ${best.toLocaleString()}점`}</span></div><p className="crab-score-breakdown">생존 {result?.baseScore??own?.baseScore??0}점 + 행렬 보너스 <b>{result?.bonus??own?.bonus??0}점</b></p><div className="crab-result-metrics"><span><Timer/><small>생존 시간</small><b>{secondsLabel(result?.seconds??seconds)}</b></span><span><span>🦀</span><small>게 행렬</small><b>{result?.chain??chain}마리</b></span><span><Trophy/><small>획득 골드</small><b>{result?`+${result.gold}`:'저장 중…'}</b></span></div></div><div className="crab-result-actions"><button className="crab-secondary crab-home" disabled={status!=='finished'} onClick={()=>{if(onHome)onHome();else setStatus('ready');}}><Home size={18}/>처음으로</button>{status==='settle'&&<button className="crab-start" onClick={finish}>기록 저장 다시 시도</button>}<GameReplay race={race} me={me} rematch={rematch} settled={status==='finished'} onReplay={start} onSoloReplay={onSoloReplay}/></div></div></div>}
      {!['ready','loading'].includes(status)&&<button className="crab-audio" aria-label={music?.enabled?'해변 소리 끄기':'해변 소리 켜기'} onClick={()=>{sound.current?.unlock();music?.toggle();}}>{music?.enabled?<Volume2 size={17}/>:<VolumeX size={17}/>}<span>해변의 소리</span></button>}
    </div>
    <div className="crab-footer"><div><span className="crab-eyebrow">SUN, SAND & A VERY LONG LINE OF CRABS</span><h3>평화로운 해변의 수상한 행렬</h3><p>{target.nickname}의 별 · {race?'마지막 한 명이 될 때까지 살아남으세요. 모든 게 행렬을 조심해요.':'기본 10점/초 + 추가 게 1마리당 2점/초 · 20초부터 골드 보상'}</p></div><span className="crab-footer-icon"><Shell size={32}/></span></div>
    <p className="crab-guide"><Footprints size={16}/><strong>WASD / 방향키</strong> 이동 <span>·</span> 대각선 이동 가능 <span>·</span> 내 행렬과 상대 행렬 모두 조심하세요.</p>
  </div>;
}
