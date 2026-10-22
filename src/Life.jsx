import React,{useCallback,useEffect,useRef,useState} from 'react';
import {api} from './api';
import {ITEM_DEFINITIONS,RARITIES} from '../shared/life.mjs';
import {CROPS,RECIPES,cropState} from '../shared/garden.mjs';
import './life.css';

export function useLife(userId,socket,connected,notify){
  const [data,setData]=useState(null),[pending,setPending]=useState(false),sequence=useRef(0),guard=useRef(false),retry=useRef(null),seenReports=useRef(new Set());
  const load=useCallback(async()=>{
    const request=++sequence.current;
    try{const result=await api('/me/life');if(request===sequence.current){setData({...result,receivedAt:Date.now()});const report=result.autonomy?.reports.find(r=>!r.acknowledged);if(report&&!seenReports.current.has(report.id)){seenReports.current.add(report.id);notify(report.result.reply);}}}
    catch(e){if(request===sequence.current)notify(e.message);}
  },[userId,notify]);
  useEffect(()=>{
    setData(null);if(!userId)return;
    load();const update=result=>{
      setData(previous=>({...previous,...result,receivedAt:Date.now()}));
      if(result.notice)notify(result.notice);
      const catches=result.results?.filter(r=>r.itemId)||[];
      if(!result.notice&&catches.length){const last=ITEM_DEFINITIONS.find(item=>item.itemId===catches.at(-1).itemId);notify(`${catches.at(-1).actor==='COMPANION'?'AI 동반자가 ':''}${last.icon} ${last.name} 획득!${catches.length>1?` 외 ${catches.length-1}마리`:''} 보관함에 저장했어요.`);}
      else if(!result.notice&&result.results?.length&&!catches.length)notify('이번에는 물고기가 지나갔어요. 다시 기다려 볼까요?');
      load();
    };
    socket?.on('life:state',update);
    return()=>{sequence.current++;socket?.off('life:state',update);};
  },[userId,socket,connected,load]);
  const command=useCallback((name,body={})=>{
    if(guard.current)return;
    if(!socket?.connected){notify('실시간 연결을 기다려 주세요.');return;}
    guard.current=true;setPending(true);
    socket.timeout(6000).emit(name,body,(error,result)=>{
      guard.current=false;setPending(false);
      if(error||!result?.ok)notify(result?.error||'응답을 확인하지 못했어요. 연결 후 상태를 다시 확인해 주세요.');
      load();
    });
  },[socket,notify,load]);
  const perform=async action=>{
    if(guard.current)return;
    if(!connected){notify('마을 연결을 기다려 주세요.');return;}
    const signature=JSON.stringify(action);if(retry.current?.signature!==signature)retry.current={signature,key:crypto.randomUUID()};
    guard.current=true;setPending(true);
    try{const result=await api('/me/life/actions',{method:'POST',body:{requestId:retry.current.key,action}});retry.current=null;await load();return result;}
    catch(e){if(e.status)retry.current=null;notify(e.message);await load();}
    finally{guard.current=false;setPending(false);}
  };
  const manage=async(method,path,body)=>{if(guard.current)return;guard.current=true;setPending(true);try{await api(path,{method,body});await load();return true;}catch(e){notify(e.message);}finally{guard.current=false;setPending(false);}};
  return {data,pending,load,perform,configure:settings=>manage('PUT','/me/life/autonomy',settings),acknowledge:id=>manage('POST',`/me/life/reports/${id}/ack`,{}),forget:id=>manage('DELETE',`/me/life/memories/${id}`),start:anchorId=>command('life:start',{anchorId}),stop:(actor='PLAYER')=>command('life:stop',{actor})};
}

export function FishingStatus({data,pending,connected,onStop}){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(timer);},[]);
  const sessions=[data?.session,data?.companion?.session].filter(Boolean);
  const tasks=[data?.task,data?.companion?.task].filter(Boolean);
  if(!sessions.length&&!tasks.length&&!data?.autonomy?.settings.enabled)return null;
  return <section className="fishing-status" aria-label="낚시 진행 상황"><div><span className="life-eyebrow">우리 마을 생활</span>{data?.autonomy?.settings.enabled&&<p>AI 자율 생활 · {data.companion.state==='Resting'?'산책 후 쉬는 중':'허용한 활동을 살피고 있어요'}</p>}{tasks.map(task=><div className="fishing-actor" key={task.id}><strong>{task.actor==='COMPANION'?'AI 동반자':'나'} · {task.label}</strong><p>{task.state==='Moving'?'작업 장소로 이동 중':'작업 중 · 완료되면 보관함에 반영돼요'}</p><button className="text-button" disabled={pending||!connected} onClick={()=>onStop(task.actor)}>{task.actor==='COMPANION'?'동반자 중단':'내 작업 중단'}</button></div>)}{sessions.map(session=>{const remaining=Math.max(0,Math.ceil((session.nextAt-data.serverTime-(now-data.receivedAt))/1000));return <div className="fishing-actor" key={session.id}><strong>🎣 {session.actor==='COMPANION'?'AI 동반자':'나'} · {session.state==='Moving'?'바다로 이동 중':'낚시 중'}</strong><p>{session.state==='Moving'?'예약한 자리로 걸어가고 있어요':`${session.caught}마리 획득 · ${connected?`${remaining}초 후 다음 판정`:'연결 확인 중…'}`}{session.taskLimit?` · ${session.attempts}/${session.taskLimit}회`:''}</p><button type="button" className="text-button" disabled={pending||!connected} onClick={()=>onStop(session.actor)}>{session.actor==='COMPANION'?'동반자 중단':'내 낚시 중단'}</button></div>;})}</div><button type="button" className="secondary" disabled={pending||!connected} onClick={()=>onStop('BOTH')}>{pending?'처리 중…':'모두 중단'}</button></section>;
}

