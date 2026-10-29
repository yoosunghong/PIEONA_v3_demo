import React,{useEffect,useState} from 'react';
import {Footprints,Trophy,ArrowLeft,Check,Users,UserRound,Search,House,ChevronDown,PartyPopper,Sparkles,Clock3,Gamepad2,Keyboard,MessagesSquare,Shell,Volleyball as VolleyIcon} from 'lucide-react';
import {api,dateLabel} from './api';
import WordGames from './WordGames';
import Runner from './Runner';
import CrabChase from './CrabChase';
import Volleyball from './Volleyball';
import {useBackgroundMusic} from './BackgroundMusic';
import {RUN_DISTANCE} from '../shared/runner.mjs';
import {maxGamePlayers} from '../shared/multiplayer.mjs';
import AvatarPortrait from './AvatarPortrait';
import './game-hub.css';

export function Records({target,notify,revision=0,socket}){
  const[liveRevision,setLiveRevision]=useState(0);
  useEffect(()=>{const update=data=>{if(data.villageId===target.id)setLiveRevision(r=>r+1);};socket?.on('games:changed',update);return()=>socket?.off('games:changed',update);},[socket,target.id]);
  const[kind,setKind]=useState('runner'),[records,setRecords]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{let active=true;setLoading(true);setError('');api(`/villages/${target.id}/records?kind=${kind}`).then(r=>{if(active)setRecords(r.records);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[target.id,kind,revision,liveRevision]);
  return <div className="village-records"><h3><Trophy size={19}/>{target.nickname}의 별 기록</h3><p className="tiny">이 별에서 완료한 플레이의 상위 30개 기록이에요. 보상 여부와 관계없이 남아요.</p><div className="tab-row"><button className={kind==='runner'?'active':''} onClick={()=>setKind('runner')}>구름 달리기</button><button className={kind==='volley'?'active':''} onClick={()=>setKind('volley')}>몽글 배구</button><button className={kind==='crab'?'active':''} onClick={()=>setKind('crab')}>게 게 게</button></div>{loading?<p role="status">기록을 불러오는 중…</p>:error?<p role="alert">{error}</p>:records.length?<ol className="record-list">{records.map((r,i)=><li key={i} className={r.isMe?'my-record':''}><span className="record-rank">{r.rank}</span><div><strong>{r.nickname}{r.isMe?' · 나':''}</strong><small>{dateLabel(r.playedAt)}{kind==='crab'&&Number.isFinite(r.seconds)?` · ${r.seconds.toFixed(1)}초 생존`:''}</small></div><b>{r.score.toLocaleString()}<small> 점</small></b></li>)}</ol>:<div className="empty"><Trophy/><p>아직 기록이 없어요.<br/>이 별의 첫 기록을 남겨보세요!</p></div>}</div>;
}
const GAMES = [
  {id:'volley',title:'몽글 배구',description:'점프와 스파이크로 즐기는 해변 배구!',cardDescription:<>작은 점프, 짜릿한 한 방!<br/>AI 또는 친구와 해변 한 판.</>,image:'/images/minigames/mongle-volley.svg',alt:'해변에서 네트를 사이에 두고 배구하는 노란 새싹과 보라색 새싹',category:'스포츠',players:'1–2명',detail:'7점 선승 · 이동 / 점프 / 스파이크',Icon:VolleyIcon},
  {id:'crab',title:'게 게 게',description:'해변의 게 행렬을 피해 오래 살아남으세요!',cardDescription:<>뒤를 조심해요! 끝없이<br/>길어지는 게들의 추격전.</>,image:'/images/minigames/crab-paradise.webp',alt:'햇살 가득한 해변에서 줄지어 달려오는 귀여운 게들',category:'생존',players:`1–${maxGamePlayers('crab')}명`,detail:'탑뷰 해변 · WASD / 방향키 / 터치',Icon:Shell},
  {id:'runner',title:'구름 달리기',description:'하늘을 달리며 결승선을 향해 달려요!',cardDescription:<>하늘을 달리며 결승선을<br/>향해 달려요!</>,image:'/images/minigames/cloud-run-card.webp',alt:'구름 위 정원에서 함께 달리는 두 친구',category:'달리기',players:`1–${maxGamePlayers('runner')}명`,detail:`${RUN_DISTANCE.toLocaleString()}m 하늘섬 레이스`,Icon:Footprints},
  {id:'typing',title:'타자입력 게임',cardDescription:<>단어마다 반짝이는 별!<br/>60초 한 판, 빠르고 정확하게!</>,category:'말놀이',players:'다수 · 인원 제한 없음',Icon:Keyboard},
  {id:'wordchain',title:'끝말잇기 게임',cardDescription:<>동그랗게 모여 이어가는<br/>친구와의 우리말 놀이.</>,category:'말놀이',players:'다수 · 인원 제한 없음',Icon:MessagesSquare},
];

export default function GameHub({target,me,notify,onReward,anonymous,socket,members=[],race,onLeaveRace}){
  const [wordKind,setWordKind]=useState(null);
  const [game,setGame]=useState(null),[selected,setSelected]=useState(null),[category,setCategory]=useState('all');
  const {setTrack}=useBackgroundMusic();
  const musicKind=wordKind||(race?.kind||game);
  useEffect(()=>{
    setTrack(['typing','wordchain','crab','volley'].includes(musicKind)?'/audio/minigame2.mp3':'/audio/S_Vilage_v2.mp3');
    return()=>setTrack('/audio/S_Vilage_v2.mp3');
  },[musicKind,setTrack]);
  const [multiplayer,setMultiplayer]=useState(true),[selectedFriends,setSelectedFriends]=useState([]),[inviteProgress,setInviteProgress]=useState(null);
  const [pending,setPending]=useState(null),[sending,setSending]=useState(false),[hideName,setHideName]=useState(!!anonymous);
  const [query,setQuery]=useState(''),[sort,setSort]=useState('available'),[showRecords,setShowRecords]=useState(false),[revision,setRevision]=useState(0);
  const [connected,setConnected]=useState(!!socket?.connected);
  const [soloReplay,setSoloReplay]=useState(null);
  const selectedGame=GAMES.find(item=>item.id===selected),GameIcon=selectedGame?.Icon;
  const neighbors=members.filter(member=>member.userId!==me.id&&(!member.actorKind||member.actorKind==='PLAYER'));
  const friendLimit=maxGamePlayers(selected)-1;
  const chosenFriends=neighbors.filter(member=>selectedFriends.includes(member.userId)&&!member.runnerBusy);
  const visibleFriends=neighbors.filter(member=>(member.nickname||'새싹').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>sort==='name'?(a.nickname||'').localeCompare(b.nickname||'','ko'):Number(a.runnerBusy)-Number(b.runnerBusy)||(a.nickname||'').localeCompare(b.nickname||'','ko'));

  useEffect(()=>{
    const ended=data=>setPending(value=>value===data.id?null:value);
    const progress=data=>setInviteProgress(data);
    const online=()=>setConnected(true),offline=()=>{setConnected(false);setSending(false);setPending(null);};
    socket?.on('runner:invite-ended',ended);socket?.on('runner:invite-progress',progress);socket?.on('connect',online);socket?.on('disconnect',offline);
    return()=>{socket?.off('runner:invite-ended',ended);socket?.off('runner:invite-progress',progress);socket?.off('connect',online);socket?.off('disconnect',offline);};
  },[socket]);
  useEffect(()=>{setGame(race?(race.kind||'runner'):(soloReplay?.kind||null));if(race)setPending(null);},[race?.id]);
  useEffect(()=>{const update=()=>setRevision(value=>value+1);socket?.on('games:changed',update);return()=>socket?.off('games:changed',update);},[socket]);
  useEffect(()=>()=>{if(pending)socket?.emit('runner:cancel-invite',{id:pending});},[pending,socket]);
  useEffect(()=>{setSelectedFriends(current=>{const next=current.filter(id=>neighbors.some(p=>p.userId===id&&!p.runnerBusy)).slice(0,friendLimit);return next.length===current.length?current:next;});},[members,friendLimit,me.id]);

  function cancelInvite(){if(pending)socket?.emit('runner:cancel-invite',{id:pending});setPending(null);}
  function selectGame(id){cancelInvite();if(id==='typing'||id==='wordchain'){setWordKind(id);return;}setSelected(id);setSelectedFriends(current=>current.slice(0,maxGamePlayers(id)-1));setMultiplayer(true);}
  function changeMode(together){cancelInvite();setMultiplayer(together);}
  function createRoom(){
    if(!selectedGame)return;
    if(!multiplayer){setSoloReplay(null);setGame(selected);return;}
    if(!chosenFriends.length||!socket?.connected||sending||pending)return;
    setSending(true);setInviteProgress(null);
    socket.timeout(5000).emit('runner:invite',{userIds:chosenFriends.map(p=>p.userId),anonymous:hideName,kind:selected},(err,result)=>{
      setSending(false);
      if(err||!result?.ok)notify(result?.error||'연결을 확인해주세요.');
      else setPending(result.id);
    });
  }
  function back(){cancelInvite();setSoloReplay(null);if(race)onLeaveRace();setGame(null);setSelected(null);setCategory('all');}
  function replaySolo(){const kind=race?.kind||game;setSoloReplay({kind,key:Date.now()});if(race)onLeaveRace();setGame(kind);}
  const reward=()=>{onReward();setRevision(value=>value+1);};
  const gameKey=race?.id||soloReplay?.key||'solo',replayProps={autoStart:!race&&!!soloReplay,onSoloReplay:replaySolo};
  if(wordKind)return <WordGames initialKind={wordKind} target={target} me={me} socket={socket} members={members} notify={notify} onBack={()=>{setWordKind(null);setSelected(null);setCategory('all');}} onReward={reward}/>;
  if(game||race)return <><div className="game-back"><button className="text-button" onClick={back}><ArrowLeft size={16}/>게임 목록으로</button></div>{(game==='volley'||race?.kind==='volley')?<Volleyball key={gameKey} {...replayProps} onHome={back} target={target} me={me} notify={notify} onReward={reward} anonymous={hideName} socket={socket} race={race}/>: (game==='crab'||race?.kind==='crab')?<CrabChase key={gameKey} {...replayProps} onHome={back} target={target} me={me} notify={notify} onReward={reward} anonymous={hideName} socket={socket} race={race}/>:<Runner key={gameKey} {...replayProps} target={target} me={me} notify={notify} onReward={reward} anonymous={hideName} socket={socket} race={race}/>}</>;

  return <div className="panel-body game-hub">
    <section className="playground-catalog" aria-label="미니게임 선택">
      <nav className="playground-categories" aria-label="게임 종류">
        {[['all','전체',Gamepad2],['runner','달리기',Footprints],['crab','생존',Shell],['volley','스포츠',VolleyIcon],['words','말놀이',MessagesSquare]].map(([id,label,Icon])=><button key={id} aria-pressed={category===id} className={category===id?'active':''} disabled={sending||!!pending} onClick={()=>setCategory(id)}>{id!=='all'&&<Icon size={22}/>}<span>{label}</span></button>)}
        <span className="playground-game-count">{GAMES.length}개의 작은 즐거움</span>
      </nav>
      <div className="playground-cards">
        {GAMES.filter(item=>category==='all'||item.id===category||(category==='words'&&item.category==='말놀이')).map(item=><button key={item.id} className={'playground-card '+(selected===item.id?'selected':'')} aria-pressed={selected===item.id} disabled={sending||!!pending} onClick={()=>selectGame(item.id)}>
          <div className={'playground-card-art'+(!item.image?' playground-word-art '+item.id:'')}>{item.image?<img src={item.image} alt={item.alt}/>:<item.Icon size={72} aria-hidden="true"/>}{selected===item.id&&<span className="playground-check"><Check size={24}/></span>}</div>
          <div className="playground-card-copy"><h3>{item.title}</h3><p>{item.cardDescription}</p><div className="playground-tags"><span><item.Icon size={19}/>{item.category}</span><span><UserRound size={17}/>{item.players}</span></div></div>
        </button>)}
      </div>
      <div className="playground-catalog-note"><Sparkles size={22}/><div><strong>작은 플레이, 함께 쌓이는 추억</strong><p>마음에 드는 게임을 고르고, 우리 별에서 놀아봐요.</p></div></div>
      <button className="playground-records-link" aria-expanded={showRecords} onClick={()=>setShowRecords(value=>!value)}><Trophy size={17}/>{target.nickname}의 별 기록 보기<ChevronDown size={16} className={showRecords?'expanded':''}/></button>
      {showRecords&&<Records target={target} socket={socket} notify={notify} revision={revision}/>}
    </section>

    <section className="playground-room" aria-label="미니게임 방 만들기">
      {selectedGame?<>
      <h3 className="playground-step"><span>1</span>선택한 게임</h3>
      <div className="playground-selected-game"><img src={selectedGame.image} alt=""/><div><h3>{selectedGame.title}</h3><p>{selectedGame.description}</p><div className="playground-tags"><span><GameIcon size={19}/>{selectedGame.category}</span><span><UserRound size={17}/>{selectedGame.players}</span></div></div></div>
      <div className="playground-invite-heading"><h3 className="playground-step"><span>2</span>초대할 친구 선택</h3><small><House size={15}/>같은 별에 있는 친구만 초대할 수 있어요!</small></div>
      <div className="playground-modes">
        <button className={multiplayer?'selected':''} aria-pressed={multiplayer} disabled={sending||!!pending} onClick={()=>changeMode(true)}><span className="playground-mode-icon"><Users size={28}/></span><span><strong>친구와 함께 플레이</strong><small>별 친구를 초대해요!</small></span>{multiplayer&&<span className="playground-check"><Check size={17}/></span>}</button>
        <button className={!multiplayer?'selected':''} aria-pressed={!multiplayer} disabled={sending||!!pending} onClick={()=>changeMode(false)}><span className="playground-mode-icon"><UserRound size={27}/></span><span><strong>혼자 플레이</strong><small>{selected==='volley'?'몽글 AI와 대결해요!':'솔로로 즐길게요!'}</small></span>{!multiplayer&&<span className="playground-check"><Check size={17}/></span>}</button>
      </div>
      <div className="playground-friends-area">
        {multiplayer?<>
          <div className="playground-friend-tools"><label className="playground-search"><Search size={19}/><input aria-label="별 친구 검색" placeholder="별 친구 검색하기..." value={query} onChange={event=>setQuery(event.target.value)}/></label><div className="playground-sort"><select aria-label="친구 정렬" value={sort} onChange={event=>setSort(event.target.value)}><option value="available">접속 중 우선</option><option value="name">이름순</option></select><ChevronDown size={14}/></div></div>
          <div className="playground-friend-list" aria-label="초대할 별 친구">
            {!connected?<div className="playground-empty" role="status"><House size={28}/><strong>별에 다시 연결하고 있어요</strong><p>연결되면 함께할 친구를 보여드릴게요.</p></div>:visibleFriends.length?visibleFriends.map(member=><label key={member.userId} className={'playground-friend '+(selectedFriends.includes(member.userId)?'selected':'')+(member.runnerBusy?' busy':'')}><input type="checkbox" aria-label={`${member.nickname||'새싹'} 초대 선택`} checked={selectedFriends.includes(member.userId)} disabled={member.runnerBusy||sending||!!pending||(!selectedFriends.includes(member.userId)&&chosenFriends.length>=friendLimit)} onChange={event=>setSelectedFriends(current=>event.target.checked?(friendLimit===1?[member.userId]:[...current,member.userId].slice(0,friendLimit)):current.filter(id=>id!==member.userId))}/><AvatarPortrait user={member}/><strong>{member.nickname||'새싹'}</strong><span className="playground-presence"><i/>{member.runnerBusy?'게임 중':'접속 중'}</span><span className="playground-friend-message">{member.runnerBusy?'다음 판에 함께해요!':selected==='volley'?'배구 한 판 할까요?':selected==='crab'?'같이 도망쳐볼까요?':'같이 달려볼까요?'}<Footprints size={14}/></span></label>):<div className="playground-empty" role="status"><Users size={30}/><strong>{query?'검색한 친구가 없어요':'함께할 친구를 기다리고 있어요'}</strong><p>{query?'다른 이름으로 검색해 보세요.':'이 별에 친구가 방문하면 여기에서 초대할 수 있어요.'}</p>{!query&&<button onClick={()=>changeMode(false)}>먼저 혼자 놀아볼까요? →</button>}</div>}
          </div>
        </>:<div className="playground-solo"><span><selectedGame.Icon size={34}/></span><strong>나만의 작은 도전, 준비됐나요?</strong><p>{selected==='volley'?'공의 움직임을 따라오는 몽글 AI와 7점 선승 배구를 즐겨요.':selected==='crab'?'순찰하는 게와 내 뒤의 행렬을 피해 생존 기록에 도전해요.':'구름 위 트랙을 달리며 반짝이는 씨앗을 모아요.'}</p><small><Clock3 size={15}/>{selectedGame.detail}</small></div>}
      </div>
      <div className="playground-room-footer">
        <label className="playground-anonymous"><input type="checkbox" checked={hideName} disabled={sending||!!pending} onChange={event=>setHideName(event.target.checked)}/>게임 기록에 내 이름 대신 익명으로 표시</label>
        {pending?<div className="playground-pending" role="status"><span><span className="spinner"/>친구들의 수락을 기다리고 있어요… {inviteProgress?.id===pending?`${inviteProgress.accepted}/${inviteProgress.total}명 수락`:''}</span><button onClick={cancelInvite}>초대 취소</button></div>:<button className="playground-create" disabled={sending||(multiplayer&&(!chosenFriends.length||!connected))} onClick={createRoom}><PartyPopper size={28}/>{sending?'친구를 초대하고 있어요…':'이 방 만들기'}</button>}
        <p className="playground-start-hint" role="status">{pending?'초대한 친구들이 모두 수락하면 준비 화면으로 이동해요.':multiplayer?chosenFriends.length?`친구 ${chosenFriends.length}명과 총 ${chosenFriends.length+1}명이 함께해요.`:`함께할 친구를 최대 ${friendLimit}명 선택해 주세요.`:'방을 만들면 게임 준비 화면으로 이동해요.'}</p>
      </div>
      </>:<div className="playground-empty playground-choose-game"><Gamepad2 size={48}/><h3>어떤 게임으로 놀아볼까요?</h3><p>게임 목록에서 마음에 드는 게임을 선택해 주세요.</p><small>혼자 도전하거나 별 친구와 함께 즐겨요!</small></div>}
    </section>
  </div>;
}
