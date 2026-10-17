import test from 'node:test';
import assert from 'node:assert/strict';
import {villageScenery} from '../shared/scenery.mjs';
import {decorations} from '../shared/world.mjs';
import {villageCatalog,filterVillageCatalog,rememberDecoration} from '../src/villageCatalog.mjs';

test('all lists every type in stable order whether stored, placed or recently used',()=>{
  const placed=villageScenery({}),stored=placed.map(item=>({...item,hidden:true}));
  const before=villageCatalog(placed),after=villageCatalog(stored);
  assert.deepEqual(before.map(item=>item.key),after.map(item=>item.key));
  for(const entry of decorations)assert.ok(before.some(item=>item.key===entry.id));
  assert.deepEqual(filterVillageCatalog(after,{recent:['scenery:가장자리 돌','bench']}),after);
  const rocks=after.filter(item=>item.name==='가장자리 돌');
  assert.equal(rocks.length,1);
  assert.equal(rocks[0].total,42);
  assert.equal(rocks[0].remaining,42);
  assert.equal(before.find(item=>item.key===rocks[0].key).remaining,0);
});

test('quantities and restore candidates follow placement, storage and undo snapshots',()=>{
  const scenery=villageScenery({}).map(item=>({...item,hidden:true}));
  const items=[...scenery,{id:'one',type:'bench'},{id:'two',type:'bench',hidden:true}];
  const original=villageCatalog(items),rock=original.find(item=>item.name==='가장자리 돌');
  assert.equal(original.find(item=>item.key==='bench').remaining,9);
  const restored=rock.storedIds[0];
  const next=villageCatalog(items.map(item=>item.id===restored?{...item,hidden:false}:item));
  const remaining=next.find(item=>item.key===rock.key);
  assert.equal(remaining.remaining,41);
  assert.equal(remaining.total,42);
  assert.ok(!remaining.storedIds.includes(restored));
  assert.equal(villageCatalog(items).find(item=>item.key===rock.key).remaining,42);
});

test('recent is a separate deduplicated list in successful-use order with search support',()=>{
  const catalog=villageCatalog(villageScenery({}));
  let recent=rememberDecoration([],'bench');
  recent=rememberDecoration(recent,'lantern');
  recent=rememberDecoration(recent,'bench');
  assert.deepEqual(recent,['bench','lantern']);
  assert.deepEqual(filterVillageCatalog(catalog,{category:'recent',recent}).map(item=>item.key),recent);
  assert.deepEqual(filterVillageCatalog(catalog,{category:'recent',recent,query:'가로등'}).map(item=>item.key),['lantern']);
  assert.deepEqual(filterVillageCatalog(catalog,{category:'recent'}),[]);
  assert.ok(filterVillageCatalog(catalog,{category:'plants'}).some(item=>item.name==='정원 나무'));
  assert.ok(filterVillageCatalog(catalog,{category:'decor'}).some(item=>item.name==='가장자리 돌'));
});
