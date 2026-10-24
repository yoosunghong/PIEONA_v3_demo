import React,{useState} from 'react';
import {Gift,Sparkles,X,Check} from 'lucide-react';
import {SURVEY_REWARD} from '../shared/surveyRewards.mjs';
import './survey-rewards.css';

const variants=[['lumi','루미 · 눈빛','#e8efff'],['kai','카이 · 대지','#78635f'],['nero','네로 · 숲','#b4dfc0'],['piyo','피요 · 꽃빛','#f5bdce'],['zero','제로 · 밤하늘','#514475']];
export function SurveyRewards({received=false,invitation=false}){
  const [variant,setVariant]=useState(variants[0]);
  return <section className="survey-rewards" aria-label="설문 참여 보상">
    <div className="reward-heading"><span className="reward-kicker"><Gift size={14}/> {received?'THANK YOU GIFT':'SPECIAL PLAYTEST GIFT'}</span><h3>{received?'아기용과 둥지가 도착했어요!':invitation?'설문 참여 완료 시 아래 아이템을 드려요!':'설문을 완료하면 아래 아이템을 드려요!'}</h3><p>{received?'소중한 의견 고마워요. 새로운 친구와 마을을 꾸며 보세요.':'당신의 이야기에, 작은 친구와 포근한 보금자리로 보답할게요.'}</p></div>
    <div className="reward-cards"><article className="reward-card reward-dragon"><span className="reward-tag"><Sparkles size={12}/> 색상 변경 가능</span><div className="reward-art"><img src={'/images/rewards/dragon-'+variant[0]+'.png?v=crystalwing-1'} alt={variant[1]+' 색상의 아기용 탈것 · 수정 날개로 날아다니는 Crystalwing'}/></div><h4>나만의 아기용 탈것</h4><p>수정 날개로 머리 높이를 날아요.<br/>직접 타고 우리 마을을 날아보세요</p><div className="reward-swatches" role="group" aria-label="아기용 색상 미리보기">{variants.map(v=><button type="button" key={v[0]} aria-label={v[1]} aria-pressed={variant[0]===v[0]} title={v[1]} style={{'--swatch':v[2]}} onClick={()=>setVariant(v)}>{variant[0]===v[0]&&<Check size={12}/>}</button>)}</div></article>
    <article className="reward-card reward-nest"><span className="reward-tag">마을꾸미기 오브젝트</span><div className="reward-art"><img src="/images/rewards/dragon-nest.png" alt="수정과 덩굴 아치, 따뜻한 등불과 쿠션으로 꾸민 아기용 전용 둥지"/></div><h4>아기용 전용 둥지</h4><p>별빛 수정과 따뜻한 등불.<br/>우리 마을에 놓는 포근한 보금자리</p><span className="reward-nest-note">마을꾸미기에서 배치 · 회전 · 보관</span></article></div>
    <p className="reward-footnote">{received?'탈것은 캐릭터 꾸미기 → 내 플레이어 → 탈것, 둥지는 마을꾸미기 → 장식에서 만나요.':'설문 제출 완료 시 계정당 1회 자동 지급 · 아기용 탈것 1종 + 전용 둥지 1개'}</p>
  </section>;
}

export function SurveyRewardHint({userId,onStart,visible=true}){
  const key=`illova.survey-reward-hint.${SURVEY_REWARD}.${userId}`;
  const [dismissed,setDismissed]=useState(()=>{try{return localStorage.getItem(key)==='dismissed';}catch{return false;}});
  function dismiss(){setDismissed(true);try{localStorage.setItem(key,'dismissed');}catch{}}
  return <div className="survey-button-wrap"><button className="top-survey survey-glow" title="플레이 설문조사" aria-label="플레이 설문조사" onClick={onStart}><Gift size={14}/><span>설문</span></button>{visible&&!dismissed&&<aside className="survey-reward-hint" aria-label="설문 보상 안내"><button className="reward-hint-close" aria-label="설문 보상 안내 닫기" onClick={dismiss}><X size={14}/></button><button className="reward-hint-start" onClick={onStart}><span className="reward-hint-images"><img src="/images/rewards/dragon-lumi.png?v=crystalwing-1" alt="아기용 탈것"/><img src="/images/rewards/dragon-nest.png" alt="전용 둥지"/></span><span>설문을 완료하면<br/><strong>탈것과 둥지를 드려요</strong><small>설문 참여하기 →</small></span></button></aside>}</div>;
}
