import React,{useEffect,useRef,useState} from 'react';
import {api} from './api';
import AvatarPortrait from './AvatarPortrait';
import './persona-scripts.css';

export default function PersonaDialogue({me,socket,visible=true,onExpression=()=>{}}){
 const [queue,setQueue]=useState([]),[version,setVersion]=useState(null),[error,setError]=useState(''),[held,setHeld]=useState(false),[displayedId,setDisplayedId]=useState(null);
 const seen=useRef(new Set()),node=useRef(null),expression=useRef(onExpression);expression.current=onExpression;
 useEffect(()=>{
  setQueue([]);setVersion(null);seen.current=new Set();if(!me||!visible)return;
  let alive=true;
  const add=line=>{if(!alive||line.ownerId!==me.id||line.slot!==(me.activeSlot||'')||seen.current.has(line.id))return;seen.current.add(line.id);setQueue(q=>[...q,line]);};
  async function load(){try{const state=await api('/me/pss');if(!alive)return;setVersion(state.version);setQueue(q=>q.filter(l=>l.version===state.version));const pending=await api('/me/pss/dialogues');for(const line of pending.lines)add(line);}catch(e){if(alive)setError(e.message);}}
  const changed=()=>{seen.current=new Set();setQueue([]);load();};
  socket?.on('pss:dialogue',add);socket?.on('pss:changed',changed);socket?.on('connect',load);load();
  return()=>{alive=false;socket?.off('pss:dialogue',add);socket?.off('pss:changed',changed);socket?.off('connect',load);};
 },[me?.id,me?.activeSlot,socket,visible]);
 const line=queue.find(l=>l.version===version);
 useEffect(()=>{
  if(!line||!visible)return;let frame,second,alive=true;
  expression.current(line.expression);
  const acknowledge=()=>{if(document.visibilityState==='hidden')return;frame=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{if(alive&&node.current?.getBoundingClientRect().width>0){setDisplayedId(line.id);api('/me/pss/display',{method:'POST',body:{executionId:line.id}}).catch(e=>{if(alive)setError(e.message);});}});});};
  acknowledge();document.addEventListener('visibilitychange',acknowledge);
  return()=>{alive=false;cancelAnimationFrame(frame);cancelAnimationFrame(second);document.removeEventListener('visibilitychange',acknowledge);};
 },[line?.id,visible]);
 useEffect(()=>{
  if(!line){setHeld(false);return;}
  if(!visible||held||displayedId!==line.id)return;
  const timer=setTimeout(()=>setQueue(q=>q.filter(l=>l.id!==line.id)),6500);
  return()=>clearTimeout(timer);
 },[line?.id,visible,held,displayedId]);
 if(!visible||!line)return null;
 return <aside ref={node} className="pss-dialogue" role="status" aria-live="polite" aria-label={me.nickname+' 아바타 활동 대사'} data-event-id={line.eventId} data-variant-id={line.variantId} data-execution-id={line.id} data-version={line.version} data-expression={line.expression}
  onPointerEnter={()=>setHeld(true)} onPointerLeave={()=>{if(!node.current?.contains(document.activeElement))setHeld(false);}}
  onFocusCapture={()=>setHeld(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget)&&!event.currentTarget.matches(':hover'))setHeld(false);}}>
  <AvatarPortrait user={{...me,appearance:me.avatarAppearance||me.appearance}}/><div><strong>{me.nickname} · AI 아바타</strong><p>{line.text}</p>{error&&<small role="alert">표시 기록 저장 실패: {error}</small>}</div><button type="button" aria-label="다음 활동 대사" onClick={()=>setQueue(q=>q.filter(l=>l.id!==line.id))}>×</button>
 </aside>;
}
