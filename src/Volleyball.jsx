import React,{useEffect,useRef,useState} from 'react';
import {Play,RotateCcw,Trophy,ArrowLeft,ArrowRight,ArrowUp,Zap,WifiOff} from 'lucide-react';
import {api} from './api';
import {newVolleyGame} from '../shared/volleyball.mjs';
import {newVolleyClient,predictVolleyInput,reconcileVolley,syncVolleyClock,volleyFrame} from '../shared/volleySync.mjs';
import {drawVolley,drawVolleyCourt} from './volleyCanvas';
import GameReplay,{useGameRematch} from './GameReplay';
import './volleyball.css';

export default function Volleyball({target,me,notify,onReward,anonymous,socket,race,onSoloReplay,autoStart=false}){
  const canvas=useRef(),keys=useRef(new Set()),engine=useRef({active:false}),live=useRef({});
  const [status,setStatus]=useState('ready'),[snapshot,setSnapshot]=useState(()=>newVolleyGame(race?.players.map(p=>p.userId)||[me.id,'ai'])),[result,setResult]=useState(null),[error,setError]=useState(''),[connected,setConnected]=useState(!!socket?.connected);
  live.current={notify,onReward,status,me,race};
  const participants=race?.players||[{userId:me.id,nickname:me.nickname},{userId:'ai',nickname:'몽글 AI'}],names=participants.map(p=>p.nickname||'새싹');
  const ownSide=snapshot.players.findIndex(p=>p.id===me.id);
  const rematch=useGameRematch({race,socket,gameId:engine.current.game?.id,notify});
  function input(){const k=keys.current;return {move:(k.has('KeyD')||k.has('ArrowRight')?1:0)-(k.has('KeyA')||k.has('ArrowLeft')?1:0),jump:k.has('KeyW')||k.has('ArrowUp'),spike:k.has('Space')||k.has('KeyZ')};}
  function send(){const e=engine.current;if(!e.game||e.snapshot?.ended||e.interrupted||!socket?.connected)return;
    const now=performance.now(),packet={id:e.game.id,...input(),seq:++e.seq};predictVolleyInput(e.client,packet,now);
    if(now-(e.lastSync??-Infinity)>=250){e.lastSync=now;socket.emit('volley:input',packet,response=>{if(e.active&&e.game?.id===packet.id&&response?.ok)syncVolleyClock(e.client,response.elapsed,now,performance.now());});}
    else socket.emit('volley:input',packet);
  }
  function begin(g){const e=engine.current,now=performance.now();keys.current.clear();Object.assign(e,{game:g,snapshot:g.snapshot,client:newVolleyClient(g,me.id,now),received:now,seq:0,lastSync:-Infinity,lastHud:now,finishing:false,finished:false,interrupted:false});setSnapshot(g.snapshot);setResult(null);setError('');setStatus('playing');}
  async function start(){
    if(!socket?.connected)return;setStatus('loading');setError('');
    try{const g=await api('/volley-games',{method:'POST',body:{targetId:target.id,anonymous}});if(!engine.current.active){api(`/volley-games/${g.id}/abandon`,{method:'POST'}).catch(()=>{});return;}begin(g);}
    catch(e){if(engine.current.active){setStatus('ready');setError(e.message);}}
  }
  useEffect(()=>{if(autoStart&&connected&&!race&&!engine.current.autoStarted){engine.current.autoStarted=true;start();}},[autoStart,connected]);
  async function finish(){
    const e=engine.current;if(!e.game||e.finishing||e.finished)return;e.finishing=true;const gameId=e.game.id;
    try{const r=await api(`/volley-games/${gameId}/finish`,{method:'POST',body:{}});if(e.active&&e.game?.id===gameId){e.finished=true;setResult(r);setStatus('finished');live.current.onReward();}}
    catch(err){if(e.active&&e.game?.id===gameId){setError(err.message);setStatus('settle');}}finally{if(e.game?.id===gameId)e.finishing=false;}
  }
  async function restart(){const e=engine.current;setStatus('loading');try{if(e.game)await api(`/volley-games/${e.game.id}/abandon`,{method:'POST'});await start();}catch(err){if(e.active){setError(err.message);setStatus('interrupted');}}}
  function receive(data){const e=engine.current;if(!e.active||!e.game||e.game.roomId!==data.roomId||e.finished||e.interrupted)return;
    const now=performance.now();if(!reconcileVolley(e.client,data,now))return;
    const changed=data.scores.some((score,i)=>score!==e.snapshot.scores[i])||data.phase!==e.snapshot.phase;e.snapshot=data;e.received=now;
    if(data.ended||changed||now-e.lastHud>=100){e.lastHud=now;setSnapshot(data);}
    if(data.ended){keys.current.clear();setStatus('ending');finish();}
  }
  useEffect(()=>{engine.current.active=true;return()=>{const e=engine.current;e.active=false;keys.current.clear();if(e.game&&!e.finished)api(`/volley-games/${e.game.id}/abandon`,{method:'POST'}).catch(()=>{});};},[]);
  useEffect(()=>{if(race?.game&&engine.current.game?.id!==race.game.id)begin(race.game);},[race?.game?.id]);
  useEffect(()=>{
    const offline=()=>{setConnected(false);keys.current.clear();const e=engine.current;if(e.game&&!e.finished&&!e.snapshot?.ended){e.interrupted=true;setStatus('interrupted');}},online=()=>setConnected(true);
    socket?.on('volley:snapshot',receive);socket?.on('disconnect',offline);socket?.on('connect',online);
    return()=>{socket?.off('volley:snapshot',receive);socket?.off('disconnect',offline);socket?.off('connect',online);};
  },[socket]);
  useEffect(()=>{
    if(status!=='playing')return;
    const supported=['KeyA','KeyD','KeyW','ArrowLeft','ArrowRight','ArrowUp','Space','KeyZ'];
    function down(event){if(event.ctrlKey||event.metaKey||event.altKey||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||!supported.includes(event.code))return;event.preventDefault();if(keys.current.has(event.code))return;keys.current.add(event.code);send();}
    function up(event){if(supported.includes(event.code)){event.preventDefault();keys.current.delete(event.code);send();}}
    function clear(){keys.current.clear();send();}function hidden(){if(document.hidden)clear();}
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',clear);document.addEventListener('visibilitychange',hidden);
    const heartbeat=setInterval(send,100);let polling=false;
    const poll=setInterval(async()=>{const e=engine.current;if(!e.game||e.finished||polling||performance.now()-e.received<1200)return;polling=true;try{const g=await api(`/volley-games/${e.game.id}/state`);receive({roomId:g.roomId,...g.snapshot});}catch(err){if(e.active)setError(err.message);}finally{polling=false;}},1500);
    return()=>{clear();clearInterval(heartbeat);clearInterval(poll);window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',hidden);};
  },[status,socket]);
  useEffect(()=>{
    let frame;const c=canvas.current.getContext('2d'),backdrop=document.createElement('canvas');backdrop.width=960;backdrop.height=540;drawVolleyCourt(backdrop.getContext('2d'));
    const preview=newVolleyGame(participants.map(p=>p.userId));
    function render(){const e=engine.current;if(!document.hidden){const s=e.client&&!e.interrupted?volleyFrame(e.client,performance.now()):e.snapshot||preview;drawVolley(c,s,{names,ownId:me.id,backdrop});}frame=requestAnimationFrame(render);}
    render();return()=>cancelAnimationFrame(frame);
  },[me.id,participants.map(p=>`${p.userId}:${p.nickname}`).join('|')]);
  function touch(code,pressed,event){event.preventDefault();if(pressed){event.currentTarget.setPointerCapture(event.pointerId);keys.current.add(code);}else keys.current.delete(code);send();}
  function ready(){setStatus('waiting');setError('');socket?.timeout(5000).emit('runner:ready',{id:race.id},(err,r)=>{if(!engine.current.active)return;if(err||!r?.ok){setStatus('ready');setError(r?.error||'준비 연결을 확인해 주세요.');}});}
  const won=result?.winner===me.id;
  return <section className="volley-game" aria-label="몽글 배구">
    <header className="volley-heading"><div><span className="volley-eyebrow">MONGLE VOLLEY · {race?'FRIEND MATCH':'VS AI'}</span><h3>몽글 배구 <span>작은 점프, 짜릿한 한 방!</span></h3></div><span className="volley-rule">7점 선승 · 최대 3분</span></header>
    <div className="volley-scoreboard" aria-label="현재 점수"><span className={ownSide===0?'is-me':''}>{names[0]}{ownSide===0?' · 나':''}</span><strong>{snapshot.scores[0]} <small>:</small> {snapshot.scores[1]}</strong><span className={ownSide===1?'is-me':''}>{names[1]}{ownSide===1?' · 나':''}</span></div>
    <div className="volley-court"><canvas ref={canvas} width="960" height="540" role="img" aria-label="해변 배구 코트. 왼쪽과 오른쪽 선수가 네트를 사이에 두고 공을 주고받아요."/>
      {status==='interrupted'&&<div className="volley-overlay"><div><WifiOff size={32}/><h4>잠시 연결이 끊겼어요</h4><p>현재 경기를 중단했어요.<br/>연결되면 새로운 경기를 시작할 수 있어요.</p>{!race&&<button className="primary" disabled={!connected} onClick={restart}><RotateCcw size={18}/>새 경기 시작</button>}</div></div>}
      {['ready','loading','waiting'].includes(status)&&<div className="volley-overlay"><div><span className="volley-overlay-icon">✦</span><h4>{status==='waiting'?'친구를 기다리는 중…':'오늘은 해변에서 한 판!'}</h4><p>{race?'친구와 네트를 사이에 두고 대결해요.':'몽글 AI와 가볍게 랠리를 즐겨요.'}<br/>공을 상대 코트 바닥에 떨어뜨리면 득점!</p><button className="primary" disabled={status!=='ready'||!connected} onClick={race?ready:start}><Play size={18}/>{status==='loading'?'코트 준비 중…':status==='waiting'?'상대 준비 대기 중':race?'준비 완료':'AI와 경기 시작'}</button><small>내 캐릭터는 {ownSide===1?'오른쪽':'왼쪽'} 코트에 있어요.</small></div></div>}
      {['ending','settle','finished'].includes(status)&&<div className="volley-overlay"><div><Trophy size={38}/><h4>{result?(won?'멋진 승리!':result.winner===null?'무승부!':'다음엔 이길 수 있어요!'):'경기 종료'}</h4><p>{snapshot.forfeit?'상대가 코트를 떠나 경기가 끝났어요.':`${snapshot.scores[0]} : ${snapshot.scores[1]}`}</p>{result?<><strong className="volley-result">{result.score.toLocaleString()}점 <span>+{result.gold} 골드</span></strong><small>게임 목록에서 다른 게임도 즐겨보세요.</small></>:status==='settle'?<button className="primary" onClick={finish}>기록 저장 다시 시도</button>:<p role="status">기록을 저장하고 있어요…</p>}<GameReplay race={race} me={me} rematch={rematch} settled={status==='finished'} onReplay={start} onSoloReplay={onSoloReplay} unavailable={snapshot.forfeit}/></div></div>}
    </div>
    <div className="volley-status" aria-live="polite">{!connected?<><WifiOff size={16}/>마을 연결을 기다리고 있어요.</>:status==='playing'?snapshot.lastHit?.spike&&snapshot.elapsed-snapshot.lastHit.at<500?'스파이크!':snapshot.phase==='serve'?'서브를 준비해요. 내 코트에서 움직이며 기다려요.':'공 아래로 이동해서 받아쳐요. 점프 중 스파이크로 빠르게 공격!':race?'두 사람 모두 준비하면 경기가 시작돼요.':'이동하고, 점프하고, 타이밍에 맞춰 스파이크!'}</div>
    {error&&<p className="volley-error" role="alert">{error}</p>}
    <div className="volley-controls" aria-label="배구 터치 조작">{[['KeyA','왼쪽',ArrowLeft],['KeyD','오른쪽',ArrowRight],['KeyW','점프',ArrowUp],['Space','스파이크',Zap]].map(([code,label,Icon])=><button key={code} disabled={status!=='playing'||!connected} className={code==='Space'?'volley-spike':''} aria-label={label} onPointerDown={e=>touch(code,true,e)} onPointerUp={e=>touch(code,false,e)} onPointerCancel={e=>touch(code,false,e)} onLostPointerCapture={e=>{keys.current.delete(code);send();}} onContextMenu={e=>e.preventDefault()}><Icon size={21}/><span>{label}</span></button>)}</div>
    <p className="volley-help"><kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd> 이동 <b>·</b> <kbd>W</kbd> / <kbd>↑</kbd> 점프 <b>·</b> <kbd>Space</kbd> / <kbd>Z</kbd> 스파이크<br/><small>몸에 닿으면 자동으로 공을 받아쳐요. 점프한 상태에서 공이 닿기 직전에 스파이크를 눌러보세요.</small></p>
  </section>;
}
