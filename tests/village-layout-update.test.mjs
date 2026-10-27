import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './runtimeHarness.mjs';
import {villageScenery} from '../shared/scenery.mjs';
import {villageLife,lifeInteractionObjects} from '../shared/lifeLayout.mjs';
import {canPlaceDecoration} from '../src/villageEditorState.mjs';
import {villageCatalog} from '../src/villageCatalog.mjs';

test('retired facilities leave the catalog and hidden gardens release interactions',()=>{
  const scenery=villageScenery({});
  assert.ok(scenery.filter(item=>['scenery:life-kitchen','scenery:life-storage'].includes(item.id)).every(item=>item.hidden));
  assert.ok(!villageCatalog(scenery).some(item=>['scenery:life-kitchen','scenery:life-storage'].includes(item.id)));
  const village={scenery:[{id:'life-garden-0',x:-4.4,z:3.9,rotation:0,hidden:true}]};
  assert.ok(!lifeInteractionObjects(village).some(item=>['garden:0','storage','kitchen'].includes(item.id)));
  for(let rotation=0;rotation<4;rotation++){
    const items=villageScenery({scenery:[{id:'life-fishing',x:0,z:6.3,rotation}]}).map(item=>({...item,hidden:item.id!=='scenery:life-fishing'}));
    assert.equal(canPlaceDecoration(items,0,6.3,'scenery:life-fishing'),true);
  }
});

test('API saves central signs, movable stage and steps, garden storage, fishing rotation and half clearances',async()=>{
  const h=await harness();try{
    const user=await h.register('layout_updates');
    const save=async village=>{const result=await h.request('/me/world',user,{village},'PATCH');assert.equal(result.status,200,JSON.stringify(result.body));return result.body.user.village;};
    let scenery=villageScenery({}).map(({id,x,z,rotation})=>({id:id.slice(8),x,z,rotation,hidden:true}));
    await save({scenery,sign:{x:0,z:0,rotation:0},guestbook:{hidden:true},pollbox:{hidden:true},chalkboard:{hidden:true}});
    scenery=scenery.map(item=>item.id==='central-stage'?{...item,x:2,z:0,hidden:false}:item.id==='path-stone-0'?{...item,x:-2,z:0,hidden:false}:item);
    await save({scenery});
    for(let rotation=0;rotation<4;rotation++)await save({scenery:scenery.map(item=>item.id==='life-fishing'?{...item,x:0,z:6.3,rotation,hidden:false}:item)});
    const saved=await save({scenery:scenery.map(item=>item.id==='life-garden-0'?{...item,x:-4,z:3,hidden:false}:item)});
    assert.deepEqual(villageLife(saved).beds,[]);
    const stored=await save({scenery});
    assert.deepEqual(villageLife(stored).beds,[]);
  }finally{await h.close();}
});
