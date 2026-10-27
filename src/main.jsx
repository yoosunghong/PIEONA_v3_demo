import FishingDuel from './FishingDuel';
import PersonaUpdate from './PersonaUpdate';
import PersonaDialogue from './PersonaDialogue';
import Chalkboard,{useChalkboard} from './Chalkboard';
import {topicTurnDelay} from '../shared/topic.mjs';
import './topic.css';
import React,{useState,useEffect,useCallback,useRef,Suspense,lazy}from'react';
const Exploration=lazy(()=>import('./Exploration'));
import{createRoot}from'react-dom/client';
import{io}from'socket.io-client';
import{Flower2,Home,Map as MapIcon,BookOpen,Users,Settings,Sparkles,ArrowUp,ArrowUpRight,ChevronRight,ChevronLeft,ChevronDown,ChevronUp,Search,MessageCircle,Heart,Coins,LogOut,Mic,MicOff,Volume2,VolumeX,Sun,Moon,Leaf,ShieldCheck,Coffee,Plus,SlidersHorizontal,Send,Check,Gamepad2,Compass,Radio,Lock,Globe,Star,X,Paintbrush,Shirt,Trophy,Camera,HelpCircle,UserPlus,PanelRightClose,PanelRightOpen,Footprints,BarChart3}from'lucide-react';
import Scene from'./Scene';
import {useLife,FishingStatus} from './Life';
import NotificationBell from './NotificationBell';
import AvatarPortrait from './AvatarPortrait';
import Tutorial from './Tutorial';
import Onboarding from './Onboarding';
import Survey,{SurveyInvitation} from './Survey';
import {SurveyRewards,SurveyRewardHint} from './SurveyRewards';
import SurveyStatistics from './SurveyStatistics';
import StageCapture from './StageCapture';
import {newCapture} from './captureModel.mjs';
import {villageThemes} from '../shared/world.mjs';
import{api,levelLabel,themes,dateLabel}from'./api';
import {loadAppSnapshot,applyPresence} from './appSnapshot.mjs';
import{Modal,AvatarBadge,MemoryPanel,SettingsPanel,LogsPanel,SocialPanel,SlotsPanel}from'./Panels';
import GameHub,{Records} from './GameHub';
import AvatarCards from './AvatarCards';
import VillagePolls,{useVillagePolls} from './VillagePolls';
import {cardTier} from '../shared/avatarCards.mjs';
import Customization from './Customization';
import VillageEditor from './VillageEditor';
import WorldStage from './WorldStage';
import LifeStudio from './LifeStudio';
import {isLifeFocus} from './lifeFocus.mjs';
import SignEditor from './SignEditor';
import Guestbook from './Guestbook';
import {villageSign} from '../shared/sign.mjs';
import ChatSessions from './ChatSessions';
import {MusicProvider,MusicControls,useBackgroundMusic} from './BackgroundMusic';
import'./style.css';
import'./theme.css';
import'./typography.css';
import './world-play.css';
import './visibility.css';
import './home.css';
import './tutorial.css';
import './improvements.css';
import './memory.css';
import './capture.css';
import './survey-statistics.css';
import './illova-ui.css';
import './exploration-entry.css';
import './avatar-progress.css';
import './mobile-village.css';
import './fold-layout.css';
import './world-welcome.css';
import './responsive.css';
import './compact-layout.css';
import {villageView,demoVillageView,createDemoVillageRequest} from './explorationNavigation.mjs';

