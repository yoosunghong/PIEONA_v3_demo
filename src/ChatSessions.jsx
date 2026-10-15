import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {BookOpen,Check,MessageCircle,X} from 'lucide-react';
import {api,dateLabel} from './api';
import './chat-sessions.css';

export default function ChatSessions({targetId,currentId,busy,onSelect,onClose,onLogs,notify}){
  const [sessions,setSessions]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const root=useRef(null);
  const [space,setSpace]=useState(300);
  useLayoutEffect(()=>{
    const dock=root.current.parentElement,world=dock.closest('.world-panel');
    const measure=()=>setSpace(Math.max(130,Math.min(480,dock.getBoundingClientRect().top-world.getBoundingClientRect().top-20)));
    measure();const observer=new ResizeObserver(measure);observer.observe(dock);observer.observe(world);
    window.addEventListener('resize',measure);return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
  },[]);
  useEffect(()=>{
    let active=true;
    api('/conversations?targetId='+encodeURIComponent(targetId)).then(r=>{if(active)setSessions(r.conversations);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[targetId]);
  useEffect(()=>{
    root.current?.focus();
    const outside=e=>{if(!root.current?.contains(e.target)&&!e.target.closest('[aria-controls="chat-sessions"]'))onClose();};
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[onClose]);
  return <aside id="chat-sessions" className="chat-sessions" style={{maxHeight:space}} aria-label="채팅 세션 목록" tabIndex={-1} ref={root} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
    <header><div><strong>대화 세션</strong><p>기억은 이어지고, 이야기는 새롭게.</p></div><button type="button" className="icon-button" aria-label="세션 목록 닫기" onClick={onClose}><X size={18}/></button></header>
    <div className="session-list" aria-busy={loading}>
      {loading?<p className="session-empty">이야기를 불러오는 중…</p>:error?<p className="session-empty" role="alert">{error}</p>:!sessions.length?<p className="session-empty">아직 저장된 대화가 없어요.<br/>새 대화로 첫 이야기를 시작하세요.</p>:sessions.map(c=><button type="button" className={'session-item '+(c.id===currentId?'active':'')} key={c.id} disabled={busy} aria-current={c.id===currentId?'true':undefined} onClick={()=>onSelect(c)}><MessageCircle size={17}/><span><strong>{c.title}</strong><small>{dateLabel(c.updated_at)} · {Math.floor(c.count/2)}번의 대화{c.id===currentId?' · 현재':''}</small></span>{c.id===currentId&&<Check size={16}/>}</button>)}
    </div>
    <footer><span>아바타가 기억한 성향은 그대로 이어져요.</span><button type="button" className="text-button" onClick={onLogs}><BookOpen size={15}/>전체 기록</button></footer>
  </aside>;
}
