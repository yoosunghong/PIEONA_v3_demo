import React,{useEffect,useState} from 'react';
import {api} from './api';
import {TRAITS} from '../shared/personaScripts.mjs';
import './persona-scripts.css';

const names={sociability:'사교성',kindness:'다정함',curiosity:'호기심',playfulness:'장난기',sensitivity:'감수성',activity:'활동 선호'};
export default function PersonaUpdate({notify=()=>{},onApplied=()=>{}}){
 const [data,setData]=useState(null),[proposal,setProposal]=useState(null),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[consent,setConsent]=useState(false);
 const load=()=>api('/me/pss').then(setData);
 useEffect(()=>{let alive=true;api('/me/pss').then(d=>{if(alive)setData(d);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);
 async function run(action){setBusy(true);setError('');try{await action();}catch(e){setError(e.message);}finally{setBusy(false);}}
 const body=proposal?{proposalId:proposal.proposalId}:null;
 return <section className="pss-update panel-body" aria-busy={busy}>
  <p>대화에서 자란 성향을 검토하고, 생활 활동에 사용할 짧은 대사를 준비해요. 활동 중에는 AI를 호출하지 않아요.</p>
  {error&&<p role="alert" className="form-error">{error}</p>}
  {data&&<><p>현재 성향 버전 {data.version} · 대사 버전 {data.version} {data.provider&&`· ${data.provider}`}</p>
   <table><thead><tr><th>성향</th><th>변경 전</th><th>제안</th></tr></thead><tbody>{TRAITS.map(key=><tr key={key}><th>{names[key]}</th><td>{Math.round(data.persona[key]*100)}</td><td>{proposal?Math.round(proposal.persona[key]*100):'—'}</td></tr>)}<tr><th>말투</th><td>{data.persona.speechStyle}</td><td>{proposal?.persona.speechStyle||'—'}</td></tr><tr><th>취향</th><td>{data.persona.preferences.join(', ')||'—'}</td><td>{proposal?.persona.preferences.join(', ')||'—'}</td></tr></tbody></table>
   {!proposal&&<><label className="pss-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>현재 자아의 내 대화 최근 40개와 기억 최대 30개를 Google Gemini로 보내 성향을 분석하는 데 동의해요.</label><button className="primary" disabled={busy||!consent} onClick={()=>run(async()=>setProposal(await api('/me/pss/propose',{method:'POST',body:{consent:true}})))}>대화로 성향 분석</button></>}
   {proposal&&<><h3>변경 제안</h3><p>{proposal.summary}</p><p className="tiny">사용한 근거 {proposal.evidenceIds.length}개 · 승인 후에도 대사를 검토한 뒤 적용할 수 있어요.</p>
    {!preview&&<button className="primary" disabled={busy} onClick={()=>run(async()=>setPreview(await api('/me/pss/generate',{method:'POST',body})))}>성향 승인 · 대사 생성</button>}
    {preview&&<><h3>이벤트 대사 비교</h3><p>검증 완료 · {preview.provider} · {preview.after.events.length*3}개 대사</p>{preview.after.events.map(e=><article key={e.eventId}><h4>{e.eventId}</h4><div className="pss-comparison"><div><strong>기존</strong>{preview.before.events.find(old=>old.eventId===e.eventId)?.variants.map(v=><p key={v.id}>{v.text}</p>)||<p>아직 없음</p>}</div><div><strong>업데이트</strong>{e.variants.map(v=><p key={v.id}>{v.text}</p>)}</div></div></article>)}<button className="primary" disabled={busy} onClick={()=>run(async()=>{await api('/me/pss/apply',{method:'POST',body});setProposal(null);setPreview(null);await load();await onApplied();notify('검증된 새 성향과 대사를 적용했어요.');})}>검증된 버전 적용</button></>}
    <button className="secondary" disabled={busy} onClick={()=>run(async()=>{await api('/me/pss/cancel',{method:'POST',body});setProposal(null);setPreview(null);})}>제안 취소</button>
   </>}
   {busy&&<p role="status">분석·생성 또는 저장 중이에요…</p>}
   {data.versions.length>1&&<details><summary>이전 버전 복구</summary>{data.versions.filter(v=>v.version!==data.version).map(v=><button className="secondary" key={v.version} disabled={busy||!!proposal} onClick={()=>run(async()=>{await api('/me/pss/rollback',{method:'POST',body:{version:v.version}});await load();await onApplied();})}>성향·대사 v{v.version} 복구</button>)}</details>}
   <details><summary>지원 이벤트 {data.registry.filter(e=>e.active).length}개 / 미지원 {data.registry.filter(e=>!e.active).length}개</summary>{data.registry.map(e=><p key={e.id}><code>{e.id}</code> · {e.active?'지원':e.reason}</p>)}</details>
  </>}
 </section>;
}
