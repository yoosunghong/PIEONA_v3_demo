import React,{useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {ArrowLeft,ArrowRight,ArrowUp,Play,RotateCcw,Flag,Timer,Flower2,Volume2,VolumeX,Sprout} from 'lucide-react';
import {api} from './api';
import {loadAsset} from './avatar';
import {createRunMotion} from './avatarMotion.mjs';
import {dressAvatar,disposeObject} from './worldAssets';
import {useBackgroundMusic} from './BackgroundMusic';
import {createRunnerWorld} from './runnerWorld';
import {createRunnerAudio} from './runnerAudio.mjs';
import {newRun,runScore,runDistance,runSpeed,RUN_DISTANCE,RUN_DURATION,RUN_MAX_SPEED,RUN_SPEED_INTERVAL,RUN_SPEED_STEP,SEED_POINTS} from '../shared/runner.mjs';
import {reconcileRun,runTime,predictRunInput,acknowledgeJump,visualJumpTime,runnerPose} from '../shared/runnerSync.mjs';
import './runner.css';

export default function Runner({target,me,notify,onReward,anonymous,socket,race}){
  const [status,setStatus]=useState('ready'),[game,setGame]=useState(null),[hud,setHud]=useState(newRun()),[result,setResult]=useState(null),[ready,setReady]=useState(false),[error,setError]=useState(''),[snapshot,setSnapshot]=useState(null),[audioBlocked,setAudioBlocked]=useState(false),[ending,setEnding]=useState(null),[spectating,setSpectating]=useState(false);
  const music=useBackgroundMusic(),audio=useRef(),mount=useRef(),selfTag=useRef(),otherTag=useRef(),resultTitle=useRef();
  const [pickups,setPickups]=useState([]),pickupCount=useRef(0),effects=useRef();
  useEffect(()=>{effects.current=createRunnerAudio(window.AudioContext||window.webkitAudioContext);return()=>effects.current?.dispose();},[]);
  useEffect(()=>{
    const count=hud.collectedSeeds||0,previous=pickupCount.current;
    if(count<=previous)return;
    pickupCount.current=count;
    const next=Array.from({length:count-previous},(_,i)=>previous+i+1);
    setPickups(current=>[...current,...next].slice(-8));
    if(musicRef.current?.enabled!==false)effects.current?.seed(musicRef.current?.volume??.3);
  },[hud.collectedSeeds]);
  useEffect(()=>{if(ending&&!spectating)resultTitle.current?.focus();},[!!ending,spectating]);
  const raceRef=useRef(race);raceRef.current=race;
  const musicRef=useRef(music);musicRef.current=music;
  const ref=useRef({active:true,state:newRun(),authoritative:newRun(),pending:[],seq:0,requests:new Set(),queue:Promise.resolve(),lastInput:-200,clock:{start:0,time:0,correction:0},lastSnapshot:0});
  function begin(g,start){
    Object.assign(ref.current,{game:g,state:newRun(),authoritative:newRun(),pending:[],seq:0,requests:new Set(),queue:Promise.resolve(),lastInput:-200,finished:false,finishing:false,ended:false,visualJump:null,clock:{start,time:0,correction:0}});
    pickupCount.current=0;setPickups([]);
    setResult(null);setEnding(null);setSpectating(false);setHud(newRun());setGame(g);setStatus('playing');
  }
  useEffect(()=>{ref.current.active=true;return()=>{const s=ref.current;s.active=false;if(raceRef.current)socket?.emit('runner:leave',{});if(s.game&&!s.finished)api(`/games/${s.game.id}/abandon`,{method:'POST'}).catch(()=>{});};},[]);
  useEffect(()=>{if(!race||!ready)return;socket?.timeout(5000).emit('runner:ready',{id:race.id},(err,r)=>{if(err||!r?.ok)notify(r?.error||'함께 출발하지 못했어요. 목록으로 돌아가 다시 초대해주세요.');});},[race?.id,ready,socket]);
  useEffect(()=>{if(race?.game&&ref.current.game?.id!==race.game.id)begin(race.game,performance.now()-(race.game.serverTime-race.game.started));},[race?.game?.id]);
  function apply(data,sent){
    const s=ref.current;if(!s.active||s.finished||!s.game)return;
    const reconciled=reconcileRun(s.authoritative,data.state,s.pending,s.game.notes);if(!reconciled)return;
    s.visualJump=acknowledgeJump(s.visualJump,s.authoritative,data.state);
    Object.assign(s,{authoritative:reconciled.authoritative,state:reconciled.predicted,pending:reconciled.pending});
    // Broadcast arrival jitter never resets the track clock.
    if(sent!==undefined){const now=performance.now(),candidate=now-data.elapsed-(now-sent)/2,change=THREE.MathUtils.clamp((candidate-s.clock.start)*.12,-12,12);s.clock.start+=change;s.clock.correction+=change;}
    if(!data.state.lives||data.elapsed>=s.game.duration){
      s.ended=true;setEnding(data.state);setHud(data.state);setStatus('ending');finish();
    }
  }
  useEffect(()=>{
    if(!race||!socket)return;
    const receive=data=>{if(data.id!==race.id)return;ref.current.lastSnapshot=performance.now();latestSnapshot.current=data;setSnapshot(data);const own=data.players.find(p=>p.userId===me.id);if(own)apply({state:own.state,elapsed:data.elapsed});};
    socket.on('runner:snapshot',receive);return()=>socket.off('runner:snapshot',receive);
  },[race?.id,socket,me.id]);
  const latestSnapshot=useRef();latestSnapshot.current=snapshot;
  async function start(){effects.current?.unlock();setStatus('loading');setResult(null);try{const sent=performance.now();const g=await api('/games',{method:'POST',body:{targetId:target.id,kind:'runner',anonymous}});if(!ref.current.active){api(`/games/${g.id}/abandon`,{method:'POST'}).catch(()=>{});return;}begin(g,(sent+performance.now())/2);}catch(e){if(ref.current.active){notify(e.message);setStatus('ready');}}}
  function playMusic(){if(!audio.current||!musicRef.current?.enabled)return;audio.current.play().then(()=>setAudioBlocked(false)).catch(e=>{if(e.name==='NotAllowedError')setAudioBlocked(true);});}
  useEffect(()=>{
    if(status!=='playing')return;
    const player=audio.current,restore=music?.interrupt();playMusic();
    return()=>{player?.pause();if(player)player.currentTime=0;restore?.();};
  },[status,music?.interrupt]);
  useEffect(()=>{if(audio.current)audio.current.volume=music?.volume??.3;if(status==='playing'){if(music?.enabled)playMusic();else audio.current?.pause();}},[music?.volume,music?.enabled,status]);
  function input(action){
    effects.current?.unlock();
    const s=ref.current,now=performance.now();if(!s.game||s.ended||s.finished||s.finishing||now-s.lastInput<120)return;
    const elapsed=runTime(s.clock,now,s.game.duration),predicted=predictRunInput(s.state,s.game.notes,elapsed,action);if(!predicted)return;
    s.lastInput=now;playMusic();const entry={seq:++s.seq,action,elapsed};s.pending.push(entry);s.state=predicted;
    if(action==='jump')s.visualJump={seq:entry.seq,at:elapsed};
    const gameId=s.game.id;
    const http=async()=>{const sent=performance.now();const data=await api(`/games/${gameId}/action`,{method:'POST',body:{action,seq:entry.seq}});if(s.game?.id===gameId)apply(data,sent);};
    let request;
    if(raceRef.current&&socket?.connected){
      const sent=performance.now();request=new Promise((resolve,reject)=>socket.timeout(2500).emit('runner:action',{id:gameId,action,seq:entry.seq},(err,data)=>{if(err){http().then(resolve,reject);return;}if(!data?.ok){reject(new Error(data?.error||'입력을 전달하지 못했어요.'));return;}if(s.game?.id===gameId)apply(data,sent);resolve();}));
    }else{request=s.queue.then(http);s.queue=request.catch(()=>{});}
    s.requests.add(request);request.catch(e=>{
      if(!s.active||s.game?.id!==gameId)return;
      s.pending=s.pending.filter(p=>p.seq!==entry.seq);
      if(s.visualJump?.seq===entry.seq&&s.visualJump.serverAt===undefined)s.visualJump=null;
      const restored=reconcileRun(s.authoritative,s.authoritative,s.pending,s.game.notes);if(restored)s.state=restored.predicted;
      notify(e.message);
    }).finally(()=>s.requests.delete(request));
  }
  async function finish(){
    const s=ref.current;if(!s.game||s.finishing||s.finished)return;s.finishing=true;
    try{await Promise.allSettled([...s.requests]);const r=await api(`/games/${s.game.id}/finish`,{method:'POST'});s.finished=true;if(s.active){setResult(r);setStatus('finished');onReward();}}
    catch(e){if(s.active){notify(e.message);setStatus('settle');}}
    finally{s.finishing=false;}
  }
  useEffect(()=>{
    if(status!=='playing')return;let inFlight=false;
    const poll=setInterval(async()=>{
      const s=ref.current;if(inFlight||s.finishing||s.finished)return;
      if(raceRef.current&&performance.now()-s.lastSnapshot<1500)return;
      inFlight=true;try{await s.queue;const sent=performance.now(),data=await api(`/games/${s.game.id}/state`);apply(data,sent);}catch(e){if(s.active)notify(e.message);}finally{inFlight=false;}
    },850);
    function key(e){if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;const action=['a','arrowleft'].includes(e.key.toLowerCase())?'left':['d','arrowright'].includes(e.key.toLowerCase())?'right':[' ','arrowup','w'].includes(e.key.toLowerCase())?'jump':null;if(action){e.preventDefault();input(action);}}
    window.addEventListener('keydown',key);return()=>{clearInterval(poll);window.removeEventListener('keydown',key);};
  },[status]);
  useEffect(()=>{
    const el=mount.current;let disposed=false,frame,renderer,avatar,opponentAvatar,runMotion,opponentMotion;setReady(false);setError('');
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch{setError('3D 화면을 열 수 없어요. 브라우저의 하드웨어 가속을 확인해주세요.');return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;el.appendChild(renderer.domElement);
    const world=new THREE.Scene();world.fog=new THREE.Fog('#d8eaff',48,110);
    const camera=new THREE.PerspectiveCamera(55,1,.1,160);camera.position.set(0,4.1,7.8);camera.lookAt(0,1.6,-10);
    world.add(new THREE.HemisphereLight('#e8f5ff','#c9bdad',2.2));const sun=new THREE.DirectionalLight('#fff3d6',3.2);sun.position.set(-9,16,7);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-9,right:9,top:12,bottom:-12,near:.5,far:48});sun.shadow.bias=-.0005;world.add(sun);world.add(sun.target);
    const environment=createRunnerWorld(world);
    const player=new THREE.Group(),opponent=new THREE.Group();world.add(player,opponent);player.rotation.y=opponent.rotation.y=Math.PI;opponent.visible=false;
    const shadowMat=new THREE.MeshBasicMaterial({color:'#5b7192',transparent:true,opacity:.16,depthWrite:false}),shadowGeo=new THREE.CircleGeometry(.65,24),shadows=[];
    for(let i=0;i<2;i++){const o=new THREE.Mesh(shadowGeo,shadowMat);o.rotation.x=-Math.PI/2;o.position.y=.012;world.add(o);shadows.push(o);}
    function prepare(asset,look,parent){const model=clone(asset);const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());model.scale.setScalar(2.25/size.y);const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());model.position.set(-center.x,-bounds.min.y,-center.z);parent.add(model);dressAvatar(model,look);return model;}
    const other=raceRef.current?.players.find(p=>p.userId!==me.id);
    Promise.all([loadAsset(me.appearance?.character),other?loadAsset(other.appearance?.character):Promise.resolve(null)]).then(([asset,otherAsset])=>{if(disposed)return;avatar=prepare(asset,me.appearance,player);runMotion=createRunMotion(avatar);if(other){opponentAvatar=prepare(otherAsset,other.appearance,opponent);opponentMotion=createRunMotion(opponentAvatar);}setReady(true);}).catch(()=>{if(!disposed)setError('캐릭터를 불러오지 못했어요. 게임 목록으로 돌아가 다시 시도해주세요.');});
    const clock=new THREE.Clock(),tagPoint=new THREE.Vector3();let currentGame,lastHud=0;
    function positionTag(tag,model){if(!tag)return;tagPoint.set(model.position.x,model.position.y+2.65,model.position.z).project(camera);tag.style.left=`${(tagPoint.x*.5+.5)*100}%`;tag.style.top=`${(-tagPoint.y*.5+.5)*100}%`;tag.hidden=!model.visible;}
    function render(){
      if(disposed)return;frame=requestAnimationFrame(render);const dt=Math.min(clock.getDelta(),.05),time=clock.elapsedTime,s=ref.current;
      if(document.hidden)return;
      const matchTime=s.game?runTime(s.clock,performance.now(),Infinity):0;
      const t=s.ended?s.authoritative.elapsed:Math.min(matchTime,s.game?.duration||RUN_DURATION);
      if(s.game!==currentGame){currentGame=s.game;environment.setNotes(currentGame?.notes||[]);}
      const pose=runnerPose(s.state,s.game?.notes||[],matchTime,{finished:s.ended||s.finished,jumpAt:visualJumpTime(s.visualJump,s.state)});
      const predicted=pose.state,moving=!!s.game&&pose.moving;
      environment.update(t,runDistance(t),predicted.resolved);
      const blend=1-Math.exp(-18*dt);
      player.position.x+=((predicted.lane-1)*2.4-(raceRef.current ? .45 : 0)-player.position.x)*blend;
      player.position.y=pose.jump+(runMotion?.update(time,moving)||0);
      player.visible=!(predicted.lastCollision&&matchTime-predicted.lastCollision<650&&Math.floor(matchTime/90)%2);
      const other=latestSnapshot.current?.players.find(p=>p.userId!==me.id);
      if(opponentAvatar){
        opponent.visible=!other?.left;
        const remote=runnerPose(other?.state||newRun(),s.game?.notes||[],matchTime,{finished:!other||other.finished});
        opponent.position.x+=((remote.state.lane-1)*2.4+.45-opponent.position.x)*(1-Math.exp(-12*dt));opponent.position.z=-1.7;
        const y=remote.jump+(opponentMotion?.update(time,remote.moving)||0);opponent.position.y+=(y-opponent.position.y)*(1-Math.exp(-24*dt));
      }
      shadows.forEach((o,i)=>{const p=i?opponent:player;o.visible=p.visible;o.position.x=p.position.x;o.position.z=p.position.z;o.scale.setScalar(Math.max(.45,1-p.position.y*.17));});
      renderer.render(world,camera);positionTag(selfTag.current,player);positionTag(otherTag.current,opponent);
      if(s.game&&time-lastHud>.1){lastHud=time;if(s.active&&!s.ended&&!s.finished)setHud(predicted);}
    }render();
    const observer=new ResizeObserver(()=>{const {width,height}=el.getBoundingClientRect();if(width&&height){renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();}});observer.observe(el);
    return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();for(const model of [avatar,opponentAvatar])model?.traverse(o=>{if(o.userData.generated)disposeObject(o);if(o.isSkinnedMesh)o.skeleton.dispose();});environment.dispose();shadowGeo.dispose();shadowMat.dispose();renderer.dispose();renderer.domElement.remove();};
  },[me.id,JSON.stringify(me.appearance),race?.id]);
  const distance=runDistance(hud.elapsed),other=race?.players.find(p=>p.userId!==me.id),progress=distance/RUN_DISTANCE*100,seconds=Math.max(0,((game?.duration||RUN_DURATION)-hud.elapsed)/1000);
  const players=race?race.players:[{userId:me.id,nickname:me.nickname}];
  const ranked=players.map(p=>({...p,live:snapshot?.players.find(v=>v.userId===p.userId)})).sort((a,b)=>(b.live?.score??(b.userId===me.id?runScore(hud):0))-(a.live?.score??(a.userId===me.id?runScore(hud):0)));
  return <div className="panel-body runner sky-runner" onPointerDownCapture={()=>effects.current?.unlock()}>
    <audio ref={audio} src="/audio/splash-and-play.mp3" preload="auto" loop onError={()=>notify('달리기 음악을 불러오지 못했어요. 재생을 다시 시도해주세요.')}/>
    <div className="runner-stage">
      <div className="runner-viewport" ref={mount} aria-label="하늘섬 구름 달리기 3D 트랙"/>
      <div className="sky-top"><div className="sky-brand"><Flower2/><div><b>PIEONA</b><small>미니게임 · 하늘 달리기</small></div></div><div className="sky-timer"><Timer size={19}/>{String(Math.floor(seconds/60)).padStart(2,'0')}:{(seconds%60).toFixed(1).padStart(4,'0')}</div></div>
      <div className="sky-progress" aria-label={`완주 거리 ${Math.floor(distance)} / ${RUN_DISTANCE}m`}><div><span style={{width:`${progress}%`}}/></div><Flag size={19}/><small>{Math.floor(distance).toLocaleString()} / {RUN_DISTANCE.toLocaleString()}m</small></div>
      <div className="sky-standings"><strong>{ranked.findIndex(p=>p.userId===me.id)+1}<small> / {players.length}</small></strong><ol>{ranked.map(p=><li key={p.userId} className={p.userId===me.id?'is-me':''}><Flower2 size={16}/><span>{p.nickname}{p.userId===me.id?' · 나':''}</span><small>{p.live?.left?'나감':(p.userId===me.id?runScore(hud):p.live?.score||0).toLocaleString()}</small></li>)}</ol></div>
      <div className="sky-hint"><span>{runSpeed(hud.elapsed).toFixed(1)} m/s · {runSpeed(hud.elapsed)>=RUN_MAX_SPEED?'최고 속도!':`${RUN_SPEED_INTERVAL/1000}초마다 +${RUN_SPEED_STEP} m/s`}</span><br/><strong>분홍 울타리는 점프해요.</strong><br/><span>초록 링 씨앗을 모으면 +{SEED_POINTS}점!</span><div className="sky-seeds" aria-label={`씨앗 ${hud.collectedSeeds||0}개 수집`}><Sprout size={19}/><b key={hud.collectedSeeds||0}>{hud.collectedSeeds||0}개</b><small>+{((hud.collectedSeeds||0)*SEED_POINTS).toLocaleString()}점</small></div></div>
      <span className="sky-name self" ref={selfTag}>{me.nickname} · 나</span>{other&&<span className="sky-name" ref={otherTag}>{other.nickname}</span>}
      <div className="sky-pickups" aria-live="polite" aria-atomic="false">{pickups.map(id=><span key={id} className="sky-pickup" style={{'--pickup-x':`${(id%3-1)*46}px`}} onAnimationEnd={()=>setPickups(current=>current.filter(value=>value!==id))}><Sprout size={23}/>+{SEED_POINTS}점</span>)}</div>
      <div className="sky-lives" aria-label={`남은 목숨 ${hud.lives}개`}>{'♥'.repeat(hud.lives)}<span>{'♥'.repeat(3-hud.lives)}</span></div>
      {status==='playing'&&hud.elapsed<3000&&<div className="sky-countdown" role="status"><b>{Math.max(1,Math.ceil((3000-hud.elapsed)/1000))}</b><span>하늘을 향해, 준비!</span></div>}
      {!ready&&!error&&<div className="sky-message" role="status">하늘섬과 캐릭터를 준비하고 있어요…</div>}
      {error&&<div className="sky-message" role="alert">{error}</div>}
      {status==='playing'&&<div className="runner-controls sky-controls"><div><button aria-label="왼쪽 이동" onPointerDown={e=>{e.preventDefault();input('left');}}><ArrowLeft/></button><button aria-label="오른쪽 이동" onPointerDown={e=>{e.preventDefault();input('right');}}><ArrowRight/></button></div><button className="sky-jump" onPointerDown={e=>{e.preventDefault();input('jump');}}><ArrowUp/><span>JUMP</span></button></div>}
      <button className="sky-audio" aria-label={audioBlocked?'달리기 음악 재생':music?.enabled?'게임 음악 끄기':'게임 음악 켜기'} onClick={()=>{if(audioBlocked)playMusic();else music?.toggle();}}>{music?.enabled?<Volume2 size={17}/>:<VolumeX size={17}/>}<span>{audioBlocked?'음악 재생':'Splash & Play'}</span></button>
      {ending&&!spectating&&<div className={'sky-ending '+(ending.lives?'complete':'game-over')}>
        <div className="sky-result-card" role="status" aria-live="polite">
          <img src="/images/minigames/runner-game-over.webp" alt="구름에 앉아 쉬는 새싹 마스코트와 달리기 깃발"/>
          <div className="sky-result-copy"><span className="eyebrow">{ending.lives?'RUN COMPLETE':'GAME OVER'}</span>
            <h3 ref={resultTitle} tabIndex={-1}>{ending.lives?'하늘섬 완주!':'잠깐 쉬어가도 괜찮아'}</h3>
            <strong>{(result?.score??runScore(ending)).toLocaleString()}<small> SCORE</small></strong>
            <p>{result?`장애물 ${result.hits} / ${result.total}개 통과 · 씨앗 ${result.collectedSeeds}개 (+${(result.collectedSeeds*SEED_POINTS).toLocaleString()}점) · +${result.gold} 골드`:status==='settle'?'기록 저장을 다시 시도해주세요.':'달린 기록을 저장하고 있어요…'}</p>
            {status==='finished'&&!race&&<button className="primary" onClick={start}><RotateCcw size={16}/>다시 달리기</button>}
            {status==='settle'&&<button className="primary" onClick={finish}>기록 저장 다시 시도</button>}
            {race&&<button className="secondary" onClick={()=>setSpectating(true)}>상대 달리기 지켜보기</button>}
          </div>
        </div>
      </div>}
    </div>
    <div className="sky-footer"><div><span className="eyebrow">CLOUD RUN · SKY KINGDOM</span><h3>구름 위로, 함께 달려요</h3><p>{target.nickname}의 마을 · {race?'이웃과 함께하는 2인 달리기':'나의 캐릭터로 떠나는 하늘섬'}</p></div>{status==='playing'?<strong className="sky-score">{runScore(hud).toLocaleString()}<small> SCORE</small></strong>:!race&&status!=='finished'&&status!=='settle'?<button className="primary" disabled={!ready||status==='loading'} onClick={start}><Play size={17}/>{status==='loading'?'출발 준비 중…':'달리기 시작'}</button>:null}</div>
    {race&&!game?<p className="runner-guide" role="status">{ready?'두 사람의 준비가 끝나면 함께 출발해요…':'캐릭터와 트랙을 준비하고 있어요…'}</p>:ending?<div className="runner-end-summary"><span>{result?`${result.score.toLocaleString()}점 · +${result.gold} 골드 · 마을 기록 저장 완료`:'달리기 종료 · 기록 저장 중'}</span>{spectating&&<button className="text-button" onClick={()=>setSpectating(false)}>내 결과 보기</button>}</div>:<p className="runner-guide"><strong>← → / A · D</strong> 길 바꾸기 <span>·</span> <strong>스페이스 / ↑ / W</strong> 점프 <span>·</span> 목숨 3개로 {RUN_DISTANCE.toLocaleString()}m를 완주해요. 속도가 점점 올라가요! 씨앗 1개당 +{SEED_POINTS}점 · 장애물 8개 통과부터 보상.</p>}
  </div>;
}
