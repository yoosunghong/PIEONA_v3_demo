import React,{useCallback,useEffect,useRef,useState} from 'react';
import {api} from './api';
import {ALL_ITEMS} from '../shared/life.mjs';
import {playerStars} from '../shared/stars.mjs';
import {starDetails,ROBOT_CYCLE_MS} from '../shared/colony.mjs';
import './colony.css';

const itemName=id=>ALL_ITEMS.find(i=>i.itemId===id)?.name||id;
export function useColony(userId,enabled=true){
  const [data,setData]=useState(null),[stars,setStars]=useState(playerStars),[error,setError]=useState('');
  const generation=useRef(0);
  useEffect(()=>{generation.current++;setData(null);setStars(playerStars);},[userId]);
  const load=useCallback(async()=>{
    if(!userId||!enabled)return;const token=generation.current;
    try{const result=await api('/me/colony');if(token!==generation.current)return;setData({...result,receivedAt:Date.now()});setStars([...playerStars,...result.stars.map(starDetails)]);setError('');return result;}catch(e){if(token===generation.current)setError(e.message);}
  },[userId,enabled]);
  useEffect(()=>{load();if(!userId||!enabled)return;const timer=setInterval(load,5000);return()=>clearInterval(timer);},[load]);
  const command=async(path,body={})=>{const token=generation.current;const result=await api(path,{method:'POST',body});if(token===generation.current){setData({...result,receivedAt:Date.now()});setStars([...playerStars,...result.stars.map(starDetails)]);}return result;};
  return {data,stars,error,load,command};
}

