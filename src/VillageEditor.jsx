import {isScenery,villageScenery} from '../shared/scenery.mjs';
import React,{useEffect,useLayoutEffect,useReducer,useRef,useState} from 'react';
import {ArrowLeft,Armchair,BookOpen,Blocks,Check,Flower2,Grid2X2,House,Lightbulb,Mouse,Plus,Redo2,RotateCw,Search,SlidersHorizontal,Sparkles,Trash2,Trees,Undo2,X,ZoomIn,ZoomOut,Copy,Focus} from 'lucide-react';
import {api} from './api';
import {decorations,villageThemes} from '../shared/world.mjs';
import {canPlaceDecoration,editorHistory,snapPosition} from './villageEditorState.mjs';
import {decorationThumbnails} from './decorationThumbnails';
import './village-editor.css';
import {SIGN_ID,villageSign,signPlacementItem} from '../shared/sign.mjs';
import {SignThumbnail} from './SignEditor';
import {GUESTBOOK_ID,villageGuestbook,guestbookPlacementItem} from '../shared/guestbook.mjs';
const fixedItem=id=>id===SIGN_ID||id===GUESTBOOK_ID||isScenery(id);
const itemName=item=>isScenery(item.id)?item.name:item.id===SIGN_ID?'마을 팻말':item.id===GUESTBOOK_ID?'마을 방명록':decorations.find(entry=>entry.id===item.type)?.name;

const categories=[{id:'all',name:'전체',Icon:Grid2X2},{id:'furniture',name:'가구',Icon:Armchair},{id:'plants',name:'식물',Icon:Flower2},{id:'decor',name:'장식',Icon:Trees},{id:'buildings',name:'건물',Icon:House},{id:'lighting',name:'조명',Icon:Lightbulb},{id:'other',name:'기타',Icon:Blocks}];

