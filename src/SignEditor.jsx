import React,{useEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {Pencil,Brush,Eraser,Undo2,Redo2,Trash2,X,Plus,ChevronDown} from 'lucide-react';
import {api} from './api';
import {signColors,signShapes,rgbaSignColor,MAX_CUSTOM_SIGN_COLORS,MAX_SIGN_STROKES,MAX_SIGN_POINTS,signPointCount} from '../shared/sign.mjs';
import {insideBoard,renderSign} from './signDrawing.mjs';
import './sign-editor.css';

const colorNames=['먹색','회색','아이보리','코랄','분홍','주황','노랑','초록','하늘','파랑','보라','갈색'];
const brushSizes=[2,8,14,26,40];
const shapeNames=['나무 판자','화살표','매달린 팻말'];
export default function SignEditor({sign,onClose,onSaved}){
  const [history,setHistory]=useState({past:[],present:{shape:sign.shape,strokes:sign.strokes,customColors:sign.customColors||[]},future:[]});
  const [tool,setTool]=useState('draw'),[color,setColor]=useState(signColors[0]),[toolSizes,setToolSizes]=useState({draw:14,erase:14}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmExit,setConfirmExit]=useState(false);
  const canvas=useRef(),preview=useRef(),root=useRef(),stroke=useRef(null),saving=useRef(false),previousFocus=useRef(document.activeElement);
  const [brushCursor,setBrushCursor]=useState(null);
  const nativeColor=useRef(null);
  const [customOpen,setCustomOpen]=useState(false);
  const [colorPicker,setColorPicker]=useState(false),[rgba,setRgba]=useState({r:32,g:54,b:76,a:1}),[colorError,setColorError]=useState('');
  const size=toolSizes[tool];
  const drawing=history.present,dirty=JSON.stringify(drawing)!==JSON.stringify({shape:sign.shape,strokes:sign.strokes,customColors:sign.customColors||[]});
  function redraw(value=drawing,active=stroke.current){if(canvas.current)renderSign(canvas.current,{...value,strokes:active?[...value.strokes,active]:value.strokes});}
  useEffect(()=>{redraw();},[drawing]);
  useEffect(()=>{root.current?.querySelector('button')?.focus();return()=>previousFocus.current?.isConnected&&previousFocus.current.focus();},[]);
  useEffect(()=>{if(!dirty)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  function commit(present){setHistory(h=>({past:[...h.past,h.present].slice(-30),present,future:[]}));setError('');}
  function addColor(){
    const value=rgbaSignColor(rgba.r,rgba.g,rgba.b,rgba.a);
    if(!value)return setColorError('RGB는 0~255 정수, A는 0~1 사이로 입력해 주세요.');
    if(!drawing.customColors.includes(value)){
      if(drawing.customColors.length>=MAX_CUSTOM_SIGN_COLORS)return setColorError('추가 색상은 최대 24개까지 보관할 수 있어요.');
      commit({...drawing,customColors:[...drawing.customColors,value]});
    }
    setColor(value);setTool('draw');setColorError('');setColorPicker(false);setCustomOpen(true);
  }
  function removeColor(value){commit({...drawing,customColors:drawing.customColors.filter(entry=>entry!==value)});if(color===value)setColor(signColors[0]);}
  function travel(type){if(stroke.current||saving.current)return;setHistory(h=>type==='undo'?(h.past.length?{past:h.past.slice(0,-1),present:h.past.at(-1),future:[h.present,...h.future]}:h):(h.future.length?{past:[...h.past,h.present],present:h.future[0],future:h.future.slice(1)}:h));}
  function close(){if(saving.current)return;const drawingNow=!!stroke.current;if(drawingNow)finish();if(dirty||drawingNow)setConfirmExit(true);else onClose();}
  function position(e){const rect=canvas.current.getBoundingClientRect();return[Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))];}
  function trackBrush(e){if(e.pointerType==='touch'){setBrushCursor(null);return;}const rect=preview.current.getBoundingClientRect();setBrushCursor({x:e.clientX-rect.left,y:e.clientY-rect.top,scale:rect.width/canvas.current.width});}
  function hideBrush(e){if(e.currentTarget.contains(e.relatedTarget))return;setBrushCursor(null);}
  function start(e){
    if(saving.current||stroke.current||e.button!==0)return;
    const point=position(e);if(!insideBoard(...point,drawing.shape))return;
    if(drawing.strokes.length>=MAX_SIGN_STROKES||signPointCount(drawing.strokes)>=MAX_SIGN_POINTS)return setError('그림이 가득 찼어요. 전체 지우기로 새로 그릴 수 있어요.');
    e.preventDefault();canvas.current.setPointerCapture(e.pointerId);stroke.current={tool,color,size,points:[point]};redraw();
  }
  function move(e){
    const active=stroke.current;if(!active)return;e.preventDefault();
    const remaining=MAX_SIGN_POINTS-signPointCount(drawing.strokes);
    const samples=e.nativeEvent.getCoalescedEvents?.();
    for(const event of samples?.length?samples:[e]){
      const point=position(event),last=active.points.at(-1);
      if(active.points.length>=Math.min(2000,remaining))break;
      if(Math.hypot(point[0]-last[0],point[1]-last[1])<.002)continue;
      active.points.push(point.map(value=>Math.round(value*10000)/10000));
    }
    redraw();
  }
  function finish(e,cancel=false){const active=stroke.current;if(!active)return;stroke.current=null;if(e&&canvas.current.hasPointerCapture(e.pointerId))canvas.current.releasePointerCapture(e.pointerId);if(!cancel)commit({...drawing,strokes:[...drawing.strokes,active]});else redraw();}
  async function save(){
    if(saving.current||stroke.current)return;saving.current=true;setBusy(true);setError('');
    try{const result=await api('/me/world',{method:'PATCH',body:{village:{sign:{shape:drawing.shape,strokes:drawing.strokes,customColors:drawing.customColors}}}});onSaved(result.user);}
    catch(e){setError('저장하지 못했어요. '+e.message);}finally{saving.current=false;setBusy(false);}
  }
  function keyboard(e){
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(confirmExit)setConfirmExit(false);else if(colorPicker)setColorPicker(false);else close();return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();travel(e.shiftKey?'redo':'undo');}
    if(e.key==='Tab'){const nodes=[...root.current.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(node=>!node.closest('[inert]')),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
  }
  return <div className="sign-editor-backdrop" onKeyDown={keyboard}><section ref={root} className="sign-editor" role="dialog" aria-modal="true" aria-labelledby="sign-editor-title" aria-busy={busy}>
    <header className="sign-heading" inert={confirmExit}><Pencil strokeWidth={1.6}/><div><h2 id="sign-editor-title">팻말 꾸미기</h2><p>별에 놓을 팻말을 자유롭게 그려보세요!</p></div><button aria-label="팻말 편집 닫기" disabled={busy} onClick={close}><X/></button></header>
    <div className="sign-editor-body" inert={confirmExit}><nav className="sign-tools" aria-label="그림 도구">{[{id:'draw',label:'브러시',Icon:Brush},{id:'erase',label:'지우기',Icon:Eraser},{id:'undo',label:'되돌리기',Icon:Undo2},{id:'redo',label:'다시하기',Icon:Redo2},{id:'clear',label:'전체 지우기',Icon:Trash2}].map(({id,label,Icon})=><button key={id} aria-label={label} aria-pressed={['draw','erase'].includes(id)?tool===id:undefined} className={tool===id?'active':''} disabled={busy||(id==='undo'&&!history.past.length)||(id==='redo'&&!history.future.length)||(id==='clear'&&!drawing.strokes.length)} onClick={()=>id==='draw'||id==='erase'?setTool(id):id==='clear'?commit({...drawing,strokes:[]}):travel(id)}><Icon strokeWidth={1.8}/><span>{label}</span></button>)}</nav>
    <div ref={preview} className="sign-preview" onPointerEnter={trackBrush} onPointerMove={trackBrush} onPointerLeave={hideBrush}><canvas ref={canvas} width="800" height="800" aria-label="팻말 그림판" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>finish(e,true)}/>{brushCursor&&<span className={'sign-brush-cursor '+(tool==='erase'?'is-eraser':'is-brush')} aria-hidden="true" style={{left:brushCursor.x,top:brushCursor.y,width:20+size*brushCursor.scale*1.5,height:20+size*brushCursor.scale*1.5,color:tool==='erase'?'#365780':color}}>{tool==='erase'?<Eraser/>:<Brush/>}</span>}</div>
    <aside className="sign-options"><section className="sign-palette"><h3>색상 선택</h3><div className="sign-swatches">{signColors.map((value,index)=><button key={value} title={colorNames[index]} aria-label={colorNames[index]} aria-pressed={color===value} style={{background:value}} disabled={busy} onClick={()=>{setColor(value);setTool('draw');}}/>)}</div>
    <button type="button" className="sign-add-color" disabled={busy} aria-expanded={colorPicker} aria-controls="sign-rgba-picker" onClick={()=>{flushSync(()=>setColorPicker(true));setColorError('');if(nativeColor.current?.showPicker)nativeColor.current.showPicker();else nativeColor.current?.click();}}><Plus size={15}/>색상 추가</button>
    <button type="button" className="sign-custom-toggle" disabled={busy} aria-expanded={customOpen} aria-controls="sign-custom-colors" onClick={()=>setCustomOpen(value=>!value)}>추가 색상 ({drawing.customColors.length})<ChevronDown size={15}/></button>
    {customOpen&&<div id="sign-custom-colors" className="sign-swatches sign-custom-swatches">{drawing.customColors.length?drawing.customColors.map(value=><span className="sign-custom-color" key={value}><button className="sign-color-swatch" title={value} aria-label={'추가 색상 '+value} aria-pressed={color===value} style={{'--swatch-color':value}} disabled={busy} onClick={()=>{setColor(value);setTool('draw');}}/><button className="sign-remove-color" aria-label={'색상 '+value+' 삭제'} title="추가 색상 삭제" disabled={busy} onClick={()=>removeColor(value)}><X size={12}/></button></span>):<p className="sign-palette-empty">색상을 골라 팔레트에 추가해 보세요.</p>}</div>}
    {colorPicker&&<div id="sign-rgba-picker" className="sign-rgba-picker"><label className="sign-color-picker-label">색상<input ref={nativeColor} type="color" aria-label="추가할 색상 고르기" value={rgbaSignColor(rgba.r,rgba.g,rgba.b,1)?.slice(0,7)||'#20364c'} disabled={busy} onChange={e=>{const hex=e.target.value;setRgba(current=>({...current,r:parseInt(hex.slice(1,3),16),g:parseInt(hex.slice(3,5),16),b:parseInt(hex.slice(5,7),16)}));}}/></label><div className="sign-rgba-fields">{['r','g','b','a'].map(channel=><label key={channel}>{channel.toUpperCase()}<input type="number" aria-label={'색상 '+channel.toUpperCase()} min="0" max={channel==='a'?1:255} step={channel==='a'?0.01:1} value={Number.isNaN(rgba[channel])?'':rgba[channel]} disabled={busy} onChange={e=>setRgba(current=>({...current,[channel]:e.target.value===''?NaN:Number(e.target.value)}))}/></label>)}</div><span className="sign-rgba-preview" aria-hidden="true" style={{'--swatch-color':rgbaSignColor(rgba.r,rgba.g,rgba.b,rgba.a)||'transparent'}}/>{colorError&&<p className="sign-error" role="alert">{colorError}</p>}<button className="sign-confirm-color" disabled={busy} onClick={addColor}>팔레트에 추가</button></div>}</section>

    <section className="sign-brush"><h3 id="sign-brush-size-label">{tool==='erase'?'지우개 크기':'브러시 크기'}</h3><div className="sign-size-options" role="group" aria-labelledby="sign-brush-size-label">{brushSizes.map((value,index)=><button key={value} type="button" aria-label={`${index+1}단계`} aria-pressed={size===value} title={`${index+1}단계`} disabled={busy} onClick={()=>setToolSizes(current=>({...current,[tool]:value}))}><i aria-hidden="true" style={{width:5+index*3,height:5+index*3}}/></button>)}</div></section>
    <section className="sign-shapes"><h3>팻말 모양</h3><div>{signShapes.map((shape,index)=><button key={shape} aria-label={shapeNames[index]} aria-pressed={drawing.shape===shape} disabled={busy} onClick={()=>commit({...drawing,shape})}><SignThumbnail shape={shape}/></button>)}</div></section></aside></div>
    {error&&<p className="sign-error" role="alert">{error}</p>}
    <footer className="sign-footer" inert={confirmExit}><button disabled={busy} onClick={close}>취소</button><button className="sign-save" disabled={busy} onClick={save}>{busy?'저장 중…':'저장하기'}</button></footer>
    {confirmExit&&<div className="sign-discard" role="alertdialog" aria-label="그림 변경 사항"><strong>그린 내용을 저장할까요?</strong><p>저장하지 않고 나가면 이번 그림은 사라져요.</p>{error&&<p className="sign-error" role="alert">{error}</p>}<div><button autoFocus disabled={busy} onClick={()=>setConfirmExit(false)}>계속 그리기</button><button disabled={busy} onClick={onClose}>저장하지 않고 나가기</button><button className="sign-save" disabled={busy} onClick={save}>저장하기</button></div></div>}
  </section></div>;
}
export function SignThumbnail({shape}){const ref=useRef();useEffect(()=>{renderSign(ref.current,{shape,strokes:[]});},[shape]);return <canvas ref={ref} width="800" height="800" aria-hidden="true"/>;}
