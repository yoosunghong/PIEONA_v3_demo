import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,BookOpen,Camera,Check,ChevronLeft,ChevronRight,Download,Grid2X2,Heart,HelpCircle,Images,Leaf,List,MapPin,MoreHorizontal,Pencil,Plus,Save,Search,Trash2,X} from 'lucide-react';
import AvatarPortrait from './AvatarPortrait';
import {characters} from '../shared/world.mjs';
import {captureFilename,filterCaptures,photoDate,photoFrames} from './captureModel.mjs';
import {deleteCapture,listCaptures,saveCapture} from './captureStore.mjs';
import {downloadCapture,renderCapture} from './captureCanvas.mjs';

export default function StageCapture({shot,ownerId,themeId='default',notify,onClose,onNewCapture,closeGuard}){
  const [photos,setPhotos]=useState([]),[selected,setSelected]=useState(shot?.id||null),[draft,setDraft]=useState(shot||null);
  const [saving,setSaving]=useState(false),[exitAction,setExitAction]=useState(null);
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false),[reload,setReload]=useState(0);
  const [favorites,setFavorites]=useState(false),[query,setQuery]=useState(''),[sort,setSort]=useState('newest'),[list,setList]=useState(false);
  const [preview,setPreview]=useState(''),[previewError,setPreviewError]=useState(''),[saveState,setSaveState]=useState('saved');
  const [menu,setMenu]=useState(false),[confirmDelete,setConfirmDelete]=useState(false),[deleting,setDeleting]=useState(false),[help,setHelp]=useState(false),[tag,setTag]=useState('');
  const saveQueue=useRef(Promise.resolve()),pending=useRef(0),failedPhotos=useRef(new Map()),previewVersion=useRef(0),titleRef=useRef(null);
  const rootRef=useRef(null),wasConfirm=useRef(false);
  const photo=draft?.id===selected?draft:photos.find(item=>item.id===selected);
  const isNew=!!draft&&!photos.some(item=>item.id===draft.id);
  const visible=filterCaptures(photos,{favorites,query,sort});
  const index=visible.findIndex(item=>item.id===selected);

  function requestAction(action){if(saving)return;if(draft)setExitAction(()=>action);else action();}
  useEffect(()=>{
    if(!closeGuard)return;
    closeGuard.current=()=>{
      if(saving)return true;
      if(!draft)return false;
      setExitAction(()=>onClose);return true;
    };
    return()=>{closeGuard.current=null;};
  },[draft,saving,onClose,closeGuard]);

  useEffect(()=>{rootRef.current?.querySelector('button:not(:disabled)')?.focus();},[selected]);
  useEffect(()=>{
    if(wasConfirm.current&&!confirmDelete&&!exitAction){
      if(draft)titleRef.current?.focus();else rootRef.current?.querySelector('[aria-label="사진 더보기"]')?.focus();
    }
    wasConfirm.current=confirmDelete||!!exitAction;
  },[confirmDelete,exitAction]);

  useEffect(()=>{
    let active=true;setLoading(true);setLoadError(false);
    listCaptures(ownerId).then(items=>{
      if(!active)return;
      setPhotos(current=>{
        const combined=items.map(item=>current.find(existing=>existing.id===item.id)||item);
        for(const item of current)if(!combined.some(existing=>existing.id===item.id))combined.push(item);
        return combined;
      });
    }).catch(()=>{if(active)setLoadError(true);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[ownerId,reload,shot]);

  useEffect(()=>{
    const version=++previewVersion.current;setPreview('');setPreviewError('');
    if(!photo)return;
    renderCapture(photo).then(url=>{if(version===previewVersion.current)setPreview(url);}).catch(error=>{if(version===previewVersion.current)setPreviewError(error.message);});
    return()=>{previewVersion.current++;};
  },[photo?.id,photo?.image,photo?.frame,photo?.showDate,photo?.showTime,photo?.title,photo?.memo,photo?.tags]);

  function persist(next){
    const saved=next;
    pending.current++;setSaveState('saving');
    saveQueue.current=saveQueue.current.then(()=>saveCapture(ownerId,saved)).then(()=>{
      failedPhotos.current.delete(saved.id);
      pending.current--;if(!pending.current)setSaveState(failedPhotos.current.size?'error':'saved');
    }).catch(()=>{
      pending.current--;failedPhotos.current.set(saved.id,saved);setSaveState('error');
      notify('사진 변경을 보관하지 못했어요. PNG로 내려받거나 다시 보관해 주세요.');
    });
  }
  function retrySave(){for(const failed of failedPhotos.current.values())persist(photos.find(item=>item.id===failed.id)||failed);}
  function change(id,patch){
    if(saving)return;
    if(photo?.id===id){setDraft({...photo,...patch});return;}
    const current=photos.find(item=>item.id===id);if(!current)return;
    const next={...current,...patch};setPhotos(items=>items.map(item=>item.id===id?next:item));persist(next);
  }
  function open(id){requestAction(()=>{setDraft(null);setSelected(id);setMenu(false);setTag('');setConfirmDelete(false);});}
  function showAlbum(){setDraft(null);setSelected(null);setMenu(false);setConfirmDelete(false);}
  function back(){requestAction(showAlbum);}
  async function saveFinal(){
    if(!draft||saving)return;
    const value=tag.trim().replace(/^#+/,'').slice(0,16);
    const snapshot={...draft,title:draft.title.trim()||'우리 별의 작은 순간',tags:value&&draft.tags.length<8&&!draft.tags.includes(value)?[...draft.tags,value]:draft.tags};
    setSaving(true);
    try{
      const exportImage=await renderCapture(snapshot);
      const saved={...snapshot,exportImage};
      await saveQueue.current;await saveCapture(ownerId,saved);
      failedPhotos.current.delete(saved.id);setSaveState(failedPhotos.current.size?'error':'saved');
      setPhotos(items=>[saved,...items.filter(item=>item.id!==saved.id)]);
      setTag('');setExitAction(null);showAlbum();notify('제목과 이야기를 담은 최종 사진을 앨범에 저장했어요.');
    }catch{notify('앨범에 저장하지 못했어요. 작성한 내용은 그대로 두었으니 다시 저장해 주세요.');}
    finally{setSaving(false);}
  }
  function addTag(){
    const value=tag.trim().replace(/^#+/,'').slice(0,16);
    if(value&&photo.tags.length<8&&!photo.tags.includes(value))change(photo.id,{tags:[...photo.tags,value]});
    setTag('');
  }
  async function remove(){
    setDeleting(true);
    try{
      await saveQueue.current;await deleteCapture(ownerId,photo.id);
      failedPhotos.current.delete(photo.id);setSaveState(failedPhotos.current.size?'error':'saved');
      setPhotos(items=>items.filter(item=>item.id!==photo.id));showAlbum();notify('사진을 보관함에서 삭제했어요.');
    }catch{notify('사진을 삭제하지 못했어요. 다시 시도해 주세요.');}
    finally{setDeleting(false);}
  }
  function download(){
    if(!preview||draft)return;
    downloadCapture(photo.exportImage||preview,captureFilename(photo));notify('제목·이야기·프레임을 담은 PNG 사진을 다운로드해요.');
  }
  function onKeyDown(event){
    if((confirmDelete||exitAction)&&event.key==='Tab'){
      const buttons=[...event.currentTarget.querySelectorAll('.capture-confirm button:not(:disabled)')];
      if(buttons.length){event.preventDefault();buttons[(buttons.indexOf(document.activeElement)+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}
      return;
    }
    if(event.key==='Escape'&&(photo||confirmDelete||exitAction||menu||help)){
      event.preventDefault();event.stopPropagation();
      if(deleting||saving)return;
      if(exitAction)setExitAction(null);else if(confirmDelete)setConfirmDelete(false);else if(menu)setMenu(false);else if(help)setHelp(false);else back();
    }
  }

  return <div ref={rootRef} className={'capture-studio '+(photo?'is-detail':'is-album')} data-theme={themeId} onKeyDown={onKeyDown}>
    {!photo?<div className="capture-album-layout">
      <aside className="capture-rail" aria-label="기억 저장소 메뉴">
        <span className="capture-rail-sprout"><Leaf size={29} strokeWidth={1.4}/></span>
        <button className={!favorites?'active':''} onClick={()=>setFavorites(false)} aria-pressed={!favorites}><Images size={27}/><span>앨범</span></button>
        <button className={favorites?'active':''} onClick={()=>setFavorites(true)} aria-pressed={favorites}><Heart size={26}/><span>좋아한 순간</span></button>
        <span className="capture-rail-bottom">LITTLE<br/>MEMORIES</span>
      </aside>
      <div className="capture-album-paper">
        <header className="capture-album-heading">
          <div><BookOpen size={29} strokeWidth={1.5}/><h2>기억 저장소</h2><button className="capture-round capture-help" aria-label="사진 보관 안내" onClick={()=>setHelp(value=>!value)}><HelpCircle size={19}/></button></div>
          <div className="capture-heading-tools"><label className="capture-sort"><span className="sr-only">사진 정렬</span><select value={sort} onChange={event=>setSort(event.target.value)}><option value="newest">최신순</option><option value="oldest">오래된순</option></select></label><button className="capture-round" aria-label={list?'격자 보기':'목록 보기'} onClick={()=>setList(value=>!value)}>{list?<Grid2X2 size={17}/>:<List size={17}/>}</button><button className="capture-round" aria-label="보관함 닫기" onClick={onClose}><X size={18}/></button></div>
        </header>
        <div className="capture-album-filters">
          <label className="capture-search"><Search size={15}/><input aria-label="사진 검색" placeholder="기억 찾기" value={query} onChange={event=>setQuery(event.target.value)}/></label>
        </div>
        {help&&<div className="capture-help-note" role="status">캡처 후 제목과 이야기를 적고 앨범에 저장을 누르면 이 기기의 브라우저에 자아별로 보관돼요. 저장한 최종 사진은 제목과 이야기를 포함한 PNG로 내려받을 수 있어요. 브라우저 데이터를 지우면 보관함도 삭제돼요.</div>}
        {saveState==='error'&&<div className="capture-storage-error" role="alert">보관하지 못한 변경이 있어요.<button onClick={retrySave}>다시 보관하기</button></div>}
        <div className="capture-album-scroll" aria-busy={loading}>
          {loadError&&<div className="capture-storage-error" role="alert">보관함을 불러오지 못했어요.<button onClick={()=>setReload(value=>value+1)}>다시 불러오기</button></div>}
          {loading?<div className="capture-empty" role="status"><span className="spinner"/><p>소중한 순간을 꺼내고 있어요…</p></div>:visible.length?<div className={'capture-photo-grid'+(list?' as-list':'')}>
            {visible.map(item=><article key={item.id} className="capture-photo-card">
              <button className="capture-photo-open" onClick={()=>open(item.id)} aria-label={item.title+' 사진 열기'}><span className="capture-thumbnail"><img loading="lazy" src={item.image} alt={item.title}/><span className="capture-frame-mark" aria-hidden="true">{photoFrames.find(frame=>frame.id===item.frame)?.symbol}</span></span><time dateTime={new Date(item.at).toISOString()}>{photoDate(item.at,'.')}</time><strong>{item.title}</strong>{list&&<span className="capture-list-location"><MapPin size={13}/>{item.location}</span>}</button>
              <button className={'capture-card-heart'+(item.favorite?' active':'')} aria-label={item.favorite?'즐겨찾기 해제':'즐겨찾기에 추가'} aria-pressed={item.favorite} onClick={()=>change(item.id,{favorite:!item.favorite})}><Heart size={23} fill={item.favorite?'currentColor':'#ffffffbb'}/></button>
            </article>)}
          </div>:<div className="capture-empty"><span className="capture-empty-art"><Images size={43} strokeWidth={1.1}/><Leaf size={22}/></span><h3>{query?'아직 이곳에는 기억이 없어요':favorites?'마음에 드는 순간에 하트를 남겨보세요':'우리 별의 첫 순간을 담아볼까요?'}</h3><p>{query?'검색어를 바꿔보세요.':favorites?'사진 위의 하트를 누르면 이곳에서 모아볼 수 있어요.':'햇살 좋은 오후도, 이웃과의 만남도 한 장의 추억이 돼요.'}</p><button className="capture-action" onClick={onNewCapture}><Camera size={17}/>지금 사진 찍기</button></div>}
        </div>
        <footer className="capture-album-footer"><span>{favorites?'좋아한 순간':'간직한 순간'} <strong>{visible.length}</strong><span className="capture-footer-note">이 브라우저에 보관 중</span></span><button className="capture-new-photo" onClick={onNewCapture}><Plus size={15}/>새 순간 담기</button></footer>
      </div>
    </div>:<>
      <div className="capture-detail-toolbar"><button onClick={back} disabled={saving}><ArrowLeft size={17}/>앨범으로</button><span aria-live="polite">{saving?'최종 사진을 저장하고 있어요…':draft?'편집 중 · 저장하면 앨범에 들어가요':'앨범에 저장된 최종 사진'}{!draft&&<Check size={13}/>}</span>{!draft&&<button className="capture-action capture-toolbar-download" aria-label="PNG 다운로드" disabled={!preview} onClick={download}><Download size={15}/>PNG 저장</button>}<button className="capture-round" aria-label="사진 닫기" disabled={saving} onClick={()=>requestAction(onClose)}><X size={18}/></button></div>
      <div className="capture-detail-layout">
        <div className="capture-photo-stage">
          <span className="capture-paper-behind"/>
          <div className="capture-polaroid">{preview?<img src={preview} alt={photo.title+' · '+(photoFrames.find(frame=>frame.id===photo.frame)?.name||'사진 프레임')}/>:<div className="capture-preview-loading" role="status">{previewError||'사진에 추억을 담는 중…'}</div>}</div>
          {visible.length>1&&<><button className="capture-photo-prev capture-round" aria-label="이전 사진" disabled={index<=0} onClick={()=>open(visible[index-1].id)}><ChevronLeft size={23}/></button><button className="capture-photo-next capture-round" aria-label="다음 사진" disabled={index<0||index>=visible.length-1} onClick={()=>open(visible[index+1].id)}><ChevronRight size={23}/></button></>}
          <span className="capture-photo-caption">a little moment, a lasting memory.</span>
        </div>
        <section className="capture-journal" aria-label="사진의 이야기" inert={saving||!!exitAction||confirmDelete}>
          <div className="capture-journal-top"><time dateTime={new Date(photo.at).toISOString()}>{photoDate(photo.at)}</time><div><button className={'capture-round capture-favorite'+(photo.favorite?' active':'')} aria-pressed={photo.favorite} aria-label={photo.favorite?'즐겨찾기 해제':'즐겨찾기에 추가'} onClick={()=>change(photo.id,{favorite:!photo.favorite})}><Heart size={24} fill={photo.favorite?'currentColor':'none'}/></button><button className="capture-round" aria-label="사진 더보기" aria-expanded={menu} onClick={()=>setMenu(value=>!value)}><MoreHorizontal size={22}/></button></div>
            {menu&&<div className="capture-photo-menu"><button onClick={()=>{titleRef.current?.focus();setMenu(false);}}><Pencil size={15}/>제목 수정</button><button onClick={download} disabled={!preview||!!draft}><Download size={15}/>PNG 다운로드</button>{!isNew&&<button className="capture-delete-action" onClick={()=>{setMenu(false);setConfirmDelete(true);}}><Trash2 size={15}/>사진 삭제</button>}</div>}
          </div>
          <label className="capture-title"><span className="sr-only">사진 제목</span><input ref={titleRef} maxLength={48} value={photo.title} onChange={event=>change(photo.id,{title:event.target.value})} onBlur={()=>{if(!photo.title.trim())change(photo.id,{title:'우리 별의 작은 순간'});}}/><Pencil size={15} aria-hidden="true"/></label>
          <div className="capture-location"><MapPin size={16} fill="currentColor"/><span>{photo.location} · {photo.theme}</span></div>
          <label className="capture-memo"><span className="sr-only">이 순간의 메모</span><textarea maxLength={400} value={photo.memo} rows={4} placeholder={'바람이 참 좋았던 날.\n오늘의 작은 이야기를 남겨보세요.'} onChange={event=>change(photo.id,{memo:event.target.value})}/><small>{photo.memo.length} / 400</small></label>
          <div className="capture-companions"><h3>함께한 이웃</h3><div>{photo.participants.map((person,i)=><span key={person.id||i} title={person.nickname}><AvatarPortrait user={person}/><small>{person.nickname||characters.find(item=>item.id===person.appearance?.character)?.name||'피오'}</small></span>)}</div></div>
          <div className="capture-tags"><span>태그</span><div>{photo.tags.map(value=><button key={value} title="태그 삭제" onClick={()=>change(photo.id,{tags:photo.tags.filter(item=>item!==value)})}>#{value}<X size={10}/></button>)}{photo.tags.length<8&&<form onSubmit={event=>{event.preventDefault();addTag();}}><input aria-label="새 태그" maxLength={16} value={tag} placeholder="+ 태그" onChange={event=>setTag(event.target.value)}/>{tag.trim()&&<button aria-label="태그 추가" type="submit"><Plus size={12}/></button>}</form>}</div></div>
          <div className="capture-frame-picker"><h3>사진에 어울리는 프레임</h3><div role="group" aria-label="사진 프레임">{photoFrames.map(frame=><button key={frame.id} className={photo.frame===frame.id?'active':''} title={frame.name} aria-label={frame.name} aria-pressed={photo.frame===frame.id} onClick={()=>change(photo.id,{frame:frame.id})}><span aria-hidden="true">{frame.symbol}</span><small>{frame.name}</small></button>)}</div></div>
          <div className="capture-date-options"><label><input type="checkbox" checked={photo.showDate} onChange={event=>change(photo.id,{showDate:event.target.checked})}/>날짜 표시</label><label><input type="checkbox" checked={photo.showTime} onChange={event=>change(photo.id,{showTime:event.target.checked})}/>시간 표시</label></div>
          <div className="capture-detail-actions">{draft?<><span>제목과 메모도 PNG에 함께 담겨요.</span><button className="capture-action" disabled={!preview||saving} onClick={saveFinal}><Save size={15}/>{saving?'저장 중…':'앨범에 저장'}</button></>:<span><Check size={14}/>저장된 사진 · 언제든 PNG로 내려받으세요.</span>}</div>
        </section>
      </div>
    </>}
    {!!exitAction&&<div className="capture-confirm" role="alertdialog" aria-modal="true" aria-labelledby="capture-discard-title"><div><Camera size={27}/><h3 id="capture-discard-title">아직 앨범에 저장하지 않았어요</h3><p>제목과 이야기를 더 적어볼까요?<br/>저장하지 않고 나가면 이번 편집 내용은 사라져요.</p><div><button autoFocus onClick={()=>setExitAction(null)}>계속 작성하기</button><button onClick={()=>{const action=exitAction;setExitAction(null);setDraft(null);action();}}>저장하지 않고 나가기</button><button className="capture-action" disabled={!preview||saving} onClick={saveFinal}>앨범에 저장</button></div></div></div>}
    {confirmDelete&&<div className="capture-confirm" role="alertdialog" aria-modal="true" aria-labelledby="capture-delete-title"><div><Trash2 size={27}/><h3 id="capture-delete-title">이 사진을 떠나보낼까요?</h3><p>보관함에서 지우면 다시 꺼낼 수 없어요.<br/>간직하고 싶다면 먼저 PNG로 내려받으세요.</p><div><button autoFocus disabled={deleting} onClick={()=>setConfirmDelete(false)}>계속 간직하기</button><button className="capture-action capture-delete-action" disabled={deleting} onClick={remove}>{deleting?'삭제 중…':'사진 삭제'}</button></div></div></div>}
  </div>;
}
