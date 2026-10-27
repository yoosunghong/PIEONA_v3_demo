import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,Keyboard,HelpCircle,AlarmClock,Trophy,Crown,Users,Play,Star} from 'lucide-react';
import AvatarPortrait from './AvatarPortrait';
import {TYPING_ROUNDS,TYPING_ROUND_MS,TYPING_WORD_POINTS,TYPING_TYPO_PENALTY} from '../shared/wordGames.mjs';
import './typing-game.css';

const colors=['#7784fa','#ff9fae','#ffcf65','#83d9ce','#b8cf7b','#f1aacd'];
function Stars({event}){
  return event?<span key={event} className="typing-star-burst" aria-hidden="true">{Array.from({length:9},(_,i)=><Star key={i} fill="currentColor" style={{'--dx':`${Math.cos(i*Math.PI*2/9)*70}px`,'--dy':`${Math.sin(i*Math.PI*2/9)*55-20}px`,'--delay':`${i*18}ms`}}/>)}<b>+{TYPING_WORD_POINTS}</b></span>:null;
}
export default function TypingGame({room,me,text,setText,error,canInput,inputRef,submit,busy,connected,serverNow,countdown,onStart,onLeave,onReplay}){
  const [help,setHelp]=useState(false),[bursts,setBursts]=useState({});
  const previous=useRef({roomId:null,scores:new Map()}),timers=useRef(new Set());
  useEffect(()=>{
    const old=previous.current,events={};
    if(old.roomId===room.id)for(const p of room.players){const before=old.scores.get(p.id);if(before!==undefined&&p.score>before)events[p.id]=`${room.id}:${p.id}:${p.index}`;}
    previous.current={roomId:room.id,scores:new Map(room.players.map(p=>[p.id,p.score]))};
    if(!Object.keys(events).length)return;
    setBursts(current=>({...current,...events}));
    const timer=setTimeout(()=>{setBursts(current=>Object.fromEntries(Object.entries(current).filter(([id,event])=>events[id]!==event)));timers.current.delete(timer);},1100);timers.current.add(timer);
  },[room]);
  useEffect(()=>()=>{for(const timer of timers.current)clearTimeout(timer);},[]);
  const playing=room.status==='playing',finished=room.status==='finished',waiting=room.status==='waiting';
  const elapsed=Math.max(0,serverNow-(room.startedAt||serverNow));
  const round=Math.min(TYPING_ROUNDS,Math.floor(elapsed/TYPING_ROUND_MS)+1);
  const remaining=playing?Math.max(0,Math.min(TYPING_ROUND_MS,(room.deadline||0)-serverNow,TYPING_ROUND_MS-elapsed%TYPING_ROUND_MS)):TYPING_ROUND_MS;
  const seconds=Math.ceil(remaining/1000),mine=room.players.find(p=>p.id===me.id);
  const word=room.words?.[(mine?.index||0)%room.words.length]||'';
  const players=room.players.filter(p=>!p.left),ranked=[...players].sort((a,b)=>b.score-a.score||room.players.indexOf(a)-room.players.indexOf(b));
  const maxScore=Math.max(TYPING_WORD_POINTS,...players.map(p=>p.score)),leader=ranked[0]?.score>0?ranked[0]?.id:null;
  const champion=room.players.find(p=>p.id===room.winner);
  return <section className="typing-game" aria-label="타자입력 게임">
    <header className="typing-game-header">
      <button className="typing-glass typing-exit" onClick={onLeave} disabled={busy}><ArrowLeft/>나가기</button>
      <div className="typing-glass typing-title"><span><Keyboard/></span><h2>타자입력 게임</h2><button aria-label="게임 방법" aria-expanded={help} onClick={()=>setHelp(v=>!v)}><HelpCircle/></button></div>
      <div className="typing-glass typing-round"><span>{waiting?'참가자':'라운드'}</span><strong>{waiting?`${players.length}명`:`${finished?TYPING_ROUNDS:round} / ${TYPING_ROUNDS}`}</strong></div>
    </header>
    {waiting&&error&&<p className="typing-room-error" role="alert">{error}</p>}
    {help&&<aside className="typing-help"><strong>함께하는 타자입력 게임</strong><p>현재 단어를 입력하고 Enter! 정답마다 {TYPING_WORD_POINTS}점과 별을 받아요. 60초 한 라운드! 오타를 제출하면 {TYPING_TYPO_PENALTY}점 감점되며 최저 점수는 0점이에요. 긴 단어와 어려운 단어도 나와요. 가장 높은 점수가 승리해요.</p><p>인원 제한 없이 대기실에 참가하고 방장이 시작해요. 붙여넣기는 사용할 수 없어요.</p><button onClick={()=>setHelp(false)}>알겠어요</button></aside>}
    <div className={'typing-timer typing-glass'+(seconds<=5&&playing?' urgent':'')} role="timer" aria-label="라운드 남은 시간"><AlarmClock/><div className="typing-timer-track"><span style={{width:`${waiting||finished?100:remaining/TYPING_ROUND_MS*100}%`}}/></div><strong>{countdown?`${countdown}초 후`:`${String(Math.floor((finished?0:seconds)/60)).padStart(2,'0')}:${String((finished?0:seconds)%60).padStart(2,'0')}`}</strong></div>
    <aside className="typing-cheer" aria-hidden="true"><div>더 빠르게!<br/>정확하게!</div><AvatarPortrait user={me} resolution={256}/></aside>
    <main className="typing-word-card">
      <span className="typing-paw" aria-hidden="true">●<i/><i/><i/><i/></span>
      {waiting?<div className="typing-state"><span className="typing-label"><Users size={18}/>함께할 친구를 기다려요</span><h3>다 같이, 준비됐나요?</h3><p>현재 {players.length}명 참가 · 인원 제한 없이 함께해요.</p>{room.hostId===me.id?<button className="typing-start" disabled={busy||!connected||players.length<2} onClick={onStart}><Play fill="currentColor" size={21}/>다 같이 시작하기</button>:<p className="typing-waiting-message">방장이 시작하면 3초 뒤 함께 출발해요.</p>}<small>{players.length<2?'친구가 한 명 이상 참가하면 시작할 수 있어요.':'친구들이 모두 모이면 시작해 주세요.'}</small></div>:finished?<div className="typing-state typing-finish"><Trophy className="typing-result-cup"/><span className="typing-label">게임 종료</span><h3>{champion?`${champion.nickname}님, 축하해요!`:'함께 완성한 멋진 한 판!'}</h3><p>내 점수 <strong>{mine?.score||0}점</strong> · 정답 {mine?.index||0}개</p><button className="typing-start" onClick={onReplay}>다시 함께 놀기</button></div>:<>
        <span className="typing-label">현재 단어</span>
        <div className={'typing-word'+(word.length>=5?' long-word':'')} style={{'--word-length':Math.max(1,word.length)}}><h3>{countdown?'준비!':word}</h3><img src="/images/minigames/typing-kitten.png" alt=""/></div>
        <form onSubmit={submit} className="typing-input-form"><input ref={inputRef} aria-label="타자 단어 입력" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.nativeEvent.isComposing||e.keyCode===229))e.preventDefault();}} onPaste={e=>e.preventDefault()} onDrop={e=>e.preventDefault()} maxLength={50} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} disabled={!canInput} placeholder={countdown?'잠시 후 시작해요':connected?'단어를 입력하세요':'다시 연결하고 있어요…'}/><button type="submit" aria-label="단어 제출" disabled={!canInput||!text.trim()}>Enter ↵</button></form>
        <p className={'typing-input-hint'+(error?' error':'')} role={error?'alert':'status'}>{error||(!connected?'마을에 다시 연결하고 있어요.':countdown?'손을 풀고, 출발할 준비를 해요!':'단어를 빠르고 정확하게 입력하세요!')}</p>
      </>}
    </main>
    <aside className="typing-leaderboard" aria-label="실시간 순위"><h3><Trophy fill="#ffc936"/>현재 점수 <small>{players.length}명</small></h3><ol>{ranked.map((p,i)=><li key={p.id} className={(leader===p.id?'leading ':'')+(p.id===me.id?'is-me':'')} style={{'--player-color':colors[room.players.indexOf(p)%colors.length]}}><span className={'typing-rank rank-'+i}>{i===0&&leader?<Crown fill="currentColor"/>:i+1}</span><AvatarPortrait user={p} headshot/><div className="typing-score-detail"><strong>{p.nickname||'새싹'}{p.id===me.id&&<small>나</small>}</strong><div className="typing-score-track"><span style={{width:`${p.score/maxScore*100}%`}}/><Stars event={bursts[p.id]}/></div></div><b>{p.score}점</b></li>)}</ol></aside>
    <div className="typing-player-roster" aria-label="참가자 아바타와 점수">{players.map((p,i)=><div key={p.id} className={'typing-player '+(p.id===me.id?'is-me ':'')+(bursts[p.id]?'celebrating':'')} style={{'--player-color':colors[i%colors.length]}}>
      <div className="typing-player-character" role="img" aria-label={`${p.nickname||'새싹'}의 아바타`}><AvatarPortrait user={p} resolution={384}/></div>
      <div className="typing-desk"><div className="typing-keyboard" aria-hidden="true">{Array.from({length:24},(_,k)=><i key={k}/>)}</div></div>
      <div className={'typing-nameplate'+(leader===p.id?' leading':'')}>{leader===p.id&&<Crown fill="#ffd14d"/>}<strong>{p.nickname||'새싹'}</strong><b>{p.score}점</b><div className="typing-seat-progress"><span style={{width:`${p.score/maxScore*100}%`}}/><Stars event={bursts[p.id]}/></div></div>
    </div>)}</div>
    <span className="typing-connection" role="status">{!connected?'연결을 복구하고 있어요…':waiting?'친구들이 같은 마을의 타자게임에서 참가할 수 있어요.':''}</span>
  </section>;
}