function GardenPanel({data,disabled,onAction}){
  const [seeds,setSeeds]=useState({}),[now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const serverNow=data.serverTime+now-data.receivedAt;
  return <><p className="life-description">씨앗은 무료예요. 접속하지 않아도 자라고, 다 자란 작물은 시들지 않아요.</p><div className="garden-grid">{data.garden.plots.map((plot,index)=>{
    const crop=CROPS.find(c=>c.id===plot.cropId),state=cropState(plot,serverNow),seconds=Math.max(0,Math.ceil((plot.readyAt-serverNow)/1000));
    return <article className={'garden-card '+state.toLowerCase()} key={plot.id}><span className="life-eyebrow">작은 텃밭 {index+1}</span><span className="garden-icon" aria-hidden="true">{crop?.icon||'🌱'}</span><h3>{crop?.name||'무엇을 심을까요?'}</h3>{state==='Empty'?<><label>씨앗 선택<select aria-label={`${index+1}번 텃밭 씨앗`} value={seeds[plot.id]||'HERB'} onChange={e=>setSeeds({...seeds,[plot.id]:e.target.value})}>{CROPS.map(c=><option key={c.id} value={c.id}>{c.name} · {c.growMs/60000}분</option>)}</select></label><button className="primary" disabled={disabled||plot.reserved} onClick={()=>onAction({intent:'PLANT_SEED',plot:plot.id,crop:seeds[plot.id]||'HERB'})}>{plot.reserved?'작업 예정':`${index+1}번 텃밭에 심기`}</button></>:<><p role="status">{plot.reserved?'작업 중':state==='Ready'?'수확할 준비가 됐어요!':`${Math.floor(seconds/60)}분 ${seconds%60}초 후 수확`}</p><progress aria-label={`${crop.name} 성장`} max={crop.growMs} value={Math.min(crop.growMs,serverNow-plot.plantedAt)}/><button className="primary" disabled={disabled||plot.reserved||state!=='Ready'} onClick={()=>onAction({intent:'HARVEST_CROP',plot:plot.id,plantingId:plot.plantingId})}>{index+1}번 텃밭 수확</button></>}</article>;
  })}</div><p className="life-footnote">아바타에게 “허브 좀 심어줘”, “텃밭 수확해줘”, “꽃 다 자랐어?”라고 말해 보세요.</p></>;
}

function RecipeCard({recipe,bag,disabled,onAction}){
  const [choices,setChoices]=useState({});
  const fish=ITEM_DEFINITIONS.filter(f=>(bag.get(f.itemId)||0)>0),safe=fish.filter(f=>['common','uncommon'].includes(f.rarity));
  const selected=Array.from({length:recipe.fishCount},(_,index)=>choices[index]??safe[index]?.itemId??'');
  const enough=selected.every(id=>id&&(bag.get(id)||0)>0)&&(!recipe.distinctFish||new Set(selected).size===recipe.fishCount)&&recipe.ingredients.every(i=>(bag.get(i.itemId)||0)>=i.quantity);
  return <article className="recipe-card"><div className="recipe-heading"><span aria-hidden="true">{recipe.icon}</span><div><h3>{recipe.name}</h3><p>{recipe.description} → 음식 1개</p></div></div>{selected.map((value,index)=><label key={index}>물고기 {index+1}<select aria-label={`${recipe.name} 물고기 ${index+1}`} value={value} onChange={e=>setChoices({...choices,[index]:e.target.value})}><option value="">사용할 물고기 선택</option>{fish.map(f=><option key={f.itemId} value={f.itemId}>{f.name} · {bag.get(f.itemId)}마리 · {RARITIES[f.rarity]}</option>)}</select></label>)}{recipe.ingredients.map(i=><p className="recipe-ingredient" key={i.itemId}>{CROPS.find(c=>c.id===i.itemId).name} · 보유 {bag.get(i.itemId)||0} / 필요 {i.quantity}</p>)}<button className="primary" disabled={disabled||!enough} onClick={()=>onAction({intent:'COOK_FOOD',recipe:recipe.id,...(selected.length?{fish:selected}:{})})}>{enough?`${recipe.name} 만들기`:'재료를 준비해 주세요'}</button></article>;
}

function AutonomyPanel({data,pending,onConfigure,onAcknowledge}){
  const policy=data.autonomy?.settings,[draft,setDraft]=useState(policy),[saved,setSaved]=useState(false),signature=JSON.stringify(policy);
  useEffect(()=>setDraft(policy),[signature]);
  if(!draft)return <p>생활 설정을 불러오는 중이에요.</p>;
  const change=patch=>{setSaved(false);setDraft({...draft,...patch});};
  return <div className="autonomy-panel"><p className="life-description">부탁한 일이 먼저예요. 자율 작업은 재료를 쓰기 전에 중단할 수 있고, “그만하자”는 자율·오프라인 활동도 꺼요.</p><div className="autonomy-settings">{[['enabled','자율 생활 켜기'],['offline','접속 종료 후에도 허용한 활동 정산'],['fishing','혼자 낚시하기'],['gardening','다 자란 작물 수확하기'],['replant','빈 텃밭에 씨앗 심기']].map(([key,label])=><label key={key}><input type="checkbox" checked={draft[key]} onChange={e=>change({[key]:e.target.checked})}/>{label}</label>)}<label>다시 심을 씨앗<select value={draft.crop} onChange={e=>change({crop:e.target.value})}>{CROPS.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>자동 요리 허용<select value={draft.recipe||''} onChange={e=>change({recipe:e.target.value||null})}><option value="">재료를 자동으로 사용하지 않기</option>{RECIPES.map(r=><option key={r.id} value={r.id}>{r.name} · {r.description}</option>)}</select></label></div><p className="life-description">자동 요리는 선택한 레시피의 재료를 소비해요. 희귀·특별 물고기는 사용하지 않아요. 접속 중에는 요리 간격이 10분이에요.</p><button className="primary" disabled={pending} onClick={async()=>{if(await onConfigure(draft))setSaved(true);}}>{pending?'저장 중…':'생활 설정 저장'}</button>{saved&&<p role="status">생활 설정을 저장했어요.</p>}<p className="life-footnote">오프라인은 최대 2시간: 낚시 판정 80회, 작물 18개 수확, 음식 6개 제작까지. 실제 결과는 재료와 성장 시간에 따라 달라져요.</p><h3>돌아온 날의 보고</h3>{!data.autonomy.reports.length?<p className="life-description">아직 오프라인 활동 보고가 없어요.</p>:data.autonomy.reports.map(report=><article className="life-report" key={report.id}><small>{new Date(report.startedAt).toLocaleString('ko-KR')}부터 · {Math.floor(report.result.creditedMs/60000)}분 정산</small><p>{report.result.reply}</p>{report.result.capped&&<p>최대 2시간까지만 정산했어요.</p>}<button className="secondary" disabled={pending||!!report.acknowledged} onClick={()=>onAcknowledge(report.id)}>{report.acknowledged?'확인한 보고':'보고 확인'}</button></article>)}</div>;
}
function RelationshipPanel({events,pending,onForget}){
  return <div><p className="life-description">실제로 있었던 특별한 순간만 기억해요. 현재 자아와 나에게만 보이고, 이후 대화에서도 참고해요. 잊은 추억은 자동으로 다시 만들지 않아요.</p>{!events.length?<p className="storage-empty">아직 기록된 추억이 없어요. 같이 낚시하거나 첫 수확과 요리를 해 보세요.</p>:events.map(event=><article className="life-report" key={event.id}><small>{new Date(event.timestamp).toLocaleString('ko-KR')}</small><p>{event.summary}</p><button className="text-button" disabled={pending} onClick={()=>onForget(event.id)}>추억에서 잊기</button></article>)}</div>;
}
const categories=[['all','전체'],['fish','물고기'],['ingredient','식재료'],['food','음식'],['decoration','가구·장식'],['other','기타']];
export function StoragePanel({data,onRetry,initialTab='storage',pending,connected,onAction,onConfigure,onAcknowledge,onForget}){
  const [tab,setTab]=useState(initialTab),[category,setCategory]=useState('all'),[selected,setSelected]=useState(null);
  useEffect(()=>setTab(initialTab),[initialTab]);
  if(!data?.catalog||!data?.garden)return <div className="panel-body"><p>마을 생활을 불러오고 있어요.</p><button className="secondary" onClick={onRetry}>다시 불러오기</button></div>;
  const bag=new Map(data.inventory.map(i=>[i.itemId,i.quantity])),discoveries=new Map(data.discoveries.map(i=>[i.itemId,i])),fish=data.catalog.filter(i=>i.category==='fish');
  const items=tab==='collection'?fish:data.catalog.filter(i=>(bag.get(i.itemId)||0)>0&&(category==='all'||i.category===category));
  const item=items.find(i=>i.itemId===selected)||items[0],known=item&&(tab!=='collection'||discoveries.has(item.itemId)),discovery=item&&discoveries.get(item.itemId),disabled=pending||!connected||!!data.task;
  return <div className="life-panel"><div className="life-tabs" role="tablist" aria-label="마을 생활">{[['storage','보관함'],['collection',`도감 ${discoveries.size}/${fish.length}`],['garden','텃밭'],['kitchen','요리'],['autonomy','AI 생활'],['memories','우리의 추억']].map(([id,name])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}>{name}</button>)}</div>
    {data.garden.lastResult&&<p className="life-result" role="status">{data.garden.lastResult.actor==='COMPANION'?'AI 동반자':'나'} · {data.garden.lastResult.result.reply}</p>}
    {data.task&&<p className="life-description">{data.task.label} 작업을 진행 중이에요. 마을 화면에서 중단할 수 있어요.</p>}
    {tab==='autonomy'?<AutonomyPanel data={data} pending={pending} onConfigure={onConfigure} onAcknowledge={onAcknowledge}/>:tab==='memories'?<RelationshipPanel events={data.relationshipMemories||[]} pending={pending} onForget={onForget}/>:tab==='garden'?<GardenPanel data={data} disabled={disabled} onAction={onAction}/>:tab==='kitchen'?<><p className="life-description">조리대로 이동해 음식 1개를 만들어요. 완료할 때 재료를 사용하고 보관함에 넣어요. 희귀·특별 물고기는 직접 선택한 경우에만 사용해요.</p><div className="recipe-grid">{RECIPES.map(r=><RecipeCard key={r.id} recipe={r} bag={bag} disabled={disabled} onAction={onAction}/>)}</div></>:<>
      <p className="life-description">낚시와 수확, 요리로 모은 아이템을 수량 제한과 유통기한 없이 보관해요.</p>
      {tab==='collection'&&<div className="collection-progress"><label htmlFor="fish-progress">도감 완성률 {Math.round(discoveries.size/fish.length*100)}%</label><progress id="fish-progress" value={discoveries.size} max={fish.length}/></div>}
      <div className="storage-layout">{tab==='storage'&&<nav className="storage-categories" aria-label="아이템 카테고리">{categories.map(([id,name])=><button key={id} aria-pressed={category===id} onClick={()=>setCategory(id)}>{name}</button>)}</nav>}
      <div className="storage-grid">{!items.length?<div className="storage-empty"><span>🧺</span><h3>아직 비어 있어요</h3><p>낚시하거나 텃밭을 수확하고, 재료로 요리해 보세요.</p></div>:items.map(i=>{const revealed=tab==='storage'||discoveries.has(i.itemId);return <button className={'storage-item rarity-'+i.rarity} key={i.itemId} aria-pressed={item?.itemId===i.itemId} aria-label={revealed?i.name:'미발견 물고기'} onClick={()=>setSelected(i.itemId)}><span className={revealed?'item-icon':'item-icon undiscovered'} aria-hidden="true">{i.icon}</span><strong>{revealed?i.name:'???'}</strong><small>{RARITIES[i.rarity]}{tab==='storage'?` · ${bag.get(i.itemId)}${i.unit}`:revealed?' · 발견':' · 미발견'}</small></button>;})}</div>
      {item&&<aside className="storage-detail"><span className={known?'detail-icon':'detail-icon undiscovered'} aria-hidden="true">{item.icon}</span><span className="life-eyebrow">{categories.find(([id])=>id===item.category)?.[1]} · {RARITIES[item.rarity]}</span><h3>{known?item.name:'아직 만나지 못한 친구'}</h3><p>{known?item.description:'낚시로 처음 만나면 발견 기록이 열려요.'}</p>{known&&<><dl><dt>보유 수량</dt><dd>{bag.get(item.itemId)||0}{item.unit}</dd>{item.category==='fish'&&<><dt>최초 발견</dt><dd>{discovery?new Date(discovery.discoveredAt).toLocaleString('ko-KR'):'—'}</dd><dt>처음 획득한 캐릭터</dt><dd>{discovery?.acquiredByName||'—'}</dd></>}</dl><p className="item-usage">{item.usage}</p>{['fish','ingredient'].includes(item.category)&&<button className="secondary" onClick={()=>setTab('kitchen')}>요리하기</button>}</>}</aside>}</div>
    </>}<p className="life-footnote">보관함과 텃밭은 계정의 모든 자아가 함께 사용해요.</p></div>;
}
