// The plaza keeps its legacy storage; every other destination has its own layout.
export function initializeStarWorlds(store){
  store.db.exec('CREATE TABLE IF NOT EXISTS star_worlds(owner_id TEXT NOT NULL,star_id TEXT NOT NULL,village TEXT NOT NULL,PRIMARY KEY(owner_id,star_id))');
}
export function starAccessible(store,uid,starId){
  if(!store.one('SELECT 1 FROM owned_stars WHERE owner_id=? AND star_id=?',uid,starId))return false;
  return !store.one("SELECT 1 FROM sqlite_master WHERE name='colony_letters'")||!store.one("SELECT 1 FROM colony_letters WHERE owner_id=? AND star_id=? AND status='occupied'",uid,starId);
}
export function readStarWorld(store,uid,starId='plaza'){
  const base=()=>JSON.parse(store.one('SELECT village FROM users WHERE id=?',uid)?.village||'{}');
  if(starId==='plaza')return base();
  const row=store.one('SELECT village FROM star_worlds WHERE owner_id=? AND star_id=?',uid,starId);
  if(row)return JSON.parse(row.village);
  // Older accounts saw the same layout on all stars. Preserve it once, while
  // assigning legacy mining robots to the plaza rather than duplicating them.
  const village=base();village.items=(village.items||[]).filter(i=>i.type!=='miningRobot');
  writeStarWorld(store,uid,starId,village);return village;
}
export function writeStarWorld(store,uid,starId,village){
  if(starId==='plaza')store.run('UPDATE users SET village=? WHERE id=?',JSON.stringify(village),uid);
  else store.run('INSERT INTO star_worlds VALUES(?,?,?) ON CONFLICT(owner_id,star_id) DO UPDATE SET village=excluded.village',uid,starId,JSON.stringify(village));
}
export function createStarWorld(store,uid,starId){
  store.run('INSERT OR IGNORE INTO star_worlds VALUES(?,?,?)',uid,starId,JSON.stringify({theme:'milkyway',items:[]}));
}
export function starBonus(store,uid,starId,type){
  if(!store.one("SELECT 1 FROM sqlite_master WHERE name='colony_stars'"))return 0;
  return store.one("SELECT bonus FROM colony_stars s WHERE owner_id=? AND star_id=? AND type=? AND NOT EXISTS(SELECT 1 FROM colony_letters l WHERE l.owner_id=s.owner_id AND l.star_id=s.star_id AND l.status='occupied')",uid,starId,type)?.bonus||0;
}

// Called in the same transaction as the decision and compensation. Account
// inventory and old work receipts stay with the player; physical star state moves.
export function transferStarWorld(store,from,to,starId,at){
  return store.transaction(()=>{
    if(from===to||!starId.startsWith('found-')||!starAccessible(store,from,starId))throw Object.assign(new Error('양도할 수 있는 소유 별이 아니에요.'),{status:409});
    readStarWorld(store,from,starId);
    store.run('UPDATE owned_stars SET owner_id=? WHERE owner_id=? AND star_id=?',to,from,starId);
    store.run('UPDATE star_worlds SET owner_id=? WHERE owner_id=? AND star_id=?',to,from,starId);
    store.run('UPDATE colony_stars SET owner_id=? WHERE owner_id=? AND star_id=?',to,from,starId);
    store.run('UPDATE colony_robots SET owner_id=? WHERE owner_id=? AND star_id=?',to,from,starId);
    const prefix=starId+'|';
    store.run('UPDATE garden_plots SET owner_id=? WHERE owner_id=? AND substr(plot_id,1,length(?))=?',to,from,prefix,prefix);
    const pending=store.all("SELECT id FROM life_operations WHERE owner_id=? AND status='pending' AND json_extract(plan,'$.starId')=?",from,starId);
    for(const op of pending){
      store.run("UPDATE life_operations SET status='cancelled',completed_at=?,result=? WHERE id=?",at,JSON.stringify({ok:false,reply:'별을 양도하여 작업을 중단했어요. 재료는 사용하지 않았어요.'}),op.id);
      store.run('DELETE FROM garden_reservations WHERE operation_id=?',op.id);
    }
  });
}
