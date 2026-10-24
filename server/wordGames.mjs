import {z} from 'zod';
import {id,now} from './store.mjs';
import {TYPING_PHRASES,validateChain,normalizeWord} from '../shared/wordGames.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function installWordGames({app,io,store,auth,checkTarget,userById,villageVisitors,emitWorld,emitVillage=()=>{},isBusy=()=>false,clock=Date.now}){
  const rooms=new Map();
  const present=(uid,village)=>!!villageVisitors.get(village)?.get(uid)?.sockets.size;
  const busy=uid=>[...rooms.values()].some(r=>r.status!=='finished'&&r.players.some(p=>p.id===uid));
  const snapshot=r=>({...r,serverTime:clock(),phrases:r.kind==='typing'?TYPING_PHRASES:undefined});
  const publish=r=>{io.to(`village:${r.villageId}`).emit('duel:state',snapshot(r));};
  function finish(r,winner,reason){
    if(r.status==='finished')return;
    r.status='finished';r.winner=winner;r.reason=reason;r.finishedAt=clock();
    if(r.startedAt&&clock()>=r.startedAt)store.transaction(()=>{
      for(const p of r.players){
        const score=r.kind==='typing'?p.correct:p.score;
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
      if(r.kind==='wordchain')finish(r,r.players[1-r.turn].id,'상대의 단어 입력 시간이 끝났어요.');
      else {const [a,b]=r.players;finish(r,a.correct===b.correct?null:a.correct>b.correct?a.id:b.id,'60초 타자 대결이 끝났어요.');}
    }
    if(r.finishedAt&&clock()-r.finishedAt>300000)rooms.delete(r.id);
  }}
  const roomFor=(req)=>{const r=rooms.get(req.params.id);if(!r)fail(404,'대결을 찾을 수 없어요.');checkTarget(req,r.villageId);if(!r.players.some(p=>p.id===req.user.id))fail(403,'참가자만 조작할 수 있어요.');return r;};
  app.get('/api/villages/:id/duels',auth,(req,res)=>{checkTarget(req,req.params.id);tick();res.json({rooms:[...rooms.values()].filter(r=>r.villageId===req.params.id&&(r.status!=='finished'||r.players.some(p=>p.id===req.user.id))).map(snapshot)});});
  app.post('/api/villages/:id/duels',auth,(req,res)=>{
    checkTarget(req,req.params.id);tick();if(!present(req.user.id,req.params.id))fail(409,'마을에 연결한 뒤 시작해주세요.');
    if(busy(req.user.id)||isBusy(req.user.id))fail(409,'이미 참가한 게임이나 생활 활동을 먼저 마쳐주세요.');
    const {kind}=z.object({kind:z.enum(['typing','wordchain'])}).parse(req.body);
    const r={id:id(),villageId:req.params.id,kind,status:'waiting',createdAt:clock(),players:[{id:req.user.id,nickname:req.user.nickname,correct:0,attempted:0,index:0,score:0,lastInput:0}],used:[],turn:0,log:[]};rooms.set(r.id,r);publish(r);emitVillage(r.villageId);res.status(201).json({room:snapshot(r)});
  });
  app.post('/api/duels/:id/join',auth,(req,res)=>{
    tick();const r=rooms.get(req.params.id);if(!r)fail(404,'대결을 찾을 수 없어요.');checkTarget(req,r.villageId);
    if(r.status!=='waiting'||r.players.length!==1)fail(409,'이미 시작한 대결이에요.');
    if(!present(req.user.id,r.villageId)||busy(req.user.id)||isBusy(req.user.id))fail(409,'같은 마을에서 대기 중인 친구만 참가할 수 있어요.');
    r.players.push({id:req.user.id,nickname:req.user.nickname,correct:0,attempted:0,index:0,score:0,lastInput:0});r.status='playing';r.startedAt=clock()+3000;r.deadline=r.startedAt+(r.kind==='typing'?60000:15000);publish(r);emitVillage(r.villageId);res.json({room:snapshot(r)});
  });
  app.post('/api/duels/:id/action',auth,(req,res)=>{
    tick();const r=roomFor(req),p=r.players.find(p=>p.id===req.user.id);
    if(r.status!=='playing'||clock()<r.startedAt)fail(409,'대결 시작을 기다려주세요.');
    if(!present(req.user.id,r.villageId))fail(409,'대결이 열린 마을로 돌아와주세요.');
    const {text,index}=z.object({text:z.string().trim().min(1).max(200),index:z.number().int().min(0).optional()}).parse(req.body);
    if(r.kind==='typing'){
      if(index!==p.index)fail(409,'현재 문장으로 다시 입력해주세요.');
      const expected=TYPING_PHRASES[p.index%TYPING_PHRASES.length];
      if(clock()-Math.max(r.startedAt,p.lastInput)<Math.max(1200,expected.length*45))fail(429,'입력이 너무 빨라요. 문장을 직접 입력해주세요.');
      p.attempted+=expected.length;p.lastInput=clock();
      if(normalizeWord(text)!==expected){publish(r);return res.json({room:snapshot(r),error:'문장이 달라요. 띄어쓰기와 문장 부호를 확인해주세요.'});}
      p.correct+=expected.length;p.index++;
    }else{
      if(r.players[r.turn].id!==req.user.id)fail(409,'상대의 차례예요.');
      const error=validateChain(text,r.used);if(error)fail(400,error);
      r.used.push(normalizeWord(text));p.score++;r.log.push({nickname:p.nickname,text:normalizeWord(text)});r.turn=1-r.turn;r.deadline=clock()+15000;
      if(r.used.length>=100)finish(r,null,'100개 단어를 함께 완성했어요!');
    }
    publish(r);res.json({room:snapshot(r)});
  });
  app.post('/api/duels/:id/leave',auth,(req,res)=>{const r=roomFor(req);finish(r,r.startedAt?r.players.find(p=>p.id!==req.user.id)?.id:null,r.startedAt?'상대가 대결을 떠났어요.':'대결을 취소했어요.');res.json({ok:true});});
  const timer=setInterval(tick,500);timer.unref();
  function leave(uid,villageId){for(const r of rooms.values())if(r.villageId===villageId&&r.status!=='finished'&&r.players.some(p=>p.id===uid))finish(r,r.startedAt?r.players.find(p=>p.id!==uid)?.id:null,'친구가 마을을 떠났어요.');}
  return {busy,tick,leave,close(){clearInterval(timer);}};
}
