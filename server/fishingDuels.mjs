import {z} from 'zod';
import {id} from './store.mjs';
import {fishingScore,FISHING_DURATIONS} from '../shared/fishingDuel.mjs';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function createFishingDuels({store,clock,members,anchors,active,busy,startPair,stopPlayer,settlePlayer,publish,emitVillage}){
  store.db.exec('CREATE TABLE IF NOT EXISTS fishing_duels(id TEXT PRIMARY KEY,state TEXT NOT NULL)');
  const matches=new Map();
  // A restart interrupts the live match; return escrow exactly once.
  store.transaction(()=>{for(const row of store.all('SELECT * FROM fishing_duels')){
    const match=JSON.parse(row.state);
    if(match.status==='active'){
      for(const p of match.players)store.run('UPDATE users SET gold=gold+? WHERE id=?',match.stake,p.userId);
      Object.assign(match,{status:'cancelled',reason:'서버가 재시작되어 내기 골드를 돌려드렸어요.',endedAt:clock()});
      store.run('UPDATE fishing_duels SET state=? WHERE id=?',JSON.stringify(match),match.id);
    }
    if(match.status!=='pending')matches.set(match.id,match);
  }});
  const save=m=>store.run('INSERT INTO fishing_duels VALUES(?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state',m.id,JSON.stringify(m));
  const current=uid=>[...matches.values()].find(m=>['pending','active'].includes(m.status)&&m.players.some(p=>p.userId===uid));
  function view(m){if(!m)return null;return {...m,serverTime:clock(),players:m.players.map(p=>{
    const items=p.sessionId?store.all('SELECT item_id AS itemId,SUM(quantity) AS quantity FROM acquisition_events WHERE session_id=? AND timestamp<=? GROUP BY item_id',p.sessionId,m.deadline??clock()):[];
    return {...p,items,caught:items.reduce((sum,i)=>sum+i.quantity,0),score:fishingScore(items)};
  })};}
  function snapshot(uid){return view(current(uid)||[...matches.values()].reverse().find(m=>m.players.some(p=>p.userId===uid)));}
  function broadcast(m){for(const p of m.players)publish(p.userId);emitVillage(m.villageId);}
  function complete(m,forfeiter=null,reason){
    if(m.status!=='active')return;
    const result=view(m),[a,b]=result.players,winner=forfeiter?m.players.find(p=>p.userId!==forfeiter).userId:a.score===b.score?null:a.score>b.score?a.userId:b.userId;
    const completed={...m,status:'finished',endedAt:clock(),winner,reason:reason||(winner?'최종 점수가 높은 플레이어가 승리했어요.':'동점이에요. 내기 골드를 돌려드려요.')};
    store.transaction(()=>{
      if(winner)store.run('UPDATE users SET gold=gold+? WHERE id=?',m.stake*2,winner);
      else for(const p of m.players)store.run('UPDATE users SET gold=gold+? WHERE id=?',m.stake,p.userId);
      save(completed);
    });
    Object.assign(m,completed);
    for(const p of m.players)stopPlayer(p.userId);
    broadcast(m);
  }
  function request(uid,room,raw){
    const data=z.object({targetId:z.string(),minutes:z.number().refine(n=>FISHING_DURATIONS.includes(n)),stake:z.number().int().min(0).max(10000)}).strict().parse(raw);
    if(uid===data.targetId||!members(room)?.has(uid)||!members(room)?.has(data.targetId))fail(409,'같은 마을의 낚시 중인 플레이어에게 신청해 주세요.');
    if(current(uid)||current(data.targetId))fail(409,'이미 대결 신청이나 대결이 진행 중이에요.');
    const target=active(data.targetId),player=members(room).get(uid),opponent=members(room).get(data.targetId);
    if((player.starId||'fishing')!==(opponent.starId||'fishing'))fail(409,'같은 별에 있는 상대에게 신청해 주세요.');
    if(!target||target.status!=='active'||target.village_id!==room)fail(409,'낚시 중인 상대에게 신청해 주세요.');
    if(Math.hypot(player.x-opponent.x,player.z-opponent.z)>2.2)fail(409,'상대 낚시 자리 가까이로 이동해 주세요.');
    if(busy(uid)&&!active(uid))fail(409,'다른 활동을 마친 뒤 신청해 주세요.');
    const m={id:id(),villageId:room,starId:target.star_id||'fishing',status:'pending',stake:data.stake,minutes:data.minutes,createdAt:clock(),expiresAt:clock()+30000,players:[uid,data.targetId].map(userId=>({userId,nickname:store.one('SELECT nickname FROM users WHERE id=?',userId).nickname}))};
    matches.set(m.id,m);save(m);broadcast(m);return view(m);
  }
  function action(uid,room,raw){
    const data=z.object({id:z.string(),action:z.enum(['accept','decline','cancel','finish'])}).strict().parse(raw),m=matches.get(data.id);
    if(!m||!m.players.some(p=>p.userId===uid))fail(403,'내 낚시 대결만 변경할 수 있어요.');
    if(m.status==='pending'){
      if(clock()>=m.expiresAt)fail(409,'신청 시간이 만료됐어요.');
      if(data.action==='cancel'&&m.players[0].userId!==uid||['accept','decline'].includes(data.action)&&m.players[1].userId!==uid)fail(403,'대결 신청 권한을 확인해 주세요.');
      if(data.action==='finish')fail(409,'아직 시작하지 않은 대결이에요.');
      if(data.action!=='accept'){m.status='cancelled';m.reason='대결 신청이 취소되었어요.';save(m);broadcast(m);return view(m);}
      if(room!==m.villageId||m.players.some(p=>!members(room)?.has(p.userId)||(members(room).get(p.userId).starId||'fishing')!==m.starId))fail(409,'두 플레이어가 같은 마을에 있어야 해요.');
      store.transaction(()=>{
        for(const p of m.players)if(!store.run('UPDATE users SET gold=gold-? WHERE id=? AND gold>=?',m.stake,p.userId,m.stake).changes)fail(400,'참가자의 내기 골드가 부족해요.');
        const sessions=startPair(m);
        m.players=m.players.map((p,i)=>({...p,sessionId:sessions[i].id,anchorId:sessions[i].anchor_id}));
        Object.assign(m,{status:'active',startedAt:clock(),deadline:m.minutes?clock()+m.minutes*60000:null,finishRequestedBy:[]});save(m);
      });
      broadcast(m);return view(m);
    }
    if(m.status!=='active')fail(409,'이미 종료된 대결이에요.');
    if(data.action!=='finish'||m.minutes!==0)fail(409,'자유 대결에서만 종료 동의를 요청할 수 있어요.');
    if(!m.finishRequestedBy.includes(uid))m.finishRequestedBy.push(uid);
    save(m);
    if(m.finishRequestedBy.length===2){for(const p of m.players)settlePlayer(p.userId);complete(m);}else broadcast(m);
    return view(m);
  }
  function leave(uid){const m=current(uid);if(!m)return;if(m.status==='pending'){m.status='cancelled';m.reason='플레이어가 낚시를 중단하거나 마을을 떠나 신청이 취소됐어요.';save(m);broadcast(m);}else{for(const p of m.players)settlePlayer(p.userId);if(m.deadline!==null&&clock()>=m.deadline)complete(m);else complete(m,uid,'상대가 낚시를 중단하거나 마을을 떠나 기권했어요.');}}
  function tick(){for(const m of matches.values()){
    if(m.status==='pending'&&clock()>=m.expiresAt){m.status='cancelled';m.reason='대결 신청 시간이 만료됐어요.';save(m);broadcast(m);}
    if(m.status==='active'&&m.deadline!==null&&clock()>=m.deadline)complete(m);
  }}
  return {request,action,snapshot,current,leave,tick,limit:uid=>{const m=current(uid);return m?.status==='active'?m.deadline:null;},changed(uid){const m=current(uid);if(m?.status==='active')broadcast(m);}};
}
