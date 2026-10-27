import {validateChain,findChainHint} from './chainDictionary.mjs';
import {randomInt} from 'node:crypto';
import {z} from 'zod';
import {id,now} from './store.mjs';
import {typingWordSequence,TYPING_TYPO_PENALTY,TYPING_ROUNDS,TYPING_ROUND_MS,TYPING_WORD_POINTS,CHAIN_ROUNDS,CHAIN_GAME_MS,CHAIN_HINTS,CHAIN_REACTIONS,chainWordPoints,normalizeWord} from '../shared/wordGames.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function installWordGames({app,io,store,auth,checkTarget,userById,playerAppearance=user=>JSON.parse(user.appearance||'{}'),villageVisitors,emitWorld,emitVillage=()=>{},isBusy=()=>false,clock=Date.now}){
  const rooms=new Map();
  const hintHistory=new Map();
  const present=(uid,village)=>!!villageVisitors.get(village)?.get(uid)?.sockets.size;
  const active=r=>r.players.filter(p=>!p.left);
  const busy=uid=>[...rooms.values()].some(r=>r.status!=='finished'&&r.players.some(p=>p.id===uid&&!p.left));
  const player=user=>({id:user.id,nickname:user.nickname,appearance:{character:'pio',...playerAppearance(user)},correct:0,attempted:0,index:0,score:0,lastInput:0,hintsLeft:CHAIN_HINTS});
  const snapshot=r=>{
    const round=r.kind==='typing'?Math.min(TYPING_ROUNDS,Math.max(1,Math.floor((clock()-(r.startedAt||clock()))/TYPING_ROUND_MS)+1)):Math.min(CHAIN_ROUNDS,r.chainRound||1);
    return {...r,serverTime:clock(),round,rounds:r.kind==='typing'?TYPING_ROUNDS:CHAIN_ROUNDS,roundDeadline:r.startedAt&&r.kind==='typing'?Math.min(r.deadline,r.startedAt+round*TYPING_ROUND_MS):undefined};
  };
  const publish=r=>{io.to(`village:${r.villageId}`).emit('duel:state',snapshot(r));};
  function finish(r,winner,reason){
    if(r.status==='finished')return;
    r.status='finished';r.winner=winner;r.reason=reason;r.finishedAt=clock();
    if(r.startedAt&&clock()>=r.startedAt)store.transaction(()=>{
      for(const p of active(r)){
        const score=p.score;
        store.run('INSERT OR IGNORE INTO social_game_records VALUES(?,?,?,?,?,?,?)',r.id,p.id,r.villageId,r.kind,score,JSON.stringify({winner,reason,opponent:r.players.find(x=>x.id!==p.id)?.nickname}),now());
        const daily=store.one("SELECT COUNT(*) n FROM social_game_records WHERE user_id=? AND created_at>=?",p.id,new Date(clock()-86400000).toISOString()).n;
        if(daily<=10&&(clock()-r.startedAt>=10000||r.used.length>=2)){store.run('UPDATE users SET gold=gold+? WHERE id=?',winner===p.id?20:10,p.id);const user=userById(p.id);store.run('INSERT OR IGNORE INTO avatar_experience VALUES(?,?,?,10)',`duel:${r.id}:${p.id}`,p.id,user.active_slot);}
      }
    });
    publish(r);emitVillage(r.villageId);emitWorld();
  }
  function tick(){for(const r of rooms.values()){
    if(r.status==='waiting'&&clock()-r.createdAt>120000)finish(r,null,'대기 시간이 끝났어요.');
    if(r.status==='playing'&&clock()>=r.deadline){
      if(r.kind==='wordchain'){r.loser=r.players[r.turn].id;r.lastEvent={type:'timeout',playerId:r.loser,at:clock()};finish(r,chainWinner(r),`${r.players[r.turn].nickname}님이 제한 시간 안에 답하지 못했어요.`);}
      else {const ranked=active(r).sort((a,b)=>b.score-a.score);finish(r,ranked.length&&(!ranked[1]||ranked[0].score>ranked[1].score)?ranked[0].id:null,'60초 타자입력 게임이 끝났어요!');}
    }
    if(r.finishedAt&&clock()-r.finishedAt>300000){rooms.delete(r.id);for(const key of hintHistory.keys())if(key.startsWith(r.id+':'))hintHistory.delete(key);}
  }}
  function chainWinner(r){const ranked=active(r).filter(p=>p.id!==r.loser).sort((a,b)=>b.score-a.score);return ranked.length&&(!ranked[1]||ranked[0].score>ranked[1].score)?ranked[0].id:null;}
  function advanceChain(r){
    const previous=r.turn;
    for(let step=1;step<=r.players.length;step++){
      const next=(previous+step)%r.players.length;if(r.players[next].left)continue;
      r.turn=next;r.turnStartedAt=clock();return;
    }
    finish(r,null,'모든 참가자가 게임을 떠났어요.');
  }
  const roomFor=(req)=>{const r=rooms.get(req.params.id);if(!r)fail(404,'대결을 찾을 수 없어요.');checkTarget(req,r.villageId);if(!r.players.some(p=>p.id===req.user.id&&!p.left))fail(403,'참가자만 조작할 수 있어요.');return r;};
  app.get('/api/villages/:id/duels',auth,(req,res)=>{checkTarget(req,req.params.id);tick();res.json({rooms:[...rooms.values()].filter(r=>r.villageId===req.params.id&&(r.status!=='finished'||r.players.some(p=>p.id===req.user.id))).map(snapshot)});});
  app.post('/api/villages/:id/duels',auth,(req,res)=>{
    checkTarget(req,req.params.id);tick();if(!present(req.user.id,req.params.id))fail(409,'마을에 연결한 뒤 시작해주세요.');
    if(busy(req.user.id)||isBusy(req.user.id))fail(409,'이미 참가한 게임이나 생활 활동을 먼저 마쳐주세요.');
    const {kind}=z.object({kind:z.enum(['typing','wordchain'])}).parse(req.body);
    const words=kind==='typing'?typingWordSequence(randomInt):undefined;
    const r={id:id(),villageId:req.params.id,hostId:req.user.id,kind,status:'waiting',createdAt:clock(),players:[player(req.user)],words,used:[],turn:0,chainRound:1,log:[],reactions:{}};rooms.set(r.id,r);publish(r);emitVillage(r.villageId);res.status(201).json({room:snapshot(r)});
  });
  app.post('/api/duels/:id/join',auth,(req,res)=>{
    tick();const r=rooms.get(req.params.id);if(!r)fail(404,'대결을 찾을 수 없어요.');checkTarget(req,r.villageId);
    if(r.status!=='waiting')fail(409,'이미 시작한 대결이에요.');
    if(!present(req.user.id,r.villageId)||busy(req.user.id)||isBusy(req.user.id))fail(409,'같은 마을에서 대기 중인 친구만 참가할 수 있어요.');
    r.players.push(player(req.user));publish(r);emitVillage(r.villageId);res.json({room:snapshot(r)});
  });
  app.post('/api/duels/:id/start',auth,(req,res)=>{
    tick();const r=roomFor(req);
    if(r.status!=='waiting')fail(409,'시작할 수 있는 대기실이 아니에요.');
    if(r.hostId!==req.user.id)fail(403,'방장만 게임을 시작할 수 있어요.');
    if(!present(req.user.id,r.villageId))fail(409,'마을에 연결한 뒤 시작해주세요.');
    if(active(r).length<2)fail(409,'친구가 한 명 이상 참가하면 시작할 수 있어요.');
    r.status='playing';r.startedAt=clock()+3000;r.turnStartedAt=r.startedAt;r.deadline=r.startedAt+(r.kind==='typing'?TYPING_ROUNDS*TYPING_ROUND_MS:CHAIN_GAME_MS);
    publish(r);emitVillage(r.villageId);res.json({room:snapshot(r)});
  });
  app.post('/api/duels/:id/action',auth,(req,res)=>{
    tick();const r=roomFor(req),p=r.players.find(p=>p.id===req.user.id);
    if(r.status!=='playing'||clock()<r.startedAt)fail(409,'대결 시작을 기다려주세요.');
    if(!present(req.user.id,r.villageId))fail(409,'대결이 열린 마을로 돌아와주세요.');
    const {text,index}=z.object({text:z.string().trim().min(1).max(200),index:z.number().int().min(0).optional()}).parse(req.body);
    if(r.kind==='typing'){
      if(index!==p.index)fail(409,'현재 단어로 다시 입력해주세요.');
      const expected=r.words[p.index%r.words.length];
      if(clock()-Math.max(r.startedAt,p.lastInput)<Math.max(180,expected.length*45))fail(429,'입력이 너무 빨라요. 단어를 직접 입력해주세요.');
      p.attempted+=expected.length;p.lastInput=clock();
      if(normalizeWord(text)!==expected){p.score=Math.max(0,p.score-TYPING_TYPO_PENALTY);p.typos=(p.typos||0)+1;publish(r);return res.json({room:snapshot(r),error:`오타! ${TYPING_TYPO_PENALTY}점 감점 (최저 0점). 다시 입력해 주세요.`});}
      p.correct+=expected.length;p.score+=TYPING_WORD_POINTS;p.index++;
    }else{
      if(r.players[r.turn].id!==req.user.id)fail(409,'상대의 차례예요.');
      const error=validateChain(text,r.used);if(error)fail(400,error);
      const elapsed=clock()-r.turnStartedAt,points=chainWordPoints(elapsed);
      r.used.push(normalizeWord(text));p.score+=points;r.log.push({playerId:p.id,nickname:p.nickname,text:normalizeWord(text),at:clock(),points,elapsed});r.lastEvent={type:'word',playerId:p.id,at:clock(),points};advanceChain(r);
    }
    publish(r);res.json({room:snapshot(r)});
  });
  app.post('/api/duels/:id/hint',auth,(req,res)=>{
    tick();const r=roomFor(req),p=r.players.find(p=>p.id===req.user.id);
    if(r.kind!=='wordchain'||r.status!=='playing'||clock()<r.startedAt||r.players[r.turn].id!==p.id)fail(409,'내 차례에 힌트를 사용할 수 있어요.');
    if(!present(p.id,r.villageId))fail(409,'마을에 다시 연결해주세요.');
    if(!p.hintsLeft)fail(409,'이번 게임의 힌트를 모두 사용했어요.');
    const key=r.id+':'+p.id,previous=hintHistory.get(key)||[],hint=findChainHint(r.used,previous);
    if(!hint)fail(404,'이어갈 수 있는 힌트를 찾지 못했어요.');
    p.hintsLeft--;hintHistory.set(key,[...previous,hint]);publish(r);res.json({hint,room:snapshot(r)});
  });
  app.post('/api/duels/:id/reaction',auth,(req,res)=>{
    tick();const r=roomFor(req),{emoji}=z.object({emoji:z.enum(CHAIN_REACTIONS)}).parse(req.body);
    if(r.kind!=='wordchain'||r.status==='finished'||!present(req.user.id,r.villageId))fail(409,'참가 중인 끝말잇기에서 사용할 수 있어요.');
    const previous=r.reactions[req.user.id];if(previous&&clock()-previous.at<1500)fail(429,'이모티콘은 잠시 후 다시 보내주세요.');
    r.reactions[req.user.id]={emoji,at:clock()};publish(r);res.json({room:snapshot(r)});
  });
  function depart(r,uid){
    if(r.status==='finished')return;
    if(r.status==='waiting'){r.players=r.players.filter(p=>p.id!==uid);if(r.hostId===uid)r.hostId=r.players[0]?.id;}
    else {const p=r.players.find(p=>p.id===uid);if(p)p.left=true;}
    if(!active(r).length)finish(r,null,'모든 참가자가 게임을 떠났어요.');
    else if(r.kind==='wordchain'&&r.status==='playing'&&active(r).length<2)finish(r,active(r)[0].id,'친구가 게임을 떠났어요.');
    else if(r.kind==='wordchain'&&r.status==='playing'&&r.players[r.turn].id===uid){advanceChain(r);if(r.status!=='finished'){publish(r);emitVillage(r.villageId);}}
    else {publish(r);emitVillage(r.villageId);}
  }
  app.post('/api/duels/:id/leave',auth,(req,res)=>{tick();const r=roomFor(req);depart(r,req.user.id);res.json({ok:true});});
  const timer=setInterval(tick,500);timer.unref();
  function leave(uid,villageId){for(const r of rooms.values())if(r.villageId===villageId&&r.status!=='finished'&&r.players.some(p=>p.id===uid&&!p.left))depart(r,uid);}
  return {busy,tick,leave,close(){clearInterval(timer);}};
}
