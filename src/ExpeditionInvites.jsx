import React,{useEffect,useState} from 'react';
import {io} from 'socket.io-client';
import {api} from './api';
import './expedition-social.css';

export default function ExpeditionInvites(){
 const [invite,setInvite]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{let active=true,socket,polling=false;const poll=async()=>{if(polling)return;polling=true;try{const r=await api('/exploration/invitations');if(!active)return;setInvite(r.invitations[0]||null);if(!socket){socket=io({withCredentials:true});socket.on('exploration:invited',i=>{setError('');setInvite(i);});socket.on('exploration:left',e=>{setNotice(`${e.nickname}님이 ${e.reason}`);window.dispatchEvent(new CustomEvent('exploration:notice',{detail:e}));});}}catch(e){if(e.status===401){socket?.disconnect();socket=null;if(active)setInvite(null);}}finally{polling=false;}};poll();const timer=setInterval(poll,5000);return()=>{active=false;clearInterval(timer);socket?.disconnect();};},[]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),6000);return()=>clearTimeout(timer);},[notice]);
 useEffect(()=>{if(!invite)return;const timer=setTimeout(()=>setInvite(null),Math.max(0,invite.expires-Date.now()));return()=>clearTimeout(timer);},[invite?.id]);
 async function respond(accept){setBusy(true);setError('');try{await api(`/exploration/invitations/${invite.id}`,{method:'POST',body:{accept}});setInvite(null);if(accept)location.href='/explore';}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <>{invite&&<aside className="exp-live-invite" role="dialog" aria-modal="false" aria-label="친구의 숲 탐험 초대"><span>함께 걷는 초록 숲</span><strong>{invite.nickname}님이 숲에 초대했어요</strong><p>최대 4명이 같은 숲에서 함께 채집할 수 있어요. 진행 중인 탐험은 귀환 후 참여해 주세요.</p>{error&&<p role="alert">{error}</p>}<div><button disabled={busy} onClick={()=>respond(false)}>거절</button><button disabled={busy} onClick={()=>respond(true)}>수락하고 함께 가기</button></div></aside>}{notice&&<div className="exp-live-notice" role="status">{notice}</div>}</>;
}
