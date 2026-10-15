import React,{useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {ArrowLeft,ArrowRight,ArrowUp,Play,RotateCcw} from 'lucide-react';
import {api} from './api';
import {loadAsset} from './avatar';
import {createRunMotion} from './avatarMotion.mjs';
import {dressAvatar,disposeObject,createDecoration} from './worldAssets';
import {newRun,advanceRun,runAction,jumpHeight,runScore} from '../shared/runner.mjs';

export default function Runner({target,me,notify,onReward,anonymous}){
  const[status,setStatus]=useState('ready'),[game,setGame]=useState(null),[hud,setHud]=useState(newRun()),[result,setResult]=useState(null),[ready,setReady]=useState(false),[error,setError]=useState('');
  const mount=useRef(),ref=useRef({active:true,game:null,state:newRun(),start:0,queue:Promise.resolve(),lastInput:0,finishing:false});
  useEffect(()=>{ref.current.active=true;return()=>{const s=ref.current;s.active=false;if(s.game&&!s.finished)api(`/games/${s.game.id}/abandon`,{method:'POST'}).catch(()=>{});};},[]);
  async function start(){setStatus('loading');setResult(null);try{const sent=performance.now();const g=await api('/games',{method:'POST',body:{targetId:target.id,kind:'runner',anonymous}});if(!ref.current.active){api(`/games/${g.id}/abandon`,{method:'POST'}).catch(()=>{});return;}Object.assign(ref.current,{game:g,state:newRun(),start:performance.now()-(performance.now()-sent)/2,finished:false,finishing:false,queue:Promise.resolve(),lastInput:0});setHud(newRun());setGame(g);setStatus('playing');}catch(e){if(ref.current.active){notify(e.message);setStatus('ready');}}}
  function apply(data){const s=ref.current;if(!s.active||s.finished)return;s.state=data.state;s.start=performance.now()-data.elapsed;setHud(data.state);}
  function input(action){const s=ref.current;if(!s.game||s.finished||s.finishing||performance.now()-s.lastInput<120)return;s.lastInput=performance.now();const elapsed=performance.now()-s.start;s.state=runAction(s.state,s.game.notes,elapsed,action);
    s.queue=s.queue.then(async()=>{if(!s.active||s.finished)return;const data=await api(`/games/${s.game.id}/action`,{method:'POST',body:{action}});apply(data);}).catch(e=>{if(s.active)notify(e.message);});
  }
  async function finish(){const s=ref.current;if(s.finishing||s.finished)return;s.finishing=true;try{await s.queue;const r=await api(`/games/${s.game.id}/finish`,{method:'POST'});s.finished=true;if(s.active){setResult(r);setStatus('finished');onReward();}}catch(e){if(s.active&&e.status!==400){notify(e.message);setStatus('settle');}}finally{s.finishing=false;}}
  useEffect(()=>{if(status!=='playing')return;let inFlight=false;
    const poll=setInterval(async()=>{const s=ref.current;if(inFlight||s.finishing||s.finished)return;inFlight=true;try{await s.queue;const data=await api(`/games/${s.game.id}/state`);apply(data);if(!data.state.lives||data.elapsed>=s.game.duration)await finish();}catch(e){if(s.active)notify(e.message);}finally{inFlight=false;}},850);
    function key(e){if(e.repeat)return;const action=['a','arrowleft'].includes(e.key.toLowerCase())?'left':['d','arrowright'].includes(e.key.toLowerCase())?'right':[' ','arrowup','w'].includes(e.key.toLowerCase())?'jump':null;if(action){e.preventDefault();input(action);}}
    window.addEventListener('keydown',key);return()=>{clearInterval(poll);window.removeEventListener('keydown',key);};
  },[status]);
  useEffect(()=>{
    const el=mount.current;let disposed=false,frame,renderer,avatar;setReady(false);setError('');
    try{renderer=new THREE.WebGLRenderer({antialias:true});}catch{setError('3D 화면을 열 수 없어요. 브라우저의 하드웨어 가속을 확인해주세요.');return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;el.appendChild(renderer.domElement);
    const world=new THREE.Scene();world.background=new THREE.Color('#e2effa');world.fog=new THREE.Fog('#e2effa',24,75);
    const camera=new THREE.PerspectiveCamera(52,1,.1,120);camera.position.set(0,3.4,6.3);camera.lookAt(0,1,-7);
    world.add(new THREE.HemisphereLight('#ffffff','#b7bbcf',1.8));const sun=new THREE.DirectionalLight('#fff4df',2.5);sun.position.set(-5,12,6);world.add(sun);
    const owned=new THREE.Group();world.add(owned);const obstacles=new THREE.Group();owned.add(obstacles);
    const mat=color=>new THREE.MeshStandardMaterial({color,roughness:.7});const grass=mat('#b7d6c3'),road=mat('#e5e6f2'),white=mat('#f6fafb'),pink=mat('#d4b3d4'),wood=mat('#bd987a');
    function box(w,h,d,m,x,y,z,parent=owned){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
    box(70,.3,140,grass,0,-.4,-40);box(7.6,.2,120,road,0,-.12,-40);
    for(const x of [-3.9,3.9])box(.22,.3,120,white,x,.04,-40);
    const stripes=[];for(let i=0;i<24;i++)for(const x of [-1.2,1.2])stripes.push(box(.06,.02,1.3,white,x,.01,-i*4));
    const scenery=[];for(let i=0;i<14;i++){const model=createDecoration(i%3===0?'mushroom':i%3===1?'planter':'lantern');model.position.set((i%2?1:-1)*(5.5+i%3),0,-i*6);owned.add(model);scenery.push(model);}
    const player=new THREE.Group();world.add(player);player.rotation.y=Math.PI;
    let runMotion;
    loadAsset().then(asset=>{if(disposed)return;avatar=clone(asset);const b=new THREE.Box3().setFromObject(avatar),size=b.getSize(new THREE.Vector3());avatar.scale.setScalar(2.3/size.y);const bounds=new THREE.Box3().setFromObject(avatar),center=bounds.getCenter(new THREE.Vector3());avatar.position.set(-center.x,-bounds.min.y,-center.z);player.add(avatar);dressAvatar(avatar,me.appearance);
      runMotion=createRunMotion(avatar);setReady(true);
    }).catch(()=>{if(!disposed)setError('캐릭터를 불러오지 못했어요. 게임 목록으로 돌아가 다시 시도해주세요.');});
    let currentGame,models=[];const clock=new THREE.Clock();let lastHud=0;
    function render(){if(disposed)return;frame=requestAnimationFrame(render);const dt=Math.min(clock.getDelta(),.05),time=clock.elapsedTime,s=ref.current;const t=s.game?(s.finished?s.state.elapsed:Math.min(s.game.duration,performance.now()-s.start)):0;
      if(s.game!==currentGame){currentGame=s.game;for(const model of models){obstacles.remove(model);disposeObject(model);}models=[];
        if(currentGame)for(const o of currentGame.notes){const group=new THREE.Group();const m=o.lane===-1?pink:wood;const obstacle=box(o.lane===-1?7:1.7,o.height,.65,m.clone(),0,o.height/2,0,group);for(const x of [-.45,.45])box(.12,o.height+.12,.72,white.clone(),x,o.height/2,0,group);group.position.x=o.lane===-1?0:(o.lane-1)*2.4;group.userData.note=o;obstacles.add(group);models.push(group);}}
      const predicted=s.game?advanceRun(s.state,s.game.notes,t):s.state;
      const moving=s.game&&!s.finished&&predicted.lives>0&&t>3000;const motion=moving?Math.max(0,t-3000)*.011:0;
      player.position.x+=((predicted.lane-1)*2.4-player.position.x)*Math.min(1,dt*18);player.position.y=jumpHeight(t,predicted.jumpAt)+(runMotion?.update(t/1000,moving)||0);
      player.visible=!(predicted.lastCollision&&t-predicted.lastCollision<650&&Math.floor(t/90)%2);
      stripes.forEach((stripe,i)=>{stripe.position.z=8-((Math.floor(i/2)*4-motion)%96+96)%96;});scenery.forEach((model,i)=>{model.position.z=8-((i*6-motion)%84+84)%84;});
      for(const model of models){model.position.z=-(model.userData.note.time-t)*.011;model.visible=model.position.z>-65&&model.position.z<5;}
      if(s.game&&time-lastHud>.1){lastHud=time;if(s.active&&!s.finished)setHud(predicted);}
      renderer.render(world,camera);
    }render();
    const observer=new ResizeObserver(()=>{const {width,height}=el.getBoundingClientRect();if(width&&height){renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();}});observer.observe(el);
    return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();if(avatar)avatar.traverse(o=>{if(o.userData.generated)disposeObject(o);});disposeObject(owned);[grass,road,white,pink,wood].forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();};
  },[me.id,JSON.stringify(me.appearance)]);
  return <div className="panel-body runner"><div className="runner-heading"><span className="eyebrow">CLOUD RUN</span><h3>구름 달리기</h3><p className="tiny">{target.nickname}의 마을에서 나의 캐릭터와 달려요.</p></div><div className="runner-viewport" ref={mount}/>{!ready&&!error&&<p role="status">3D 캐릭터를 준비하는 중…</p>}{error&&<p className="form-error" role="alert">{error}</p>}
    {status==='playing'?<><div className="runner-hud" aria-live="off"><strong>{'♥'.repeat(hud.lives)}{'♡'.repeat(3-hud.lives)}</strong><span>{runScore(hud).toLocaleString()} 점</span><span>{hud.elapsed<3000?`${Math.max(1,Math.ceil((3000-hud.elapsed)/1000))} · 준비!`:`${Math.ceil((45000-hud.elapsed)/1000)}초`}</span></div><div className="runner-controls"><button className="secondary" aria-label="왼쪽 이동" onPointerDown={e=>{e.preventDefault();input('left');}}><ArrowLeft/></button><button className="primary" onPointerDown={e=>{e.preventDefault();input('jump');}}><ArrowUp size={20}/>점프</button><button className="secondary" aria-label="오른쪽 이동" onPointerDown={e=>{e.preventDefault();input('right');}}><ArrowRight/></button></div></>:status==='finished'?<div className="game-result"><h3>{result.lives?'완주했어요!':'다음에는 더 멀리!'}</h3><strong>{result.score.toLocaleString()}<small> SCORE</small></strong><p>장애물 {result.hits} / {result.total}개 통과 · +{result.gold} 골드</p><p className="tiny">이 마을의 구름 달리기 기록에 저장했어요.</p><button className="secondary" onClick={start}><RotateCcw size={15}/>다시 달리기</button></div>:status==='settle'?<button className="primary full" onClick={finish}>기록 저장 다시 시도</button>:<><p className="runner-guide">자동으로 달려요. <strong>← → / A · D</strong>로 길을 바꾸고 <strong>스페이스 / ↑</strong>로 점프하세요. 분홍 울타리는 꼭 점프! 목숨 3개로 45초 동안 달려요.</p><button className="primary full" disabled={!ready||status==='loading'} onClick={start}><Play size={16}/>{status==='loading'?'출발 준비 중…':'달리기 시작'}</button><p className="tiny center">장애물 8개 통과부터 보상 · 리듬게임과 일일 보상 한도 공유</p></>}
  </div>;
}
