import React,{useCallback,useEffect,useRef,useState} from 'react';
import {BookOpen,ChevronLeft,ChevronRight,Lock,Send,Trash2,X} from 'lucide-react';
import {api,dateLabel} from './api';
import {GUESTBOOK_MAX_LENGTH,guestbookLength} from '../shared/guestbook.mjs';
import './guestbook.css';

export default function Guestbook({target,me,socket,onClose,notify}){
  const own=target.id===me.id,path='/villages/'+target.id+'/guestbook';
  const [data,setData]=useState(null),[page,setPage]=useState(1),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [content,setContent]=useState(''),[anonymous,setAnonymous]=useState(false),[visibility,setVisibility]=useState('public');
  const [busy,setBusy]=useState(false),[deleting,setDeleting]=useState(null);
  const root=useRef(),closeButton=useRef(),sequence=useRef(0),mutation=useRef(false),alive=useRef(true),deleteButton=useRef(),previousDelete=useRef(null),pages=useRef();
  const length=guestbookLength(content);
  const load=useCallback(async()=>{
    const request=++sequence.current;setLoading(true);setError('');
    try{const result=await api(path+'?page='+page);if(alive.current&&request===sequence.current){setData(result);if(result.page!==page)setPage(result.page);}}
    catch(e){if(alive.current&&request===sequence.current){setData(null);setError(e.message);}}
    finally{if(alive.current&&request===sequence.current)setLoading(false);}
  },[path,page]);
  useEffect(()=>{alive.current=true;closeButton.current?.focus();return()=>{alive.current=false;sequence.current++;};},[]);
  useEffect(()=>{load();const changed=event=>{if(event.villageId===target.id)load();};const focus=()=>{if(!document.hidden)load();};socket?.on('guestbook:changed',changed);socket?.on('connect',load);socket?.on('world:changed',load);window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);return()=>{sequence.current++;socket?.off('guestbook:changed',changed);socket?.off('connect',load);socket?.off('world:changed',load);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};},[load,socket,target.id]);
  useEffect(()=>{if(deleting)deleteButton.current?.focus();else if(previousDelete.current)closeButton.current?.focus();previousDelete.current=deleting;},[deleting]);
  useEffect(()=>{if(pages.current)pages.current.scrollTop=0;},[data?.page]);
  function close(){if(!mutation.current)onClose();}
  function keyboard(e){
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!mutation.current){if(deleting)setDeleting(null);else close();}}
    if(e.key==='Tab'){
      const focusable=[...root.current.querySelectorAll('button:not(:disabled),textarea,input,select,[tabindex="0"]')].filter(el=>!el.closest('[inert]'));
      const first=focusable[0],last=focusable.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
  }
  async function submit(e){
    e.preventDefault();if(mutation.current||!content.trim()||length>GUESTBOOK_MAX_LENGTH)return;
    mutation.current=true;setBusy(true);setError('');
    try{await api(path,{method:'POST',body:{content,anonymous,visibility}});if(!alive.current)return;setContent('');notify(visibility==='private'?'주인만 읽을 수 있는 글을 남겼어요.':'방명록에 글을 남겼어요.');if(page!==1)setPage(1);else await load();}
    catch(e){if(alive.current)setError(e.message);}
    finally{mutation.current=false;if(alive.current)setBusy(false);}
  }
  async function remove(){
    if(mutation.current)return;mutation.current=true;setBusy(true);setError('');
    try{await api(path+'/'+deleting,{method:'DELETE'});if(alive.current){setDeleting(null);notify('방명록 글을 삭제했어요.');await load();closeButton.current?.focus();}}
    catch(e){if(alive.current)setError(e.message);}
    finally{mutation.current=false;if(alive.current)setBusy(false);}
  }
  return <div className="guestbook-layer" onKeyDown={keyboard}><section ref={root} className="guestbook" role="dialog" aria-modal="true" aria-labelledby="guestbook-title">
    <div className="guestbook-content" inert={!!deleting}>
      <header className="guestbook-heading"><span className="guestbook-emblem"><BookOpen size={25}/></span><div><p>마음이 머무는 작은 책</p><h2 id="guestbook-title">{own?'우리 마을':target.nickname+'의'} 방명록</h2></div><button ref={closeButton} aria-label="방명록 닫기" disabled={busy} onClick={close}><X size={21}/></button></header>
      <div className="guestbook-intro"><span>{own?'이웃이 남긴 마음을 읽고, 나의 이야기도 남겨보세요.':'잠시 다녀간 마음을 한 페이지에 남겨주세요.'}</span><small>최신 글부터 · 한 페이지에 4개</small></div>
      <div ref={pages} className="guestbook-pages" aria-busy={loading}>
        {loading&&!data?<p className="guestbook-empty" role="status">책장을 펼치고 있어요…</p>:data?.entries.length?<ol>{data.entries.map(entry=><li key={entry.id}><article><header><strong>{entry.authorName}</strong>{entry.isOwner&&<span className="guestbook-badge">주인</span>}{entry.visibility==='private'&&<span className="guestbook-badge"><Lock size={11}/>주인만 보기</span>}{own&&<button className="guestbook-remove" aria-label={entry.authorName+'의 글 삭제'} disabled={busy} onClick={()=>setDeleting(entry.id)}><Trash2 size={15}/></button>}</header><p>{entry.content}</p><time dateTime={entry.createdAt}>{dateLabel(entry.createdAt)}</time></article></li>)}</ol>:data&&<div className="guestbook-empty"><BookOpen size={36}/><strong>아직 빈 책장이에요</strong><span>첫 번째 이야기를 남겨보세요.</span></div>}
      </div>
      <nav className="guestbook-pagination" aria-label="방명록 페이지"><button aria-label="이전 페이지" disabled={busy||loading||!data||data.page<=1} onClick={()=>setPage(data.page-1)}><ChevronLeft size={18}/></button><span aria-live="polite">{data?`${data.page} / ${data.pages} 페이지 · ${data.total}개의 글`:'방명록'}{loading&&data?' · 불러오는 중…':''}</span><button aria-label="다음 페이지" disabled={busy||loading||!data||data.page>=data.pages} onClick={()=>setPage(data.page+1)}><ChevronRight size={18}/></button></nav>
      <form className="guestbook-compose" onSubmit={submit}><label htmlFor="guestbook-message">작은 인사 남기기</label><textarea id="guestbook-message" rows={3} placeholder="이 마을에서의 기분은 어땠나요?" value={content} disabled={busy} onChange={e=>setContent(Array.from(e.target.value).slice(0,GUESTBOOK_MAX_LENGTH).join(''))} aria-describedby="guestbook-count guestbook-privacy"/><span id="guestbook-count" className="guestbook-count">{length} / {GUESTBOOK_MAX_LENGTH}자</span><div className="guestbook-options"><label><input type="checkbox" checked={anonymous} disabled={busy} onChange={e=>setAnonymous(e.target.checked)}/>익명으로 남기기</label><select aria-label="글 공개 범위" value={visibility} disabled={busy} onChange={e=>setVisibility(e.target.value)}><option value="public">모두 공개</option><option value="private">주인만 보기</option></select></div><p id="guestbook-privacy">{visibility==='private'?'마을 주인만 읽을 수 있어요. 다른 방문객에게는 표시되지 않아요.':'마을 주인과 방문객이 함께 읽을 수 있어요.'}{anonymous?' 이름은 익명으로 표시돼요.':''}</p><button className="guestbook-submit" disabled={busy||!content.trim()||length>GUESTBOOK_MAX_LENGTH}><Send size={16}/>{busy?'처리 중…':'글 남기기'}</button></form>
      {error&&<div className="guestbook-error" role="alert">{error}<button disabled={busy||loading} onClick={load}>다시 불러오기</button></div>}
    </div>
    {deleting&&<div className="guestbook-confirm" role="alertdialog" aria-modal="true" aria-labelledby="guestbook-delete-title"><Trash2 size={28}/><h3 id="guestbook-delete-title">이 글을 삭제할까요?</h3><p>삭제한 글은 다시 복구할 수 없어요.</p>{error&&<p role="alert">{error}</p>}<div><button ref={deleteButton} disabled={busy} onClick={()=>{setDeleting(null);closeButton.current?.focus();}}>취소</button><button disabled={busy} onClick={remove}>{busy?'삭제 중…':'삭제하기'}</button></div></div>}
  </section></div>;
}
