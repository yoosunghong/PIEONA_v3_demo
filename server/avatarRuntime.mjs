import {villageBenches,benchExit} from '../shared/benches.mjs';
import {villageLife} from '../shared/lifeLayout.mjs';
import {WALK_RADIUS} from '../shared/villageSize.mjs';
import {ALL_ITEMS} from '../shared/life.mjs';

const fail=message=>{throw Object.assign(new Error(message),{status:409});};
export function createAvatarRuntime({store,clock,player,companion,village,members,interrupt,publish,emitVillage,emitMove,logAction,busy}){
  const tasks=new Map(),receipts=new Map();
  store.db.exec(`CREATE TABLE IF NOT EXISTS avatar_carry (
    owner_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0));`);
  function returnItem(uid){
    store.transaction(()=>{
      const row=store.one('SELECT * FROM avatar_carry WHERE owner_id=?',uid);if(!row)return;
      store.run('INSERT INTO inventory_entries(owner_id,item_id,quantity) VALUES(?,?,?) ON CONFLICT(owner_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity',uid,row.item_id,row.quantity);
      store.run('DELETE FROM avatar_carry WHERE owner_id=?',uid);
    });
  }
  // A crash cannot lose items which were physically in transit.
  for(const row of store.all('SELECT owner_id FROM avatar_carry'))returnItem(row.owner_id);
  const seatOccupied=(uid,seatId,except)=>!!seatId&&members(uid).some(m=>m.userId!==except&&m.seatId===seatId)||!!seatId&&tasks.get(uid)?.seat?.id===seatId&&except!==`companion:${uid}`;
  function nearPlayer(uid){
    const p=player(uid);if(!p)fail('내 마을에 접속한 상태에서 부탁해 줘.');
    // Offset toward the village centre, keeping both characters distinct and in bounds.
    const radius=Math.hypot(p.x,p.z),angle=radius>.01?Math.atan2(-p.x,-p.z):Math.PI/2;
    return {x:p.x+Math.sin(angle)*1.2,z:p.z+Math.cos(angle)*1.2};
  }
  function planTarget(uid,action){
    const layout=villageLife(village(uid));
    if(action.target==='PLAYER')return nearPlayer(uid);
    if(action.target==='STORAGE')return {...layout.storage,z:layout.storage.z-.8};
    if(action.target==='GARDEN')return layout.beds[0].approach||{x:layout.beds[0].x,z:layout.beds[0].z-.8};
    if(action.target==='KITCHEN')return layout.kitchen.approach||{x:layout.kitchen.x,z:layout.kitchen.z-.8};
    if(action.target==='POSITION'&&Number.isFinite(action.x)&&Number.isFinite(action.z)&&Math.hypot(action.x,action.z)<=WALK_RADIUS)return {x:action.x,z:action.z};
    fail('이동할 장소를 알려줘. 마을 안의 플레이어, 보관함, 텃밭, 요리대로 갈 수 있어.');
  }
  function stop(uid){
    const job=tasks.get(uid);if(job){job.receipt.status='cancelled';tasks.delete(uid);}
    returnItem(uid);
    const m=companion(uid,false);if(m){const seat=villageBenches(village(uid)).find(s=>s.id===m.seatId);if(seat)Object.assign(m,benchExit(seat));Object.assign(m,{moving:false,seatId:null,carriedItem:null,activityState:'Idle'});}
  }
  function leg(job,m,target){
    job.start={x:m.x,z:m.z};job.target=target;job.started=clock();
    job.arrived=clock()+Math.ceil(Math.hypot(target.x-m.x,target.z-m.z)/2.4*1000);
    Object.assign(m,{moving:true,seatId:null,activityState:'Moving'});
  }
  function execute(uid,action,requestId){
    const key=`${uid}:${requestId}`,signature=JSON.stringify(action),previous=receipts.get(key);
    if(previous){if(previous.signature!==signature)fail('같은 요청 번호에 다른 행동을 실행할 수 없어.');return {ok:previous.status!=='cancelled',intent:action.intent,reply:previous.reply};}
    if(!player(uid))fail('내 마을에 접속한 상태에서 부탁해 줘.');
    if(busy(uid))fail('진행 중인 게임을 마친 뒤 부탁해 줘.');
    let target,seat,item;
    if(action.intent==='MOVE_TO')target=planTarget(uid,action);
    if(action.intent==='SIT_DOWN'){
      const m=companion(uid,false)||{x:1.1,z:0};
      seat=villageBenches(village(uid)).filter(s=>(!action.seatId||s.id===action.seatId)&&!seatOccupied(uid,s.id,`companion:${uid}`)).sort((a,b)=>Math.hypot(a.x-m.x,a.z-m.z)-Math.hypot(b.x-m.x,b.z-m.z))[0];
      if(!seat)fail('지금 앉을 수 있는 빈 벤치가 없어.');target=seat;
    }
    if(action.intent==='TAKE_FROM_STORAGE'){
      item=ALL_ITEMS.find(i=>i.itemId===action.item);if(!item)fail('보관함에서 어떤 물건을 가져올지 알려줘.');
      const available=store.one('SELECT quantity FROM inventory_entries WHERE owner_id=? AND item_id=?',uid,item.itemId)?.quantity||0;
      const carried=store.one('SELECT quantity FROM avatar_carry WHERE owner_id=? AND item_id=?',uid,item.itemId)?.quantity||0;
      if(available+carried<(action.quantity||1))fail(`보관함에 ${item.name} 수량이 부족해. 현재 ${available+carried}${item.unit||'개'}야.`);
      target=planTarget(uid,{target:'STORAGE'});
    }
    interrupt(uid);const m=companion(uid,true);
    const reply=action.intent==='MOVE_TO'?'좋아, 그쪽으로 걸어갈게.':action.intent==='SIT_DOWN'?'빈 벤치로 가서 앉을게.':action.intent==='STAND_UP'?'일어났어.':`보관함에서 ${item.name} ${action.quantity||1}${item.unit||'개'}를 꺼내 네 근처로 가져올게.`;
    const receipt={signature,status:action.intent==='STAND_UP'?'completed':'running',reply};receipts.set(key,receipt);
    // Receipts only deduplicate movement; no lasting reward is granted by these actions.
    if(receipts.size>2000){const oldest=[...receipts].find(([,r])=>r.status!=='running');if(oldest)receipts.delete(oldest[0]);}
    if(action.intent!=='STAND_UP'){
      const job={id:requestId,intent:action.intent,targetKind:action.target,seat,item,quantity:action.quantity||1,phase:'outbound',receipt};
      tasks.set(uid,job);leg(job,m,target);
    }
    logAction(uid,'avatar_action_start',{actor:'COMPANION',intent:action.intent,operationId:requestId});
    publish(uid);emitVillage(uid);return {ok:true,intent:action.intent,reply};
  }
  function tick(){
    for(const [uid,job] of tasks){
      const m=companion(uid,false);if(!m||!player(uid)){stop(uid);continue;}
      const f=Math.max(0,Math.min(1,(clock()-job.started)/Math.max(1,job.arrived-job.started)));
      Object.assign(m,{x:job.start.x+(job.target.x-job.start.x)*f,z:job.start.z+(job.target.z-job.start.z)*f,rotation:Math.atan2(job.target.x-job.start.x,job.target.z-job.start.z)});
      if(f<1){emitMove(uid,m);continue;}
      if(job.intent==='MOVE_TO'&&job.targetKind==='PLAYER'){
        const p=player(uid);if(Math.hypot(m.x-p.x,m.z-p.z)>1.8){leg(job,m,nearPlayer(uid));continue;}
      }
      let reply;
      if(job.intent==='TAKE_FROM_STORAGE'&&job.phase==='outbound'){
        const available=store.one('SELECT quantity FROM inventory_entries WHERE owner_id=? AND item_id=?',uid,job.item.itemId)?.quantity||0;
        if(available<job.quantity){reply='도착해 보니 보관함의 재고가 부족해. 물건을 꺼내지 않았어.';}
        else{
          store.transaction(()=>{
            store.run('UPDATE inventory_entries SET quantity=quantity-? WHERE owner_id=? AND item_id=?',job.quantity,uid,job.item.itemId);
            store.run('INSERT INTO avatar_carry VALUES(?,?,?)',uid,job.item.itemId,job.quantity);
          });
          m.carriedItem={itemId:job.item.itemId,quantity:job.quantity};job.phase='returning';leg(job,m,nearPlayer(uid));publish(uid);emitVillage(uid);continue;
        }
      }
      if(job.intent==='TAKE_FROM_STORAGE'&&job.phase==='returning'){
        // Re-evaluate a moving player's destination; delivery needs actual proximity.
        const p=player(uid);if(Math.hypot(m.x-p.x,m.z-p.z)>1.8){leg(job,m,nearPlayer(uid));continue;}
        returnItem(uid);m.carriedItem=null;
        reply=`${job.item.name} ${job.quantity}${job.item.unit||'개'}를 가져왔어. 확인한 물건은 우리 공용 보관함에 다시 넣어 뒀어.`;
      }
      if(job.intent==='SIT_DOWN'){
        const current=villageBenches(village(uid)).find(s=>s.id===job.seat.id);
        if(!current||seatOccupied(uid,current.id,m.userId)||Math.hypot(current.x-m.x,current.z-m.z)>.2)reply='벤치가 바뀌었거나 다른 사람이 앉아서 앉지 못했어.';
        else{Object.assign(m,{seatId:current.id,rotation:current.rotation,activityState:'Sitting'});reply='벤치에 앉았어.';}
      }
      Object.assign(m,{moving:false,activityState:m.seatId?'Sitting':'Idle'});
      tasks.delete(uid);job.receipt.status='completed';job.receipt.reply=reply||'네가 부탁한 곳에 도착했어.';
      logAction(uid,'avatar_action_complete',{actor:'COMPANION',intent:job.intent,operationId:job.id});
      publish(uid,[],job.receipt.reply);emitVillage(uid);
    }
  }
  function task(uid){const job=tasks.get(uid);return job?{id:job.id,actor:'COMPANION',intent:job.intent,state:'Moving',label:job.intent==='SIT_DOWN'?'벤치에 앉기':job.intent==='TAKE_FROM_STORAGE'?`${job.item.name} ${job.quantity}${job.item.unit||'개'} ${job.phase==='returning'?'운반 중':'가져오기'}`:'부탁한 곳으로 이동'}:null;}
  return {execute,stop,tick,task,seatOccupied,engaged:uid=>tasks.has(uid)||!!companion(uid,false)?.seatId,close(){for(const uid of tasks.keys())stop(uid);}};
}
