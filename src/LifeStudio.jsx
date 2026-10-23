import React,{useEffect,useRef,useState} from 'react';
import {X,Lock,Sprout,Archive,ChefHat,Sparkles} from 'lucide-react';
import {StoragePanel} from './Life';
import InventoryStudio,{InventoryIcon} from './InventoryStudio';
import InventoryWorldHud from './InventoryWorldHud';
import KitchenStudio from './KitchenStudio';
import './life-studio.css';

const facilityIcons={storage:Archive,garden:Sprout,kitchen:ChefHat};
const facilityLabels={storage:'TREASURE CHEST',garden:'GARDEN JOURNAL',kitchen:'LITTLE KITCHEN'};
const headings={storage:['마을 보관함','작은 보물과 발견을 모아 보세요'],garden:['작은 텃밭','씨앗을 심고 자라는 모습을 살펴보세요'],kitchen:['마을 요리대','우리 마을의 재료로 요리해 보세요']};

export default function LifeStudio({context,onClose,...props}){
  const [displayed,setDisplayed]=useState(context),dialog=useRef(),back=useRef();
  useEffect(()=>{
    if(context){setDisplayed(context);return;}
    const timer=setTimeout(()=>setDisplayed(null),300);return()=>clearTimeout(timer);
  },[context]);
  useEffect(()=>{
    if(!context)return;
    const previous=document.activeElement,frame=requestAnimationFrame(()=>back.current?.focus());
    const trap=event=>{
      if(event.key!=='Tab')return;
      const buttons=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];
      const first=buttons[0],last=buttons.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    window.addEventListener('keydown',trap);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('keydown',trap);if(previous?.isConnected)previous.focus();};
  },[context]);
  if(!displayed)return null;
  const Icon=facilityIcons[displayed];
  if(displayed==='kitchen')return <KitchenStudio {...props} dialog={dialog} back={back} leaving={!context} onClose={onClose}/>;
  if(displayed==='storage')return <><InventoryWorldHud viewer={props.viewer} village={props.village} position={props.position}/><section ref={dialog} className={'life-studio life-studio-storage inventory-studio'+(!context?' is-leaving':'')} role="dialog" aria-modal="true" aria-labelledby="life-studio-title" inert={!context}>
    <header className="inventory-banner"><div className="inventory-clouds" aria-hidden="true"/><InventoryIcon id="chest" className="inventory-chest"/><div className="inventory-banner-copy"><h1 id="life-studio-title">마을 보관함</h1><p>마을에서 모은 소중한 아이템들을 보관하세요.</p></div><button ref={back} className="inventory-close" type="button" aria-label="마을로 돌아가기" onClick={onClose}><X size={31}/></button><span className="inventory-sparkle" aria-hidden="true">✦</span></header>
    <InventoryStudio {...props}/>
  </section></>;
  return <section ref={dialog} className={'life-studio life-studio-'+displayed+(!context?' is-leaving':'')} role="dialog" aria-modal="true" aria-labelledby="life-studio-title" inert={!context}>
    <header className="life-studio-heading"><button ref={back} type="button" aria-label="마을로 돌아가기" onClick={onClose}><X size={21}/></button><div><span>{facilityLabels[displayed]}</span><h1 id="life-studio-title">{headings[displayed][0]}</h1><p>{headings[displayed][1]}</p></div><span className="life-facility-emblem" aria-hidden="true"><Icon size={35}/></span></header>
    <div className="life-studio-content"><div className="life-studio-summary"><Sparkles size={17}/><span>{displayed==='storage'?'오늘의 작은 발견을 차곡차곡':displayed==='garden'?'씨앗 한 알에서 시작되는 하루':'정원에서 식탁까지, 나만의 레시피'}</span><strong>{displayed==='storage'?`${props.data?.inventory?.reduce((sum,item)=>sum+item.quantity,0)||0}개`:displayed==='garden'?'GROW':'COOK'}</strong></div><StoragePanel {...props} initialTab={displayed}/></div>
    <div className="life-studio-hint"><Lock size={14}/><span>오브젝트를 살펴보는 중 · <kbd>Esc</kbd> 마을로 돌아가기</span></div>
  </section>;
}
