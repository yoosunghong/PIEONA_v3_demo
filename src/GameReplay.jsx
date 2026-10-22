import React,{useEffect,useRef,useState} from 'react';
import {RotateCcw} from 'lucide-react';
import './game-replay.css';

export function useGameRematch({race,socket,gameId,notify}){
  const [state,setState]=useState(null),[busy,setBusy]=useState(false),[connected,setConnected]=useState(!!socket?.connected);
  const current=useRef();current.current=`${race?.id}:${gameId}`;
  const event=race?.kind==='crab'?'crab:rematch':'game:rematch';
  useEffect(()=>{
    setState(null);setBusy(false);
    const receive=data=>{if(data.id===race?.id)setState(data);};
    socket?.on(event,receive);return()=>socket?.off(event,receive);
  },[socket,event,race?.id,gameId]);
  useEffect(()=>{
    const online=()=>setConnected(true),offline=()=>{setConnected(false);setBusy(false);};
    socket?.on('connect',online);socket?.on('disconnect',offline);
    return()=>{socket?.off('connect',online);socket?.off('disconnect',offline);current.current=null;};
  },[socket]);
  function respond(action){
    if(!socket?.connected||busy||!gameId)return;
    const key=current.current;setBusy(true);
    socket.timeout(5000).emit(event,{id:race.id,gameId,action},(err,r)=>{
      if(current.current!==key)return;setBusy(false);
      if(err||!r?.ok)notify(r?.error||'재대결 응답을 확인하지 못했어요. 다시 시도해주세요.');
    });
  }
  return {state,busy,connected,respond};
}

export default function GameReplay({race,me,rematch,settled,onReplay,onSoloReplay,waiting=false,unavailable=false,requiresConnection=true}){
  const {state,busy,connected,respond}=rematch;
  const disabled=!settled||busy||(requiresConnection&&!connected);
  if(!race)return <div className="game-replay"><button className="primary" disabled={disabled} onClick={onReplay}><RotateCcw size={17}/>{settled?'다시하기':'기록 저장 후 다시하기'}</button></div>;
  if(unavailable||state?.status==='unavailable')return <div className="game-replay"><button className="primary" disabled={disabled} onClick={onSoloReplay}><RotateCcw size={17}/>다시하기 · 혼자 플레이</button><p role="status">친구가 게임을 떠났어요. 혼자 새 게임을 시작할 수 있어요.</p></div>;
  const pending=state?.status==='pending',requested=state?.from===me.id,accepted=state?.accepted?.includes(me.id);
  const message=waiting?'친구들의 경기가 끝나면 함께 다시할 수 있어요.':pending?`재대결 동의 ${state.accepted?.length||1}/${race.players.length}명 · 모두 동의하면 시작해요.`:state?.status==='declined'?'재대결을 거절했어요. 다시 요청할 수 있어요.':state?.status==='expired'?'재대결 요청이 만료됐어요.':state?.status==='cancelled'?'재대결 요청이 취소됐어요.':'다시하기를 누르면 친구들에게 재대결을 요청해요.';
  return <div className="game-replay">
    <button className="primary" disabled={disabled||waiting||(pending&&(requested||accepted))} onClick={()=>respond(pending?'accept':'request')}><RotateCcw size={17}/>{pending?(requested?'친구 수락 대기 중…':accepted?'재대결 동의 완료':'수락하고 다시하기'):'다시하기'}</button>
    {waiting&&onSoloReplay&&<button className="secondary" disabled={disabled} onClick={onSoloReplay}>혼자 다시하기</button>}
    {pending&&<button className="secondary" disabled={busy||!connected} onClick={()=>respond(requested?'cancel':'decline')}>{requested?'요청 취소':'거절'}</button>}
    <p role="status">{!settled?'기록을 저장하고 있어요…':message}</p>
  </div>;
}
