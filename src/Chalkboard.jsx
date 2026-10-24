import React,{useCallback,useEffect,useRef,useState} from 'react';
import {api} from './api';
import {renderChalkboard} from './chalkboardDrawing.mjs';
import {MAX_SIGN_POINTS,signPointCount} from '../shared/sign.mjs';
import './chalkboard.css';

export function useChalkboard(villageId,socket){
  const [data,setData]=useState(null),[error,setError]=useState('');
  const sequence=useRef(0);
  const load=useCallback(async()=>{if(!villageId)return;const token=++sequence.current;try{const result=await api(`/villages/${villageId}/chalkboard`);if(token===sequence.current){setData(result);setError('');}}catch(e){if(token===sequence.current)setError(e.message);}},[villageId]);
  useEffect(()=>{setData(null);load();const changed=e=>{if(e.villageId===villageId)load();};const focus=()=>{if(!document.hidden)load();};socket?.on('chalkboard:changed',changed);socket?.on('connect',load);window.addEventListener('focus',focus);return()=>{sequence.current++;socket?.off('chalkboard:changed',changed);socket?.off('connect',load);window.removeEventListener('focus',focus);};},[load,socket,villageId]);
  return{data,error,load,setData};
}
const colors=['#fffaf4','#f8df70','#fa91b5','#55bce7','#a7e3a5','#cbb1ff'];
export default function Chalkboard({target,me,board}){
  const canvas=useRef(),stroke=useRef(),batch=useRef(null);
  const [draft,setDraft]=useState([]),[color,setColor]=useState(colors[0]),[size,setSize]=useState(5),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmClear,setConfirmClear]=useState(false),[drawing,setDrawing]=useState(false);
  const draftRevision=useRef(null);
  const redraw=()=>{if(canvas.current)renderChalkboard(canvas.current,[...(board.data?.strokes||[]),...draft,...(stroke.current?[stroke.current]:[])]);};
  useEffect(redraw,[board.data,draft]);
  const point=e=>{const rect=canvas.current.getBoundingClientRect();return[Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))];};
  function start(e){if(busy||!board.data||stroke.current||e.button!==0)return;if(draft.length>=100)return setError('먼저 낙서를 저장한 뒤 이어서 그려주세요.');if(!draft.length)draftRevision.current=board.data.revision;e.preventDefault();canvas.current.setPointerCapture(e.pointerId);stroke.current={tool:'draw',color,size,points:[point(e)]};setDrawing(true);redraw();}
  function move(e){if(!stroke.current)return;const p=point(e),last=stroke.current.points.at(-1);if(stroke.current.points.length>=2000||signPointCount(draft)+stroke.current.points.length>=MAX_SIGN_POINTS)return;if(Math.hypot(p[0]-last[0],p[1]-last[1])<.002)return;stroke.current.points.push(p);redraw();}
  function finish(e,cancel=false){if(!stroke.current)return;const result=stroke.current;stroke.current=null;setDrawing(false);if(canvas.current.hasPointerCapture(e.pointerId))canvas.current.releasePointerCapture(e.pointerId);if(!cancel){batch.current=null;setDraft(previous=>[...previous,result]);}else redraw();}
  async function save(){
    if(busy||drawing||!draft.length)return;setBusy(true);setError('');
    batch.current??=crypto.randomUUID();
    try{const result=await api(`/villages/${target.id}/chalkboard`,{method:'POST',body:{strokes:draft,revision:draftRevision.current,requestId:batch.current}});board.setData(result);setDraft([]);batch.current=null;}
    catch(e){setError(e.message);await board.load();}finally{setBusy(false);}
  }
  async function clear(){if(busy||!board.data)return;setBusy(true);setError('');try{board.setData(await api(`/villages/${target.id}/chalkboard`,{method:'DELETE',body:{revision:board.data.revision}}));setDraft([]);batch.current=null;setConfirmClear(false);}catch(e){setError(e.message);}finally{setBusy(false);}}
  const stale=draft.length>0&&draftRevision.current!==board.data?.revision;
  return <div className="panel-body chalkboard-panel"><p>마을 주인과 놀러 온 이웃이 함께 낙서하는 곳이에요. 저장하면 모두에게 보여요.</p>
    <div className="chalkboard-tools"><div role="group" aria-label="분필 색상">{colors.map(value=><button key={value} aria-label={'분필 '+value} aria-pressed={color===value} disabled={busy||drawing} style={{background:value}} onClick={()=>setColor(value)}/>)}</div><label>분필 굵기 <input type="range" aria-label="분필 굵기" min="2" max="20" value={size} disabled={busy||drawing} onChange={e=>setSize(Number(e.target.value))}/></label><button disabled={busy||drawing||!draft.length} onClick={()=>{batch.current=null;setDraft(draft.slice(0,-1));}}>내 낙서 되돌리기</button></div>
    <canvas ref={canvas} width="1200" height="800" aria-label="이웃과 함께 쓰는 칠판 그림판" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>finish(e,true)}/>
    {!board.data&&<p role="status">{board.error||'칠판을 불러오는 중…'}</p>}{(error||board.error)&&<p role="alert">{error||board.error}<button onClick={board.load}>다시 불러오기</button></p>}
    {stale&&<p role="alert">마을 주인이 칠판을 지웠어요. 임시 낙서를 비우고 새 칠판에 그려주세요.</p>}
    <footer><button disabled={busy||drawing||!draft.length} onClick={()=>{setDraft([]);batch.current=null;}}>임시 낙서 비우기</button>{me.id===target.id&&<button disabled={busy||drawing||!board.data} onClick={()=>setConfirmClear(true)}>칠판 전체 지우기</button>}<button className="card-pink-button" disabled={busy||drawing||stale||!draft.length} onClick={save}>{busy?'처리 중…':'낙서 저장하기'}</button></footer>
    <small>저장하지 않은 낙서는 창을 닫으면 사라져요. 다른 사람의 낙서는 마을 주인만 전체 지울 수 있어요.</small>
    {confirmClear&&<div role="alertdialog" aria-label="칠판 전체 지우기" className="chalkboard-confirm"><p>모두의 낙서를 지울까요?</p><button disabled={busy} onClick={()=>setConfirmClear(false)}>취소</button><button disabled={busy} onClick={clear}>전체 지우기</button></div>}
  </div>;
}
