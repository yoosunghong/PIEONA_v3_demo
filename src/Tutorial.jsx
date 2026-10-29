import React,{useEffect,useRef,useState} from 'react';
import {ArrowRight,ChevronLeft,Leaf,X} from 'lucide-react';

const steps=[
  {target:'world',title:'작은 별에 오신 걸 환영해요!',text:'나는 정원 안내자 피오예요. 모바일에서는 지면을 터치하면 그곳으로 걸어가요. PC에서는 WASD나 방향키로 이동하고 스페이스로 폴짝 뛸 수 있어요.'},
  {target:'chat',title:'나의 아바타와 이야기해요',text:'별의 아바타를 누르고 대화하기 버튼을 선택해 일상과 취향을 들려주세요. 대화가 쌓일수록 아바타가 조금씩 나를 닮아가요. 새 대화와 세션으로 이야기를 이어갈 수 있어요.'},
  {target:'memory',title:'기억 정원을 가꿔요',text:'기억 정원에서 아바타가 배운 기억을 확인하고 수정해요. 이웃에게 나눌 기억의 공개 범위도 직접 정할 수 있어요.'},
  {target:'friends',title:'친구의 별에 놀러 가요',text:'오른쪽 친구·이웃 목록에서 친구를 만나보세요. 목록 위 + 버튼으로 친구를 추가하고, 친구의 별을 방문해 AI 아바타와 대화할 수 있어요.'},
  {target:'games',title:'가볍게 놀고 기록을 남겨요',text:'미니게임에서 리듬게임과 구름 달리기를 즐겨보세요. 친구와 함께 도전하고 별 기록에서 점수도 확인해요.'},
  {target:'customize',title:'나만의 분위기로 꾸며요',text:'별 꾸미기에서 소품을 배치하고, 우측 상단 별테마 버튼에서 은하수·오로라·황혼·태양 노을 테마를 골라보세요. 휠로 줌아웃하거나 내 별 보기를 누르면 광장별·낚시별·농장별로 이동할 수 있어요. 캡처 버튼으로 날짜와 메모도 남겨보세요.'}
];

export default function Tutorial({onClose}){
  const [index,setIndex]=useState(0),[rect,setRect]=useState(null);
  const dialog=useRef(null),next=useRef(null);
  const step=steps[index];
  useEffect(()=>{
    const previous=document.activeElement;
    next.current?.focus();
    function keyboard(e){
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}
      if(e.key==='Tab'){
        const buttons=[...dialog.current.querySelectorAll('button:not(:disabled)')];
        if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons.at(-1).focus();}
        else if(!e.shiftKey&&document.activeElement===buttons.at(-1)){e.preventDefault();buttons[0].focus();}
      }
    }
    window.addEventListener('keydown',keyboard,true);
    return()=>{window.removeEventListener('keydown',keyboard,true);previous?.focus?.();};
  },[]);
  useEffect(()=>{
    function measure(){
      const el=document.querySelector(`[data-tutorial="${step.target}"]`);
      const r=el?.getBoundingClientRect();
      setRect(r&&r.width&&r.height?{left:Math.max(0,r.left-6),top:Math.max(0,r.top-6),width:Math.min(innerWidth,r.right+6)-Math.max(0,r.left-6),height:Math.min(innerHeight,r.bottom+6)-Math.max(0,r.top-6)}:null);
    }
    measure();window.addEventListener('resize',measure);window.addEventListener('scroll',measure,true);
    const observer=new ResizeObserver(measure);const target=document.querySelector(`[data-tutorial="${step.target}"]`);if(target)observer.observe(target);
    return()=>{observer.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true);};
  },[index]);
  const clip=rect?`polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,${rect.left}px ${rect.top}px,${rect.left}px ${rect.top+rect.height}px,${rect.left+rect.width}px ${rect.top+rect.height}px,${rect.left+rect.width}px ${rect.top}px,${rect.left}px ${rect.top}px)`:undefined;
  return <div className={'tutorial-backdrop tutorial-step-'+step.target}>
    <div className="tutorial-shade" style={{clipPath:clip}} aria-hidden="true"/>
    {rect&&<div className="tutorial-highlight" style={rect} aria-hidden="true"/>}
    <section ref={dialog} className="tutorial-dialog" role="dialog" aria-modal="true" aria-labelledby="tutorial-title" aria-describedby="tutorial-description">
      <img className="tutorial-character" src="/images/tutorial-guide.png" alt="새싹 왕관을 쓰고 손을 흔드는 정원 안내자 피오"/>
      <div className="tutorial-bubble">
        <div className="tutorial-heading"><span><Leaf size={17}/>피오의 별 안내</span><button aria-label="튜토리얼 건너뛰기" onClick={onClose}><X size={19}/></button></div>
        <div key={index} className="tutorial-copy" aria-live="polite"><h2 id="tutorial-title">{step.title}</h2><p id="tutorial-description">{step.text}</p></div>
        <div className="tutorial-progress" aria-label={`${steps.length}단계 중 ${index+1}단계`}>{steps.map((_,i)=><span key={i} className={i===index?'active':''}/>)}<small>{index+1} / {steps.length}</small></div>
        <div className="tutorial-controls"><button className="tutorial-skip" onClick={onClose}>건너뛰기</button><div><button className="secondary" disabled={!index} onClick={()=>setIndex(i=>i-1)}><ChevronLeft size={16}/>이전</button><button ref={next} className="primary" onClick={()=>index===steps.length-1?onClose():setIndex(i=>i+1)}>{index===steps.length-1?'시작하기':'다음'}<ArrowRight size={16}/></button></div></div>
        <p className="tutorial-replay">왼쪽 아래 도움말에서 언제든 다시 볼 수 있어요.</p>
      </div>
    </section>
  </div>;
}
