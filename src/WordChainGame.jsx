import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,MessagesSquare,Users,Crown,AlarmClock,Send,Smile,Lightbulb,Volume2,Play,Flower2,HelpCircle,Trophy} from 'lucide-react';
import AvatarPortrait from './AvatarPortrait';
import {CHAIN_GAME_MS,CHAIN_HINTS,CHAIN_REACTIONS,chainStarts} from '../shared/wordGames.mjs';
import {createChainAudio} from './wordGameAudio.mjs';
import './word-chain-game.css';

const colors=['#bec3ff','#ffb6ca','#ffdc85','#b5d9ff','#d0e6a2','#ffc2d7'];
function seatPosition(index,count){
  if(count<=6){const seats=[[33.5,46],[50.8,33.5],[67.5,39.5],[82.5,50],[76,71],[35.8,68.5]];const indices=count===2?[0,3]:count===3?[0,2,4]:count===4?[0,1,3,4]:count===5?[0,1,2,3,4]:[0,1,2,3,4,5];return seats[indices[index]||0];}
  const angle=-Math.PI+(index/count)*Math.PI*2;return [59+Math.cos(angle)*25,52+Math.sin(angle)*24];
}
export default function WordChainGame({room,me,text,setText,error,canInput,inputRef,submit,busy,connected,serverNow,countdown,onStart,onLeave,onReplay,onHint,onReaction}){
  const audio=useRef(null),heard=useRef(room.log.length);
  useEffect(()=>{const sound=createChainAudio();audio.current=sound;const unlock=()=>sound.unlock();window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);return()=>{window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);sound.dispose();};},[]);
  useEffect(()=>{if(room.log.length>heard.current)audio.current?.correct();heard.current=room.log.length;},[room.log.length]);
  const [help,setHelp]=useState(false),[emotes,setEmotes]=useState(false),[hint,setHint]=useState(null),[voiceMessage,setVoiceMessage]=useState(''),[seatPage,setSeatPage]=useState(0);
  const playing=room.status==='playing',waiting=room.status==='waiting',finished=room.status==='finished';
  const players=room.players.filter(p=>!p.left),ranked=[...players].sort((a,b)=>Number(a.id===room.loser)-Number(b.id===room.loser)||b.score-a.score||room.players.indexOf(a)-room.players.indexOf(b));
  const current=room.players[room.turn],mine=room.players.find(p=>p.id===me.id),isTurn=current?.id===me.id;
  const round=room.round||1,word=room.used.at(-1)||'',starts=word?chainStarts(word.at(-1)):[];
  const pageCount=Math.ceil(players.length/6),visiblePage=Math.min(seatPage,Math.max(0,pageCount-1)),visiblePlayers=players.slice(visiblePage*6,visiblePage*6+6),playerIds=players.map(p=>p.id).join(',');
  useEffect(()=>{if(playing)setSeatPage(Math.max(0,Math.floor(players.findIndex(p=>p.id===current?.id)/6)));},[room.id,room.turn,round,playing,playerIds]);
  const remaining=playing?Math.max(0,Math.min(CHAIN_GAME_MS,(room.deadline||0)-serverNow)):CHAIN_GAME_MS;
  const turnKey=`${room.id}:${round}:${room.turn}:${room.used.length}`,hintVisible=hint?.key===turnKey;
  const leader=ranked[0]?.score>0?ranked[0].id:null,champion=room.players.find(p=>p.id===room.winner);
  const currentRef=useRef(turnKey);currentRef.current=turnKey;
  useEffect(()=>()=>{window.speechSynthesis?.cancel();},[]);
  async function requestHint(){const key=turnKey,result=await onHint();if(result?.hint&&currentRef.current===key)setHint({key,word:result.hint});}
  function readWord(){
    if(!word)return;
    if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){setVoiceMessage('이 브라우저에서는 음성 읽기를 지원하지 않아요.');return;}
    window.speechSynthesis.cancel();const speech=new window.SpeechSynthesisUtterance(word);speech.lang='ko-KR';speech.rate=.85;speech.onerror=()=>setVoiceMessage('음성 읽기를 사용할 수 없어요.');window.speechSynthesis.speak(speech);setVoiceMessage('제시어를 읽어요.');
  }
  return <section className={'word-chain-game'+(playing&&isTurn&&!countdown?' my-turn':'')} aria-label="끝말잇기 게임">
    <header className="chain-game-header"><button className="chain-back chain-glass" aria-label="게임 목록으로 나가기" disabled={busy} onClick={onLeave}><ArrowLeft/></button><strong className="chain-my-name">{me.nickname||'새싹'}</strong><div className="chain-game-title chain-glass"><span><MessagesSquare/></span><h2>끝말잇기 게임</h2><button aria-label="끝말잇기 게임 방법" aria-expanded={help} onClick={()=>setHelp(v=>!v)}><HelpCircle/></button></div><button className="chain-room-exit chain-glass" disabled={busy} onClick={onLeave}><Users/>방 나가기</button></header>
    <div className="chain-round-sign"><i/><i/><strong>{waiting?'친구를 기다려요':finished?'게임 종료':'120초 끝말잇기'}</strong></div>
    <div className={'chain-game-timer chain-glass'+(playing&&remaining<=5000?' urgent':'')} role="timer" aria-label="게임 남은 시간"><AlarmClock/><div><span style={{width:`${remaining/CHAIN_GAME_MS*100}%`}}/></div><strong>{countdown?`${countdown}초 후`:`${String(Math.floor((finished?0:Math.ceil(remaining/1000))/60)).padStart(2,'0')}:${String((finished?0:Math.ceil(remaining/1000))%60).padStart(2,'0')}`}</strong></div>
    <aside className="chain-game-scores" aria-label="끝말잇기 실시간 순위"><h3><Crown fill="currentColor"/>현재 점수 <small>{players.length}명</small></h3><ol>{ranked.map((p,i)=><li key={p.id} className={(leader===p.id?'leading ':'')+(p.id===me.id?'is-me':'')} style={{'--seat-color':colors[room.players.indexOf(p)%colors.length]}}><span className={'chain-rank rank-'+i}>{leader===p.id?<Crown fill="currentColor"/>:i+1}</span><AvatarPortrait user={p} headshot/><strong>{p.nickname||'새싹'}</strong><b>{p.score}점</b></li>)}</ol></aside>
    <div className="chain-circle" data-count={visiblePlayers.length} aria-label="참가자 원형 좌석">{visiblePlayers.map((p,i)=>{
      const [x,y]=seatPosition(i,visiblePlayers.length),last=room.log.findLast(item=>item.playerId===p.id),reaction=room.reactions?.[p.id],reacting=reaction&&serverNow-reaction.at<4000;
      const active=playing&&current?.id===p.id;
      return <div key={p.id} className={'chain-seat '+(active?'active ':'')+(p.id===me.id?'is-me ':'')} data-player-id={p.id} style={{left:`${x}%`,top:`${y}%`,'--seat-color':colors[room.players.indexOf(p)%colors.length],zIndex:y>55?4:2}}>
        <div className={'chain-seat-bubble'+(reacting?' reaction':'')+(active&&!reacting?' thinking':'')} aria-label={`${p.nickname||'새싹'}의 말풍선`}>{reacting?reaction.emoji:active?(p.id===me.id?'내 차례!':'생각 중…'):last?`${last.text}!`:waiting?'준비!':'함께해요'}</div>
        <div className="chain-seat-avatar" role="img" aria-label={`${p.nickname||'새싹'}의 아바타`}><AvatarPortrait user={p} resolution={384}/></div>
        <div className="chain-stump" aria-hidden="true"/><div className="chain-seat-name">{active&&<span aria-label="현재 차례"/>}<strong>{p.nickname||'새싹'}{p.id===me.id?' · 나':''}</strong></div>
      </div>;
    })}</div>
    {pageCount>1&&<nav className="chain-seat-pages" aria-label="참가자 좌석 페이지"><button aria-label="이전 좌석" disabled={visiblePage===0} onClick={()=>setSeatPage(visiblePage-1)}>‹</button><span>좌석 {visiblePage+1} / {pageCount}</span><button aria-label="다음 좌석" disabled={visiblePage===pageCount-1} onClick={()=>setSeatPage(visiblePage+1)}>›</button></nav>}
    <main className="chain-word-plaque"><div className="chain-plaque-flowers" aria-hidden="true"><Flower2/><i/><Flower2/></div><div className="chain-plaque-content">{waiting?<><span className="chain-word-label"><Users size={18}/>현재 {players.length}명 참가</span><h3>친구와 이어가요!</h3>{room.hostId===me.id?<button className="chain-start" disabled={busy||!connected||players.length<2} onClick={onStart}><Play fill="currentColor"/>게임 시작</button>:<p>방장이 시작하면 함께 출발해요.</p>}<small>전체 120초 · 시간이 끝나면 현재 차례 패배</small></>:finished?<><Trophy className="chain-result-cup"/><span className="chain-word-label">게임 종료</span><h3>{champion?`${champion.nickname}님 승리!`:'멋진 한 판이었어요!'}</h3><p>{room.reason}</p><p>{room.loser===me.id?'시간 초과로 패배했어요 · ':''}내 점수 {mine?.score||0}점</p><button className="chain-start" onClick={onReplay}>다시 함께 놀기</button></>:<><span className="chain-word-label">현재 제시어</span><div className="chain-presented-word"><h3>{countdown?'준비!':word||'첫 단어'}</h3><button aria-label="제시어 읽기" onClick={readWord} disabled={!word}><Volume2 fill="currentColor"/></button></div><p className="chain-next-start">{countdown?'잠시 후 함께 시작해요!':word?<>다음은 <strong>{starts.join(' / ')}</strong>로 시작해요</>:'두 글자 이상의 명사로 시작해요'}</p></>}</div></main>
    {!finished&&<div className="chain-turn-banner" role="status">{error?<span className="error">{error}</span>:!connected?'마을에 다시 연결하고 있어요…':waiting?`${players.length}명 참가 · 친구들이 모두 모이면 시작해요`:countdown?`${countdown}초 후 시작해요`:hintVisible?<>힌트: <strong>{hint.word}</strong></>:isTurn?'내 차례예요! 단어를 이어주세요.':`${current?.nickname||'친구'}님이 생각하고 있어요.`}</div>}
    <div className="chain-input-dock"><form onSubmit={submit} className="chain-game-form"><button type="button" className="chain-smile" aria-label="이모티콘 선택" aria-expanded={emotes} disabled={finished||!connected} onClick={()=>setEmotes(v=>!v)}><Smile/></button><div className="chain-input-wrap"><input ref={inputRef} aria-label="끝말잇기 단어 입력" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.nativeEvent.isComposing||e.keyCode===229))e.preventDefault();}} maxLength={200} autoComplete="off" autoCorrect="off" spellCheck={false} disabled={!canInput} placeholder={waiting?'친구들이 모이면 시작해요':finished?'멋진 끝말잇기를 완성했어요!':countdown?'잠시 후 시작해요':isTurn?'다음 단어를 입력하세요!':'친구의 차례를 기다려요'}/><button className="chain-send" aria-label="끝말잇기 단어 제출" disabled={!canInput||!text.trim()}><Send fill="currentColor"/></button></div></form><button className="chain-tool chain-hint" disabled={!canInput||!(mine?.hintsLeft>0)} onClick={requestHint} aria-label={`힌트 ${mine?.hintsLeft??CHAIN_HINTS}개 남음`}><span aria-hidden="true">💡</span><b>{mine?.hintsLeft??CHAIN_HINTS}</b><strong>힌트</strong></button><button className="chain-tool" disabled={finished||!connected||busy} aria-label="이모티콘" aria-expanded={emotes} onClick={()=>setEmotes(v=>!v)}><AvatarPortrait user={me} headshot/><strong>이모티콘</strong></button></div>
    {emotes&&<div className="chain-emote-picker" aria-label="보낼 이모티콘">{CHAIN_REACTIONS.map(emoji=><button key={emoji} disabled={busy} onClick={async()=>{setEmotes(false);await onReaction(emoji);}} aria-label={`${emoji} 보내기`}>{emoji}</button>)}</div>}
    {help&&<aside className="chain-help"><h3>끝말잇기, 이렇게 놀아요</h3><p>앞 단어의 마지막 글자로 시작하는 한글 두 글자 이상 명사를 입력하고 Enter를 눌러요. 두음법칙을 허용하며 이미 쓴 단어는 사용할 수 없어요.</p><p>게임 전체 제한 시간은 120초예요. 시간이 끝날 때 차례인 사람이 패배해요. 남은 참가자 중 점수가 가장 높은 사람이 승리하며 동점은 공동 순위예요. 내 차례 시작 후 0.1초마다 정답 점수가 1점씩 줄어들어요 (최대 100점, 최소 10점).</p><p>힌트는 게임당 3번, 내 차례에 한 단어씩 볼 수 있어요.</p><button onClick={()=>setHelp(false)}>알겠어요</button></aside>}
    <span className="chain-voice-status" role="status">{voiceMessage}</span>
  </section>;
}
