import {id} from './store.mjs';
import {rollFish} from '../shared/life.mjs';
// Caller includes this award and its settlement checkpoint in one transaction.
export function awardLifeFish(store,session,cycle,timestamp,random,source='fishing'){
  const fish=rollFish(random);if(!fish)return null;
  const uid=session.owner_id;
  store.run('INSERT INTO acquisition_events VALUES(?,?,?,?,?,?,?,?,?)',id(),uid,fish.itemId,1,session.actor_id,source,timestamp,session.id,cycle);
  store.run('INSERT INTO inventory_entries VALUES(?,?,1) ON CONFLICT(owner_id,item_id) DO UPDATE SET quantity=quantity+1',uid,fish.itemId);
  store.run('INSERT OR IGNORE INTO fish_discoveries VALUES(?,?,?,?)',uid,fish.itemId,timestamp,session.actor_id);
  return fish;
}
