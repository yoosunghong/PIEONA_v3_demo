import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,Keyboard,MessagesSquare,Users} from 'lucide-react';
import {api} from './api';
import {wordGameLobby} from './wordGameLobby.mjs';
import AvatarPortrait from './AvatarPortrait';
import TypingGame from './TypingGame';
import WordChainGame from './WordChainGame';
import './social-play.css';
export default function WordGames({initialKind='typing',target,me,socket,members=[],notify,onBack,onReward}){
  const [kind,setKind]=useState(initialKind),[rooms,setRooms]=useState([]),[room,setRoom]=useState(null),[text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[now,setNow]=useState(Date.now());
  const roomRef=useRef(null),input=useRef(null),rewarded=useRef(new Set());roomRef.current=room;
  const [loading,setLoading]=useState(true),[connected,setConnected]=useState(!!socket?.connected);
  const {friends,available,waitingRooms}=wordGameLobby(members,rooms,me.id,kind);
  function accept(r){setRooms(current=>[...current.filter(item=>item.id!==r.id),r]);if(r.players.some(p=>p.id===me.id&&!p.left))setRoom({...r,receivedAt:Date.now()});}
  async function load(){setLoading(true);setError('');try{const result=await api(`/villages/${target.id}/duels`);setRooms(result.rooms);const mine=result.rooms.find(r=>r.players.some(p=>p.id===me.id&&!p.left)&&r.status!=='finished');const current=mine||result.rooms.find(r=>r.id===roomRef.current?.id&&r.players.some(p=>p.id===me.id&&!p.left));if(current)setRoom({...current,receivedAt:Date.now()});}catch(e){setError(e.message);}finally{setLoading(false);}}
  useEffect(()=>{const online=()=>setConnected(true),offline=()=>setConnected(false);socket?.on('connect',online);socket?.on('disconnect',offline);return()=>{socket?.off('connect',online);socket?.off('disconnect',offline);};},[socket]);
  useEffect(()=>{load();const update=r=>{if(r.villageId===target.id)accept(r);};socket?.on('duel:state',update);socket?.on('connect',load);const timer=setInterval(()=>setNow(Date.now()),200);return()=>{clearInterval(timer);socket?.off('duel:state',update);socket?.off('connect',load);const r=roomRef.current;if(r&&r.status!=='finished')api(`/duels/${r.id}/leave`,{method:'POST'}).catch(()=>{});};},[target.id,me.id,socket]);
  useEffect(()=>{if(room?.status==='finished'&&!rewarded.current.has(room.id)){rewarded.current.add(room.id);onReward();}},[room?.status]);
  async function perform(path,body={}){setBusy(true);setError('');try{const result=await api(path,{method:'POST',body});if(result.room)accept(result.room);return result;}catch(e){setError(e.message);return null;}finally{setBusy(false);}}
  async function submit(e){e.preventDefault();if(!canInput||!text.trim())return;const r=await perform(`/duels/${room.id}/action`,{text,index:mine?.index});if(r?.error)setError(r.error);else if(r)setText('');}
  const mine=room?.players.find(p=>p.id===me.id),serverNow=room?room.serverTime+(now-(room.receivedAt||now)):now,countdown=room?.startedAt>serverNow?Math.ceil((room.startedAt-serverNow)/1000):0,isTurn=room?.kind==='typing'||room?.players[room.turn]?.id===me.id;
  const canInput=room?.status==='playing'&&!busy&&!countdown&&isTurn&&connected;
  // Focus after React commits the enabled input, including countdown, turn and request transitions.
  useEffect(()=>{if(canInput)input.current?.focus();},[canInput,room?.id]);
  useEffect(()=>{if(room?.kind==='wordchain'){setText('');setError('');}},[room?.id,room?.turn,room?.round,room?.status]);
  const leaveGame=async()=>{if(room.status!=='finished'){const result=await perform(`/duels/${room.id}/leave`);if(!result)return;}roomRef.current=null;setRoom(null);setText('');onBack();};
  const replay=()=>{setRoom(null);setText('');load();};
  if(room?.kind==='wordchain')return <WordChainGame room={room} me={me} text={text} setText={setText} error={error} canInput={canInput} inputRef={input} submit={submit} busy={busy} connected={connected} serverNow={serverNow} countdown={countdown} onStart={()=>perform(`/duels/${room.id}/start`)} onLeave={leaveGame} onReplay={replay} onHint={()=>perform(`/duels/${room.id}/hint`)} onReaction={emoji=>perform(`/duels/${room.id}/reaction`,{emoji})}/>;
  if(room?.kind==='typing')return <TypingGame room={room} me={me} text={text} setText={setText} error={error} canInput={canInput} inputRef={input} submit={submit} busy={busy} connected={connected} serverNow={serverNow} countdown={countdown} onStart={()=>perform(`/duels/${room.id}/start`)} onLeave={leaveGame} onReplay={replay}/>;
  return <div className="panel-body word-games"><button className="text-button" onClick={onBack}><ArrowLeft size={16}/>게임 목록으로</button><div className="word-game-heading"><span>{kind==='typing'?<Keyboard size={30}/>:<MessagesSquare size={30}/>}</span><div><small className="social-eyebrow">A LITTLE CHALLENGE, ALL TOGETHER</small><h2>{room?.kind==='wordchain'||!room&&kind==='wordchain'?'도란도란 끝말잇기':'타자입력 게임'}</h2><p>{room?.kind==='wordchain'||!room&&kind==='wordchain'?'15초 안에 다음 단어를 이어요. 두음법칙을 허용해요.':'같은 단어를 빠르고 정확하게! 인원 제한 없이 5라운드를 함께해요.'}</p></div></div>
    {error&&<p className="word-game-error" role="alert">{error}</p>}
    {!room?<><div className="tab-row"><button className={kind==='typing'?'active':''} onClick={()=>setKind('typing')}>타자입력</button><button className={kind==='wordchain'?'active':''} onClick={()=>setKind('wordchain')}>끝말잇기</button></div>
      <section className="word-game-friends" aria-label="같은 마을의 게임 친구">
        <h3>같은 마을의 친구</h3>
        {!connected?<p role="status">마을에 다시 연결하고 있어요. 연결되면 참가할 친구를 확인할 수 있어요.</p>:<>
          <p className="tiny" role="status">마을 친구 {friends.length}명 · 함께할 수 있는 친구 {available}명</p>
          {friends.map(friend=><div className="duel-lobby-row" key={friend.userId}><AvatarPortrait user={friend}/><div><strong>{friend.nickname||'새싹'}</strong><small>{friend.joinable?'이 게임의 대결 방에서 기다리는 중':friend.busy?'다른 게임이나 활동 중':'함께 플레이 가능'}</small></div>{friend.joinable&&<button className="card-pink-button" disabled={busy||loading||!connected} onClick={()=>perform(`/duels/${friend.joinable.id}/join`)}>참가하기</button>}</div>)}
          {!friends.length&&<p className="tiny">지금은 같은 마을에 다른 플레이어가 없어요.</p>}
        </>}
      </section>
      <button className="card-pink-button full" disabled={busy||loading||!connected} onClick={()=>perform(`/villages/${target.id}/duels`,{kind})}><Users size={17}/>{kind==='typing'?'다 함께 타자게임 방 만들기':'다 함께 끝말잇기 방 만들기'}</button>
      <h3>참가할 수 있는 대기 방</h3>
      {loading?<p role="status">대기 방을 불러오는 중…</p>:error?<button className="text-button" onClick={load}>대기 방 다시 불러오기</button>:<>
        {waitingRooms.map(r=><div className="duel-lobby-row" key={r.id}><Users size={22}/><div><strong>{r.players[0].nickname}</strong><small>{r.players.length}명 · 인원 제한 없음 · 함께할 친구를 기다려요</small></div><button className="card-pink-button" disabled={busy||!connected} onClick={()=>perform(`/duels/${r.id}/join`)}>참가하기</button></div>)}
        {!waitingRooms.length&&<div className="social-empty"><Users size={32}/><p>{friends.length?'아직 이 게임의 대기 방이 없어요. 방을 만들면 같은 마을의 친구가 참가할 수 있어요.':'먼저 방을 만들어 두면 친구가 마을에 와서 참가할 수 있어요.'}</p></div>}
      </>}
    </>:null}
  </div>;
}
