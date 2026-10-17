import React,{useCallback,useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Bell,Heart,Gamepad2,Footprints,MessageCircle} from 'lucide-react';
import {api,dateLabel} from './api';
import {Modal} from './Panels';
import './notifications.css';

export default function NotificationBell({socket,notify,onVisit}){
  const [open,setOpen]=useState(false),[items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const load=useCallback(async()=>{try{const result=await api('/activities');setItems(result.activities);setError('');}catch(e){setError(e.message);}finally{setLoading(false);}},[]);
  useEffect(()=>{load();socket?.on('refresh',load);socket?.on('connect',load);return()=>{socket?.off('refresh',load);socket?.off('connect',load);};},[socket,load]);
  useEffect(()=>{if(!open)return;const key=e=>{if(e.key==='Escape'){e.stopImmediatePropagation();setOpen(false);}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[open]);
  useEffect(()=>{if(!open)return;const ids=items.filter(a=>!a.is_read).map(a=>a.id);if(!ids.length)return;let active=true;api('/activities/read',{method:'POST',body:{ids}}).then(()=>{if(active)setItems(current=>current.map(a=>ids.includes(a.id)?{...a,is_read:1}:a));}).catch(e=>notify(e.message));return()=>{active=false;};},[open,items,notify]);
  const unread=items.some(a=>!a.is_read);
  const icons={minigame:Gamepad2,cheer:Heart,conversation:MessageCircle};
  return <><button type="button" className="notification-button" title="알림" aria-label={unread?'알림 · 새 알림 있음':'알림'} aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setOpen(true);load();}}><Bell size={19}/>{unread&&<span className="notification-dot"/>}</button>{open&&createPortal(<Modal title="알림" eyebrow="LITTLE TRACES OF CONNECTION" onClose={()=>setOpen(false)} className="notifications-modal"><div className="panel-body notification-list">{loading?<p role="status">알림을 불러오는 중…</p>:error?<div role="alert"><p>{error}</p><button className="secondary" onClick={load}>다시 시도</button></div>:items.length?items.map(a=>{const Icon=icons[a.type]||Footprints;return <article className="activity-row" key={a.id}><span className="activity-icon"><Icon size={20}/></span><div><strong>{a.nickname||'이름 없는 새싹'}</strong><p>{a.detail}</p><small>{dateLabel(a.created_at)}</small></div>{a.actor_id&&<button className="text-button" onClick={()=>{setOpen(false);onVisit(a.actor_id);}}>답방 ↗</button>}</article>;}):<div className="empty"><Bell/><h3>아직 도착한 알림이 없어요</h3><p>방문과 응원, 미니게임 결과를 여기서 확인해요.</p></div>}</div></Modal>,document.body)}</>;
}