export default function Colony({starId='plaza',colony,view,onView,robotId,onRobot,npcId,onVisit,onChanged}){
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[reply,setReply]=useState(''),[item,setItem]=useState(''),[quantity,setQuantity]=useState(1),[now,setNow]=useState(Date.now());
  const guard=useRef(false),dialog=useRef(),data=colony.data;
  useEffect(()=>{if(!view&&!robotId)return;const previous=document.activeElement;dialog.current?.querySelector('button')?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[view,robotId]);
  useEffect(()=>{if(!view&&!robotId)return;const timer=setInterval(()=>setNow(Date.now()),100);return()=>clearInterval(timer);},[view,robotId]);
  useEffect(()=>{setReply('');setError('');setItem('');setQuantity(1);},[npcId,view]);
  useEffect(()=>{if(!view&&!robotId)return;const key=e=>{if(e.key==='Escape'){e.stopPropagation();onView(null);onRobot(null);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[view,robotId,onView,onRobot]);
  async function run(path,body){if(guard.current)return;guard.current=true;setPending(true);setError('');try{const result=await colony.command(path,body);setReply(result.reply||'');await onChanged?.();return result;}catch(e){setError(e.message);}finally{guard.current=false;setPending(false);}}
  if(!view&&!robotId)return null;
  const npc=data?.npcs.find(n=>n.id===npcId),robot=data?.robots.find(r=>r.id===robotId&&r.starId===starId),discovery=data?.discovery;
  const elapsed=data?Math.max(0,now-data.receivedAt):0,battle=data?.defense,battleTime=battle?Math.max(0,now-data.receivedAt+data.serverTime-battle.started):0;
  const close=()=>{onView(null);onRobot(null);};
  return <aside ref={dialog} className={'colony-panel'+(robotId?' robot-telemetry':'')} role="dialog" aria-modal="false" aria-label={robotId?'채광 로봇 상태':view==='npc'?'NPC 교류':'별 개척과 편지'}>
    <header><div><small>STAR CONNECTIONS</small><h2>{robotId?'채광 로봇':npc?npc.name:'별 개척 · 편지함'}</h2></div><button aria-label="별 교류 닫기" onClick={close}>×</button></header>
    {(error||colony.error)&&<p role="alert">{error||colony.error}<button onClick={colony.load}>다시 불러오기</button></p>}
    {!data?<p role="status">별 소식을 불러오고 있어요…</p>:<>
    {robotId?<section>{robot?<><p className="colony-status">{robot.operating?'● 채광 중':robot.battery>0?'점령 중 · 작동 중지':'배터리 소진 · 충전 필요'}</p><dl><dt>총 가동 시간</dt><dd>{Math.floor((robot.totalRuntime+Math.min(elapsed,robot.battery*36000))/60000)}분</dd><dt>배터리</dt><dd>{robot.battery}%</dd><dt>누적 철광석</dt><dd>{robot.collected}개</dd><dt>기본 생산 속도</dt><dd>{60000/ROBOT_CYCLE_MS}개 / 분</dd></dl><progress aria-label="로봇 배터리" max="100" value={robot.battery}/><p>배치 즉시 가동 · 배터리 60분 · 배치한 별의 채광 보너스 적용</p><button disabled={pending} onClick={()=>run('/me/colony/robots/'+robotId+'/recharge',{starId})}>철광석 5개로 충전</button></>:<p>저장된 로봇을 확인하고 있어요. 별 꾸미기에서 배치를 저장해 주세요.</p>}</section>:<>
    <p className="colony-wallet">💠 별의 핵 {data.inventory.find(i=>i.itemId==='STAR_CORE')?.quantity||0} · ⛏ 철광석 {data.inventory.find(i=>i.itemId==='IRON_ORE')?.quantity||0}</p>
    {view==='npc'&&npc?<section><h3>호감도 {npc.affinity} / 1000</h3><progress aria-label="NPC 호감도" max="1000" value={npc.affinity}/><p>설득 성공률 {Math.round(npc.persuasionChance*100)}%</p><h3>발견한 위시리스트</h3><p>{npc.wishlist.length?npc.wishlist.map(itemName).join(' · '):'대화하면서 좋아하는 물건을 알아보세요.'}</p><button disabled={pending} onClick={()=>run('/npcs/'+npc.id+'/talk')}>대화하기</button><h3>거래하기</h3><p>아이템을 올려 건네면 NPC가 보답을 골라 줍니다.</p><label>줄 아이템<select value={item} onChange={e=>{setItem(e.target.value);setQuantity(1);}}><option value="">아이템 선택</option>{data.inventory.filter(i=>i.quantity>0).map(i=><option key={i.itemId} value={i.itemId}>{itemName(i.itemId)} ({i.quantity}개)</option>)}</select></label><label>수량<input type="number" min="1" max={Math.min(99,data.inventory.find(i=>i.itemId===item)?.quantity||1)} value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label><button disabled={pending||!item||!Number.isInteger(quantity)||quantity<1||quantity>Math.min(99,data.inventory.find(i=>i.itemId===item)?.quantity||0)} onClick={async()=>{const r=await run('/npcs/'+npc.id+'/trade',{itemId:item,quantity});if(r)setReply(`${r.reply} ${itemName(r.reward.itemId)} ${r.reward.quantity}개를 받았어요.`);}}>올린 아이템 건네기</button></section>:<section><h3>발견한 별</h3>{discovery?<article style={{borderColor:discovery.color}}><h3>{discovery.name} · {discovery.grade}등급</h3><p>{discovery.stat} +{discovery.bonus}{discovery.unit}</p><p>{discovery.players}명 참여 · 발견 확률 {Math.round(discovery.chance*100)}%</p><button disabled={pending} onClick={()=>run('/me/colony/claim',{starId:discovery.id})}>핵 {discovery.cost}개로 내 별로 만들기</button><button disabled={pending} onClick={()=>run('/me/colony/discard',{starId:discovery.id})}>발견한 별 보내기</button></article>:<p>미니게임 완료 시 20% + 참여자 수 × 10% 확률로 별을 발견해요. 한 번에 한 개만 발견하며, 완료 보상으로 핵 1개를 받아요.</p>}<h3>보유한 개척별</h3>{data.stars.length?data.stars.map(s=><article key={s.id}><strong>{starDetails(s).name}</strong><p>{starDetails(s).caption}</p></article>):<p>발견한 별을 내 별로 만들어 보세요.</p>}<h3>NPC에게 찾아가기</h3>{data.npcs.map(n=><button key={n.id} disabled={pending} onClick={()=>{close();onVisit(n.id);}}>{n.name} · 호감 {n.affinity}</button>)}</section>}
    {reply&&<p className="colony-reply" role="status">{reply}</p>}
    <section><h3>도착한 편지</h3>{data.letters.filter(l=>view!=='npc'||l.npc_id===npcId).map(l=><article key={l.id}><strong>{data.npcs.find(n=>n.id===l.npc_id)?.name} · {l.star_name}</strong><p>{{pending:'그 별은 내가 눈여겨보던 곳이야. 찾아와서 이야기하자.',ceded:'별과 배치된 시설, 로봇을 함께 넘겨줘서 고마워. 그 일을 기억할게.',kept:'네 권리를 인정할게. 별을 잘 가꿔 줘.',attacking:'우주선이 출발했어! 방어전을 준비하세요.',occupied:'NPC 점령 중 · 별 비활성화. 탈환전으로 되찾으세요.',defended:'별을 지켜냈어요. NPC도 이 일을 기억합니다.'}[l.status]}</p>{l.status==='pending'&&(npcId===l.npc_id&&view==='npc'?<div><p>양보하면 꾸미기 배치·생활 시설·작물·채광 로봇도 NPC에게 함께 넘어가요.</p><button disabled={pending} onClick={()=>run('/me/colony/letters/'+l.id+'/resolve',{choice:'cede'})}>양보 · 핵 {l.cost*2}개 받기</button><button disabled={pending} onClick={()=>run('/me/colony/letters/'+l.id+'/resolve',{choice:'keep'})}>내 권리를 주장하고 설득</button></div>:<button onClick={()=>{close();onVisit(l.npc_id);}}>NPC 찾아가기</button>)}{['attacking','occupied'].includes(l.status)&&!battle&&<button disabled={pending} onClick={()=>run('/me/colony/letters/'+l.id+'/defense')}>{l.status==='occupied'?'탈환전 시작':'별 방어하기'}</button>}</article>)}{!data.letters.length&&<p>아직 도착한 편지가 없어요.</p>}</section>
    </>}
    {battle&&<section className="colony-defense"><h3>별 방어전 · {Math.max(0,Math.ceil((battle.duration-battleTime)/1000))}초</h3><p>1 · 2 · 3 포탑 버튼으로 각 항로를 방어하세요. 15대 중 12대를 격추하면 승리해요. 우주선은 6초 후 도착합니다.</p><div className="colony-lanes">{[0,1,2].map(lane=><div key={lane}><div className="colony-flight">{battle.ships.filter(s=>s.lane===lane&&!battle.hits.includes(s.id)&&battleTime>=s.spawn&&battleTime<s.arrives).map(s=><span key={s.id} style={{top:Math.min(90,(battleTime-s.spawn)/60)+'%'}}>🛸</span>)}</div><button disabled={pending||battleTime>=battle.duration} onClick={()=>run('/me/colony/defense/'+battle.id+'/fire',{lane})}>포탑 {lane+1}</button></div>)}</div><p role="status">격추 {battle.hits.length} / 12</p><small>전투는 화면을 닫아도 진행되며 접속을 끊으면 남은 우주선이 도착합니다.</small></section>}
    </>}
  </aside>;
}
