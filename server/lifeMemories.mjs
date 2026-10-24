import {id} from './store.mjs';
import {ALL_ITEMS} from '../shared/life.mjs';

export function createLifeMemories(store){
  store.db.exec(`CREATE TABLE IF NOT EXISTS life_memory_events(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),avatar_slot TEXT NOT NULL,event_key TEXT NOT NULL,event_type TEXT NOT NULL,summary TEXT NOT NULL,participants TEXT NOT NULL,item_id TEXT,timestamp INTEGER NOT NULL,hidden INTEGER NOT NULL DEFAULT 0,UNIQUE(owner_id,avatar_slot,event_key));`);
  function record(uid,slot,key,type,summary,participants,itemId,time){
    store.run('INSERT OR IGNORE INTO life_memory_events(id,owner_id,avatar_slot,event_key,event_type,summary,participants,item_id,timestamp) VALUES(?,?,?,?,?,?,?,?,?)',id(),uid,slot||'',key,type,summary,JSON.stringify(participants),itemId||null,time);
  }
  function fish(session,item,timestamp,firstDiscovery=false){
    if(!item)return;const uid=session.owner_id,slot=session.avatar_slot||'';
    if(firstDiscovery&&['rare','special'].includes(item.rarity))record(uid,slot,`rare:${item.itemId}`,'RARE_FISH',`플레이어가 ${item.name}를 처음 발견했다.`,['PLAYER'],item.itemId,timestamp);
  }
  function operation(op,result,time){
    if(!result.ok||!['HARVEST_CROP','COOK_FOOD'].includes(op.intent))return;
    for(const item of result.items||[]){
      if(store.one("SELECT 1 FROM life_operations o JOIN inventory_changes c ON c.operation_id=o.id WHERE o.owner_id=? AND COALESCE(o.avatar_slot,'')=? AND o.intent=? AND o.status='completed' AND o.id!=? AND c.item_id=? AND c.quantity>0 LIMIT 1",op.owner_id,op.avatar_slot||'',op.intent,op.id,item.itemId))continue;
      const def=ALL_ITEMS.find(i=>i.itemId===item.itemId),cook=op.intent==='COOK_FOOD';record(op.owner_id,op.avatar_slot,`${op.intent}:${item.itemId}`,cook?'FIRST_COOK':'FIRST_HARVEST',`플레이어가 처음으로 ${def.name} ${item.quantity}${def.unit}를 ${cook?'만들어':'수확해'} 보관함에 넣었다.`,[op.actor],item.itemId,time);
    }
  }
  return {fish,operation,list:(uid,slot)=>store.all('SELECT id,event_type AS type,summary,participants,item_id AS itemId,timestamp FROM life_memory_events WHERE owner_id=? AND avatar_slot=? AND hidden=0 ORDER BY timestamp DESC,rowid DESC LIMIT 30',uid,slot||'').map(e=>({...e,participants:JSON.parse(e.participants)})),forget(uid,eventId){return store.transaction(()=>{const changed=store.run('UPDATE life_memory_events SET hidden=1 WHERE id=? AND owner_id=?',eventId,uid).changes;if(changed)store.run('UPDATE users SET revision=revision+1 WHERE id=?',uid);return changed;});}};
}
