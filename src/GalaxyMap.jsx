import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ChevronLeft,ChevronRight,HelpCircle,Home,MapPin,RotateCcw,Search,SlidersHorizontal,Star,Users,X,ZoomIn,ZoomOut} from 'lucide-react';
import {AvatarBadge} from './Panels';
import {api} from './api';
import {galaxyLayout} from '../shared/galaxy.mjs';
import './galaxy-map.css';

const fixedUiSelector='.galaxy-header,.galaxy-player-card,.galaxy-view-controls,.galaxy-filters,.galaxy-help,.galaxy-footer,.galaxy-message';
const isMapSurface=target=>!target.closest(fixedUiSelector);

export default function GalaxyMap({me,onClose,onVisit,onPhaseChange}){
  const [users,setUsers]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[filters,setFilters]=useState(false),[help,setHelp]=useState(false),[selected,setSelected]=useState(me.id),[phase,setPhase]=useState('opening'),[page,setPage]=useState(0),[destination,setDestination]=useState(null);
  const root=useRef(null),busy=useRef(false),alive=useRef(true),previousFocus=useRef(null);
  const camera=useRef(null),drag=useRef(null);
  const [view,setView]=useState({zoom:1,rotation:0,tilt:0}),[rotating,setRotating]=useState(false);
  const zoomBy=factor=>{if(!busy.current)setView(v=>({...v,zoom:Math.min(2.4,Math.max(.6,v.zoom*factor))}));};
  const resetView=()=>{if(!busy.current)setView({zoom:1,rotation:0,tilt:0});};
  useEffect(()=>{
    const node=root.current;
    const wheel=e=>{if(!isMapSurface(e.target))return;e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?window.innerHeight:1);zoomBy(Math.exp(-Math.max(-240,Math.min(240,delta))*.0015));};
    node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel);
  },[]);
  function startRotation(e){if(e.button!==2||busy.current||!isMapSurface(e.target))return;e.preventDefault();drag.current={pointerId:e.pointerId,x:e.clientX,y:e.clientY,rotation:view.rotation,tilt:view.tilt};e.currentTarget.setPointerCapture(e.pointerId);setRotating(true);}
  function rotate(e){const start=drag.current;if(!start||e.pointerId!==start.pointerId)return;e.preventDefault();setView(v=>({...v,rotation:(start.rotation+(e.clientX-start.x)*.23)%360,tilt:Math.max(-30,Math.min(30,start.tilt-(e.clientY-start.y)*.15))}));}
  function endRotation(e){if(drag.current?.pointerId!==e.pointerId)return;drag.current=null;setRotating(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}
  const [compact,setCompact]=useState(()=>window.matchMedia('(max-width: 760px)').matches);
  useEffect(()=>{const media=window.matchMedia('(max-width: 760px)'),change=()=>{setCompact(media.matches);setPage(0);};media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  const load=()=>{setLoading(true);setError('');api('/galaxy').then(data=>{if(alive.current)setUsers(data.users);}).catch(e=>{if(alive.current)setError(e.message);}).finally(()=>{if(alive.current)setLoading(false);});};
  useEffect(()=>{alive.current=true;previousFocus.current=document.activeElement;root.current?.focus();load();const timer=setTimeout(()=>setPhase('open'),650);return()=>{alive.current=false;clearTimeout(timer);previousFocus.current?.focus?.();};},[]);
  useEffect(()=>{onPhaseChange(phase);},[phase]);
  useEffect(()=>{const key=e=>{if(e.target.closest('input,textarea,select')||e.ctrlKey||e.metaKey||e.altKey||busy.current)return;if(['+','=','-','0'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.key==='0')resetView();else zoomBy(e.key==='-'?1/1.2:1.2);}};const node=root.current;node.addEventListener('keydown',key);return()=>node.removeEventListener('keydown',key);},[]);
  useEffect(()=>{const key=e=>{if(e.key==='Escape'&&!busy.current){e.stopPropagation();onClose();}if(e.key==='Tab'){const nodes=[...root.current.querySelectorAll('button:not(:disabled),input,[tabindex="0"]')].filter(n=>n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===root.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};root.current?.addEventListener('keydown',key);return()=>root.current?.removeEventListener('keydown',key);},[onClose]);
  const layout=useMemo(()=>galaxyLayout(users,me.id),[users,me.id]);
  const matching=layout.filter(u=>(filter==='all'||filter==='npc'&&u.isNpc||filter==='friends'&&u.relation==='accepted')&&(!query.trim()||[u.nickname,...(u.starNames||[]),u.nickname+'의 별'].some(name=>name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))));
  const pageSize=compact?6:16,pages=Math.max(1,Math.ceil(matching.length/pageSize)),visible=matching.slice(Math.min(page,pages-1)*pageSize,(Math.min(page,pages-1)+1)*pageSize);
  const current=users.find(u=>u.id===selected)||users.find(u=>u.id===me.id)||null;
  async function travel(user){
    if(busy.current)return;if(!user.allowVisitors&&user.id!==me.id){setError('현재 방문을 허용하지 않는 별이에요.');return;}
    busy.current=true;setSelected(user.id);setDestination(user);setError('');setPhase('traveling');
    try{
      const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      await new Promise(resolve=>setTimeout(resolve,reduced?80:850));
      setPhase('handoff');
      if(await onVisit(user.id)===false)throw new Error('별로 이동하지 못했어요. 다시 시도해 주세요.');
      if(alive.current){setPhase('arriving');await new Promise(resolve=>setTimeout(resolve,reduced?80:450));onClose();}
    }catch(e){if(alive.current){setError(e.message);setPhase('open');setDestination(null);}}finally{busy.current=false;}
  }
  return <section ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label="은하 지도" aria-busy={loading||busy.current} className={'galaxy-map galaxy-'+phase} style={{'--destination-x':(destination?.x||50)+'%','--destination-y':(destination?.y||50)+'%',cursor:rotating?'grabbing':undefined}} onContextMenu={e=>{if(isMapSurface(e.target))e.preventDefault();}} onPointerDown={startRotation} onPointerMove={rotate} onPointerUp={endRotation} onPointerCancel={endRotation} onLostPointerCapture={endRotation}>
    <div className="galaxy-sky" aria-hidden="true"><div className="galaxy-backdrop"/></div>
    <div ref={camera} className={'galaxy-camera'+(rotating?' is-rotating':'')} data-zoom={view.zoom.toFixed(3)} data-rotation={view.rotation.toFixed(2)} data-tilt={view.tilt.toFixed(2)} style={{transform:`perspective(1600px) rotateX(${view.tilt}deg) rotateZ(${view.rotation}deg) scale(${view.zoom})`}}>
    <div className="galaxy-universe"><div className="galaxy-orbits" aria-hidden="true"><i/><i/><i/></div>
      <div className="galaxy-constellations">{visible.map((user,index)=><button key={user.id} className={'galaxy-constellation'+(user.id===selected?' is-highlighted':'')+(user.id===me.id?' is-own':'')} style={{left:user.x+'%',top:user.y+'%','--constellation-color':user.color,'--mobile-x':(24+index%2*52)+'%','--mobile-y':(18+Math.floor(index/2)*31)+'%','--sparkle-delay':(-index*.37)+'s'}} aria-label={`${user.nickname}의 별자리 · 별 ${user.starCount}개 · 광장별로 이동`} onPointerEnter={()=>{if(!busy.current&&!drag.current)setSelected(user.id);}} onFocus={()=>setSelected(user.id)} onClick={()=>travel(user)} disabled={busy.current}>
        <svg className="galaxy-stars" viewBox="0 0 180 205" aria-hidden="true"><g className="galaxy-connections">{user.edges.map(([a,b],i)=><line key={i} x1={user.points[a].x} y1={user.points[a].y} x2={user.points[b].x} y2={user.points[b].y}/>)}</g>{user.points.map((p,i)=><g className={'galaxy-star'+(i===0?' galaxy-plaza-star':'')} key={i} data-owned-star={i} data-star-id={i===0?'plaza':undefined}><circle className="galaxy-star-halo" cx={p.x} cy={p.y} r={i===0?23:10}/>{i===0&&<path className="galaxy-plaza-rays" d={`M ${p.x-19} ${p.y} H ${p.x+19} M ${p.x} ${p.y-19} V ${p.y+19} M ${p.x-10} ${p.y-10} L ${p.x+10} ${p.y+10} M ${p.x-10} ${p.y+10} L ${p.x+10} ${p.y-10}`}/>}<path className="galaxy-star-core" d={`M ${p.x} ${p.y-7} L ${p.x+3} ${p.y-3} L ${p.x+7} ${p.y} L ${p.x+3} ${p.y+3} L ${p.x} ${p.y+7} L ${p.x-3} ${p.y+3} L ${p.x-7} ${p.y} L ${p.x-3} ${p.y-3} Z`}/></g>)}</svg>
        <span className="galaxy-name"><AvatarBadge user={user}/><strong>{user.nickname}</strong>{user.id===me.id&&<small>내 별</small>}</span>
        <span className="galaxy-status" aria-hidden="true">{user.id===me.id?<Home size={17}/>:user.isNpc?<Star size={18} fill="currentColor"/>:user.relation==='accepted'?<Users size={17}/>:<span className={user.online?'online':''}/>}</span>
        {user.id===me.id&&<span className="galaxy-home-beacon" aria-hidden="true"><MapPin size={32} fill="white"/><i/><i/></span>}
      </button>)}</div>
    </div>
    </div>
    <header className="galaxy-header"><div className="galaxy-heading"><button onClick={onClose} disabled={busy.current} aria-label="은하 지도 닫기"><ArrowLeft size={30}/></button><h1>은하 지도</h1><button aria-label="은하 지도 도움말" aria-expanded={help} onClick={()=>setHelp(v=>!v)}><HelpCircle size={26}/></button></div><div className="galaxy-tools"><label className="galaxy-search"><Search size={25}/><input value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder="플레이어 이름 또는 별 이름 검색..." aria-label="플레이어 이름 또는 별 이름 검색"/>{query&&<button aria-label="검색 지우기" onClick={()=>setQuery('')}><X size={17}/></button>}</label><button className="galaxy-filter-toggle" onClick={()=>setFilters(v=>!v)} aria-label="은하 지도 필터" aria-expanded={filters}><SlidersHorizontal size={23}/></button></div></header>
    {help&&<aside className="galaxy-help"><strong>별빛으로 이어진 우리</strong><p>레벨 3 이상의 플레이어와 피오나·루나·토리·모아를 만나요. 내 별은 레벨에 관계없이 표시돼요.</p><p>별 하나는 실제 보유한 별 하나예요. 중앙에서 반짝이는 별이 광장별이에요. 별자리에 커서를 올려 정보를 보고, 클릭하면 그 이웃의 광장별로 이동해요.</p><p>마우스 휠로 확대·축소하고, 우클릭한 채 드래그하면 지도가 회전해요. + / − / 0 키로 확대·축소·초기화할 수도 있어요.</p></aside>}
    {filters&&<div className="galaxy-filters" role="group" aria-label="별자리 필터">{[['all','모든 별'],['friends','친구'],['npc','NPC']].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>{setFilter(id);setPage(0);}}>{label}</button>)}</div>}
    {loading&&<div className="galaxy-message" role="status">별자리를 불러오고 있어요…</div>}
    {!loading&&!visible.length&&<div className="galaxy-message" role="status">일치하는 별자리가 없어요.</div>}
    {error&&<div className="galaxy-message galaxy-error" role="alert">{error}{!users.length&&<button onClick={load}>다시 불러오기</button>}</div>}
    {current&&<aside className="galaxy-player-card" aria-label="별자리 플레이어 정보"><div className="galaxy-card-title"><h2>{current.nickname}의 별</h2><span>{current.id===me.id?<><Home size={15}/> 내 별</>:current.isNpc?'NPC':current.online?'접속 중':'이웃'}</span></div><div className="galaxy-level"><strong>{current.level==null?'레벨 비공개':`Lv. ${current.level}`}</strong>{current.level!=null&&<progress aria-label="다음 레벨까지 경험치" max={current.nextLevelXp||100} value={current.levelXp||0}/>}</div><div className="galaxy-card-stats"><span><Star size={23} fill="currentColor"/><b>{current.starCount}</b><small>보유 별</small></span><span><Users size={23}/><b>{current.isNpc?'NPC':current.relation==='accepted'?'친구':'플레이어'}</b></span></div><button className="galaxy-travel" disabled={busy.current||!current.allowVisitors&&current.id!==me.id} onClick={()=>travel(layout.find(u=>u.id===current.id))}><MapPin size={26}/>{busy.current?'별로 이동하는 중…':!current.allowVisitors&&current.id!==me.id?'지금은 방문할 수 없어요':'별로 이동하기'}</button></aside>}
    <div className="galaxy-view-controls" role="group" aria-label="은하 지도 시점 조작"><button aria-label="은하 지도 축소" disabled={busy.current||view.zoom<=.6} onClick={()=>zoomBy(1/1.2)}><ZoomOut size={19}/></button><output aria-label="지도 확대 비율">{Math.round(view.zoom*100)}%</output><button aria-label="은하 지도 확대" disabled={busy.current||view.zoom>=2.4} onClick={()=>zoomBy(1.2)}><ZoomIn size={19}/></button><button aria-label="은하 지도 시점 초기화" disabled={busy.current} onClick={resetView}><RotateCcw size={18}/></button><small>휠로 확대·축소 · 우클릭 드래그로 회전</small></div>
    <footer className="galaxy-footer"><span>✧ 별빛으로 만나는 이웃들</span><span>{matching.length}개의 별자리</span>{pages>1&&<nav aria-label="은하 지도 페이지"><button aria-label="이전 별자리" disabled={page===0} onClick={()=>setPage(v=>v-1)}><ChevronLeft size={17}/></button>{page+1} / {pages}<button aria-label="다음 별자리" disabled={page>=pages-1} onClick={()=>setPage(v=>v+1)}><ChevronRight size={17}/></button></nav>}</footer>
    {['traveling','handoff','arriving'].includes(phase)&&<div className="galaxy-travel-veil" role="status"><Star size={30}/><span>{destination?.nickname}의 광장별로 향하는 중</span></div>}
  </section>;
}
