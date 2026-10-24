import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowUpRight,ChevronRight,Flower2,Leaf,MessageCircle} from 'lucide-react';
import {Modal} from './Panels';
import {api} from './api';
import {balanceQuestions,scenarioQuestions} from '../shared/onboarding.mjs';
import {preferenceQuestions} from '../shared/avatarCards.mjs';
import './onboarding.css';

export default function Onboarding({me,onComplete,notify}){
  const [step,setStep]=useState(me.nickname?0:-1),[name,setName]=useState(me.nickname||'');
  const [answers,setAnswers]=useState({}),[responses,setResponses]=useState({}),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
  const [preferences,setPreferences]=useState({}),[publishPreferences,setPublishPreferences]=useState(false);
  const saving=useRef(false),heading=useRef(null);
  const total=balanceQuestions.length+scenarioQuestions.length+preferenceQuestions.length;
  const question=balanceQuestions[step],scenario=scenarioQuestions[step-balanceQuestions.length];
  const preference=preferenceQuestions[step-balanceQuestions.length-scenarioQuestions.length];
  useEffect(()=>{heading.current?.focus();},[step,saved]);
  async function nextName(e){e.preventDefault();if(saving.current)return;saving.current=true;setBusy(true);try{await api('/me',{method:'PATCH',body:{nickname:name}});setStep(0);}catch(e){notify(e.message);}finally{saving.current=false;setBusy(false);}}
  async function next(e){
    e.preventDefault();if(saving.current)return;
    if(step<total-1){setStep(value=>value+1);return;}
    saving.current=true;setBusy(true);
    try{
      await api('/balance',{method:'POST',body:{answers:balanceQuestions.map(q=>({id:q.id,choice:answers[q.id]})),responses:scenarioQuestions.map(q=>({id:q.id,text:responses[q.id]?.trim()})),preferences:preferenceQuestions.map(q=>({id:q.id,value:preferences[q.id]})),publishPreferences}});
      setSaved(true);
    }catch(e){notify(e.message);}finally{saving.current=false;setBusy(false);}
  }
  return <Modal title="피오와 함께, 나를 닮는 첫걸음" eyebrow="나의 아바타 튜토리얼" dismissOnBackdrop={false} onClose={()=>{}} className="onboarding-modal">
    <div className="panel-body onboarding">
      {step<0?<form onSubmit={nextName}><Flower2 className="onboarding-sprout" size={40}/><h3>작은 자아에게 이름을 지어주세요</h3><p className="muted">다섯 번의 선택, 두 가지 이야기와 취향 질문으로<br/>처음부터 나를 닮은 아바타를 만나보세요.</p><label>아바타 닉네임<input autoFocus required maxLength={20} value={name} onChange={e=>setName(e.target.value)} placeholder="예: 피오, 여울, 새봄"/></label><button className="primary full" disabled={busy}>이 이름으로 피어나기<ChevronRight size={16}/></button></form>
      :saved?<><Leaf className="onboarding-sprout" size={38}/><h3 ref={heading} tabIndex={-1}>첫 성향과 말투가 피어났어요!</h3><p>선택한 취향과 직접 쓴 표현을 기억했어요.<br/>첫 대화부터 나를 닮은 모습을 찾아보세요.</p><div className="onboarding-traits">{balanceQuestions.map(q=><span key={q.id}>{q[answers[q.id]]}</span>)}</div><div className="onboarding-example"><MessageCircle size={19}/><div><strong>아바타가 참고할 나의 말투</strong>{scenarioQuestions.map(q=><p key={q.id}>“{responses[q.id]?.trim()}”</p>)}</div></div><p className="tiny">선택한 공개 범위로 기억했어요. 기억 정원에서 수정할 수 있어요.</p><button className="primary full" disabled={busy} onClick={onComplete}>내 첫 아바타 카드 만나기<ArrowUpRight size={16}/></button></>
      :<form onSubmit={next}>
        <div className="onboarding-step" role="status">{step+1} / {total} · {question?'밸런스게임':scenario?'나의 말투 들려주기':'내 취향 들려주기'}</div>
        <div className="balance-progress" aria-label={`${total}단계 중 ${step+1}단계`}>{Array.from({length:total},(_,i)=><span key={i} className={i<=step?'active':''}/>)}</div>
        <h3 ref={heading} tabIndex={-1}>{question?.title||scenario?.title||preference?.title}</h3>
        {question?<div className="onboarding-choices" role="group" aria-label={question.title}>{['a','b'].map((choice,index)=><button type="button" key={choice} className="onboarding-choice" aria-pressed={answers[question.id]===choice} onClick={()=>setAnswers(current=>({...current,[question.id]:choice}))}><span className={'balance-illustration illustration-'+choice} role="img" aria-label={question[choice]} style={{backgroundImage:`url(${question.image})`}}/><span className="onboarding-choice-label"><b>{index?'B':'A'}</b>{question[choice]}</span></button>)}</div>
        :scenario?<label className="onboarding-response">{scenario.prompt}<textarea key={scenario.id} required maxLength={240} rows={4} value={responses[scenario.id]||''} onChange={e=>setResponses(current=>({...current,[scenario.id]:e.target.value}))} placeholder="내가 실제로 할 말을 적어주세요."/><span className="tiny">{scenario.hint} ({(responses[scenario.id]||'').length}/240)</span></label>:<><div className="preference-options">{preference.options.map(value=><button key={value} type="button" className={preferences[preference.id]===value?'selected':''} aria-pressed={preferences[preference.id]===value} onClick={()=>setPreferences(p=>({...p,[preference.id]:value}))}>{value}</button>)}</div>{step===total-1&&<label className="check-row"><input type="checkbox" checked={publishPreferences} onChange={e=>setPublishPreferences(e.target.checked)}/><span>이 취향 세 가지를 아바타 카드와 방문객 힌트에 공개할게요.<small>선택하지 않으면 나만 보기로 저장해요.</small></span></label>}</>}
        <p className="tiny">정답은 없어요. 취향과 말투는 나만 보기 기억에 담아요.</p>
        <div className="onboarding-controls"><button type="button" className="secondary" disabled={busy} onClick={()=>setStep(value=>value-1)}><ArrowLeft size={16}/>이전</button><button className="primary" disabled={busy||(question?!answers[question.id]:scenario?!responses[scenario.id]?.trim():!preferences[preference.id])}>{busy?'기억에 담는 중…':step===total-1?'첫 아바타 카드 만들기':'다음'}<ChevronRight size={16}/></button></div>
      </form>}
    </div>
  </Modal>;
}
