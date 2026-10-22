import {z} from 'zod';
import {randomBytes} from 'node:crypto';
import {id,day} from './store.mjs';
import {newCrabGame,advanceCrab,crabInput,crabSnapshot,crabScore,crabSeconds,crabBaseScore,crabChainBonus} from '../shared/crab.mjs';

export function installCrabGames({app,io,store,auth,sessionUser,checkTarget,busy,emitVillage,emitUpdate,event,activity,rewardVisit,clock=()=>Date.now()}){
  const rooms=new Map(),games=new Map();
  const inputSchema=z.object({id:z.string().uuid(),x:z.number().finite().min(-1).max(1),z:z.number().finite().min(-1).max(1),seq:z.number().int().positive().max(10000000)}).strict();
  const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
  function start(players,villageId,roomId=id(),started=clock()){
    const room={id:roomId,villageId,started,state:newCrabGame(players.map(p=>p.userId),randomBytes(4).readUInt32LE()),players:players.map(p=>({...p,gameId:id()})),lastBroadcast:0};
    store.transaction(()=>{for(const p of room.players){
      store.run('INSERT INTO games(id,user_id,target_id,notes,hits,started,finished,anonymous,kind) VALUES(?,?,?,?,?,?,0,?,?)',p.gameId,p.userId,villageId,'[]','{}',started,Number(!!p.anonymous),'crab');
      games.set(p.gameId,room);event(p.userId,'game_started',{kind:'crab'});
    }});rooms.set(room.id,room);emitVillage(villageId);return room;
  }
  const info=(room,p)=>({id:p.gameId,roomId:room.id,kind:'crab',started:room.started,serverTime:clock(),snapshot:crabSnapshot(room.state)});
  function get(gameId,user,checkAccess=true){const room=games.get(gameId),p=room?.players.find(p=>p.gameId===gameId&&p.userId===user.id);if(!p)fail(404,'진행 중인 해변 게임을 찾을 수 없어요.');if(checkAccess)checkTarget({user},room.villageId);return {room,p};}
  function publish(room){const snapshot=crabSnapshot(room.state);for(const p of room.players)io.to(`user:${p.userId}`).emit('crab:snapshot',{roomId:room.id,...snapshot});}
  function leave(userId,roomId){
    for(const room of rooms.values())if(!roomId||room.id===roomId){const p=room.players.find(p=>p.userId===userId&&!p.left);if(!p)continue;p.left=true;
      store.run('UPDATE games SET finished=2 WHERE id=? AND finished=0',p.gameId);
      const player=room.state.players.find(p=>p.id===userId);player.alive=false;player.lives=0;player.input={x:0,z:0};
      if(!room.state.ended){const alive=room.state.players.filter(p=>p.alive);if(alive.length<=1){room.state.ended=true;room.state.winner=alive[0]?.id||null;}publish(room);}
      emitVillage(room.villageId);
    }
  }
  app.post('/api/crab-games',auth,(req,res)=>{
    const {targetId,anonymous}=z.object({targetId:z.string().uuid(),anonymous:z.boolean().default(false)}).strict().parse(req.body);checkTarget(req,targetId);
    if(busy(req.user.id))fail(409,'진행 중인 게임을 먼저 마쳐주세요.');
    const room=start([{userId:req.user.id,anonymous}],targetId);res.status(201).json(info(room,room.players[0]));
  });
  app.get('/api/crab-games/:id/state',auth,(req,res)=>{const {room,p}=get(req.params.id,req.user);res.json({...info(room,p),snapshot:crabSnapshot(room.state)});});
  app.post('/api/crab-games/:id/abandon',auth,(req,res)=>{const {room}=get(req.params.id,req.user,false);leave(req.user.id,room.id);res.json({ok:true});});
  app.post('/api/crab-games/:id/finish',auth,(req,res)=>{
    const {room,p}=get(req.params.id,req.user),g=store.one('SELECT * FROM games WHERE id=?',p.gameId);
    if(g.finished===2)fail(409,'중단한 게임이에요.');
    if(p.result)return res.json(p.result);
    if(!room.state.ended)fail(400,'게임이 끝나면 기록을 저장할 수 있어요.');
    const player=room.state.players.find(v=>v.id===p.userId),score=crabScore(player);let gold=0;
    store.transaction(()=>{
      store.run('UPDATE games SET finished=1,score=?,hits=? WHERE id=?',score,JSON.stringify({survived:player.survived,chain:player.chain.length,baseScore:crabBaseScore(player),bonus:crabChainBonus(player),winner:room.state.winner}),p.gameId);
      const total=store.one("SELECT COALESCE(SUM(amount),0) n FROM rewards WHERE user_id=? AND type='game' AND day=?",p.userId,day()).n;
      const place=store.one("SELECT COUNT(*) n FROM rewards WHERE user_id=? AND actor_id LIKE ? AND type='game' AND day=?",p.userId,`${room.villageId}:%`,day()).n;
      if(crabSeconds({elapsed:player.survived})>=20&&total<300&&place<3){gold=Math.min(300-total,30+Math.floor(score/100));store.run("INSERT INTO rewards VALUES(?,?,'game',?,?)",p.userId,`${room.villageId}:${p.gameId}`,day(),gold);store.run('UPDATE users SET gold=gold+? WHERE id=?',gold,p.userId);rewardVisit(room.villageId,p.userId,!!p.anonymous);}
      activity(room.villageId,p.userId,'minigame',`게 게 게 ${score}점`,!!p.anonymous);event(p.userId,'game_finished',{kind:'crab',score,gold});
    });
    p.result={score,gold,seconds:crabSeconds({elapsed:player.survived}),baseScore:crabBaseScore(player),bonus:crabChainBonus(player),chain:player.chain.length,winner:room.state.winner};
    emitUpdate(p.userId);emitVillage(room.villageId);io.to([`village:${room.villageId}`,`user:${room.villageId}`]).emit('games:changed',{villageId:room.villageId});res.json(p.result);
  });
  io.on('connection',socket=>{
    socket.on('crab:input',(data,ack)=>{try{
      const user=sessionUser(socket.request.headers);if(!user)fail(401,'로그인이 필요해요.');
      const input=inputSchema.parse(data);
      const {room,p}=get(input.id,user);if(p.left||p.result)return;
      const player=room.state.players.find(p=>p.id===user.id),now=Date.now();
      // Direction changes (especially release-to-stop) must never be discarded
      // by the heartbeat throttle. Identical spam packets can be acknowledged.
      const same=player.input.x===input.x&&player.input.z===input.z;
      if(!same||!socket.data.crabInputAt||now-socket.data.crabInputAt>=8){
        advanceCrab(room.state,Math.max(0,clock()-room.started));crabInput(room.state,user.id,input);socket.data.crabInputAt=now;
      }
      ack?.({ok:true,elapsed:room.state.elapsed,inputSeq:player.inputSeq});
    }catch(e){ack?.({ok:false,error:e.message});}});
  });
  const timer=setInterval(()=>{const now=clock();for(const room of rooms.values()){
    if(!room.state.ended){advanceCrab(room.state,Math.max(0,now-room.started));if(room.state.ended)room.endedAt=now;}
    if(now-room.lastBroadcast>=45&&(!room.state.ended||room.players.some(p=>!p.left&&!p.result))){publish(room);room.lastBroadcast=now;}
    if((room.state.ended&&now-(room.endedAt||=now)>300000)||now-room.started>3600000){
      for(const p of room.players){store.run('UPDATE games SET finished=2 WHERE id=? AND finished=0',p.gameId);games.delete(p.gameId);}rooms.delete(room.id);emitVillage(room.villageId);
    }
  }},16);timer.unref();
  return {start,info,leave,abandon:(gameId,userId)=>{const room=games.get(gameId);if(room?.players.some(p=>p.gameId===gameId&&p.userId===userId))leave(userId,room.id);},busy:userId=>[...rooms.values()].some(r=>r.players.some(p=>p.userId===userId&&!p.left&&!p.result)),close:()=>clearInterval(timer)};
}
