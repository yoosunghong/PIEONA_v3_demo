import React,{useEffect,useState} from 'react';
import {Music2,Footprints,Trophy,ArrowLeft} from 'lucide-react';
import {api,dateLabel} from './api';
import Rhythm from './Rhythm';
import Runner from './Runner';

export function Records({target,notify,revision=0,socket}){
  const[liveRevision,setLiveRevision]=useState(0);
  useEffect(()=>{const update=data=>{if(data.villageId===target.id)setLiveRevision(r=>r+1);};socket?.on('games:changed',update);return()=>socket?.off('games:changed',update);},[socket,target.id]);
  const[kind,setKind]=useState('rhythm'),[records,setRecords]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{let active=true;setLoading(true);setError('');api(`/villages/${target.id}/records?kind=${kind}`).then(r=>{if(active)setRecords(r.records);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[target.id,kind,revision,liveRevision]);
  return <div className="village-records"><h3><Trophy size={19}/>{target.nickname}의 마을 기록</h3><p className="tiny">이 마을에서 완료한 플레이의 상위 30개 기록이에요. 보상 여부와 관계없이 남아요.</p><div className="tab-row"><button className={kind==='rhythm'?'active':''} onClick={()=>setKind('rhythm')}>별빛 리듬</button><button className={kind==='runner'?'active':''} onClick={()=>setKind('runner')}>구름 달리기</button></div>{loading?<p role="status">기록을 불러오는 중…</p>:error?<p role="alert">{error}</p>:records.length?<ol className="record-list">{records.map((r,i)=><li key={i} className={r.isMe?'my-record':''}><span className="record-rank">{r.rank}</span><div><strong>{r.nickname}{r.isMe?' · 나':''}</strong><small>{dateLabel(r.playedAt)}</small></div><b>{r.score.toLocaleString()}<small> 점</small></b></li>)}</ol>:<div className="empty"><Trophy/><p>아직 기록이 없어요.<br/>이 마을의 첫 기록을 남겨보세요!</p></div>}</div>;
}
export default function GameHub({target,me,notify,onReward,anonymous,socket}){
  const[game,setGame]=useState(null),[revision,setRevision]=useState(0),[hideName,setHideName]=useState(anonymous);
  useEffect(()=>{const update=()=>setRevision(r=>r+1);socket?.on('games:changed',update);return()=>socket?.off('games:changed',update);},[socket]);
  const reward=()=>{onReward();setRevision(r=>r+1);};
  if(game)return <><div className="game-back"><button className="text-button" onClick={()=>setGame(null)}><ArrowLeft size={16}/>게임 목록과 기록으로</button></div>{game==='rhythm'?<Rhythm target={target} notify={notify} onReward={reward} anonymous={hideName}/>:<Runner target={target} me={me} notify={notify} onReward={reward} anonymous={hideName}/>}</>;
  return <div className="panel-body game-hub"><p className="muted">{target.nickname}의 마을에서 함께 놀아요. 두 게임의 기록은 이 마을을 방문하는 이웃에게 공개돼요.</p><label className="check-row"><input type="checkbox" checked={hideName} onChange={e=>setHideName(e.target.checked)}/><span>이번 게임 기록에 이름 대신 익명으로 표시</span></label><div className="game-cards"><button onClick={()=>setGame('rhythm')}><Music2 size={28}/><span className="eyebrow">STARLIGHT RHYTHM</span><h3>별빛 리듬</h3><p>음표를 따라 카페에 리듬을 채워요.</p><small>D · F · J · K / 터치 · 30초</small><strong>연주하러 가기 ↗</strong></button><button onClick={()=>setGame('runner')}><Footprints size={28}/><span className="eyebrow">CLOUD RUN</span><h3>구름 달리기</h3><p>나의 3D 캐릭터로 달리고, 점프하고!</p><small>← → / A · D · 스페이스 / 터치 · 45초</small><strong>달리러 가기 ↗</strong></button></div><Records target={target} notify={notify} revision={revision}/></div>;
}