const introLines=['나의 이야기로,','또 다른 내가 피어나는 곳.'];
function Auth({onLogin,notify}){
  const[tab,setTab]=useState('login'),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(e){e.preventDefault();setBusy(true);setError('');try{const r=await api('/auth/'+(tab==='login'?'login':'register'),{method:'POST',body:{username,password}});onLogin(r.user);}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <main className="auth-page"><div className="auth-music-controls"><MusicControls/></div><div className="auth-world"><Scene emotion="happy"/><div className="auth-shade"/><div className="brand auth-brand"><Flower2/><span>ILLOVA</span></div><div className="auth-story"><span className="eyebrow">WHERE YOUR STORY BLOOMS</span><h1>{introLines[0]}<br/>{introLines[1]}</h1><p>조금씩 나를 닮아가는 아바타,<br/>그리고 우리의 이야기가 만나는 작은 정원.</p><div className="auth-tags"><span><Leaf size={14}/>나를 닮는 AI</span><span><MessageCircle size={14}/>부담 없는 인연</span><span><MapIcon size={14}/>나만의 3D 마을</span></div></div><span className="auth-caption">YOUR OWN LITTLE WORLD, WAITING TO BLOOM.</span></div><div className="auth-form-side"><div className="auth-form"><span className="small-flower"><Flower2 size={26}/></span><span className="eyebrow">A NEW CONNECTION BEGINS</span><h2>{tab==='login'?'다시 만나서 반가워요':'우리의 첫 이야기를 시작해요'}</h2><p className="muted">{tab==='login'?'당신의 작은 세상이 기다리고 있어요.':'작은 씨앗 하나가 당신을 닮아갈 거예요.'}</p><div className="tab-row"><button className={tab==='login'?'active':''} onClick={()=>{setTab('login');setError('');}}>로그인</button><button className={tab==='register'?'active':''} onClick={()=>{setTab('register');setError('');}}>계정 만들기</button></div><form onSubmit={submit}><label>아이디<input name="username" autoComplete="username" required pattern="[a-zA-Z0-9_]{3,24}" minLength={3} maxLength={24} placeholder="영문, 숫자, 밑줄 · 3~24자" value={username} onChange={e=>setUsername(e.target.value)}/></label><label>비밀번호<input name="password" autoComplete={tab==='login'?'current-password':'new-password'} type="password" required minLength={8} maxLength={128} placeholder="8자 이상의 비밀번호" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary full auth-submit" disabled={busy}>{busy?'정원 문을 여는 중…':tab==='login'?'내 정원으로 들어가기':'나의 씨앗 심기'}<ArrowUpRight size={17}/></button></form><div className="auth-game-guide"><strong>ILLOVA에서 무엇을 하나요?</strong><p>AI 아바타와 대화하며 나를 닮은 기억을 키워요. 마을과 캐릭터를 꾸미고, 이웃을 방문해 리듬게임과 구름 달리기 기록에 도전해 보세요.</p></div><a className="exploration-demo-link" href="/explore?depart=1"><Compass size={17}/> 초록 숲 먼저 둘러보기 <ArrowUpRight size={15}/></a><div className="auth-note"><ShieldCheck size={16}/><p>기억의 공개 범위는 내가 정해요.<br/>모든 프로토타입 기능을 무료로 경험하세요.</p></div><span className="auth-version">PLAYTEST 01 <span>·</span> AI AVATAR SOCIAL SANDBOX</span></div></div></main>;
}


function App({demoVillage=false}){
  const [appRequest]=useState(()=>demoVillage?createDemoVillageRequest(window.localStorage):api);
  // Track the visible area as mobile browser chrome and the keyboard open/close.
  useEffect(()=>{
    const viewport=window.visualViewport;
    const update=()=>{
      document.documentElement.style.setProperty('--app-height',`${viewport?.height??window.innerHeight}px`);
    };
    update();viewport?.addEventListener('resize',update);window.addEventListener('resize',update);
    return()=>{viewport?.removeEventListener('resize',update);window.removeEventListener('resize',update);document.documentElement.style.removeProperty('--app-height');};
  },[]);
  const {setDucked}=useBackgroundMusic();
  const [arrivalQuestion,setArrivalQuestion]=useState(null),[chatFocus,setChatFocus]=useState(0);
  const questionArrival=useRef(0);
  const[me,setMe]=useState(null),[loading,setLoading]=useState(true),[users,setUsers]=useState([]),[villageMembers,setVillageMembers]=useState([]),[villageGarden,setVillageGarden]=useState(null),[ai,setAi]=useState('local'),[connected,setConnected]=useState(false),[mode,setMode]=useState(()=>villageView(location.search)?'village':'home'),[targetId,setTargetId]=useState(null),[panel,setPanel]=useState(null),[toast,setToast]=useState(''),[query,setQuery]=useState(''),[peopleTab,setPeopleTab]=useState('all'),[mobilePeople,setMobilePeople]=useState(false),[onboarding,setOnboarding]=useState(false);
  const[messages,setMessages]=useState([]),[conversation,setConversation]=useState(null),[text,setText]=useState(''),[sending,setSending]=useState(false),[emotion,setEmotion]=useState('calm'),[bubble,setBubble]=useState(''),[daily,setDaily]=useState(null),[pendingQuestion,setPendingQuestion]=useState(false),[sceneType,setSceneType]=useState('garden'),[consent,setConsent]=useState(null),[share,setShare]=useState(false),[anonymous,setAnonymous]=useState(false),[voice,setVoice]=useState(false),[speak,setSpeak]=useState(false),[topic,setTopic]=useState('서로의 취향을 알아보는 첫인사'),[topicResult,setTopicResult]=useState(null),[topicBusy,setTopicBusy]=useState(false),[activeLog,setActiveLog]=useState(false);
  const [topicPartner,setTopicPartner]=useState(''),[topicSession,setTopicSession]=useState(null),[topicIndex,setTopicIndex]=useState(0),[topicPlaying,setTopicPlaying]=useState(true);
  const topicRequest=useRef(0);
  function endTopic(){topicRequest.current++;setTopicSession(null);setTopicBusy(false);setTopicResult(null);}
  useEffect(()=>{
    if(!topicSession||!topicResult||!topicPlaying||topicIndex>=topicResult.length)return;
    const timer=setTimeout(()=>setTopicIndex(i=>i+1),topicTurnDelay(topicResult[topicIndex].text));
    return()=>clearTimeout(timer);
  },[topicSession,topicResult,topicPlaying,topicIndex]);
  useEffect(()=>{if(!topicSession)return;const key=e=>{if(e.key==='Escape')endTopic();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[topicSession]);
  const[peopleCollapsed,setPeopleCollapsed]=useState(()=>{try{return localStorage.getItem('pieona.peopleCollapsed')==='true';}catch{return false;}});
  useEffect(()=>{try{localStorage.setItem('pieona.peopleCollapsed',String(peopleCollapsed));}catch{}},[peopleCollapsed]);
  const[surveyStatus,setSurveyStatus]=useState(null),[surveyBusy,setSurveyBusy]=useState(false),[stageBusy,setStageBusy]=useState(false),[logoutBusy,setLogoutBusy]=useState(false),[shot,setShot]=useState(null);
  const pendingLogout=useRef(false),captureRef=useRef(null),captureCloseRef=useRef(null);
  const[peopleLoading,setPeopleLoading]=useState(true),[peopleError,setPeopleError]=useState('');
  const[runInvite,setRunInvite]=useState(null),[race,setRace]=useState(null);
  const[editorSession,setEditorSession]=useState(null);
  const editing=panel==='villageEdit';
  const signFocused=panel==='signView'||panel==='signEdit';
  const guestbookFocused=panel==='guestbook';
  const lifeFocused=isLifeFocus(panel);
  const [lifeObjectId,setLifeObjectId]=useState(null);
  const objectFocused=signFocused||guestbookFocused||lifeFocused;
  function closeVillageEditor(){setEditorSession(null);closePanel();}
  const[sessionsOpen,setSessionsOpen]=useState(false),[sessionBusy,setSessionBusy]=useState(false);
  useEffect(()=>{if(demoVillage||!me?.id||onboarding)return;try{if(localStorage.getItem('pieona.tutorial.v1.'+me.id)!=='seen')setPanel('guide');}catch{setPanel('guide');}},[me?.id,onboarding]);
  function closePanel(options){if(panel==='capture'&&!options?.discardCapture&&captureCloseRef.current?.())return;if(panel==='logoutConfirm'&&logoutBusy)return;if(panel==='surveyInvite'||panel==='feedback'){if(!surveyBusy)laterSurvey();return;}if(panel==='game'&&race){socketRef.current?.emit('runner:leave',{});setRace(null);}if(panel==='guide')try{localStorage.setItem('pieona.tutorial.v1.'+me.id,'seen');}catch{}setPanel(null);}
  useEffect(()=>{if(panel!=='guide')return;const collapsed=peopleCollapsed,mobile=mobilePeople;setPeopleCollapsed(false);setMobilePeople(true);return()=>{setPeopleCollapsed(collapsed);setMobilePeople(mobile);};},[panel]);
  const closeSessions=useCallback(()=>setSessionsOpen(false),[]);
  const drafts=useRef(new Map());
  const presenceIds=useRef(null);
  useEffect(()=>{setSessionsOpen(false);},[targetId,me?.activeSlot,mode]);
  useEffect(()=>{setPanel(current=>current==='signView'||current==='signEdit'||current==='guestbook'||current==='chalkboard'||isLifeFocus(current)?null:current);},[targetId]);
  const[villageSpeech,setVillageSpeech]=useState([]);
  useEffect(()=>{setVillageSpeech([]);},[targetId]);
  useEffect(()=>{if(!villageSpeech.length)return;const timer=setTimeout(()=>setVillageSpeech(current=>current.filter(line=>line.expiresAt>Date.now())),Math.max(0,Math.min(...villageSpeech.map(line=>line.expiresAt))-Date.now()));return()=>clearTimeout(timer);},[villageSpeech]);
  const[chatCollapsed,setChatCollapsed]=useState(true);
  useEffect(()=>{try{localStorage.setItem('pieona.chatCollapsed',String(chatCollapsed));}catch{}if(!chatCollapsed)setChatFocus(value=>value+1);},[chatCollapsed]);
  useEffect(()=>{setDucked(panel==='game'||voice);return()=>setDucked(false);},[panel,voice,setDucked]);
  const inviteRef=useRef();
  useEffect(()=>{if(runInvite)inviteRef.current?.focus();},[runInvite?.id]);
  const messagesEnd=useRef(),toastTimer=useRef(),socketRef=useRef(),recognition=useRef(),sendGuard=useRef(false),targetRef=useRef(null),villageRef=useRef(null),localPose=useRef(null),touchMovement=useRef({x:0,y:0}),jumpInput=useRef(false);
  const activeVillageId=me?.id&&targetId&&!onboarding?targetId:null;villageRef.current=activeVillageId;
  useEffect(()=>{
    const request=++questionArrival.current;
    setArrivalQuestion(null);
    if(!activeVillageId||activeVillageId!==me?.id)return;
    appRequest('/me/questions/arrival',{method:'POST',body:{}}).then(({question})=>{
      if(questionArrival.current===request)setArrivalQuestion(question);
    }).catch(error=>notify(error.message));
    return()=>{questionArrival.current++;};
  },[activeVillageId,me?.id]);
  const notify=useCallback(message=>{setToast(message);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),4500);},[]);
  const [fishingChallengeTarget,setFishingChallengeTarget]=useState(null);
  const life=useLife(demoVillage?null:me?.id,socketRef.current,connected,notify);
  useEffect(()=>{if(Number.isFinite(life.data?.gold))setMe(previous=>previous?{...previous,gold:life.data.gold}:previous);},[life.data?.gold]);
  async function performLife(action){const result=await life.perform(action);if(result?.ok){if(!lifeFocused)setPanel(null);setMode('village');}return result;}
  const refresh=useCallback(async()=>{
    setPeopleLoading(true);
    try{
      const snapshot=await loadAppSnapshot(appRequest);
      if(snapshot.errors.some(({error})=>error.status===401)){setMe(null);setUsers([]);socketRef.current?.disconnect();return;}
      if(snapshot.me){setMe(snapshot.me.user);setAi(snapshot.me.ai);}
      if(snapshot.people)setUsers(applyPresence(snapshot.people.users,presenceIds.current));
      if(snapshot.survey)setSurveyStatus(snapshot.survey);
      setPeopleError(snapshot.errors.find(({path})=>path==='/users')?.error.message||'');
      for(const {path,error} of snapshot.errors)if(path==='/me'||(path==='/survey/status'&&error.status!==404))notify(error.message);
      return snapshot.me?.user;
    }finally{setPeopleLoading(false);}
  },[notify]);
  const ownConversationRequest=useRef(0);
  async function restoreOwnConversation(user){
    const request=++ownConversationRequest.current;
    setSessionBusy(true);
    try{
      const result=await appRequest('/me/conversation');
      if(request!==ownConversationRequest.current||targetRef.current!==user.id)return;
      setConversation(result.conversation?.id||null);
      setMessages(result.conversation?.messages||[]);
      setActiveLog(!!result.conversation);
      setBubble(result.conversation?.messages.filter(message=>message.role==='assistant').at(-1)?.content||'');
    }catch(error){if(request===ownConversationRequest.current)notify(error.message);}
    finally{if(request===ownConversationRequest.current)setSessionBusy(false);}
  }
  const loadDaily=useCallback(()=>appRequest('/questions').then(r=>setDaily(r.daily)).catch(e=>notify(e.message)),[notify]);
  useEffect(()=>{appRequest('/me').then(async r=>{setMe(r.user);setAi(r.ai);setOnboarding(!r.user.nickname||!r.user.balance.length);setTargetId(r.user.id);await refresh();await restoreOwnConversation(r.user);}).catch(e=>{if(e.status!==401)notify(e.message);}).finally(()=>setLoading(false));return()=>clearTimeout(toastTimer.current);},[]);
  useEffect(()=>{if(demoVillage||!me?.id)return;const socket=io({withCredentials:true});socketRef.current=socket;socket.on('connect',()=>{setConnected(true);refresh();});socket.on('disconnect',()=>{presenceIds.current=null;setConnected(false);setVillageSpeech([]);setVillageMembers([]);setVillageGarden(null);setRunInvite(null);setRace(null);});socket.on('connect_error',()=>setConnected(false));socket.on('survey:access',({role})=>{setMe(user=>user?{...user,surveyRole:role}:user);if(role==='user'){setPanel(current=>current==='surveyStatistics'?null:current);notify('설문 통계 조회 권한이 회수되었어요.');}});socket.on('runner:invited',invite=>{if(invite.villageId===villageRef.current)setRunInvite(invite);});socket.on('runner:invite-progress',data=>setRunInvite(i=>i?.id===data.id?{...i,progress:data}:i));socket.on('runner:invite-ended',data=>{setRunInvite(i=>i?.id===data.id?null:i);notify(data.reason);});socket.on('runner:matched',data=>{setRunInvite(null);setRace(data);setPanel('game');});socket.on('runner:started',data=>setRace(r=>r?.id===data.id?{...r,game:data.game}:r));socket.on('runner:cancelled',data=>{setRace(r=>r?.id===data.id?null:r);notify(data.reason);});socket.on('runner:opponent-left',()=>notify('상대가 달리기를 떠났어요. 내 기록은 끝까지 남길 수 있어요.'));socket.on('presence',ids=>{presenceIds.current=ids;setUsers(current=>applyPresence(current,ids));refresh();});socket.on('village:members',snapshot=>{if(snapshot.villageId===villageRef.current){setVillageMembers(snapshot.members);setVillageGarden({...snapshot.garden,receivedAt:Date.now()});}});socket.on('village:move',move=>{if(move.villageId===villageRef.current)setVillageMembers(current=>current.map(m=>m.userId===move.userId?{...m,...move}:m));});socket.on('village:speech',line=>{if(line.villageId===villageRef.current)setVillageSpeech(current=>[...current.filter(item=>item.expiresAt>Date.now()&&!(item.userId===line.userId&&item.role===line.role)),line].slice(-8));});socket.on('world:changed',refresh);socket.on('refresh',refresh);loadDaily();return()=>{socket.disconnect();recognition.current?.stop();window.speechSynthesis?.cancel();};},[me?.id]);
  useEffect(()=>{
    const socket=socketRef.current;setVillageMembers([]);setVillageGarden(null);setRunInvite(null);setRace(null);
    if(!socket||!connected||!activeVillageId)return;
    let cancelled=false;
    socket.emit('village:join',{villageId:activeVillageId},result=>{
      if(cancelled||villageRef.current!==activeVillageId)return;
      if(result?.ok){
        if(result.greeting)setVillageSpeech([result.greeting]);
        setVillageMembers(result.members);setVillageGarden({...result.garden,receivedAt:Date.now()});
        // Restore the local pose after reconnecting instead of teleporting other viewers.
        if(localPose.current?.villageId===activeVillageId&&!result.members.some(member=>member.userId===me.id&&(member.seatId?.startsWith('fishing:')||member.activityState==='Moving'))){
          const pose=localPose.current;
          // Restore the ground position first so the server can validate bench proximity after a reconnect.
          if(pose.seatId)socket.emit('village:move',{...pose,seatId:null});
          socket.emit('village:move',pose);
        }
      }else notify('이 마을에 들어갈 수 없어요.');
    });
    return()=>{cancelled=true;socket.emit('village:leave');};
  },[activeVillageId,connected]);
  useEffect(()=>{if(race&&panel!=='game'){socketRef.current?.emit('runner:leave',{});setRace(null);}},[panel,race?.id]);
  function publishPosition(position){
    const pose={...position,villageId:activeVillageId};localPose.current=pose;
    if(socketRef.current?.connected)socketRef.current.emit('village:move',pose);
  }
  useEffect(()=>{if(!chatCollapsed)messagesEnd.current?.scrollIntoView({behavior:'smooth',block:'nearest'});},[messages,sending,chatCollapsed]);
  useEffect(()=>{const listener=e=>{if(e.key==='Escape'&&!onboarding&&!e.defaultPrevented&&panel!=='signEdit'&&panel!=='villageEdit'&&panel!=='guestbook'){closePanel();setConsent(null);setMobilePeople(false);setSessionsOpen(false);if(mode==='chat')exitChat();}};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[onboarding,panel,me?.id,surveyBusy,logoutBusy,mode]);
  const target=(targetId===me?.id?me:users.find(u=>u.id===targetId))||me;targetRef.current=target?.id;
  const own=target?.id===me?.id;
  const villagePolls=useVillagePolls(demoVillage?null:activeVillageId,socketRef.current);
  const chalkboard=useChalkboard(demoVillage?null:targetId,socketRef.current);
  const pollActive=villagePolls.polls.some(p=>p.status==='open');
  useEffect(()=>{if(demoVillage||!me?.id||onboarding||!me.balance?.length||panel&&!['guide','cards'].includes(panel))return;const version=(me.activeSlot||me.id)+':'+cardTier(me.level);try{const key='illova.card.seen.'+me.id+'.'+(me.activeSlot||'first');if(localStorage.getItem(key)!==version){localStorage.setItem(key,version);setPanel('cards');}}catch{}},[me?.id,me?.activeSlot,me?.level,onboarding,panel]);
  async function activateCardUser(user){await refresh();setTargetId(user.id);setMode('home');setMessages([]);setConversation(null);setPanel(null);setOnboarding(!user.nickname||!user.balance.length);setSceneType(user.settings.scene);setBubble('');await restoreOwnConversation(user);loadDaily();}
  const others=users.filter(u=>u.id!==me?.id);const onlineCount=others.filter(u=>u.online).length;
  useEffect(()=>{if(me&&targetId&&targetId!==me.id&&!users.find(u=>u.id===targetId)){setTargetId(me.id);setMode('home');setMessages([]);setConversation(null);}},[users,me?.id]);
  async function login(user){setMe(user);setTargetId(user.id);setOnboarding(!user.nickname||!user.balance.length);await refresh();await restoreOwnConversation(user);}
  function requestLogout(){if(demoVillage){location.href='/';return;}if(sending||sessionBusy)return notify('아바타의 답변을 기다려 주세요.');setPanel('logoutConfirm');}
  async function logout(){
    if(logoutBusy)return;
    setLogoutBusy(true);
    try{
    if(sending||sessionBusy)return notify('아바타의 답변을 기다려 주세요.');
    try{const status=await appRequest('/survey/status');setSurveyStatus(status);if(!status.completed&&!status.deferred){pendingLogout.current=true;setPanel('surveyInvite');return;}}catch(e){notify(e.message);}
    await finishLogout();
    }finally{setLogoutBusy(false);}
  }
  async function finishLogout(){pendingLogout.current=false;setSurveyStatus(null);try{await appRequest('/auth/logout',{method:'POST'});socketRef.current?.disconnect();setMe(null);setMessages([]);setConversation(null);setPanel(null);setMode('home');setConnected(false);}catch(e){notify(e.message);}}
  async function laterSurvey(){setSurveyBusy(true);try{await appRequest('/survey/defer',{method:'POST'});setSurveyStatus(s=>({...s,deferred:true,eligible:false}));setPanel(null);if(pendingLogout.current)await finishLogout();}catch(e){notify(e.message);}finally{setSurveyBusy(false);}}
  async function completeSurvey(){setSurveyStatus({completed:true,eligible:false});if(pendingLogout.current)await finishLogout();else{await refresh();setPanel('surveyReward');}}
  useEffect(()=>{if(!me||topicSession||onboarding||panel||consent||sending||sessionBusy||sessionsOpen||race||voice||runInvite||!surveyStatus?.eligible)return;setPanel('surveyInvite');},[me?.id,onboarding,panel,consent,sending,sessionBusy,sessionsOpen,race,voice,runInvite,surveyStatus,topicSession]);
  async function finishGame(){await refresh();try{const status=await appRequest('/survey/status');setSurveyStatus(status);}catch(e){notify(e.message);}}
  async function changeStage(theme){setStageBusy(true);try{const r=await appRequest('/me/world',{method:'PATCH',body:{village:{theme}}});setMe(r.user);setPanel(null);notify('마을 테마를 저장했어요.');}catch(e){notify(e.message);}finally{setStageBusy(false);}}
  const captureBusy=useRef(false);
  async function captureStage(){
    if(captureBusy.current)return;
    captureBusy.current=true;
    try{
      const image=captureRef.current?.();if(!image)return notify('마을이 준비되면 다시 캡처해 주세요.');
      const theme=villageThemes.find(t=>t.id===target.village?.theme)||villageThemes[0];
      const people=mode==='village'?[target,me,...villageMembers.map(person=>({id:person.userId,nickname:person.nickname,appearance:person.appearance}))]:[target];
      const participants=[...new Map(people.map(person=>[person.id,{id:person.id,nickname:person.nickname,appearance:person.appearance||{}}])).values()];
      const next=newCapture({image,themeId:theme.id,theme:theme.name,location:target.nickname+'의 마을',participants});
      setShot(next);setPanel('capture');
    }catch{notify('캡처하지 못했어요. 잠시 후 다시 시도해 주세요.');}
    finally{captureBusy.current=false;}
  }
  function exitChat(){setMode('chat');setChatCollapsed(true);document.getElementById('chat-input')?.blur();}
  function goHome(){
    if(sending||sessionBusy)return notify('아바타의 답변을 기다려 주세요.');
    setPanel(null);setMode('home');
    if(targetId===me.id)return;
    setTargetId(me.id);setConversation(null);setMessages([]);setText('');setActiveLog(false);setBubble('');setSceneType(me.settings.scene);
    restoreOwnConversation(me);
  }
  async function visit(uid){if(sending||sessionBusy)return notify('아바타의 답변을 기다려 주세요.');const u=users.find(v=>v.id===uid);if(!u)return notify('이웃을 찾을 수 없어요.');try{await appRequest('/visits',{method:'POST',body:{targetId:uid,anonymous}});setTargetId(uid);setMode('chat');setChatCollapsed(true);setText('');setConversation(null);setMessages([]);setActiveLog(false);setPanel(null);setMobilePeople(false);setSceneType(u.scene);setBubble(`${u.nickname}의 작은 세상에 온 걸 환영해!`);setEmotion('happy');}catch(e){notify(e.message);}}
  async function beginChat(options={}){
    if(sendGuard.current)return;
    if(!own&&!options.accepted){setConsent(target);setShare(false);return;}
    const uid=target.id;sendGuard.current=true;setSessionBusy(true);
    try{const r=await appRequest('/conversations',{method:'POST',body:{targetId:uid,share:options.share||false,anonymous,...(options.question?{opening:options.question.id,scene:sceneType}:{})}});
      if(targetRef.current!==uid)return;
      if(conversation)drafts.current.set(conversation,text);
      setConversation(r.id);setMessages(options.question?[{id:crypto.randomUUID(),role:'assistant',content:options.question.text}]:[]);setText(current=>!own&&!conversation?current:'');setShare(options.share||false);setChatCollapsed(false);setSessionsOpen(false);setMode(own&&mode==='village'?'village':own?'home':'chat');setConsent(null);setActiveLog(false);setBubble(options.question?options.question.text:own?'새 이야기 시작! 이번엔 무슨 얘기 할까?':`${target.nickname}의 AI 아바타야.\n편하게 이야기해 줘!`);
      if(options.question)setArrivalQuestion(null);
      requestAnimationFrame(()=>document.getElementById('chat-input')?.focus({preventScroll:true}));
    }catch(e){notify(e.message);}finally{setSessionBusy(false);sendGuard.current=false;}
  }
  async function send(e){e?.preventDefault();if(sendGuard.current||sessionBusy||!text.trim())return;if(!own&&!conversation){setConsent(target);return;}const input=text.trim();sendGuard.current=true;setSending(true);setText('');let cid=conversation;const uid=target.id;
    try{if(!cid){const c=await appRequest('/conversations',{method:'POST',body:{targetId:uid,share:false,anonymous}});cid=c.id;setConversation(cid);}setMessages(current=>[...current,{id:crypto.randomUUID(),role:'user',content:input}]);const r=await appRequest('/conversations/'+cid+'/messages',{method:'POST',body:{text:input,scene:sceneType}});if(targetRef.current!==uid)return;setMessages(current=>[...current,{id:crypto.randomUUID(),role:'assistant',content:r.reply}]);setEmotion(r.emotion);setBubble(r.reply);setAi(r.provider);if(r.warning)notify(r.warning);else if(r.memories.length)notify(`새로운 기억 ${r.memories.length}개가 피어났어요 · 전체 공개`);if(speak&&window.speechSynthesis){const utterance=new SpeechSynthesisUtterance(r.reply);utterance.lang='ko-KR';utterance.rate=1;window.speechSynthesis.speak(utterance);}if(own&&pendingQuestion){await appRequest('/questions/status',{method:'POST',body:{action:'answered'}});setPendingQuestion(false);loadDaily();}await refresh();}catch(e){notify(e.message);setText(input);setMessages(current=>[...current,{id:crypto.randomUUID(),role:'error',content:e.message}]);}finally{setSending(false);sendGuard.current=false;if(targetRef.current===uid)requestAnimationFrame(()=>document.getElementById('chat-input')?.focus({preventScroll:true}));}}
  function microphone(){const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Speech)return notify('이 브라우저는 음성 입력을 지원하지 않아요. Chrome의 HTTPS 환경에서 이용해 주세요.');if(voice){recognition.current?.stop();return;}const r=new Speech();r.lang='ko-KR';r.interimResults=false;r.onstart=()=>setVoice(true);r.onend=()=>setVoice(false);r.onerror=()=>{setVoice(false);notify('마이크 권한과 HTTPS 연결을 확인해주세요.');};r.onresult=e=>setText(current=>(current?current+' ':'')+e.results[0][0].transcript);recognition.current=r;r.start();}
  const petRequest=useRef(false);
  async function interactPet(kind){
    if(petRequest.current)return;petRequest.current=true;
    try{const result=await appRequest('/me/pet/interactions',{method:'POST',body:{kind,villageId:target.id,requestId:crypto.randomUUID()}});notify(result.reply);}
    catch(error){notify(error.message);}finally{petRequest.current=false;}
  }
  async function toggleDragonMount(){
    if(petRequest.current)return;petRequest.current=true;
    try{const riding=me.appearance.ride!=='babyDragon';const result=await appRequest('/me/mount',{method:'POST',body:{riding,villageId:target.id}});setMe(result.user);notify(riding?'아기용에 탔어요. WASD / 조이스틱으로 날아보세요.':'아기용에서 내렸어요.');}
    catch(error){notify(error.message);}finally{petRequest.current=false;}
  }
  function interact(action){if(action.startsWith('mount:')){if(action==='mount:toggle'||action===`mount:${me.id}`)toggleDragonMount();else notify('내 아기용 가까이에서 F로 탑승해 주세요.');return;}if(action.startsWith('pet:')){const kind=action.slice(4);if(kind==='call'||kind==='pet')interactPet(kind);else if(kind===me.id)interactPet('pet');else notify('내 펫을 터치해 쓰다듬어 주세요.');return;}if(action==='life:stop'){life.stop();return;}if(panel||consent||onboarding)return;if(action==='life:approach'){setMode('village');notify('농장 버튼으로 들어가 텃밭을 가꿔요. 요리와 보관함은 공방에서 이용하세요. 낚시는 바닷가에서 시작해 주세요.');return;}if(action==='kitchen'||action.startsWith('garden:')){if(!own)return notify('텃밭과 조리대는 마을 주인만 사용할 수 있어요.');life.load();setLifeObjectId(action);setPanel(action==='kitchen'?'kitchen':'garden');return;}if(action==='storage'){if(!own)return notify('보관함은 마을 주인만 열 수 있어요.');life.load();setLifeObjectId(action);setPanel('storage');return;}if(action.startsWith('fishing:challenge:')){setFishingChallengeTarget(action.slice(18));return;}if(action.startsWith('fishing:')){const occupied=villageMembers.find(m=>m.userId!==me.id&&m.seatId===action);if(occupied)setFishingChallengeTarget(occupied.userId);else life.start(action);return;}if(action==='chalkboard'){setPanel('chalkboard');}else if(action==='poll'){setPanel('polls');}else if(action==='guestbook'){setPanel('guestbook');}else if(action==='sign'){setPanel('signView');}else if(action==='avatar:chat'){if(conversation){setChatCollapsed(false);setSessionsOpen(false);}else beginChat();}else if(action==='avatar'){setEmotion('happy');}else if(action==='cafe'){setSceneType('cafe');setPanel('game');}else if(action==='campfire'){setSceneType('campfire');notify('별빛 모닥불에서 느긋한 이야기를 나눠보세요.');if(mode==='village')beginChat();}}
  async function resumeConversation(c){
    if(sendGuard.current)return;
    if(c.viewer_id!==me.id)return notify('방문자의 대화는 열람만 가능해요.');
    const u=c.target_id===me.id?me:users.find(u=>u.id===c.target_id);if(!u)return notify('아바타를 찾을 수 없어요.');
    if(c.id===conversation){setSessionsOpen(false);setChatCollapsed(false);setPanel(null);return;}
    sendGuard.current=true;setSessionBusy(true);
    try{const r=await appRequest('/conversations/'+c.id);if(!r.conversation.activeAvatar)return notify('다른 자아의 대화예요. 해당 자아로 전환한 뒤 이어가세요.');
      if(conversation)drafts.current.set(conversation,text);
      setTargetId(u.id);setConversation(c.id);setMessages(r.messages);setText(drafts.current.get(c.id)||'');setShare(r.conversation.share);setAnonymous(r.conversation.anonymous);setChatCollapsed(false);setSessionsOpen(false);setMode(u.id===me.id?'home':'chat');setSceneType(u.id===me.id?me.settings.scene:u.scene);setActiveLog(true);setPanel(null);setBubble(r.messages.filter(m=>m.role==='assistant').at(-1)?.content||'이어서 이야기하자.');
    }catch(e){notify(e.message);}finally{setSessionBusy(false);sendGuard.current=false;}
  }
  async function runTopic(){
    const partner=users.find(u=>u.id===(topicPartner||(!own?target.id:'')));
    if(!partner)return notify('함께할 이웃을 골라주세요.');
    const request=++topicRequest.current;
    setTopicSession({partner,topic});setTopicIndex(0);setTopicPlaying(true);setTopicBusy(true);setTopicResult(null);
    setTargetId(me.id);setMode('home');setSceneType(me.settings.scene);setPanel(null);setMobilePeople(false);setSessionsOpen(false);setConversation(null);setMessages([]);setBubble('');
    try{const r=await appRequest('/topics',{method:'POST',body:{targetId:partner.id,topic}});if(topicRequest.current===request)setTopicResult(r.transcript);}
    catch(e){if(topicRequest.current===request){endTopic();notify(e.message);}}
    finally{if(topicRequest.current===request)setTopicBusy(false);}
  }
  if(loading)return <div className="boot" role="status" aria-label="ILLOVA 로딩 중"><img className="boot-logo" src="/images/illova-logo.png" alt="ILLOVA" fetchPriority="high"/><span className="spinner" aria-hidden="true"/><p>작은 세상이 피어나는 중…</p></div>;
  if(!me)return <><Auth onLogin={login} notify={notify}/>{toast&&<div className="toast" role="status">{toast}</div>}</>;
  const personList=others.filter(u=>(peopleTab==='all'||u.relation==='accepted')&&(u.nickname.toLowerCase().includes(query.toLowerCase())||u.tags.some(t=>t.includes(query)))).sort((a,b)=>Number(b.online)-Number(a.online));
  const panels={personaUpdate:['아바타 업데이트','PERSONA · EVENT SCRIPTS'],workshop:['마을 공방','MAKE · COOK · COLLECT'],explorationCraft:['숲 공방','FOREST WORKSHOP'],chalkboard:['마을 칠판','DRAW SOMETHING TOGETHER'],cards:['아바타 카드','YOUR OTHER SELF'],polls:['우리 마을 밸런스 투표','LET OUR AVATARS CHOOSE'],surveyReward:['새로운 친구를 만났어요','A LITTLE GIFT FOR YOUR STORY'],garden:['작은 텃밭','GROW A LITTLE EVERY DAY'],kitchen:['마을 요리대','FROM OUR GARDEN TO THE TABLE'],storage:['마을 보관함과 물고기 도감','LITTLE TREASURES FROM THE SEA'],surveyStatistics:['설문 통계','SURVEY INSIGHTS'],logoutConfirm:['로그아웃할까요?','SEE YOU AGAIN'],villageThemes:['마을테마','CHOOSE YOUR VILLAGE'],guide:['ILLOVA에 오신 걸 환영해요','YOUR LITTLE WORLD STARTS HERE'],villageEdit:['나의 마을 꾸미기','MAKE YOURSELF AT HOME'],avatarEdit:['나의 캐릭터 꾸미기','A LITTLE MORE LIKE YOU'],records:['우리 마을 미니게임 기록','LITTLE GAMES, SHARED MEMORIES'],slots:['여러 모습의 나, 자아 슬롯','DIFFERENT SEEDS, DIFFERENT STORIES'],memory:['기억 정원','THE STORIES THAT MAKE YOU'],settings:['나만의 표현과 설정','YOUR WORLD, YOUR RULES'],logs:['아바타 대화기록','LITTLE TRACES OF CONNECTION'],social:['함께 피어나는 이웃','OUR GROWING CONNECTIONS'],feedback:['ILLOVA 플레이 설문','LET US GROW TOGETHER'],surveyInvite:['피오가 이야기를 기다려요','LET US GROW TOGETHER'],capture:['마을의 순간 담기','A MOMENT TO REMEMBER'],game:['마을 놀이터','A LITTLE MOMENT OF PLAY'],topics:['아바타들의 작은 대화','TWO STORIES, ONE CONVERSATION']};
  return <div className={'app-shell'+(peopleCollapsed?' people-is-collapsed':'')+(topicSession?' is-topic-playing':'')+(editing?' is-village-editing':'')+(objectFocused?' is-sign-focused':'')+(guestbookFocused?' is-guestbook-focused':'')+(lifeFocused?' is-life-focused':'')} style={{'--village-sky':'#'+(villageThemes.find(item=>item.id===target.village?.theme)||villageThemes[0]).sky.toString(16).padStart(6,'0')}}><nav className="rail" inert={editing||guestbookFocused||lifeFocused||!!topicSession}><button className="rail-logo" aria-label="내 정원" onClick={goHome}><Flower2 size={29}/></button><div className="rail-menu">{[{id:'home',icon:Home,label:'홈',action:goHome},{id:'capture',icon:Camera,label:'앨범',action:()=>{setShot(null);setPanel('capture');}},{id:'cards',icon:Heart,label:'아바타 카드',action:()=>setPanel('cards')},{id:'memory',icon:BookOpen,label:'기억',action:()=>setPanel('memory')},{id:'logs',icon:MessageCircle,label:'메시지',action:()=>setPanel('logs')},{id:'topics',icon:Sparkles,label:'토픽',action:()=>{setPanel('topics');setTopicResult(null);}}].map(item=><button data-tutorial={item.id==='memory'?'memory':item.id==='social'?'friends':undefined} key={item.id} className={'rail-item '+((panel===item.id||!panel&&mode===item.id)?'active':'')} aria-label={item.label} title={item.label} onClick={item.action}><item.icon size={21}/><span>{item.label}</span></button>)}</div><div className="rail-bottom"><button className="rail-item" title="게임 안내" aria-label="게임 안내" onClick={()=>setPanel('guide')}><HelpCircle size={21}/></button><button className="rail-item" title="설정" aria-label="설정" onClick={()=>setPanel('settings')}><Settings size={21}/></button><button className="rail-profile" title="로그아웃" aria-label="로그아웃" onClick={requestLogout}><LogOut size={18}/></button></div></nav>
  <div className="main-shell"><header className="topbar" inert={editing||guestbookFocused||lifeFocused||!!topicSession}><div className="brand"><span>ILLOVA</span><span className="header-divider"/><span className="topbar-caption">나의 이야기가 피어나는 곳</span></div><div className="topbar-right"><NotificationBell key={me.id} socket={socketRef.current} notify={notify} onVisit={visit}/>{surveyStatus&&!surveyStatus.completed&&<SurveyRewardHint key={me.id} userId={me.id} onStart={()=>setPanel('feedback')} visible={!panel&&!onboarding&&!topicSession}/>}{['admin','manager'].includes(me.surveyRole)&&<button className="top-survey-statistics" aria-label="설문 통계" onClick={()=>setPanel('surveyStatistics')}><BarChart3 size={16}/><span>설문 통계</span></button>}<MusicControls/><span className="gold"><Coins size={16}/>{me.gold.toLocaleString()}<small>G</small></span><button className="top-user" onClick={()=>setPanel('settings')}><AvatarPortrait user={me}/><span>{me.nickname||'새싹'}<small>Lv. {me.level}</small></span><ChevronDown size={16}/></button><button className="mobile-people-button icon-button" aria-label="이웃 목록" onClick={()=>setMobilePeople(!mobilePeople)}><Users size={20}/></button></div></header>
  <div className="workspace" inert={guestbookFocused}><main data-tutorial="world" className={'world-panel theme-'+(target.village?.theme||'default')+' '+(own&&(life.data?.session||life.data?.task)?'is-fishing ':'')+(own?' own-village ':'')+(own&&(life.data?.session||life.data?.task)?' is-player-fishing ':'')+(mode==='village'?'village-mode':'')+(chatCollapsed?' chat-is-collapsed':'')}><WorldStage fishingDuel={life.data?.duel} chalkStrokes={chalkboard.data?.strokes||[]} pollActive={pollActive} onPollClick={()=>setPanel('polls')} villageSpeech={[]} chatFocusToken={chatFocus} chatActive={!chatCollapsed} questionPending={own&&!!arrivalQuestion} onQuestionClick={()=>beginChat({question:arrivalQuestion})} lifeFocused={lifeFocused} lifeObjectId={lifeObjectId} guestbookFocused={guestbookFocused} topicGuest={topicSession?.partner} topicLine={topicResult?.[topicIndex]} editing={editing} editor={editing?editorSession?.editor:null} captureRef={captureRef} jumpInput={jumpInput} movementInput={touchMovement} renderSuspended={panel==='game'||panel==='garden'||panel==='personaUpdate'} paused={!!panel&&!editing&&!objectFocused||!!consent||onboarding} key={target.id} ownerId={target.id} ownerNickname={target.nickname} ownerAppearance={target.appearance} appearance={me.appearance} village={editing&&editorSession?{...target.village,items:editorSession.items,scenery:editorSession.scenery,sign:editorSession.sign,guestbook:editorSession.guestbook,pollbox:editorSession.pollbox,chalkboard:editorSession.chalkboard}:target.village} inputEnabled={!topicSession&&!panel&&!consent&&!onboarding&&!sending&&!sessionBusy&&!sessionsOpen&&!mobilePeople} mode={topicSession?'topic':editing?'edit':lifeFocused?panel:guestbookFocused?'guestbook':signFocused?'sign':mode==='village'||mode==='chat'?'village':'home'} theme={target.theme} emotion={emotion} sceneType={sceneType} villageMembers={villageMembers} gardenData={own&&life.data?{...life.data.garden,serverTime:life.data.serverTime,receivedAt:life.data.receivedAt}:villageGarden} viewerId={me.id} viewerNickname={me.nickname} onPositionChange={publishPosition} onWalk={()=>setMode('village')} onInteract={interact}/><div className="world-interface" inert={editing||objectFocused||!!topicSession}><div className="world-top"><div><div className="breadcrumbs"><span>나의 작은 세상</span><ChevronRight size={12}/><span>{own?'내 정원':target.nickname+'의 마을'}</span></div><div className="world-title world-welcome"><span className="welcome-sun" aria-hidden="true"><Sun size={23}/></span><div className="welcome-copy"><span className="welcome-eyebrow">{own?'나의 작은 쉼터':'이웃과 함께하는 시간'}</span><h1>{mode==='village'?`${target.nickname}의 작은 마을`:own?`안녕하세요 ${me.nickname}`:`${target.nickname}와 나누는 이야기`}</h1></div></div><div className="stage-controls"><button className="stage-capture-button desktop-world-help" title="방명록 보기" onClick={()=>setPanel('guestbook')}><BookOpen size={17}/>방명록</button><button className="stage-capture-button desktop-world-help" title="팻말 보기" onClick={()=>setPanel('signView')}><Paintbrush size={17}/>팻말 보기</button><button className="stage-capture-button desktop-world-help" title="마을 캡처" onClick={captureStage}><Camera size={17}/>캡처</button></div><section className="village-avatar-progress" aria-label={target.nickname+' 캐릭터 레벨과 경험치'}><div><strong>{levelLabel(target)}</strong>{target.level!=null&&<span>현재 경험치 <b>{target.levelXp} / {target.nextLevelXp} XP</b></span>}</div>{target.level!=null&&<progress aria-label="다음 레벨까지의 경험치" value={target.levelXp} max={target.nextLevelXp}/>}</section></div><button className="village-theme-button" title={own?'마을 테마 변경':'이 마을의 테마'} disabled={!own} aria-haspopup="dialog" aria-expanded={panel==='villageThemes'} onClick={()=>setPanel('villageThemes')}><Sun size={19}/><span>마을테마</span><ChevronRight size={16}/></button></div>

  {!panel&&!onboarding&&<FishingDuel data={life.data} me={me} members={villageMembers} villageId={target.id} selected={fishingChallengeTarget} onSelect={setFishingChallengeTarget} onCommand={life.command} pending={life.pending} connected={connected}/> }
  {!panel&&!onboarding&&<FishingStatus data={life.data} pending={life.pending} connected={connected} onStop={life.stop}/>}
  {own&&<div className="village-presence" role="status"><Users size={14}/>{!connected?'마을에 다시 연결하는 중…':villageMembers.filter(member=>member.userId!==me.id&&member.actorKind!=='PET').length?`함께 있는 이웃: ${villageMembers.filter(member=>member.userId!==me.id&&member.actorKind!=='PET').map(member=>member.nickname).join(', ')}`:'지금은 나 혼자 있는 마을이에요'}</div>}
  <div className="world-actions" aria-label="마을 활동">{own&&!demoVillage&&<button className="farm-entry" onClick={async()=>{try{await api('/me/farm');life.load();setLifeObjectId(null);setPanel('garden');}catch(error){notify(error.message);}}}><Leaf size={25}/>농장</button>}{own&&!demoVillage&&<button onClick={()=>setPanel('personaUpdate')}><Sparkles size={25}/>Avatar Update</button>}{own&&<button className="exploration-entry" title="숲으로 출발" onClick={()=>{window.location.href="/explore?depart=1";}}><Compass size={25}/>숲으로 출발</button>}{own&&<button className="exploration-workshop-entry" title="공방" onClick={()=>{life.load();setPanel('workshop');}}><BookOpen size={25}/>공방</button>}{!own&&mode!=='village'&&!chatCollapsed&&<button className="walk-button" disabled={sending||sessionBusy} onClick={()=>{exitChat();setSessionsOpen(false);setBubble('');}}><Compass size={25}/>마을로 돌아가기</button>}{own&&mode!=='village'&&<button className="walk-button" onClick={()=>setMode('village')}><Compass size={25}/>내 마을 걷기</button>}{own&&<><button data-tutorial="customize" title="마을 꾸미기" onClick={()=>setPanel('villageEdit')}><Home size={25}/>마을 꾸미기</button><button onClick={()=>setPanel('avatarEdit')}><Shirt size={25}/>캐릭터 변경 · 꾸미기</button></>}<button data-tutorial="games" title="미니게임" onClick={()=>setPanel('game')}><Gamepad2 size={25}/>미니게임</button><button title="마을 기록" onClick={()=>setPanel('records')}><Trophy size={25}/>마을 기록</button><button className="mobile-world-tool" title="마을 캡처" aria-label="마을 캡처" onClick={captureStage}><Camera size={22}/></button><button className="mobile-world-tool" title="설정" aria-label="설정" onClick={()=>setPanel('settings')}><Settings size={22}/></button></div>
  {!demoVillage&&<PersonaDialogue me={me} socket={socketRef.current} visible={own&&!onboarding&&!panel} onExpression={setEmotion}/>}

  {own&&mode==='village'&&<><div className="village-footer"><div>{own&&<span className="village-visitors"><Users size={15}/>{villageMembers.filter(member=>member.userId!==me.id&&member.actorKind!=='PET').length?`함께 있는 이웃: ${villageMembers.filter(member=>member.userId!==me.id&&member.actorKind!=='PET').map(member=>member.nickname).join(', ')}`:'아직 방문한 이웃이 없어요'}</span>}{!own&&<><button className="secondary" onClick={goHome}><LogOut size={15}/>마을 나가기</button><button className="secondary" onClick={async()=>{try{await appRequest('/cheer',{method:'POST',body:{targetId:target.id,anonymous}});notify('따뜻한 응원을 남겼어요.');}catch(e){notify(e.message);}}}><Heart size={15}/>응원 남기기</button></>}</div></div></>}{!chatCollapsed&&<><section data-tutorial="chat" className={'chat-dock chat-side '+(chatCollapsed?'is-collapsed':'')+(!messages.length?' is-empty':'')} aria-label="아바타 대화창"><header><div><span className="conversation-status"/><strong>{target.nickname}와의 대화</strong><span className="ai-label">AI AVATAR</span>{!own&&<span className="privacy-note"><ShieldCheck size={12}/>허용된 기억으로만 대화해요</span>}</div><div className="chat-actions">{!own&&<button type="button" className="exit-chat-button" onClick={goHome}>내 마을로</button>}{chatCollapsed&&sending&&<span className="chat-fold-status"><span className="spinner"/>답변 작성 중…</span>}<button type="button" className="new-chat-button" disabled={sending||sessionBusy} onClick={()=>beginChat()}><Plus size={15}/>새 대화</button><button type="button" className="sessions-button" aria-expanded={sessionsOpen} aria-controls="chat-sessions" disabled={sending||sessionBusy} onClick={()=>setSessionsOpen(value=>!value)}><BookOpen size={15}/>세션</button><button type="button" className="chat-toggle" aria-label="대화창 끄기" onClick={()=>{setChatCollapsed(true);setSessionsOpen(false);document.getElementById('chat-input')?.blur();}}><X size={16}/><span>끄기</span></button></div></header>{sessionsOpen&&<ChatSessions key={target.id+':'+(me.activeSlot||'')} targetId={target.id} currentId={conversation} busy={sending||sessionBusy} onSelect={resumeConversation} onClose={closeSessions} onLogs={()=>{setSessionsOpen(false);setPanel('logs');}} notify={notify}/>}<div id="avatar-chat-body" className="chat-body" hidden={chatCollapsed}><div className="chat-messages" aria-live="polite">{!messages.length?<div className="chat-welcome"><span className="chat-spark">✧</span><p>{own?'내 취향대로 수다도, 농담도, 진지한 이야기도. 새 세션에서도 나를 닮은 성향은 이어져요.':'이 대화 상대는 소유자를 대표하는 AI 게임 캐릭터예요. 실제 사람과의 채팅이 아니에요.'}</p></div>:messages.map(m=><div className={'chat-line '+m.role} key={m.id}><small>{m.role==='user'?'나':m.role==='error'?'안내':target.nickname}</small><p>{m.content}</p></div>)}{sending&&<div className="typing-indicator"><i/><i/><i/></div>}<div ref={messagesEnd}/></div>{!messages.length&&own&&<div className="starter-row">{['오늘 기분 어때?','쉬는 날엔 뭐 하고 싶어?','너와 나는 어떤 점이 닮았을까?'].map(t=><button key={t} onClick={()=>{setText(t);document.getElementById('chat-input')?.focus();}}>{t}<Plus size={11}/></button>)}</div>}<form className="chat-input-wrap" onSubmit={send}><span className="input-flower"><Leaf size={22}/></span><input id="chat-input" aria-label="아바타에게 보낼 메시지" autoComplete="off" maxLength={1600} placeholder={own?'오늘 기분 어때?… 편하게 말해봐':'어떤 이야기든 편하게 시작해요'} value={text} readOnly={sending} disabled={sessionBusy} onChange={e=>setText(e.target.value)}/><button type="button" className={'icon-button mic '+(voice?'recording':'')} aria-label={voice?'음성 입력 중지':'음성 입력'} onClick={microphone}>{voice?<MicOff size={18}/>:<Mic size={18}/>}</button><button className="send-button" type="submit" onMouseDown={e=>e.preventDefault()} aria-label="이야기 보내기" disabled={sending||sessionBusy||!text.trim()}><Send size={22}/></button></form><footer><span><Lock size={10}/>{own?'대화 기록은 비공개 · 저장되는 기억은 기본 전체 공개':`방문자 대화 · ${share?'기록 공유에 동의함':'기록 비공개'}`}</span><span className={'ai-provider '+(ai==='local'?'local':'')}><i/>{ai==='local'?'로컬 체험 모드':'GEMINI 설정됨'}</span></footer></div></section></>}
  </div></main>
  <button inert={editing||guestbookFocused||lifeFocused||!!topicSession} className="people-reopen" aria-label="친구 패널 펼치기" aria-expanded="false" aria-controls="people-sidebar" onClick={()=>{setPeopleCollapsed(false);}}><PanelRightOpen size={20}/><span>친구</span></button>
  <aside inert={editing||guestbookFocused||lifeFocused||!!topicSession} id="people-sidebar" aria-label="친구와 이웃" className={'people-sidebar '+(peopleCollapsed?'is-collapsed ':'')+(mobilePeople?'mobile-open':'')}><header data-tutorial="friends"><div className="people-tabs" aria-label="친구 목록 필터"><button className={peopleTab==='friends'?'active':''} onClick={()=>setPeopleTab('friends')}>친구 <span>{others.filter(u=>u.relation==='accepted').length}</span></button><button className={peopleTab==='all'?'active':''} onClick={()=>setPeopleTab('all')}>이웃 <span>{others.length}</span></button></div><button className="icon-button" title="친구 추가 및 요청" aria-label="친구 추가 및 요청" onClick={()=>setPanel('social')}><UserPlus size={21}/>{others.some(u=>u.incoming)&&<span className="friend-request-count">{others.filter(u=>u.incoming).length}</span>}</button><button className="icon-button people-close" title="친구 패널 접기" aria-label="친구 패널 접기" aria-expanded="true" aria-controls="people-sidebar" onClick={()=>{setPeopleCollapsed(true);setMobilePeople(false);}}><PanelRightClose size={19}/></button></header><div className="people-search"><Search size={17}/><input aria-label="이웃 검색" placeholder="이름이나 관심사로 친구 찾기" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="people-list">{peopleError?<div className="people-load-status" role="status"><p>이웃 목록을 불러오지 못했어요.</p><button className="text-button" disabled={peopleLoading} onClick={refresh}>{peopleLoading?'다시 불러오는 중…':'다시 불러오기'}</button></div>:peopleLoading&&!others.length?<p className="people-load-status" role="status">친구와 이웃을 불러오고 있어요…</p>:null}{['online','offline'].map(status=>{const list=personList.filter(u=>status==='online'?u.online:!u.online);return list.length?<React.Fragment key={status}><div className="people-group-label"><span/>{status==='online'?'지금 함께하는 이웃':'잠시 쉬고 있는 이웃'}<small>{list.length}</small></div>{list.map(u=><button key={u.id} className={'person-row '+(target.id===u.id?'selected':'')} onClick={()=>visit(u.id)}><span className="person-avatar"><AvatarPortrait user={u}/>{u.memoryUpdated&&<b className="memory-update-badge" aria-label="새로운 기억 업데이트" title="새로운 기억이 있어요">!</b>}<i className={u.online?'online':''}/></span><span className="person-info"><strong>{u.nickname}{u.close&&<Star size={11} fill="currentColor"/>}{u.incoming&&<i className="request-dot"/>}</strong><small className={u.online?'online-text':''}>{levelLabel(u)}{u.online?' · 접속 중':''}</small><span>{u.tags.length?u.tags.slice(0,2).map(t=>'#'+t).join(' '):u.online?'정원에 머무는 중':'아바타와 대화할 수 있어요'}</span></span><MessageCircle className="person-chat-icon" size={18}/></button>)}</React.Fragment>:null;})}{!personList.length&&!peopleLoading&&!peopleError&&<div className="people-empty"><Flower2 size={30}/><h3>{query?'이웃을 찾을 수 없어요':peopleTab==='friends'?'아직 친구가 없어요':'함께할 이웃을 기다려요'}</h3><p>{peopleTab==='friends'?'이웃 설정에서 친구 요청을 보내보세요.':'친구가 계정을 만들면 이곳에서 만날 수 있어요.'}</p><button className="text-button" onClick={()=>{navigator.clipboard?.writeText(window.location.origin).then(()=>notify('초대할 주소를 복사했어요.')).catch(()=>notify(window.location.origin));}}>초대 주소 복사<ArrowUpRight size={12}/></button></div>}</div><div className="sidebar-bottom">{others.some(u=>u.incoming)&&<div className="friend-request-notice"><div className="friend-request-popup" role="status"><strong>친구 신청이 도착했어요!</strong><p>{others.find(u=>u.incoming)?.nickname}님{others.filter(u=>u.incoming).length>1?` 외 ${others.filter(u=>u.incoming).length-1}명`:''}의 신청을 확인해 주세요.</p></div><button className="friend-requests" onClick={()=>setPanel('social')}><UserPlus size={18}/><span>받은 친구 요청</span><b>{others.filter(u=>u.incoming).length}</b><ChevronRight size={16}/></button></div>}<button className="offline-note" onClick={()=>setPanel('social')}><div><strong>함께 만드는 더 큰 세상</strong><p>친구와 이웃을 만나보세요!</p></div><span><Leaf size={37}/><Sparkles size={18}/></span></button><div className="server-status"><span className={'presence-dot '+(connected?'online':'')}/>{demoVillage?'마을 체험 모드':connected?`전체 ${others.length}명의 이웃 중 ${onlineCount}명 접속 중`:'서버에 다시 연결하는 중…'}</div></div></aside>
  </div></div>
  {onboarding&&<Onboarding me={me} notify={notify} onComplete={async()=>{await refresh();setOnboarding(false);setPanel('cards');setBubble(`안녕! 네 이야기를 더 들려줄래?`);}}/>}
  {consent&&<Modal title={`${consent.nickname}와 이야기하기`} eyebrow="A SAFE LITTLE CONVERSATION" onClose={()=>setConsent(null)}><div className="panel-body consent-panel"><AvatarBadge user={consent} size="large"/><p>이웃을 대표하는 <strong>AI 게임 캐릭터</strong>와 대화해요. 질문과 답변은 대화창에서 확인할 수 있어요. 소유자가 허용한 기억만 사용하며, 이 대화는 상대의 영속적인 자아를 바꾸지 않아요.</p><label className="check-row"><input type="checkbox" checked={share} onChange={e=>setShare(e.target.checked)}/><span>이 대화의 내용을 아바타 소유자에게 공유할게요.<small>{consent.receiveTranscripts?'소유자가 내용 받기를 허용했어요. 양측 동의 시 전문이 보여요.':'소유자는 현재 내용 받기를 꺼두었어요. 다시 허용하면 동의된 내용이 보여요.'}</small></span></label><label className="check-row"><input type="checkbox" checked={anonymous} onChange={e=>setAnonymous(e.target.checked)}/><span>방문록과 대화 기록에 내 이름 대신 익명으로 표시하기</span></label><div className="info-strip"><Lock size={15}/><span>방문 사실은 남아요. 내용 공유는 지난 이야기에서 언제든 철회할 수 있고, 내가 시작한 대화는 삭제할 수 있어요. 이 프로토타입은 자동 만료 없이 PC 서버에 저장해요.</span></div><button className="primary full" onClick={()=>beginChat({accepted:true,share})}>마을에서 이야기 시작하기<MessageCircle size={16}/></button></div></Modal>}
  {runInvite&&<div ref={inviteRef} tabIndex={-1} className="runner-invitation" role="alertdialog" aria-label={runInvite.kind==='volley'?'몽글 배구 초대':runInvite.kind==='crab'?'게 게 게 초대':'구름 달리기 초대'}><span className="eyebrow">{runInvite.kind==='volley'?'MONGLE VOLLEY':runInvite.kind==='crab'?'CRAB CHASE':'CLOUD RUN'} · INVITATION</span><h3>{runInvite.kind==='volley'?'배구 한 판 할까요?':runInvite.kind==='crab'?'함께 도망쳐볼까요?':'함께 달릴까요?'}</h3><p>{runInvite.nickname}님이 {runInvite.kind==='volley'?'몽글 배구':runInvite.kind==='crab'?'게 게 게':'구름 달리기'}에 초대했어요.</p><p className="tiny">총 {runInvite.total||2}명이 함께해요. {runInvite.kind==='volley'?'같은 코트에서 점프와 스파이크로 대결해요.':runInvite.kind==='crab'?'같은 해변에서 서로의 게 행렬을 피해 살아남아요.':'이 마을의 같은 트랙에서 함께 달려요.'} 초대는 30초 동안 유효해요.</p><label className="check-row"><input type="checkbox" checked={!!runInvite.anonymous} disabled={runInvite.accepted} onChange={e=>setRunInvite(i=>({...i,anonymous:e.target.checked}))}/><span>내 게임 기록은 익명으로 표시</span></label><div><button className="secondary" onClick={()=>socketRef.current?.timeout(5000).emit('runner:respond',{inviteId:runInvite.id,accept:false},()=>setRunInvite(null))}>거절</button><button className="primary" disabled={runInvite.accepted} onClick={()=>socketRef.current?.timeout(5000).emit('runner:respond',{inviteId:runInvite.id,accept:true,anonymous:!!runInvite.anonymous},(err,r)=>{if(err||!r?.ok)notify(r?.error||'초대에 응답하지 못했어요.');else if(r.waiting)setRunInvite(i=>i?{...i,accepted:true}:i);})}>{runInvite.accepted?`친구 수락 대기 · ${runInvite.progress?.accepted||1}/${runInvite.total}명`:'수락하고 준비'}</button></div></div>}
  {panel==='guide'&&!onboarding&&<Tutorial onClose={closePanel}/>}
  {panel==='cards'&&!onboarding&&<AvatarCards key={target.id+':'+me.activeSlot} me={me} target={target} notify={notify} onClose={closePanel} socket={socketRef.current} onActivate={activateCardUser} onChat={()=>{setPanel(null);beginChat();}}/>}
  {panel&&!lifeFocused&&panel!=='explorationCraft'&&panel!=='cards'&&panel!=='guide'&&panel!=='villageEdit'&&panel!=='signView'&&panel!=='signEdit'&&panel!=='guestbook'&&<Modal className={panel==='game'?'playground-modal':panel==='capture'?'capture-modal':panel==='avatarEdit'?'avatar-studio-modal':['surveyInvite','surveyReward'].includes(panel)?'survey-gift-modal':''} description={panel==='game'?'이웃들과 함께 즐길 미니게임 방을 만들어 보세요!':undefined} side={panel==='villageThemes'} title={panels[panel][0]} eyebrow={panels[panel][1]} dismissOnBackdrop={panel!=='game'} onClose={()=>{if(topicBusy)return notify('토픽 생성이 끝날 때까지 기다려 주세요.');closePanel();}} wide={['storage','garden','kitchen','memory','logs','social','settings','game','villageEdit','avatarEdit','feedback','surveyStatistics','capture'].includes(panel)}>{panel==='personaUpdate'?<PersonaUpdate key={me.id+':'+me.activeSlot} notify={notify} onApplied={refresh}/>:panel==='workshop'?<div className="panel-body workshop-menu"><p>마을에서 모은 재료로 만들고, 요리하고, 보관하세요.</p>{[['explorationCraft','제작','설계도로 만드는 특별한 소품'],['kitchen','요리','수확한 작물과 물고기로 만드는 요리'],['storage','보관함 · 도감','소지품과 물고기 도감을 한눈에']].map(([id,title,description])=><button className="secondary" key={id} onClick={()=>{life.load();setLifeObjectId(id==='kitchen'?'kitchen':null);setPanel(id);}}><strong>{title}</strong><span>{description}</span><ChevronRight size={20}/></button>)}</div>:panel==='chalkboard'?<Chalkboard key={target.id} target={target} me={me} board={chalkboard}/>:panel==='polls'?<VillagePolls target={target} me={me} polls={villagePolls.polls} error={villagePolls.error} onRefresh={async()=>{await villagePolls.load();await refresh();}} notify={notify}/>:panel==='logoutConfirm'?<div className="panel-body"><p className="muted">정원에서 나가 로그아웃할까요?</p><div className="form-row logout-confirm-actions"><button className="secondary" disabled={logoutBusy} onClick={closePanel}>취소</button><button className="primary" disabled={logoutBusy} onClick={logout}>{logoutBusy?'로그아웃 중…':'로그아웃'}</button></div></div>:panel==='villageThemes'?<div className="panel-body village-theme-list" aria-busy={stageBusy}><p className="muted">원하는 테마를 선택하면 마을에 바로 적용되고 저장돼요.</p>{villageThemes.map(t=><button key={t.id} disabled={!own||stageBusy} aria-pressed={(target.village?.theme||'default')===t.id} onClick={()=>changeStage(t.id)}><span className="theme-swatch" style={{background:t.swatch}}/><span><strong>{t.name}</strong><small>{t.description}</small></span>{(target.village?.theme||'default')===t.id&&<Check size={18}/>}</button>)}<p className="tiny" role="status">{stageBusy?'테마를 저장하고 있어요…':'선택한 테마는 방문한 이웃에게도 보여요.'}</p></div>:panel==='capture'?<StageCapture key={shot?.id||'album'} shot={shot} ownerId={me.id} themeId={target.village?.theme||'default'} notify={notify} closeGuard={captureCloseRef} onClose={()=>closePanel({discardCapture:true})} onNewCapture={captureStage}/>:panel==='surveyReward'?<div className="panel-body"><SurveyRewards received/><div className="reward-success-actions"><button className="primary" onClick={()=>setPanel('avatarEdit')}>아기용 꾸미기</button><button className="secondary" onClick={()=>{setMode('village');setTargetId(me.id);setPanel('villageEdit');}}>둥지 배치하기</button></div></div>:panel==='surveyInvite'?<SurveyInvitation busy={surveyBusy} onStart={()=>setPanel('feedback')} onLater={laterSurvey}/>:panel==='villageEdit'||panel==='avatarEdit'?<Customization key={panel} me={me} kind={panel==='avatarEdit'?'avatar':'village'} notify={notify} onRefresh={refresh} onClose={closePanel}/>:panel==='records'?<div className="panel-body"><Records target={target} notify={notify} socket={socketRef.current}/></div>:panel==='slots'?<SlotsPanel notify={notify} onActivate={async user=>{await refresh();setTargetId(user.id);setMode('home');setMessages([]);setConversation(null);setPanel(null);setOnboarding(!user.nickname||!user.balance.length);setSceneType(user.settings.scene);setBubble('');await restoreOwnConversation(user);loadDaily();}}/>:panel==='memory'?<MemoryPanel notify={notify} onRefresh={refresh}/>:panel==='settings'?<SettingsPanel me={me} onGuide={()=>setPanel('guide')} onLogout={requestLogout} notify={notify} onRefresh={refresh} onSlots={()=>setPanel('slots')}/>:panel==='logs'?<LogsPanel notify={notify} onOpenConversation={resumeConversation} onVisit={visit}/>:panel==='social'?<SocialPanel me={me} users={users} onVisit={visit} notify={notify} onRefresh={refresh}/>:panel==='surveyStatistics'?(['admin','manager'].includes(me.surveyRole)&&<SurveyStatistics role={me.surveyRole} socket={socketRef.current} notify={notify}/>):panel==='feedback'?<Survey notify={notify} onComplete={completeSurvey} onLater={laterSurvey} onBusyChange={setSurveyBusy}/>:panel==='game'?<GameHub target={target} me={me} notify={notify} onReward={finishGame} anonymous={anonymous} socket={socketRef.current} members={villageMembers} race={race} onLeaveRace={()=>{socketRef.current?.emit('runner:leave',{});setRace(null);}}/>:panel==='topics'?<div className="panel-body topic-panel"><div className="topic-pair"><AvatarBadge user={me} size="large"/><Sparkles size={24}/><AvatarBadge user={users.find(u=>u.id===topicPartner)||(!own?target:null)} size="large"/></div><p className="muted">{'이웃 아바타를 내 마을로 초대해 마주 보고 이야기를 나눠요.'}<br/>전체 공개된 기억만 사용하며, 서로의 자아는 바뀌지 않아요.</p><select aria-label="함께할 이웃" value={topicPartner||(!own?target.id:'')} onChange={e=>setTopicPartner(e.target.value)}><option value="">함께할 이웃 고르기</option>{others.filter(u=>u.allowTopics&&u.allowVisitors).map(u=><option key={u.id} value={u.id}>{u.nickname}</option>)}</select><label>함께 나눌 주제<input maxLength={120} value={topic} onChange={e=>setTopic(e.target.value)}/></label><div className="starter-row">{['서로의 첫인상은?','무인도에 함께 간다면?','완벽한 주말을 계획해줘'].map(t=><button key={t} onClick={()=>setTopic(t)}>{t}</button>)}</div><button className="primary full" onClick={runTopic} disabled={topicBusy||!(topicPartner||!own&&target.id)||!topic.trim()}><Sparkles size={16}/>{topicBusy?'두 개의 이야기가 만나는 중…':'스페셜 토픽 시작 · 무료'}</button></div>:null}</Modal>}
  {topicSession&&<section className="topic-playback" aria-label="스페셜 토픽 대화">
    <header><span>스페셜 토픽 · 내 마을</span><h2>{topicSession.topic}</h2><p>{me.nickname} × {topicSession.partner.nickname}</p></header>
    <footer><p role="status">{topicBusy?'이웃을 초대하고 이야기를 준비하고 있어요…':topicIndex>=topicResult?.length?'이야기가 마무리되었어요.':`${topicIndex+1} / ${topicResult?.length||8}번째 이야기`}</p><div>
      {topicResult&&topicIndex<topicResult.length&&<><button onClick={()=>setTopicPlaying(v=>!v)}>{topicPlaying?'잠시 멈춤':'이어 보기'}</button><button onClick={()=>setTopicIndex(i=>i+1)}>다음 대사</button></>}
      {topicResult&&topicIndex>=topicResult.length&&<button onClick={()=>{setTopicIndex(0);setTopicPlaying(true);}}>다시 보기</button>}
      {topicResult&&<button onClick={()=>{const blob=new Blob([JSON.stringify({topic:topicSession.topic,transcript:topicResult},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='illova-topic.json';a.click();URL.revokeObjectURL(url);}}>이야기 카드 저장</button>}
      <button autoFocus onClick={endTopic}>대화 나가기</button>
    </div></footer>
  </section>}
  <LifeStudio onChat={()=>{setPanel(null);if(conversation){setChatCollapsed(false);setSessionsOpen(false);}else beginChat();}} onNavigate={next=>{life.load();setLifeObjectId(null);setPanel(next);}} objectId={lifeObjectId} onSelectPlot={setLifeObjectId} viewer={me} village={target.village} position={localPose.current} key={'life:'+target.id} context={lifeFocused?panel:null} data={life.data} onRetry={life.load} pending={life.pending} connected={connected} onAction={performLife} onClose={()=>{if(panel==='kitchen'||panel==='storage')setPanel('workshop');else closePanel();}}/>
  {guestbookFocused&&<Guestbook key={target.id} target={target} me={me} socket={socketRef.current} notify={notify} onClose={closePanel}/>}
  {panel==='signView'&&<div className="sign-view-actions" role="region" aria-label="팻말 확대 보기"><strong>{own?'우리 마을 팻말':target.nickname+'의 팻말'}</strong>{own&&<button onClick={()=>setPanel('signEdit')}><Paintbrush size={18}/>팻말 편집하기</button>}<button autoFocus onClick={closePanel}><X size={17}/>돌아가기</button></div>}
  {panel==='signEdit'&&own&&<SignEditor key={target.id} sign={villageSign(target.village)} onClose={()=>setPanel('signView')} onSaved={user=>{setMe(user);setPanel('signView');notify('팻말을 저장했어요. 마을에 온 이웃에게도 보여요.');}}/>}
  {editing&&<VillageEditor me={me} notify={notify} onRefresh={refresh} onClose={closeVillageEditor} onSceneChange={setEditorSession}/>}
  {panel==='explorationCraft'&&<Suspense fallback={<div className="boot" role="status">공방을 여는 중…</div>}><Exploration villageWorkshop user={demoVillage?null:me} onClose={async()=>{setPanel('workshop');await refresh();}}/></Suspense>}
  {toast&&<div className={'toast'+(editing?' toast-village-editor':panel==='signView'?' toast-sign-view':'')} role="status"><Flower2 size={17}/>{toast}</div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<MusicProvider>{location.pathname==='/explore'?<Suspense fallback={<div className="boot" role="status">숲으로 가는 길을 여는 중…</div>}><Exploration/></Suspense>:<App demoVillage={demoVillageView(location.search)}/>}</MusicProvider>);
