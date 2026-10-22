import {z} from 'zod';
import {id,day} from './store.mjs';
import {newVolleyGame,advanceVolley,volleyInput,volleySnapshot,volleyScore,VOLLEY} from '../shared/volleyball.mjs';

export function installVolleyGames({app,io,store,auth,sessionUser,checkTarget,busy,emitVillage,emitUpdate,event,activity,rewardVisit,clock=()=>Date.now()}){
  const rooms=new Map(),games=new Map(),fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
  const schema=z.object({id:z.string().uuid(),move:z.number().finite().min(-1).max(1),jump:z.boolean(),spike:z.boolean(),seq:z.number().int().positive().max(10000000)}).strict();
  function start(players,villageId,roomId=id(),started=clock()){
    const room={id:roomId,villageId,started,state:newVolleyGame(players.length===1?[players[0].userId,'ai']:players.map(p=>p.userId)),players:players.map(p=>({...p,gameId:id()})),lastBroadcast:0};
    store.transaction(()=>{for(const p of room.players){store.run('INSERT INTO games(id,user_id,target_id,notes,hits,started,finished,anonymous,kind) VALUES(?,?,?,?,?,?,0,?,?)',p.gameId,p.userId,villageId,'[]','{}',started,Number(!!p.anonymous),'volley');event(p.userId,'game_started',{kind:'volley'});}});
    for(const p of room.players)games.set(p.gameId,room);rooms.set(room.id,room);emitVillage(villageId);return room;
  }
  const advance=room=>advanceVolley(room.state,Math.max(0,clock()-room.started));
  const info=(room,p)=>({id:p.gameId,roomId:room.id,kind:'volley',started:room.started,serverTime:clock(),snapshot:volleySnapshot(room.state)});
  function get(gameId,user,access=true){const room=games.get(gameId),p=room?.players.find(p=>p.gameId===gameId&&p.userId===user.id);if(!p)fail(404,'배구 게임을 찾을 수 없어요.');if(access)checkTarget({user},room.villageId);return {room,p};}
  function publish(room){const snapshot={roomId:room.id,...volleySnapshot(room.state)};for(const p of room.players)io.to(`user:${p.userId}`).emit('volley:snapshot',snapshot);}
  function abandon(gameId,userId){const room=games.get(gameId),p=room?.players.find(p=>p.gameId===gameId&&p.userId===userId);if(!p||p.left||p.result)return;p.left=true;store.run('UPDATE games SET finished=2 WHERE id=? AND finished=0',gameId);if(!room.state.ended){room.state.ended=true;room.state.phase='ended';room.state.winner=room.state.players.find(p=>p.id!==userId)?.id||null;room.state.forfeit=true;publish(room);}emitVillage(room.villageId);}
  app.post('/api/volley-games',auth,(req,res)=>{const {targetId,anonymous}=z.object({targetId:z.string().uuid(),anonymous:z.boolean().default(false)}).strict().parse(req.body);checkTarget(req,targetId);if(busy(req.user.id))fail(409,'진행 중인 게임을 먼저 마쳐주세요.');const room=start([{userId:req.user.id,anonymous}],targetId);res.status(201).json(info(room,room.players[0]));});
  app.get('/api/volley-games/:id/state',auth,(req,res)=>{const {room,p}=get(req.params.id,req.user);advance(room);res.json(info(room,p));});
  app.post('/api/volley-games/:id/abandon',auth,(req,res)=>{get(req.params.id,req.user,false);abandon(req.params.id,req.user.id);res.json({ok:true});});
  app.post('/api/volley-games/:id/finish',auth,(req,res)=>{
    z.object({}).strict().parse(req.body||{});const {room,p}=get(req.params.id,req.user);if(p.left)fail(409,'중단한 게임이에요.');if(p.result)return res.json(p.result);advance(room);if(!room.state.ended)fail(400,'경기가 끝나면 기록을 저장할 수 있어요.');
    const s=room.state,score=volleyScore(s,p.userId),side=s.players.findIndex(v=>v.id===p.userId);let gold=0;
    store.transaction(()=>{store.run('UPDATE games SET finished=1,score=?,hits=? WHERE id=?',score,JSON.stringify({scores:s.scores,winner:s.winner,elapsed:s.elapsed,side}),p.gameId);
      const total=store.one("SELECT COALESCE(SUM(amount),0) n FROM rewards WHERE user_id=? AND type='game' AND day=?",p.userId,day()).n,place=store.one("SELECT COUNT(*) n FROM rewards WHERE user_id=? AND actor_id LIKE ? AND type='game' AND day=?",p.userId,`${room.villageId}:%`,day()).n;
      if(s.elapsed>=20000&&!s.forfeit&&total<300&&place<3){gold=Math.min(300-total,30+Math.floor(score/100));store.run("INSERT INTO rewards VALUES(?,?,'game',?,?)",p.userId,`${room.villageId}:${p.gameId}`,day(),gold);store.run('UPDATE users SET gold=gold+? WHERE id=?',gold,p.userId);rewardVisit(room.villageId,p.userId,!!p.anonymous);}
      activity(room.villageId,p.userId,'minigame',`몽글 배구 ${s.scores[side]} : ${s.scores[1-side]} · ${score}점`,!!p.anonymous);event(p.userId,'game_finished',{kind:'volley',score,gold});});
    p.result={score,gold,scores:s.scores,side,winner:s.winner,forfeit:!!s.forfeit};emitUpdate(p.userId);emitVillage(room.villageId);io.to([`village:${room.villageId}`,`user:${room.villageId}`]).emit('games:changed',{villageId:room.villageId});res.json(p.result);
  });
  io.on('connection',socket=>socket.on('volley:input',(data,ack)=>{try{const user=sessionUser(socket.request.headers);if(!user)fail(401,'로그인이 필요해요.');const input=schema.parse(data),{room,p}=get(input.id,user);if(p.left||p.result)fail(409,'종료한 게임이에요.');advance(room);volleyInput(room.state,user.id,input);ack?.({ok:true,elapsed:clock()-room.started});}catch(e){ack?.({ok:false,error:e.message});}}));
  const timer=setInterval(()=>{const now=clock();for(const room of rooms.values()){
    advance(room);if(now-room.lastBroadcast>=45&&room.players.some(p=>!p.left&&!p.result)){publish(room);room.lastBroadcast=now;}
    if((room.state.ended&&now-(room.endedAt??=now)>300000)||now-room.started>VOLLEY.duration+300000){for(const p of room.players){store.run('UPDATE games SET finished=2 WHERE id=? AND finished=0',p.gameId);games.delete(p.gameId);}rooms.delete(room.id);emitVillage(room.villageId);}
  }},16);timer.unref();
  return {start,info,abandon,leave:userId=>{for(const room of rooms.values())for(const p of room.players)if(p.userId===userId)abandon(p.gameId,userId);},busy:userId=>[...rooms.values()].some(r=>r.players.some(p=>p.userId===userId&&!p.left&&!p.result)),close:()=>clearInterval(timer)};
}
