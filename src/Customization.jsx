import React,{useEffect,useRef,useState} from 'react';
import {Check,RotateCw,Trash2} from 'lucide-react';
import Scene from './Scene';
import {api} from './api';
import {createAppearanceAutosave} from './appearanceAutosave.mjs';
import {decorations,hats,accessories,colors,validPlacement,characters,characterLooks} from '../shared/world.mjs';

export default function Customization({me,kind,notify,onRefresh,onClose}){
  const [items,setItems]=useState(()=>me.village.items.map(i=>({...i}))),[look,setLook]=useState({...me.appearance}),[tool,setTool]=useState('planter'),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false);
  const looks=useRef(characterLooks(me.appearance,me.characterLooks));
  const mounted=useRef(true),callbacks=useRef();callbacks.current={onRefresh,notify};
  const [saveStatus,setSaveStatus]=useState('saved'),[saveError,setSaveError]=useState('');
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [autosave]=useState(()=>createAppearanceAutosave({
    save:body=>api('/me/world',{method:'PATCH',body}),
    onStatus:status=>{if(mounted.current){setSaveStatus(status);if(status!=='error')setSaveError('');}},
    onSaved:async()=>{try{await callbacks.current.onRefresh();}catch{callbacks.current.notify('캐릭터는 저장됐어요. 화면 갱신을 위해 잠시 후 다시 확인해주세요.');}},
    onError:error=>{if(mounted.current)setSaveError(error.message);else callbacks.current.notify('캐릭터 변경을 저장하지 못했어요. '+error.message);}
  }));
  function updateLook(next){
    setLook(next);looks.current={...looks.current,[next.character||'pio']:next};
    autosave.enqueue({appearance:next,characterLooks:looks.current});
  }
  function selectCharacter(character){if(character===(look.character||'pio'))return;updateLook({...looks.current[character],character});}
  const avatar=kind==='avatar';const chosen=items.find(i=>i.id===selected);
  function place(e){const rect=e.currentTarget.getBoundingClientRect();const x=Math.round(((e.clientX-rect.left)/rect.width*14-7)*4)/4,z=Math.round(((e.clientY-rect.top)/rect.height*14-7)*4)/4;
    if(!validPlacement(x,z)||items.some(i=>i.id!==selected&&Math.hypot(i.x-x,i.z-z)<.8))return notify('중앙 광장과 산책로를 피해 빈 공간을 선택해주세요.');
    if(selected)setItems(items.map(i=>i.id===selected?{...i,x,z}:i));
    else if(items.length<24){const item={id:crypto.randomUUID(),type:tool,x,z,rotation:0};setItems([...items,item]);setSelected(item.id);}
    else notify('최대 24개까지 배치할 수 있어요.');
  }
  async function save(){setBusy(true);try{await api('/me/world',{method:'PATCH',body:{village:{items}}});await onRefresh();notify('마을 꾸미기를 저장했어요. 방문자에게도 바로 반영돼요.');onClose();}catch(e){notify(e.message);}finally{setBusy(false);}}
  return <div className="panel-body customize"><p className="muted">{avatar?'캐릭터를 고르고 모자와 액세서리로 나를 표현해요. 마을과 달리기에서도 이 모습으로 만나요.':'소품을 고르고 지도에 놓아 나만의 마을을 만들어요. 모든 소품은 무료예요.'}</p>
    <div className="custom-preview"><Scene portrait={avatar} theme={me.theme} ownerNickname={me.nickname} ownerAppearance={look} village={{...me.village,items}} mode={avatar?'home':'village'} inputEnabled={false}/><span className="preview-caption">3D 미리보기 · 드래그로 둘러보기</span></div>
    {!avatar&&<h3>마을 소품</h3>}
    {avatar?<><h3>캐릭터 변경</h3><div className="choice-grid character-options">{characters.map(c=><button key={c.id} className={'secondary '+((look.character||'pio')===c.id?'selected':'')} aria-pressed={(look.character||'pio')===c.id} onClick={()=>selectCharacter(c.id)}>{c.name}{(look.character||'pio')===c.id&&<Check size={14}/>}</button>)}</div><p className="tiny">캐릭터마다 모자 · 액세서리 · 소품 색상이 따로 유지돼요.</p><h3>모자</h3><div className="choice-grid">{hats.map(h=><button className={'secondary '+(look.hat===h.id?'selected':'')} key={h.id} aria-pressed={look.hat===h.id} onClick={()=>updateLook({...look,hat:h.id})}>{h.name}{look.hat===h.id&&<Check size={14}/>}</button>)}</div><h3>액세서리</h3><div className="choice-grid">{accessories.map(a=><button className={'secondary '+(look.accessory===a.id?'selected':'')} key={a.id} aria-pressed={look.accessory===a.id} onClick={()=>updateLook({...look,accessory:a.id})}>{a.name}{look.accessory===a.id&&<Check size={14}/>}</button>)}</div><h3>소품 색상</h3><div className="color-options">{colors.map((color,i)=><button key={color} aria-label={['하늘','장미','새싹','라일락','꿀빛','크림'][i]} aria-pressed={look.color===color} className={look.color===color?'selected':''} style={{background:color}} onClick={()=>updateLook({...look,color})}>{look.color===color&&<Check size={18}/>}</button>)}</div></>:<>
      <div className="decor-catalog">{decorations.map(d=><button key={d.id} aria-pressed={!selected&&tool===d.id} className={'decor-option '+(!selected&&tool===d.id?'selected':'')} onClick={()=>{setTool(d.id);setSelected(null);}}><span>{d.icon}</span>{d.name}</button>)}</div>
      <div className="map-heading"><strong>{chosen?`${decorations.find(d=>d.id===chosen.type).name} 이동 중`:'놓을 위치를 선택하세요'}</strong><span>{items.length} / 24</span></div>
      <svg className="village-editor" viewBox="0 0 560 560" role="img" aria-label="마을 배치 지도. 아래 위치 입력으로도 소품을 배치할 수 있어요." onClick={place}>
        <defs><pattern id="plot-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#b7ced3" strokeWidth=".6"/></pattern></defs>
        <circle cx="280" cy="280" r="270" fill="#e4f0e6"/><circle cx="280" cy="280" r="264" fill="url(#plot-grid)"/>
        <path d="M 248 388 L 248 545 L 312 545 L 312 388" fill="#d8e2e8"/><circle cx="280" cy="280" r="112" fill="#edf3fa" stroke="#bacfdf"/><text x="280" y="278" textAnchor="middle" fill="#567590" fontSize="15">주인 아바타</text><text x="280" y="302" textAnchor="middle" fill="#567590" fontSize="12">중앙 광장</text>
        <text x="134" y="272" textAnchor="middle" fontSize="30">☕</text><text x="414" y="328" textAnchor="middle" fontSize="30">💧</text><text x="364" y="140" textAnchor="middle" fontSize="28">🔥</text>
        {items.map(i=><g key={i.id} transform={`translate(${280+i.x*40} ${280+i.z*40})`} role="button" tabIndex="0" aria-label={decorations.find(d=>d.id===i.type).name+' 선택'} onClick={e=>{e.stopPropagation();setSelected(i.id);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(i.id);}}}><circle r="19" fill={selected===i.id?'#bcd7f5':'#fff'} stroke={selected===i.id?'#547eaa':'#c8d9e2'} strokeWidth="2"/><text textAnchor="middle" dominantBaseline="central" fontSize="23" transform={`rotate(${i.rotation*90})`}>{decorations.find(d=>d.id===i.type).icon}</text></g>)}
      </svg><p className="tiny">소품 선택 → 지도 클릭으로 이동. 선택한 소품은 아래에서 회전하거나 삭제할 수 있어요. 저장 전에는 방문자에게 보이지 않아요.</p>
      {chosen&&<div className="form-row"><button className="secondary" onClick={()=>setItems(items.map(i=>i.id===selected?{...i,rotation:(i.rotation+1)%4}:i))}><RotateCw size={15}/>90° 회전</button><button className="secondary" onClick={()=>{setItems(items.filter(i=>i.id!==selected));setSelected(null);}}><Trash2 size={15}/>삭제</button><button className="text-button" onClick={()=>setSelected(null)}>선택 해제</button></div>}
      <PlacementFields key={`${selected||tool}:${chosen?.x}:${chosen?.z}`} chosen={chosen} onPlace={(x,z)=>{if(!validPlacement(x,z)||items.some(i=>i.id!==selected&&Math.hypot(i.x-x,i.z-z)<.8))return notify('중앙과 산책로를 피해 빈 공간을 선택해주세요.');if(chosen)setItems(items.map(i=>i.id===selected?{...i,x,z}:i));else if(items.length<24){const item={id:crypto.randomUUID(),type:tool,x,z,rotation:0};setItems([...items,item]);setSelected(item.id);}}}/>
    </>}
    {avatar?<div className="custom-save"><p className="tiny" role="status" aria-live="polite">{saveStatus==='saving'?'자동 저장 중…':saveStatus==='error'?'자동 저장 실패 · '+saveError:'변경 사항이 자동으로 저장돼요.'}</p>{saveStatus==='error'&&<button className="secondary" onClick={()=>autosave.retry()}>다시 저장</button>}<button className="primary" onClick={onClose}>닫기</button></div>:<div className="custom-save"><button className="secondary" disabled={busy} onClick={onClose}>취소</button><button className="primary" disabled={busy} onClick={save}>{busy?'저장 중…':'꾸미기 저장'}</button></div>}<p className="tiny">꾸미기는 계정에 저장돼요. 자아 슬롯을 바꿔도 유지돼요.</p>
  </div>;
}
function PlacementFields({chosen,onPlace}){const[x,setX]=useState(chosen?.x??-3),[z,setZ]=useState(chosen?.z??3.5);return <form className="placement-fields" onSubmit={e=>{e.preventDefault();onPlace(Number(x),Number(z));}}><label>가로 위치<input type="number" step=".25" min="-5.5" max="5.5" required value={x} onChange={e=>setX(e.target.value)}/></label><label>세로 위치<input type="number" step=".25" min="-5.5" max="5.5" required value={z} onChange={e=>setZ(e.target.value)}/></label><button className="secondary">{chosen?'위치 변경':'소품 놓기'}</button></form>;}
