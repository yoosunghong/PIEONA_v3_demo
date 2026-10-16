import React,{useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {Timer,Footprints,Play,RotateCcw,Volume2,VolumeX,Trophy,Waves,Shell,Users,MoveUpRight} from 'lucide-react';
import {api} from './api';
import {loadAsset} from './avatar';
import {dressAvatar,disposeObject} from './worldAssets';
import {createRunMotion} from './avatarMotion.mjs';
import {useBackgroundMusic} from './BackgroundMusic';
import TouchJoystick from './TouchJoystick';
import {createCrabWorld} from './crabWorld';
import {createCrabAudio} from './crabAudio.mjs';
import {newCrabMotion,predictCrabMotion,reconcileCrabMotion,crabClientTime,syncCrabClock,crabCameraSize} from './crabMotion.mjs';
import {newCrabGame,crabSnapshot,crabSeconds} from '../shared/crab.mjs';
import './crab.css';

const secondsLabel=seconds=>{const tenths=Math.floor(seconds*10+1e-7);return `${Math.floor(tenths/600).toString().padStart(2,'0')}:${((tenths%600)/10).toFixed(1).padStart(4,'0')}`;};
export default function CrabChase({target,me,notify,onReward,anonymous,socket,race}){
  const mount=useRef(),mini=useRef(),stick=useRef({x:0,y:0}),keys=useRef(new Set()),engine=useRef({}),sound=useRef(),tags=useRef(new Map()),title=useRef();
  const [status,setStatus]=useState('ready'),[ready,setReady]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null),[hud,setHud]=useState(()=>crabSnapshot(newCrabGame([me.id])));
  const music=useBackgroundMusic(),live=useRef({});live.current={me,race,status,music,notify,onReward};
  function axis(){const k=keys.current;let x=(k.has('KeyD')||k.has('ArrowRight')?1:0)-(k.has('KeyA')||k.has('ArrowLeft')?1:0),z=(k.has('KeyS')||k.has('ArrowDown')?1:0)-(k.has('KeyW')||k.has('ArrowUp')?1:0);if(!x&&!z){x=stick.current.x;z=stick.current.y;}const n=Math.max(1,Math.hypot(x,z));return{x:x/n,z:z/n};}
  function begin(g,sent){const now=performance.now(),elapsed=(g.serverTime-g.started)+(sent===undefined?0:(now-sent)/2),own=g.snapshot.players.find(p=>p.id===me.id);Object.assign(engine.current,{game:g,snapshot:g.snapshot,received:now,clock:{start:now-elapsed,time:g.snapshot.elapsed},motion:newCrabMotion(own,g.snapshot.elapsed),seq:0,lastSend:-Infinity,lastAxis:{x:0,z:0},lastClockSync:-Infinity,finishing:false,finished:false,ending:false});setHud(g.snapshot);setResult(null);setStatus('playing');}
  async function start(){
    if(!socket?.connected){notify('마을 연결이 준비되면 시작할 수 있어요.');return;}
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
  useEffect(()=>{if(race&&ready)socket?.timeout(5000).emit('runner:ready',{id:race.id},(err,r)=>{if(err||!r?.ok)setError(r?.error||'준비 연결이 끊겼어요. 목록에서 다시 초대해주세요.');});},[race?.id,ready,socket]);
  useEffect(()=>{
    function receive(data){const e=engine.current;if(!e.game||data.roomId!==e.game.roomId||e.finished)return;
      if(e.snapshot&&data.elapsed<e.snapshot.elapsed)return;
      const previous=e.snapshot?.players.find(p=>p.id===me.id),own=data.players.find(p=>p.id===me.id);
      if(own?.chain.length>previous?.chain.length)sound.current?.tone('join');
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
    function send(force=false){const e=engine.current;if(!e.game||e.snapshot?.ended||!socket?.connected)return;
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
  useEffect(()=>{sound.current?.set(music?.enabled??true,music?.volume??.3,status==='playing');if(status==='playing')return music?.interrupt();},[status,music?.enabled,music?.volume,music?.interrupt]);
  useEffect(()=>{if(result)title.current?.focus();},[result]);

  useEffect(()=>{
    const el=mount.current;let disposed=false,frame,renderer;const avatars=[],owned=[];setReady(false);setError('');
    try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch{setError('3D 화면을 열 수 없어요. 브라우저 하드웨어 가속을 확인해주세요.');return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;el.appendChild(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color('#72d2ca');scene.add(new THREE.HemisphereLight('#eaffff','#c39a62',2.4));
    const sun=new THREE.DirectionalLight('#fff0d3',3.2);sun.position.set(-18,30,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-29,right:29,top:29,bottom:-29,near:1,far:85});sun.shadow.bias=-.0006;scene.add(sun);
    const camera=new THREE.OrthographicCamera(-22,22,15,-15,.1,130);camera.position.set(0,52,20);camera.lookAt(0,0,0);
    const world=createCrabWorld(scene),players=race?.players||[{userId:me.id,nickname:me.nickname,appearance:me.appearance}];
    const ringGeometry=new THREE.RingGeometry(.62,.74,32),ringMaterials=[],contactGeometry=new THREE.CircleGeometry(.58,24),contactMaterial=new THREE.MeshBasicMaterial({color:'#775a3d',transparent:true,opacity:.2,depthWrite:false});
    for(const p of players){
      const group=new THREE.Group();scene.add(group);
      const material=new THREE.MeshBasicMaterial({color:p.userId===me.id?'#29c7ba':'#8982ff',side:THREE.DoubleSide,transparent:true,opacity:.9});ringMaterials.push(material);
      const ring=new THREE.Mesh(ringGeometry,material);ring.rotation.x=-Math.PI/2;ring.position.y=.025;group.add(ring);
      const contact=new THREE.Mesh(contactGeometry,contactMaterial);contact.rotation.x=-Math.PI/2;contact.position.y=.018;group.add(contact);
      avatars.push({group,p,ring,model:null,motion:null});
    }
    Promise.all(avatars.map(async a=>{
      try{const asset=await loadAsset(a.p.appearance?.character);if(disposed)return;const model=clone(asset),size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());model.scale.setScalar(2.25/size.y);const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());model.position.set(-center.x,-bounds.min.y,-center.z);dressAvatar(model,a.p.appearance);model.traverse(o=>{if(o.isMesh)o.castShadow=false;});a.group.add(model);a.model=model;a.motion=createRunMotion(model);}
      catch{if(disposed)return;const geo=new THREE.CapsuleGeometry(.4,.9,5,10),mat=new THREE.MeshStandardMaterial({color:a.p.userId===me.id?'#4fc9bc':'#a296ea'});owned.push(geo,mat);const model=new THREE.Mesh(geo,mat);model.position.y=.9;a.group.add(model);a.model=model;}
    })).then(()=>{if(!disposed)setReady(true);});
    const clock=new THREE.Clock(),projected=new THREE.Vector3(),center=new THREE.Vector3();let lastMini=0;
    const preview=crabSnapshot(newCrabGame(players.map(p=>p.userId)));
    function render(){
      if(disposed)return;frame=requestAnimationFrame(render);const dt=Math.min(clock.getDelta(),.05),time=clock.elapsedTime;if(document.hidden)return;
      const e=engine.current,snapshot=e.snapshot||preview;world.update(snapshot,time,dt);
      const input=axis(),playing=live.current.status==='playing'&&!snapshot.ended;
      if(playing)e.sendInput?.();
      const pose=playing&&e.motion?predictCrabMotion(e.motion,input,Math.min(crabClientTime(e.clock,performance.now()),snapshot.elapsed+500),dt):null;
      for(const a of avatars){
        const p=snapshot.players.find(p=>p.id===a.p.userId);if(!p)continue;
        const local=p.id===me.id&&pose,visual=local||p,blend=local?1:1-Math.exp(-20*dt),x=visual.x,z=visual.z;
        const moving=(local?Math.hypot(input.x,input.z)>.02&&snapshot.elapsed>=3000:Math.hypot(x-a.group.position.x,z-a.group.position.z)>.03)&&p.alive&&!snapshot.ended;
        a.group.position.x+=(x-a.group.position.x)*blend;a.group.position.z+=(z-a.group.position.z)*blend;
        a.group.rotation.y+=Math.atan2(Math.sin(visual.angle-a.group.rotation.y),Math.cos(visual.angle-a.group.rotation.y))*(1-Math.exp(-24*dt));
        const hop=a.motion?.update(time,moving)||0;if(a.model)a.model.position.y+=hop-(a.hop||0);a.hop=hop;
        a.ring.material.opacity=p.alive ? .9 : .25;
        if(a.model)a.model.rotation.z=p.alive?0:Math.PI*.4;
      }
      const own=avatars.find(a=>a.p.userId===me.id)?.group.position;
      center.x+=((own?THREE.MathUtils.clamp(own.x,-16,16):0)-center.x)*(1-Math.exp(-10*dt));center.z+=((own?THREE.MathUtils.clamp(own.z,-16,16):0)-center.z)*(1-Math.exp(-10*dt));camera.position.set(center.x,52,center.z+20);camera.lookAt(center.x,0,center.z);camera.updateMatrixWorld();
      for(const a of avatars){const tag=tags.current.get(a.p.userId);if(tag){projected.set(a.group.position.x,2.8,a.group.position.z).project(camera);tag.style.left=`${(projected.x*.5+.5)*100}%`;tag.style.top=`${(-projected.y*.5+.5)*100}%`;tag.hidden=projected.x < -1||projected.x>1||projected.y < -1||projected.y>1;}}
      renderer.render(scene,camera);
      const context=mini.current?.getContext('2d');if(context&&time-lastMini>=.1){lastMini=time;context.clearRect(0,0,132,132);context.fillStyle='#f5dfb7';context.fillRect(5,5,122,122);context.fillStyle='#53c9c7';context.fillRect(0,0,7,132);context.strokeStyle='#dcb284';context.strokeRect(5,5,122,122);
        for(const c of snapshot.crabs){context.fillStyle=c.mode==='patrol'?'#c68944':c.mode==='chase'?'#ec4439':'#e27457';context.beginPath();context.arc(66+c.x*3,66+c.z*3,1.8,0,Math.PI*2);context.fill();}
        for(const p of snapshot.players){context.fillStyle=p.id===me.id?'#008c88':'#6960e6';context.beginPath();context.arc(66+p.x*3,66+p.z*3,3.8,0,Math.PI*2);context.fill();context.strokeStyle='white';context.lineWidth=1.5;context.stroke();}
      }
    }
    const observer=new ResizeObserver(()=>{const {width,height}=el.getBoundingClientRect();if(width&&height){renderer.setSize(width,height);const {halfWidth,halfHeight}=crabCameraSize(width/height);camera.left=-halfWidth;camera.right=halfWidth;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();}});observer.observe(el);render();
    return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();world.dispose();ringGeometry.dispose();contactGeometry.dispose();contactMaterial.dispose();ringMaterials.forEach(m=>m.dispose());owned.forEach(o=>o.dispose());for(const a of avatars)a.model?.traverse(o=>{if(o.userData.generated)disposeObject(o);if(o.isSkinnedMesh)o.skeleton.dispose();});renderer.dispose();renderer.domElement.remove();};
  },[me.id,JSON.stringify(me.appearance),race?.id]);

  const own=hud.players.find(p=>p.id===me.id),seconds=crabSeconds({elapsed:own?.survived||hud.elapsed}),chain=own?.chain.length||2;
  const players=race?.players||[{userId:me.id,nickname:me.nickname}],ended=['ending','finished','settle'].includes(status),won=race&&hud.winner===me.id;
  return <div className="panel-body crab-game" onPointerDownCapture={()=>sound.current?.unlock()}>
    <div className="crab-stage">
      <div className="crab-viewport" ref={mount} aria-label="게 게 게 해변 탑뷰 게임 화면"/>
      <div className="crab-topbar"><div className="crab-brand"><Shell size={25}/><div><b>게 게 게</b><small>CRAB CHASE · {race?'DUEL':'SURVIVAL'}</small></div></div><div className="crab-timer"><Timer size={18}/><strong>{secondsLabel(seconds)}</strong><small>버틴 시간</small></div><div className="crab-mode">{race?<Users size={15}/>:<Waves size={15}/>}<span>{race?'마지막까지 살아남기':'끝없는 해변 추격전'}</span></div></div>
      <div className="crab-stats"><span className="crab-live-score"><Trophy size={17}/><b>{(own?.score||0).toLocaleString()}</b><small>점 · +{own?.scoreRate||10}점/초</small></span><span>🦀 <b>{chain}</b><small>내 뒤의 게 · 보너스 +{own?.bonus||0}점</small></span><span><MoveUpRight size={16}/><b>{hud.crabs.length}</b><small>해변의 게</small></span></div>
      {players.map(p=><span key={p.userId} className={'crab-name '+(p.userId===me.id?'is-me':'')} ref={el=>{if(el)tags.current.set(p.userId,el);else tags.current.delete(p.userId);}}>{p.nickname}{p.userId===me.id?' · 나':''}</span>)}
      <div className="crab-minimap"><canvas ref={mini} width="132" height="132" aria-label="해변 지도: 청록색은 나, 보라색은 상대, 주황색과 빨간색은 게"/><small>BEACH MAP</small></div>
      <div className="crab-legend"><span><i/>순찰</span><span><i/>추격</span><span><i/>행렬</span></div>
      {status==='playing'&&<TouchJoystick input={stick} disabled={hud.ended} label="해변 이동 조이스틱"/>}
      {status==='playing'&&hud.elapsed<3000&&<div className="crab-countdown" role="status"><strong>{Math.max(1,Math.ceil((3000-hud.elapsed)/1000))}</strong><span>뒤를 조심해요!</span></div>}
      {(['ready','loading'].includes(status))&&<div className="crab-intro"><div className="crab-intro-art"/><div className="crab-intro-copy"><span className="crab-eyebrow">A LITTLE TROUBLE IN PARADISE</span><h2>게, 게, 게!<br/><em>뒤를 돌아보지 마세요.</em></h2><p>평화로운 해변, 끝없이 따라오는 게.<br/>내가 지나온 길이 가장 위험한 길이 돼요.</p><ol><li><b>01</b><span><strong>계속 움직이세요</strong>시작부터 게 두 마리가 따라와요.</span></li><li><b>02</b><span><strong>행렬을 조심하세요</strong>순찰하는 게가 다가오면 꼬리에 합류해요.</span></li><li><b>03</b><span><strong>{race?'상대를 먼저 곤란하게!':'얼마나 버틸 수 있나요?'}</strong>{race?'서로의 게 행렬로 길을 막아보세요.':'긴 행렬을 유지할수록 초당 점수가 올라가요.'}</span></li></ol>{race?<div className="crab-ready-status" role="status">{ready?'친구의 준비를 기다리고 있어요…':'해변을 준비하고 있어요…'}</div>:<button className="crab-start" disabled={!ready||status==='loading'||!!error} onClick={start}><Play size={18}/>{!ready?'해변을 준비하는 중…':status==='loading'?'출발 준비 중…':'해변으로 출발'}<span>→</span></button>}<small className="crab-intro-controls">W A S D / 방향키 · 모바일은 조이스틱</small></div></div>}
      {error&&<div className="crab-error" role="alert">{error}</div>}
      {status==='interrupted'&&<div className="crab-result-overlay"><div className="crab-result"><Waves size={32}/><h3>마을 연결이 끊겼어요</h3><p>연결이 돌아오면 새 게임을 시작할 수 있어요.</p>{!race&&<button className="crab-start" onClick={start}><RotateCcw size={17}/>다시 시작</button>}</div></div>}
      {ended&&<div className="crab-result-overlay"><div className="crab-result" role="status"><div className="crab-result-art"/><div className="crab-result-content"><span className="crab-eyebrow">{race?(won?'YOU SURVIVED':hud.winner?'CAUGHT BY A CRAB':'DRAW'):'CAUGHT BY A CRAB'}</span><h3 ref={title} tabIndex={-1}>{race?(won?'해변의 마지막 생존자!':hud.winner?'이번엔 게가 더 빨랐어요':'동시에 잡혔어요!'):'앗, 게한테 잡혔다!'}</h3><p>{race?'서로의 길을 막는 아슬아슬한 추격전':'도망친 만큼 길어진, 오늘의 게 행렬.'}</p><div className="crab-result-score"><strong>{(result?.score??own?.score??0).toLocaleString()}<small>점</small></strong><span>버틴 시간 {secondsLabel(result?.seconds??seconds)}</span></div><p className="crab-score-breakdown">생존 {result?.baseScore??own?.baseScore??0}점 + 행렬 보너스 <b>{result?.bonus??own?.bonus??0}점</b></p><div className="crab-result-metrics"><span>🦀 행렬 <b>{result?.chain??chain}마리</b></span><span><Trophy size={16}/>{result?`+${result.gold} 골드`:'기록 저장 중…'}</span></div>{status==='settle'?<button className="crab-start" onClick={finish}>기록 저장 다시 시도</button>:!race&&status==='finished'?<button className="crab-start" onClick={start}><RotateCcw size={17}/>한 번 더 도망치기</button>:<p className="crab-save-status">{result?'마을 기록에 저장했어요. 목록에서 다시 초대할 수 있어요.':'버틴 시간을 마을 기록에 남기고 있어요…'}</p>}</div></div></div>}
      {!['ready','loading'].includes(status)&&<button className="crab-audio" aria-label={music?.enabled?'해변 소리 끄기':'해변 소리 켜기'} onClick={()=>{sound.current?.unlock();music?.toggle();}}>{music?.enabled?<Volume2 size={17}/>:<VolumeX size={17}/>}<span>해변의 소리</span></button>}
    </div>
    <div className="crab-footer"><div><span className="crab-eyebrow">SUN, SAND & A VERY LONG LINE OF CRABS</span><h3>평화로운 해변의 수상한 행렬</h3><p>{target.nickname}의 마을 · {race?'상대보다 오래 살아남으세요. 모든 게는 두 사람 모두에게 위험해요.':'기본 10점/초 + 추가 게 1마리당 2점/초 · 20초부터 골드 보상'}</p></div><span className="crab-footer-icon"><Shell size={32}/></span></div>
    <p className="crab-guide"><Footprints size={16}/><strong>WASD / 방향키</strong> 이동 <span>·</span> 대각선 이동 가능 <span>·</span> 내 행렬과 상대 행렬 모두 조심하세요.</p>
  </div>;
}
