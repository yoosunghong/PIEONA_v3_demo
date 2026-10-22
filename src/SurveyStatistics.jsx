import React,{useCallback,useEffect,useRef,useState} from 'react';
import {BarChart3,RefreshCw,ShieldCheck} from 'lucide-react';
import {api} from './api';
import {surveyQuestions} from '../shared/survey.mjs';

const roleLabel={admin:'관리자',manager:'매니저',user:'일반 회원'};
const percent=(n,total)=>total?Math.round(n/total*1000)/10:0;

function Pages({data,onPage}){
  return data.pages>1&&<div className="survey-pages"><button className="secondary" disabled={data.page<=1} onClick={()=>onPage(data.page-1)}>이전</button><span>{data.page} / {data.pages} 페이지</span><button className="secondary" disabled={data.page>=data.pages} onClick={()=>onPage(data.page+1)}>다음</button></div>;
}

function Comments({question,total}){
  const [open,setOpen]=useState(false),[page,setPage]=useState(1),[data,setData]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();setData(null);setError('');
    api(`/survey/statistics/comments?question=${question}&page=${page}`,{signal:controller.signal}).then(setData).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[open,page,total,question,retry]);
  if(!total)return <p className="tiny">아직 작성된 의견이 없어요.</p>;
  return <div className="survey-comments"><button className="text-button" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'의견 접기':`익명 의견 ${total}개 보기`}</button>{open&&<>{error?<p role="alert">{error} <button className="secondary" onClick={()=>setRetry(n=>n+1)}>다시 시도</button></p>:!data?<p role="status">의견을 불러오는 중…</p>:<><ul>{data.comments.map((comment,i)=><li key={i}>{comment}</li>)}</ul><Pages data={data} onPage={setPage}/></>}</>}</div>;
}

function Managers({socket,notify}){
  const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(null),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setError('');setData(null);
    api(`/survey/managers?q=${encodeURIComponent(search)}&page=${page}`,{signal:controller.signal}).then(setData).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[search,page,revision]);
  useEffect(()=>{const reload=()=>setRevision(n=>n+1);socket?.on('survey:managers-changed',reload);socket?.on('connect',reload);return()=>{socket?.off('survey:managers-changed',reload);socket?.off('connect',reload);};},[socket]);
  async function change(user){
    setBusy(user.id);
    try{await api('/survey/managers/'+user.id,{method:'PATCH',body:{role:user.role==='manager'?'user':'manager'}});setRevision(n=>n+1);notify(user.role==='manager'?'매니저 권한을 회수했어요.':'매니저 권한을 부여했어요.');}catch(e){notify(e.message);}finally{setBusy(null);}
  }
  return <section className="survey-managers" aria-label="매니저 권한 관리"><h3><ShieldCheck size={19}/>매니저 권한 관리</h3><p className="tiny">매니저는 모든 익명 설문 통계와 의견을 조회할 수 있어요. 권한 부여와 회수는 관리자만 할 수 있어요.</p><form className="survey-account-search" onSubmit={e=>{e.preventDefault();setPage(1);setSearch(query.trim());setRevision(n=>n+1);}}><input aria-label="아이디 또는 닉네임 검색" placeholder="아이디 또는 닉네임 검색" maxLength={64} value={query} onChange={e=>setQuery(e.target.value)}/><button className="secondary">검색</button></form>
    {error?<p role="alert">{error} <button className="secondary" onClick={()=>setRevision(n=>n+1)}>다시 시도</button></p>:!data?<p role="status">계정을 불러오는 중…</p>:<><p className="tiny">검색된 계정 {data.total}개 · 아이디를 확인한 뒤 권한을 변경해 주세요.</p><ul className="survey-account-list">{data.users.map(user=><li key={user.id}><div><strong>{user.nickname||'닉네임 미설정'}</strong><small>@{user.username} · {roleLabel[user.role]}</small></div>{user.role==='admin'?<span className="survey-role">관리자</span>:<button className={user.role==='manager'?'secondary':'primary'} disabled={!!busy} onClick={()=>change(user)}>{busy===user.id?'변경 중…':user.role==='manager'?'권한 회수':'매니저 부여'}</button>}</li>)}</ul>{!data.users.length&&<p>검색 결과가 없어요.</p>}<Pages data={data} onPage={setPage}/></>}
  </section>;
}

