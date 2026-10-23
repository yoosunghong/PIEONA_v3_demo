import React,{useEffect,useState} from 'react';
import {api} from './api';
import {surveyQuestions} from '../shared/survey.mjs';

export function SurveyInvitation({onStart,onLater,busy}){
  return <div className="panel-body survey-invitation"><img src="/images/tutorial-guide.png" alt="설문 참여를 부탁하며 손을 흔드는 정원 안내자 피오"/><div><span className="eyebrow">A LITTLE HELP TO BLOOM</span><h3>당신의 이야기를 들려줄래요?</h3><p>ILLOVA를 플레이해 주셔서 고마워요!<br/>더 재미있고 편리한 마을을 만들 수 있도록 짧은 익명 설문에 참여해 주세요.</p><p className="tiny">지금은 쉬어가도 괜찮아요. 나중에 상단 설문 버튼에서 참여할 수 있어요.</p><div className="form-row"><button className="primary" disabled={busy} onClick={onStart}>설문 참여하기</button><button className="secondary" disabled={busy} onClick={onLater}>나중에 할게요</button></div></div></div>;
}

export default function Survey({notify,onComplete,onLater,onBusyChange}){
  const [answers,setAnswers]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false);},[busy,onBusyChange]);
  const set=(id,value)=>setAnswers(a=>({...a,[id]:value}));
  function choose(q,index){
    const a=answers[q.id]||{},selected=a.selected||[];
    if(q.type==='single')return set(q.id,{selected:[index],other:index===q.options.length-1?a.other||'':''});
    let next=selected.includes(index)?selected.filter(i=>i!==index):index===q.exclusive?[index]:[...selected.filter(i=>i!==q.exclusive),index];
    if(q.max&&next.length>q.max)return;
    set(q.id,{selected:next,other:next.includes(q.options.length-1)?a.other||'':''});
  }
  async function submit(e){e.preventDefault();setError('');
    for(const q of surveyQuestions){const a=answers[q.id];if(q.type==='text')continue;
      if(a===undefined||(q.options&&!a.selected?.length)){setError(`${q.id.toUpperCase()}에 응답해 주세요.`);document.getElementById('survey-'+q.id)?.focus();return;}}
    setBusy(true);try{await api('/feedback',{method:'POST',body:{answers}});notify('설문을 제출했어요. 소중한 의견 고마워요!');await onComplete();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <form className="panel-body survey-form" onSubmit={submit}><div className="survey-intro"><h3>ILLOVA를 플레이해 주셔서 감사합니다!</h3><p>본 설문은 AI 아바타와 함께하는 마을 생활을 더 재미있고 편리하게 만들기 위해 진행됩니다. 모든 응답은 익명으로 수집되며, 게임 개선 및 개발 방향을 검토하는 목적으로만 활용됩니다.</p><p>함께 낚시하기, 텃밭·요리 부탁하기, 대화하기 등 직접 경험한 내용을 바탕으로 솔직하고 편하게 답변해 주세요.</p><p className="tiny">체험하지 않은 평가 항목은 ‘아직 경험하지 않았어요’를 선택해 주세요. Q4는 직접 경험한 활동 중에서 골라 주세요. Q8은 앞으로 제공될 경우의 유료 기능 이용 의향을 묻는 문항입니다. 자유 응답에 이름, 이메일 등 개인정보를 적지 말아 주세요.</p></div>
    {surveyQuestions.map(q=><React.Fragment key={q.id}>{q.part&&<h3 className="survey-part">{q.part}</h3>}<fieldset id={'survey-'+q.id} tabIndex={-1} disabled={busy} className="survey-question"><legend>{q.id.toUpperCase()}. {q.title}</legend><p className="tiny">{q.type==='multi'?(q.max?`최대 ${q.max}개 선택`:'복수 선택 가능'):q.type==='single'?'하나만 선택':q.type==='text'?'주관식 · 선택 응답 · 최대 2,000자':'5점 척도'}</p>
      {q.type==='rating'?<><div className="survey-scale">{[1,2,3,4,5].map(n=><label key={n}><input type="radio" name={q.id} required checked={answers[q.id]===n} onChange={()=>set(q.id,n)}/><span>{n}</span></label>)}</div><p className="tiny">1점 ({q.low}) ~ 5점 ({q.high})</p>{q.unexperienced&&<label className="check-row"><input type="radio" name={q.id} checked={answers[q.id]==='unexperienced'} onChange={()=>set(q.id,'unexperienced')}/>아직 경험하지 않았어요</label>}</>:q.type==='text'?<label><span className="tiny">{q.hint}</span><textarea aria-label={q.title} maxLength={2000} value={answers[q.id]||''} onChange={e=>set(q.id,e.target.value)}/></label>:<>{q.options.map((option,i)=><label className="check-row" key={i}><input type={q.type==='multi'?'checkbox':'radio'} name={q.id} checked={answers[q.id]?.selected?.includes(i)||false} disabled={q.max&&answers[q.id]?.selected?.length>=q.max&&!answers[q.id].selected.includes(i)&&i!==q.exclusive} onChange={()=>choose(q,i)}/><span>{option}</span></label>)}{answers[q.id]?.selected?.includes(q.options.length-1)&&<input aria-label={q.id.toUpperCase()+' 기타 의견'} required maxLength={500} placeholder="기타 의견을 입력해 주세요 (최대 500자)" value={answers[q.id].other||''} onChange={e=>set(q.id,{...answers[q.id],other:e.target.value})}/>}</>}
    </fieldset></React.Fragment>)}{error&&<p role="alert" className="form-error">{error}</p>}<div className="survey-submit"><button type="button" className="secondary" disabled={busy} onClick={onLater}>나중에 할게요</button><button className="primary" disabled={busy}>{busy?'제출 중…':'익명으로 설문 제출'}</button></div></form>;
}
