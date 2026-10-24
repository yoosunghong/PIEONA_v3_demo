import {createHash} from 'node:crypto';
import {z} from 'zod';
import {id,now,settingsOf,visibleMemories} from './store.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
// Avatar decisions stay on this server. No memory or wagering data leaves the app.
export function localBallot(user,poll,memories,signals){
  const preference=JSON.stringify({memories:memories.map(m=>m.content),tags:settingsOf(user).publicTags,signals});
  const groups=[['캠핑','텐트','모닥불','야외','산책','숲'],['게임','콘솔','타자','끝말','놀이터'],['집','휴식','조용','차분','포근'],['모험','여행','새로운','탐험'],['매운','매콤','떡볶이'],['디저트','달콤','케이크'],['음악','노래','공연'],['독서','책','도서관']];
  const score=option=>groups.reduce((sum,words)=>sum+(words.some(w=>preference.includes(w))&&words.some(w=>option.includes(w))?3:0),0)+[...new Set(option.match(/[가-힣]{2,}/g)||[])].filter(word=>preference.includes(word)).length;
  const a=score(poll.option_a),b=score(poll.option_b),tie=createHash('sha256').update(user.active_slot+poll.id).digest()[0]%2;
  return {choice:a===b?(tie?'b':'a'):a>b?'a':'b',reason:a===b?'새로운 취향을 알아가고 싶어서 골랐어요.':'내 취향과 마을에서 즐긴 활동에 더 가까워요.',provider:'local'};
}
export function installVillagePolls({app,io,store,auth,checkTarget,userById,ensureSlot,villageVisitors,emitWorld,avatars,clock=Date.now}){
  const rowFor=pid=>{const p=store.one('SELECT * FROM village_polls WHERE id=?',pid);if(!p)fail(404,'투표를 찾을 수 없어요.');return p;};
  const ballots=pid=>store.all('SELECT user_id AS userId,nickname,choice,reason,provider,stake,payout FROM village_ballots WHERE poll_id=? ORDER BY created_at,user_id',pid);
  const notify=owner=>{io.to(`village:${owner}`).emit('poll:changed',{villageId:owner});emitWorld();};
  function settle(pid,manual=false){
    let changed=false;
    store.transaction(()=>{
      const poll=rowFor(pid);if(poll.status!=='open')return;
      const votes=ballots(pid),a=votes.filter(v=>v.choice==='a').length,b=votes.length-a,winner=a===b?null:a>b?'a':'b';
      if(!manual&&clock()<poll.deadline&&votes.length<poll.max_votes)return;
      const status=manual?'cancelled':'closed',refund=manual||!winner,pool=votes.reduce((sum,v)=>sum+v.stake,0),winners=votes.filter(v=>v.choice===winner);
      let remainder=refund?0:pool%Math.max(1,winners.length);
      for(const v of votes){const payout=refund?v.stake:v.choice===winner?Math.floor(pool/winners.length)+(remainder-->0?1:0):0;
        store.run('UPDATE village_ballots SET payout=? WHERE poll_id=? AND user_id=?',payout,pid,v.userId);
        if(payout)store.run('UPDATE users SET gold=gold+? WHERE id=?',payout,v.userId);
      }
      store.run("UPDATE village_polls SET status=?,result=? WHERE id=? AND status='open'",status,JSON.stringify({a,b,winner,refund,pool,reason:manual?'주인이 수동 종료했어요. 내기 골드를 모두 돌려드려요.':a===b?'동률이에요. 내기 골드를 모두 돌려드려요.':`더 많은 아바타가 ${winner.toUpperCase()}를 골랐어요.`}),pid);changed=true;
    });
    if(changed)notify(rowFor(pid).owner_id);
  }
  function tick(){for(const p of store.all("SELECT id FROM village_polls WHERE status='open' AND deadline<=?",clock()))settle(p.id);}
  function view(poll,viewer){
    settle(poll.id);poll=rowFor(poll.id);const votes=ballots(poll.id),participated=votes.some(v=>v.userId===viewer);
    return {id:poll.id,ownerId:poll.owner_id,question:poll.question,options:{a:poll.option_a,b:poll.option_b},stake:poll.stake,maxVotes:poll.max_votes,deadline:poll.deadline,status:poll.status,createdAt:poll.created_at,count:votes.length,participated,ballots:participated||poll.status!=='open'?votes:[],result:poll.result?JSON.parse(poll.result):null,serverTime:clock()};
  }
  app.get('/api/villages/:id/polls',auth,(req,res)=>{checkTarget(req,req.params.id);tick();res.json({polls:store.all('SELECT * FROM village_polls WHERE owner_id=? ORDER BY created_at DESC,rowid DESC LIMIT 10',req.params.id).map(p=>view(p,req.user.id))});});
  app.post('/api/villages/:id/polls',auth,(req,res)=>{
    if(req.params.id!==req.user.id)fail(403,'마을 주인만 투표를 열 수 있어요.');tick();
    const data=z.object({question:z.string().trim().min(2).max(100),a:z.string().trim().min(1).max(80),b:z.string().trim().min(1).max(80),stake:z.number().int().min(0).max(10000).default(0),maxVotes:z.number().int().min(2).max(50),minutes:z.number().int().min(1).max(1440)}).strict().parse(req.body);
    if(data.a===data.b)fail(400,'서로 다른 두 선택지를 적어주세요.');
    if(store.one("SELECT id FROM village_polls WHERE owner_id=? AND status='open'",req.user.id))fail(409,'진행 중인 투표를 먼저 마쳐주세요.');
    const pid=id();store.run('INSERT INTO village_polls(id,owner_id,question,option_a,option_b,stake,max_votes,deadline,created_at) VALUES(?,?,?,?,?,?,?,?,?)',pid,req.user.id,data.question,data.a,data.b,data.stake,data.maxVotes,clock()+data.minutes*60000,now());notify(req.user.id);res.status(201).json({poll:view(rowFor(pid),req.user.id)});
  });
  app.post('/api/polls/:id/attend',auth,(req,res)=>{
    tick();const poll=rowFor(req.params.id);checkTarget(req,poll.owner_id);
    if(!villageVisitors.get(poll.owner_id)?.get(req.user.id)?.sockets.size)fail(409,'투표가 열린 마을에 입장해주세요.');
    if(poll.status!=='open')fail(409,'종료된 투표예요.');
    let user=ensureSlot(userById(req.user.id));
    if(!JSON.parse(user.balance).length)fail(409,'아바타 튜토리얼을 먼저 완료해주세요.');
    const memories=visibleMemories(store,user.id,user.id).filter(m=>m.confirmed),decision=localBallot(user,poll,memories,avatars.signals(user));
    store.transaction(()=>{
      if(store.one('SELECT 1 FROM village_ballots WHERE poll_id=? AND user_id=?',poll.id,user.id))fail(409,'이미 아바타가 투표했어요.');
      if(clock()>=poll.deadline||ballots(poll.id).length>=poll.max_votes)fail(409,'투표가 마감됐어요.');
      if(!store.run('UPDATE users SET gold=gold-? WHERE id=? AND gold>=?',poll.stake,user.id,poll.stake).changes)fail(400,'내기에 필요한 골드가 부족해요.');
      store.run('INSERT INTO village_ballots(poll_id,user_id,slot_id,nickname,choice,reason,provider,stake,created_at) VALUES(?,?,?,?,?,?,?,?,?)',poll.id,user.id,user.active_slot,user.nickname,decision.choice,decision.reason,decision.provider,poll.stake,now());
    });
    settle(poll.id);notify(poll.owner_id);res.json({poll:view(rowFor(poll.id),user.id)});
  });
  app.post('/api/polls/:id/close',auth,(req,res)=>{const poll=rowFor(req.params.id);if(poll.owner_id!==req.user.id)fail(403,'마을 주인만 종료할 수 있어요.');tick();settle(poll.id,true);res.json({poll:view(rowFor(poll.id),req.user.id)});});
  tick();const timer=setInterval(tick,1000);timer.unref();return {tick,settle,close(){clearInterval(timer);}};
}