export default function SurveyStatistics({role,socket,notify}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[updated,setUpdated]=useState(null),[view,setView]=useState('statistics');
  const request=useRef(0);
  const load=useCallback(async()=>{
    const sequence=++request.current;setLoading(true);
    try{const result=await api('/survey/statistics');if(sequence===request.current){setData(result);setError('');setUpdated(new Date());}}
    catch(e){if(sequence===request.current){setError(e.message);setData(null);}}
    finally{if(sequence===request.current)setLoading(false);}
  },[]);
  useEffect(()=>{
    load();const reload=()=>{if(!document.hidden)load();};
    socket?.on('survey:changed',reload);socket?.on('connect',reload);
    const timer=setInterval(reload,15000);document.addEventListener('visibilitychange',reload);
    return()=>{request.current++;clearInterval(timer);socket?.off('survey:changed',reload);socket?.off('connect',reload);document.removeEventListener('visibilitychange',reload);};
  },[socket,load]);
  return <div className="panel-body survey-statistics">{role==='admin'&&<div className="survey-statistics-tabs" role="group" aria-label="설문 관리 메뉴"><button className={view==='statistics'?'primary':'secondary'} aria-pressed={view==='statistics'} onClick={()=>setView('statistics')}>통계 보기</button><button className={view==='managers'?'primary':'secondary'} aria-pressed={view==='managers'} onClick={()=>setView('managers')}>매니저 관리</button></div>}{view==='statistics'&&<><div className="survey-statistics-toolbar"><p className="tiny" role="status">{loading?'통계를 불러오는 중…':updated?`${updated.toLocaleTimeString('ko-KR')} 기준 · 새 응답 자동 반영 · 15초마다 확인`:''}</p><button className="secondary" disabled={loading} onClick={load}><RefreshCw size={15}/>새로고침</button></div>
    {error&&<p className="form-error" role="alert">{error}</p>}{data&&<><div className="survey-summary"><BarChart3 size={30}/><div><span>설문 v{data.version} 수집 응답</span><strong>{data.total.toLocaleString()}<small>건</small></strong></div><p>익명 응답 기준<br/>문항별 분포와 자유 의견</p></div><p className="tiny">선택 비율은 해당 문항 응답자 수 기준이며 복수 선택 문항의 합계는 100%를 넘을 수 있어요. 평균은 미경험 응답을 제외한 5점 척도예요. 의견은 제출 순서와 무관하게 표시해요.</p>{data.legacyTotal>0&&<p className="tiny">이전 설문 버전의 응답 {data.legacyTotal}건은 문항이 달라 현재 통계에서 제외했어요.</p>}{data.total===0&&<p className="survey-stats-empty">아직 제출된 설문이 없어요. 응답이 들어오면 이 화면에 자동으로 표시돼요.</p>}
    <div className="survey-statistics-questions">{surveyQuestions.map(q=>{
      const stats=data.questions.find(item=>item.id===q.id);
      return <section key={q.id} className="survey-statistics-question"><h3>{q.id.toUpperCase()}. {q.title}</h3><p className="tiny">응답 {stats.answered}명{q.type==='multi'?' · 복수 선택':''}{q.type==='rating'?` · 평균 ${stats.average===null?'—':stats.average.toFixed(2)+' / 5'} · 평가 ${stats.rated}명`:''}</p>
        {stats.counts&&<ul className="survey-distribution">{stats.counts.map((count,i)=>{const ratio=percent(count,stats.answered);return <li key={i}><div><span>{q.type==='rating'?`${i+1}점`:q.options[i]}</span><strong>{count}명 ({ratio}%)</strong></div><div className="survey-stat-bar" aria-hidden="true"><span style={{width:ratio+'%'}}/></div></li>;})}</ul>}
        {q.unexperienced&&<p className="tiny">아직 경험하지 않았어요: {stats.unexperienced}명 ({percent(stats.unexperienced,stats.answered)}%)</p>}
        {q.type!=='rating'&&<Comments question={q.id} total={q.type==='text'?stats.answered:stats.otherCount}/>}
      </section>;
    })}</div></>}</>}{role==='admin'&&view==='managers'&&<Managers socket={socket} notify={notify}/>}</div>;
}
