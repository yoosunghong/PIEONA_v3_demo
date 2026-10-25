import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {GARDEN_BEDS,KITCHEN} from '../shared/garden.mjs';
import {FISHING_ANCHORS,STORAGE} from '../shared/life.mjs';
import {validPlacement} from '../shared/world.mjs';
import {validSceneryPlacement} from '../shared/scenery.mjs';
import {canPlaceDecoration} from '../src/villageEditorState.mjs';

test('editor placement keeps fixed life facilities clear even when movable scenery is stored',()=>{
  for(const point of [...GARDEN_BEDS,...FISHING_ANCHORS,...GARDEN_BEDS.map(b=>({...b.approach,id:b.id+' approach'}))]){
    assert.equal(validPlacement(point.x,point.z,[]),false,point.id);
    assert.equal(validSceneryPlacement(point.x,point.z),false,point.id);
    assert.equal(canPlaceDecoration([],point.x,point.z),false,point.id);
    assert.equal(canPlaceDecoration([],point.x,point.z,'scenery:bench-0'),false,point.id);
  }
  assert.equal(validPlacement(-3,-3.5,[]),true);
  assert.equal(validSceneryPlacement(-3,-3.5),true);
});

import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';

test('world API rejects new objects placed on life facilities and preserves legacy layouts',async()=>{
  const runtime=createApp({testing:true,store:openStore(':memory:')});
  try{
    await new Promise(resolve=>runtime.server.listen(0,'127.0.0.1',resolve));
    const url=`http://127.0.0.1:${runtime.server.address().port}`;
    const registration=await fetch(url+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'life_placement_api',password:'test-placement-password'})});
    assert.equal(registration.status,201);
    const cookie=registration.headers.get('set-cookie').split(';')[0],user=(await registration.json()).user;
    const save=async village=>fetch(url+'/api/me/world',{method:'PATCH',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({village})});
    for(const {x,z} of [...GARDEN_BEDS,...GARDEN_BEDS.map(b=>b.approach)]){
      for(const village of [
        {items:[{id:randomUUID(),type:'bench',x,z,rotation:0}]},
        {sign:{x,z}},
        {guestbook:{x,z}},
        {scenery:[{id:'bench-0',x,z,rotation:0}]},
      ])assert.equal((await save(village)).status,400,JSON.stringify(village));
    }
    const legacy={theme:'default',items:[{id:randomUUID(),type:'bench',x:KITCHEN.x,z:KITCHEN.z,rotation:0}]};
    runtime.store.run('UPDATE users SET village=? WHERE id=?',JSON.stringify(legacy),user.id);
    assert.equal((await save({...legacy,theme:'sunset'})).status,200);
    assert.equal((await save({...legacy,items:[{...legacy.items[0],x:KITCHEN.x+.1}]})).status,200);
    assert.equal((await save({...legacy,items:[{...legacy.items[0],x:-3,z:-3.5}]})).status,200);
  }finally{await runtime.close();}
});
