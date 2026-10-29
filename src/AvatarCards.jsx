import React,{useEffect,useRef,useState} from 'react';
import {Heart,MessageCircle,Sparkles,Lock,Plus,ArrowLeft,ArrowRight,Leaf,Check} from 'lucide-react';
import {Modal} from './Panels';
import {api} from './api';
import {CARD_LEVELS,cardThemes} from '../shared/avatarCards.mjs';
import './avatar-cards.css';
import {cardPortrait} from './avatarCardPortraits.mjs';

export function CardArt({character='pio',className=''}){const art=cardPortrait(character);return <div role="img" aria-label={art.name+' 캐릭터 프로필'} className={'avatar-card-art '+className} style={{backgroundImage:`url("${art.src}")`,backgroundPosition:'center',backgroundSize:'cover'}}/>;}
export function AvatarCardFace({card,compact=false}){
  const theme=cardThemes.find(t=>t.id===card.theme)||cardThemes[0];
  return <div className={'avatar-card-face evolution-'+(card.tier||1)+' theme-'+theme.id+(compact?' is-compact':'')}>
    <CardArt character={card.character}/><span className="card-heart"><Heart size={22} fill="currentColor"/></span>
    <div className="card-speech">{theme.id==='rose'?'같이\n재밌는 거 해볼래?':theme.id==='ocean'?'조용히\n이야기 나누자.':theme.id==='sunset'?'오늘도\n탐험하러 갈래?':'오늘은\n어떤 이야기 나눌까?'}</div>
    <div className="card-copy"><h3>{card.nickname} <span>{theme.emoji}</span></h3><div className="card-tags">{card.tags?.slice(0,3).map(t=><span key={t}>{t}</span>)}</div><p className="card-mini-analysis">{card.summary}</p><div className="card-presence"><i className={card.online?'online':''}/>{card.status||'나를 닮아가는 중'}{card.level!=null&&<b>Lv.{card.level}</b>}</div></div>
  </div>;
}
export function CardReveal({card,onDone,title='나를 닮은 아바타 카드'}){
  const [flipped,setFlipped]=useState(false),[shine,setShine]=useState(false);
  const continueButton=useRef(null);
  useEffect(()=>{const flip=setTimeout(()=>setFlipped(true),650),sparkle=setTimeout(()=>setShine(true),1300);return()=>{clearTimeout(flip);clearTimeout(sparkle);};},[card.id]);
  useEffect(()=>{if(flipped)continueButton.current?.focus();},[flipped]);
  return <div className={'card-reveal '+(shine?'is-shining':'')} role="dialog" aria-modal="true" aria-label="아바타 카드 공개" onKeyDown={e=>{if(e.key==='Tab'){e.preventDefault();e.stopPropagation();continueButton.current?.focus();}}}>
    <p className="reveal-eyebrow">A LITTLE MORE LIKE YOU</p><h2>{title}</h2><p>작은 이야기들이 모여, 또 다른 내가 피어났어요.</p>
    <div className={'reveal-perspective '+(flipped?'is-flipped':'')}><div className="reveal-rotator"><div className="card-back"><span>✧</span><Leaf size={48}/><b>ILLOVA</b><small>YOUR OTHER SELF</small><span>✧</span></div><div className="reveal-front"><AvatarCardFace card={card}/></div></div><div className="card-flash"/><div className="reveal-sparkles" aria-hidden="true">✧<span>✦</span>✧<span>✧</span>✦</div></div>
    <button ref={continueButton} className="card-pink-button" disabled={!flipped} onClick={onDone}>내 카드 만나기 <Sparkles size={18}/></button>
  </div>;
}
export default function AvatarCards({me,target,notify,onClose,onChat,onActivate}){
  const own=me.id===target.id;
  const [data,setData]=useState(null),[error,setError]=useState(''),[reveal,setReveal]=useState(true),[busy,setBusy]=useState(false),[creating,setCreating]=useState(false),[name,setName]=useState(''),[theme,setTheme]=useState('rose');
  const request=useRef(0);
  async function load(){const token=++request.current;try{const result=await api(own?'/avatar-cards':`/users/${target.id}/avatar-card`);if(token===request.current){setData(result);setError('');}}catch(e){if(token===request.current)setError(e.message);}}
  useEffect(()=>{load();return()=>{request.current++;};},[target.id,me.activeSlot]);
  useEffect(()=>{if(own)return;api(`/users/${target.id}/memory-seen`,{method:'POST'}).catch(()=>{});},[target.id,own]);
  async function activate(slot){setBusy(true);try{const result=await api(`/slots/${slot.id}/activate`,{method:'POST'});await onActivate(result.user);}catch(e){notify(e.message);}finally{setBusy(false);}}
  async function create(e){e.preventDefault();setBusy(true);try{const result=await api('/slots',{method:'POST',body:{nickname:name,theme}});await activate({id:result.id});}catch(e){notify(e.message);}finally{setBusy(false);}}
  const card=data?.card?{...data.card,online:data.card.own?true:target.online,status:data.card.own?'지금 접속 중':data.card.status}:null,slots=data?.slots||[],quests=data?.quests||[];
  const themeData=cardThemes.find(t=>t.id===card?.theme)||cardThemes[0];
  return <Modal title="아바타 카드" eyebrow="THE LITTLE STORIES THAT MAKE ME" className="avatar-cards-modal" onClose={onClose} wide>
    {!data?<div className="cards-loading" role="status">{error?<><p role="alert">{error}</p><button onClick={load}>다시 불러오기</button></>:<><Sparkles/>이야기와 취향으로 카드를 그리는 중…</>}</div>:!card?<div className="cards-loading"><Leaf/><p>튜토리얼을 마치면 첫 아바타 카드가 피어나요.</p></div>:<>
      <div className="cards-workspace" inert={reveal}><div className="cards-collection"><div className="cards-intro"><div><h2>{own?'여러 모습의 나, 한 장의 이야기':'만나서 반가워, 나의 작은 이야기'}</h2><p>한눈에 개성과 취향을 발견하고, 새로운 대화를 시작해요.</p></div><span>{own?slots.length:1} / 8</span></div>
        <div className="cards-display" style={{'--card-portrait':`url("${cardPortrait(card.character).src}")`}}>
          <button className="cards-arrow" aria-label="앞쪽 카드 보기" onClick={e=>e.currentTarget.parentElement.querySelector('.cards-track').scrollBy({left:-245,behavior:'smooth'})}><ArrowLeft size={20}/></button>
          <div className="cards-track"><button className="collectible-card selected" aria-label={`${card.nickname}의 카드 다시 펼치기`} onClick={()=>setReveal(true)}><AvatarCardFace card={card}/><span className="card-selected-label"><Check size={12}/> {own?'대표 아바타':'지금 만나는 아바타'}</span></button>
            {own&&slots.filter(s=>!s.active).map(slot=><button disabled={busy} className="collectible-card other-persona" key={slot.id} onClick={()=>activate(slot)}><AvatarCardFace card={slot.preview||{...slot,tags:[],summary:'이 자아의 이야기 만나기'}}/><span className="card-switch-label">이 자아로 전환 ↗</span></button>)}
            {own&&Array.from({length:Math.max(0,4-slots.length)},(_,i)=><button key={'locked'+i} className="collectible-card locked-persona" onClick={()=>{document.getElementById('card-quests')?.scrollIntoView({behavior:'smooth'});if(data.available)setCreating(true);}}><CardArt character={['pio','luna','moa','tori'][(themeData.art+i+1)%4]}/><div className="locked-card-overlay"><Lock size={28}/><h3>또 다른 나</h3><p>{data.available?'새로운 자아를 만나보세요':'작은 도전으로 만나요'}</p><span>{data.available?'획득 가능한 카드 '+data.available+'장':'퀘스트로 카드 획득'}</span></div></button>)}
          </div><button className="cards-arrow" aria-label="뒤쪽 카드 보기" onClick={e=>e.currentTarget.parentElement.querySelector('.cards-track').scrollBy({left:245,behavior:'smooth'})}><ArrowRight size={20}/></button>
        </div>
      <section className={'card-main-details theme-'+card.theme} aria-label="선택한 아바타 정보"><div className="card-detail-body"><h2>{card.nickname} {themeData.emoji}</h2><div className="card-presence"><i className={card.online?'online':''}/>{card.status}</div><div className="card-tags">{card.tags.map(t=><span key={t}>{t}</span>)}</div><div className="card-about-row"><section><h3>한 줄 소개</h3><p>{card.intro||'작은 취향을 나누며, 나를 조금씩 알아가는 친구!'}</p></section><section className="card-relationship"><small>♥ 우리 사이</small><b>💗 {card.level==null?'비공개':'Lv.'+card.level}</b>{card.level!=null&&<progress value={card.levelXp} max={card.nextLevelXp}/>}</section></div><section className="card-personality"><h3><Sparkles size={15}/>나를 닮은 성향 분석</h3><p>{card.summary}</p><small>{card.provider==='gemini'?'AI 분석':'관찰 기반 분석'} · 대화, 별 꾸미기, 게임 기록</small>{card.notice&&<small>{card.notice}</small>}</section><section className="card-recent"><h3>최근 기억 <span>{own?'나의 이야기':'공유된 이야기'}</span></h3>{card.memories.length?card.memories.map((m,i)=><div key={m.id}><span>{['🎮','🍜','🌱'][i%3]}</span><p>“{m.content}”</p><time>{new Date(m.createdAt).toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit'})}</time></div>):<p className="muted">함께 나눌 첫 이야기를 기다려요.</p>}</section><button className="card-pink-button card-chat" onClick={onChat}><MessageCircle size={19}/>이 아바타와 대화하기</button></div></section>
        <div className="card-evolution"><div><Heart size={19}/><strong>우리가 쌓아가는 이야기</strong><p>대화할수록 나를 닮아가요. 3 · 5 · 7 · 10레벨마다 카드가 새롭게 빛나요.</p></div><div className="evolution-stops">{CARD_LEVELS.map(level=><div key={level} className={level<=card.tier?'reached':''}><span>{level<=card.tier?'♥':'✧'}</span><b>Lv.{level}</b><small>{({1:'처음 만남',3:'조금 친해짐',5:'소중한 친구',7:'마음을 아는',10:'또 다른 나'})[level]}</small></div>)}</div></div>
        {own&&<section id="card-quests" className="card-quests"><div className="quest-heading"><div><span>ANOTHER CHAPTER</span><h3>작은 도전, 새로운 나</h3></div><button className="card-pink-button" disabled={!data.available||slots.length>=8} onClick={()=>setCreating(v=>!v)}><Plus size={16}/>카드 만들기 · {data.available}장</button></div><div className="quest-grid">{quests.map(q=><article key={q.id} className={q.complete?'complete':''}><span>{q.icon}</span><div><strong>{q.title}</strong><small>{q.description}</small><progress max={q.goal} value={q.complete?q.goal:q.progress}/></div><b>{q.complete?<Check size={17}/>:q.progress+'/'+q.goal}</b></article>)}</div>{creating&&<form onSubmit={create} className="new-card-form"><label>또 다른 나의 이름<input required maxLength={20} value={name} onChange={e=>setName(e.target.value)} placeholder="새로운 자아에게 이름을 지어주세요"/></label><label>카드 테마<select value={theme} onChange={e=>setTheme(e.target.value)}>{cardThemes.map(t=><option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}</select></label><button className="card-pink-button" disabled={busy||!data.available}>새 자아 만나기</button><p>퀘스트 보상 1장을 사용해요. 새 자아는 독립된 튜토리얼과 기억으로 시작해요.</p></form>}</section>}
</div></div>
      {reveal&&<CardReveal card={card} onDone={()=>setReveal(false)} title={own?(card.tier>1?`Lv.${card.tier}, 조금 더 나를 닮았어요`:'나의 첫 아바타 카드'):`${card.nickname}의 아바타 카드`}/>}
    </>}
  </Modal>;
}
