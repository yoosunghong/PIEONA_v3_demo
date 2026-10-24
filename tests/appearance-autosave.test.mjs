import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppearanceAutosave,createWardrobeAutosave} from '../src/appearanceAutosave.mjs';
import {characterLooks} from '../shared/world.mjs';

function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

test('switching between player and pet during saves retains the newest selection for each subject',async()=>{
  const player=deferred(),pet=deferred(),writes=[];
  const autosave=createWardrobeAutosave({save:async body=>{writes.push(body);if(writes.length===1)await player.promise;else if(writes.length===2)await pet.promise;}});
  autosave.enqueue({appearance:{character:'pio'}});autosave.enqueue({pet:{petType:'dog'}});
  autosave.enqueue({appearance:{character:'luna'}});autosave.enqueue({pet:{petType:'cat'}});
  player.resolve();pet.resolve();assert.equal(await autosave.flush(),true);
  assert.deepEqual(writes.filter(w=>w.appearance).at(-1),{appearance:{character:'luna'}});
  assert.deepEqual(writes.filter(w=>w.pet).at(-1),{pet:{petType:'cat'}});
});

test('save-and-close stays blocked after a failure and succeeds only after retry',async()=>{
  let fail=true;const autosave=createWardrobeAutosave({save:async()=>{if(fail)throw new Error('save failed');}});
  await autosave.enqueue({pet:{petType:'rabbit'}});assert.equal(await autosave.flush(),false);
  fail=false;await autosave.retry();assert.equal(await autosave.flush(),true);
});

test('rapid selections serialize saves and preserve all character outfits in the final snapshot',async()=>{
  const first=deferred(),writes=[],statuses=[];let refreshes=0;
  const autosave=createAppearanceAutosave({save:async body=>{writes.push(body);if(writes.length===1)await first.promise;},onStatus:s=>statuses.push(s),onSaved:()=>{refreshes++;}});
  let looks=characterLooks();
  function select(character,hat){const appearance={...looks[character],hat};looks={...looks,[character]:appearance};return autosave.enqueue({appearance,characterLooks:looks});}
  const done=select('luna','crown');select('moa','beret');select('tori','sprout');select('luna','none');
  assert.equal(writes.length,1);
  first.resolve();await done;
  assert.equal(writes.length,2);
  assert.equal(writes[1].appearance.character,'luna');
  assert.equal(writes[1].characterLooks.luna.hat,'none');
  assert.equal(writes[1].characterLooks.moa.hat,'beret');
  assert.equal(writes[1].characterLooks.tori.hat,'sprout');
  assert.equal(writes[0].characterLooks.luna.hat,'crown');
  assert.equal(refreshes,1);assert.equal(statuses.at(-1),'saved');
});

test('failed final save can be retried with the same wardrobe',async()=>{
  let attempts=0,refreshed=0;const states=[],errors=[];
  const autosave=createAppearanceAutosave({save:async body=>{assert.equal(body.appearance.character,'tori');if(++attempts===1)throw new Error('offline');},onStatus:s=>states.push(s),onError:e=>errors.push(e.message),onSaved:()=>{refreshed++;}});
  await autosave.enqueue({appearance:{character:'tori'}});
  assert.equal(states.at(-1),'error');assert.deepEqual(errors,['offline']);assert.equal(refreshed,0);
  await autosave.retry();assert.equal(attempts,2);assert.equal(states.at(-1),'saved');assert.equal(refreshed,1);
});

test('a failed superseded save does not prevent the newer choice from saving',async()=>{
  const first=deferred(),writes=[],errors=[];
  const autosave=createAppearanceAutosave({save:async body=>{writes.push(body);if(writes.length===1)await first.promise;},onError:e=>errors.push(e)});
  const done=autosave.enqueue('luna');autosave.enqueue('moa');first.reject(new Error('offline'));await done;
  assert.deepEqual(writes,['luna','moa']);assert.deepEqual(errors,[]);
});

test('selections made during profile refresh are saved before the queue finishes',async()=>{
  const refresh=deferred(),writes=[];let refreshes=0;
  const autosave=createAppearanceAutosave({save:async body=>writes.push(body),onSaved:async()=>{if(++refreshes===1)await refresh.promise;}});
  const done=autosave.enqueue('luna');await Promise.resolve();
  autosave.enqueue('tori');refresh.resolve();await done;
  assert.deepEqual(writes,['luna','tori']);assert.equal(refreshes,2);
});