export default function VillageEditor({me,notify,onRefresh,onClose,onSceneChange}){
  const [history,dispatch]=useReducer(editorHistory,{past:[],present:[...(me.village?.items||[]).map(item=>({...item})),signPlacementItem(villageSign(me.village)),guestbookPlacementItem(villageGuestbook(me.village)),...villageScenery(me.village)],future:[]});
  const items=history.present;
  const [category,setCategory]=useState('all'),[query,setQuery]=useState(''),[sort,setSort]=useState(false),[images,setImages]=useState({});
  const [selected,setSelected]=useState(null),[tool,setTool]=useState(null),[rotation,setRotation]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[exitPrompt,setExitPrompt]=useState(false),[cameraAction,setCameraAction]=useState(null);
  const busyRef=useRef(false),initial=useRef(JSON.stringify(items)),backRef=useRef();
  const chosen=items.find(item=>item.id===selected),active=isScenery(chosen?.id)?{id:chosen.id,name:chosen.name}:chosen?.id===GUESTBOOK_ID?{id:'villageGuestbook',name:'마을 방명록'}:chosen?.id===SIGN_ID?{id:'villageSign',name:'마을 팻말'}:decorations.find(item=>item.id===(chosen?.type||tool));
  const dirty=initial.current!==JSON.stringify(items);
  useEffect(()=>{if(!dirty)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  let catalog=decorations.filter(item=>(category==='all'||category===item.category)&&item.name.includes(query.trim()));
  const storedCatalog=items.filter(item=>item.hidden&&(category==='all'||category===(fixedItem(item.id)?'other':decorations.find(entry=>entry.id===item.type)?.category))&&itemName(item)?.includes(query.trim()));
  if(sort)catalog=[...catalog].sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  useEffect(()=>{let alive=true;decorationThumbnails().then(result=>{if(alive)setImages(result);}).catch(()=>{if(alive)setError('소품 미리보기를 불러오지 못했어요. 새로고침 후 다시 시도해주세요.');});backRef.current?.focus();return()=>{alive=false;};},[]);
  function change(next){if(busyRef.current)return;setError('');dispatch({type:'change',items:next});}
  function select(id){if(busyRef.current)return;setSelected(id);setTool(null);}
  function cancel(){if(busyRef.current)return;setSelected(null);setTool(null);}
  function pick(type){if(busyRef.current)return;setTool(type);setSelected(null);setRotation(0);setExitPrompt(false);}
  function place(point,type=tool){
    if(busyRef.current||!decorations.some(item=>item.id===type))return;
    const x=snapPosition(point.x),z=snapPosition(point.z);
    if(items.filter(item=>!fixedItem(item.id)&&!item.hidden).length>=24)return setError('소품은 최대 24개까지 배치할 수 있어요. 기존 소품을 정리해 주세요.');
    if(!canPlaceDecoration(items,x,z))return setError('광장·산책로·기존 시설을 피해 빈 격자에 놓아주세요. 소품 사이에는 간격이 필요해요.');
    const stored=items.find(item=>item.type===type&&item.hidden);
    if(!stored&&items.filter(item=>!fixedItem(item.id)).length>=256)return setError('보관함이 가득 찼어요. 보관 중인 소품을 다시 배치해주세요.');
    const item={id:stored?.id||crypto.randomUUID(),type,x,z,rotation};change(stored?items.map(entry=>entry.id===stored.id?item:entry):[...items,item]);setSelected(item.id);setTool(null);
  }
  function move(id,point){
    const x=snapPosition(point.x),z=snapPosition(point.z);
    if(!canPlaceDecoration(items,x,z,id))return setError('이곳에는 놓을 수 없어요. 광장·시설·다른 소품을 피해 이동해 주세요.');
    change(items.map(item=>item.id===id?{...item,x,z}:item));
  }
  function rotate(){if(busyRef.current)return;if(chosen)change(items.map(item=>item.id===selected?{...item,rotation:(item.rotation+1)%4}:item));else setRotation(value=>(value+1)%4);}
  function remove(){
    if(!chosen||busyRef.current)return;
    change(items.map(item=>item.id===selected?{...item,hidden:true}:item));
    setSelected(null);notify('소품을 인벤토리로 돌려보냈어요. 다시 배치할 수 있어요.');
  }
  function restore(id){
    if(busyRef.current)return;
    const stored=items.find(item=>item.id===id);
    if(!stored?.hidden)return select(id);
    if(!fixedItem(id)&&items.filter(item=>!fixedItem(item.id)&&!item.hidden).length>=24)return setError('소품은 최대 24개까지 배치할 수 있어요.');
    let point=canPlaceDecoration(items,stored.x,stored.z,id)?stored:null;
    for(let x=-5.5;!point&&x<=5.5;x+=.25)for(let z=-5.5;z<=5.5;z+=.25)if(canPlaceDecoration(items,x,z,id)){point={x,z};break;}
    if(!point)return setError('배치할 공간이 없어요. 다른 소품을 정리한 뒤 다시 시도해주세요.');
    change(items.map(item=>item.id===id?{...item,x:point.x,z:point.z,hidden:false}:item));select(id);
  }
  function timeTravel(type){if(busyRef.current)return;dispatch({type});cancel();setError('');}
  function close(){if(busyRef.current)return;if(dirty)setExitPrompt(true);else onClose();}
  function placement(id){const {x,z,rotation,hidden=false}=items.find(item=>item.id===id);return{x,z,rotation,hidden};}
  async function save(){
    if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');
    try{
      await api('/me/world',{method:'PATCH',body:{village:{items:items.filter(item=>!fixedItem(item.id)),sign:placement(SIGN_ID),guestbook:placement(GUESTBOOK_ID),scenery:items.filter(item=>isScenery(item.id)).map(({id,x,z,rotation,hidden=false})=>({id:id.slice(8),x,z,rotation,hidden}))}}});
      initial.current=JSON.stringify(items);
      try{await onRefresh();}catch{notify('배치는 저장됐어요. 홈 화면을 새로고침하면 저장한 마을을 볼 수 있어요.');}
      notify('마을 꾸미기를 저장했어요.');onClose();
    }catch(e){setError('저장하지 못했어요. '+e.message);}finally{busyRef.current=false;setBusy(false);}
  }
  useEffect(()=>{
    const keydown=e=>{
      if(busyRef.current||e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
      const command=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
      if(command&&key==='z'){e.preventDefault();timeTravel(e.shiftKey?'redo':'undo');}
      else if(command&&key==='y'){e.preventDefault();timeTravel('redo');}
      else if(key==='escape'){e.preventDefault();if(tool||selected)cancel();else if(exitPrompt)setExitPrompt(false);else close();}
      else if(key==='r'&&(chosen||tool)){e.preventDefault();rotate();}
      else if((key==='delete'||key==='backspace')&&chosen){e.preventDefault();remove();}
      else if(chosen&&['arrowleft','arrowright','arrowup','arrowdown'].includes(key)){e.preventDefault();move(chosen.id,{x:chosen.x+(key==='arrowleft'?-.25:key==='arrowright'?.25:0),z:chosen.z+(key==='arrowup'?-.25:key==='arrowdown'?.25:0)});}
    };
    window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);
  });
  const camera=type=>setCameraAction({type,at:performance.now()});
  useLayoutEffect(()=>{onSceneChange({scenery:items.filter(item=>isScenery(item.id)).map(({id,x,z,rotation,hidden=false})=>({id:id.slice(8),x,z,rotation,hidden})),items:items.filter(item=>!fixedItem(item.id)),sign:{...villageSign(me.village),...items.find(item=>item.id===SIGN_ID)},guestbook:placement(GUESTBOOK_ID),editor:{selected,tool,rotation,busy,onSelect:select,onCancel:cancel,onPlace:place,onMove:move,cameraAction}});},[items,selected,tool,rotation,busy,cameraAction,onSceneChange]);
  const studioTheme=villageThemes.find(theme=>theme.id===me.village?.theme)?.id||'default';
  return <main className="village-studio" data-theme={studioTheme} aria-label="마을 꾸미기" aria-busy={busy}>
    <header className="studio-heading"><button ref={backRef} className="studio-back" aria-label="마을 꾸미기 나가기" disabled={busy} onClick={close}><ArrowLeft/></button><div><h1>마을 꾸미기</h1><p>나만의 특별한 공간을 만들어보세요</p></div></header>
    <aside className="studio-catalog" aria-label="소품 목록">
      <nav className="studio-tabs" aria-label="빠른 소품 분류">{categories.slice(0,5).map(item=><button key={item.id} aria-pressed={category===item.id} className={category===item.id?'active':''} onClick={()=>setCategory(item.id)}>{item.name}</button>)}</nav>
      <div className="studio-search"><label><Search size={19}/><input aria-label="소품 검색" placeholder="아이템 이름을 검색하세요..." value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="검색 지우기" onClick={()=>setQuery('')}><X size={14}/></button>}</label><button className={sort?'active':''} aria-label="이름순 정렬" aria-pressed={sort} onClick={()=>setSort(value=>!value)}><SlidersHorizontal size={21}/></button></div>
      <div className="studio-inventory"><nav className="studio-categories" aria-label="전체 소품 분류">{categories.map(({id,name,Icon})=><button key={id} className={category===id?'active':''} aria-pressed={category===id} onClick={()=>setCategory(id)}><Icon strokeWidth={1.65}/><span>{name}</span></button>)}</nav>
        <div className="studio-cards" aria-label="배치할 소품">{storedCatalog.map(item=><button key={item.id} className="studio-card studio-stored-card" disabled={busy} onClick={()=>restore(item.id)}><span className="studio-card-art">{item.id===SIGN_ID?<SignThumbnail shape={villageSign(me.village).shape}/>:item.id===GUESTBOOK_ID?<BookOpen size={32}/>:images[item.type]?<img src={images[item.type]} alt=""/>:<Trees size={32}/>}</span><strong>{itemName(item)}</strong><small>보관 중 · 다시 배치</small></button>)}{catalog.length?catalog.map(item=><button key={item.id} className={'studio-card '+((chosen?.type||tool)===item.id?'selected':'')} aria-label={item.name+' 배치'} aria-pressed={tool===item.id} disabled={busy} draggable={!busy} onDragStart={e=>{e.dataTransfer.setData('application/pieona-decoration',item.id);e.dataTransfer.effectAllowed='copy';pick(item.id);}} onClick={()=>pick(item.id)}><span className="studio-card-art">{images[item.id]?<img src={images[item.id]} alt="" draggable={false}/>:<span className="studio-card-placeholder" style={{background:item.color}}/>}</span><strong>{item.name}</strong><span className="studio-card-add"><Plus size={13}/></span></button>):!storedCatalog.length?<p className="studio-empty">검색한 소품이 없어요.<button onClick={()=>{setQuery('');setCategory('all');}}>전체 소품 보기</button></p>:null}</div>
      </div><button className="studio-sign-position" aria-label="마을 팻말 위치 조정" disabled={busy} onClick={()=>restore(SIGN_ID)}><SignThumbnail shape={villageSign(me.village).shape}/><span><strong>마을 팻말</strong><small>{items.find(item=>item.id===SIGN_ID)?.hidden?'보관 중 · 다시 배치':'선택하여 이동 · 회전'}</small></span></button><button className="studio-sign-position studio-guestbook-position" aria-label="마을 방명록 위치 조정" disabled={busy} onClick={()=>restore(GUESTBOOK_ID)}><BookOpen size={30}/><span><strong>마을 방명록</strong><small>{items.find(item=>item.id===GUESTBOOK_ID)?.hidden?'보관 중 · 다시 배치':'선택하여 이동 · 회전'}</small></span></button><div className="studio-scenery-note"><Trees size={15}/>소품을 눌러 이동하거나 인벤토리에 보관하세요</div><div className="studio-catalog-foot"><span><span className="studio-dot"/>{items.filter(item=>!fixedItem(item.id)&&!item.hidden).length} / 24 배치</span><span>모든 소품 무료 <Sparkles size={12}/></span></div>
    </aside>
    <div className="studio-mode"><Sparkles size={35} strokeWidth={1.5}/><div><strong>편집 모드</strong><p>아이템을 배치하여<br/>나만의 마을을 꾸며보세요!</p></div></div>
    <div className="studio-camera" aria-label="편집 카메라"><button aria-label="줌인" onClick={()=>camera('in')}><ZoomIn size={19}/></button><button aria-label="줌아웃" onClick={()=>camera('out')}><ZoomOut size={19}/></button><span/><button aria-label="카메라 시점 초기화" onClick={()=>camera('reset')}><Focus size={19}/></button></div>
    {(chosen||tool)&&<div className="studio-selection"><div>{chosen?.id===SIGN_ID?<span className="studio-selection-art"><SignThumbnail shape={villageSign(me.village).shape}/></span>:chosen?.id===GUESTBOOK_ID?<span className="studio-selection-art"><BookOpen size={30}/></span>:isScenery(chosen?.id)?<span className="studio-selection-art"><Trees size={30}/></span>:null}{active&&images[active.id]&&<img src={images[active.id]} alt=""/>}<span><strong>{active?.name}</strong><small>{chosen?'드래그로 이동 · 방향키로 미세 조정':'빈 격자를 클릭하거나 소품을 끌어 놓으세요'}</small></span><button aria-label="소품 선택 해제" onClick={cancel} disabled={busy}><X size={17}/></button></div><footer><button onClick={rotate} disabled={busy}><RotateCw size={16}/>회전 <kbd>R</kbd></button>{chosen&&!fixedItem(chosen.id)?<><button disabled={busy||items.filter(item=>!fixedItem(item.id)&&!item.hidden).length>=24} onClick={()=>{pick(chosen.type);setRotation(chosen.rotation);}}><Copy size={16}/>복제</button></>:<span>{(chosen?.rotation??rotation)*90}°{fixedItem(chosen?.id)?isScenery(chosen?.id)?' · 마을의 기본 풍경':' · 인벤토리에 보관 가능':''}</span>}{chosen&&<button className="studio-delete" disabled={busy} onClick={remove}><Trash2 size={16}/>삭제 · 보관</button>}</footer></div>}
    <div className="studio-hints"><span><Mouse/>드래그 : {tool?'둘러보기 / 클릭 : 배치':'회전 · 소품 이동'}</span><span><Mouse/>휠 : 줌인 / 아웃</span><span><Mouse/>우클릭 / Esc : 선택 취소</span><span className="studio-touch-hint">한 손가락 : 회전 · 두 손가락 : 확대 / 이동</span></div>
    {error&&<div className="studio-error" role="alert"><span>{error}</span><button aria-label="안내 닫기" onClick={()=>setError('')}><X size={16}/></button></div>}
    {exitPrompt&&<div className="studio-exit" role="alertdialog" aria-label="편집 내용 저장"><strong>꾸민 마을을 저장할까요?</strong><p>저장하지 않고 나가면 이번 변경 사항이 사라져요.</p><div><button onClick={()=>setExitPrompt(false)}>계속 꾸미기</button><button disabled={busy} onClick={onClose}>저장하지 않고 나가기</button><button className="studio-save" disabled={busy} onClick={save}>저장하고 나가기</button></div></div>}
    <footer className="studio-actions"><button disabled={busy||!history.past.length} onClick={()=>timeTravel('undo')}><Undo2/>되돌리기</button><button disabled={busy||!history.future.length} onClick={()=>timeTravel('redo')}><Redo2/>다시하기</button><button className="studio-save" disabled={busy} onClick={save}>{busy?<span className="spinner"/>:<Check/>}{busy?'저장 중…':'설정 완료'}</button></footer>
  </main>;
}
