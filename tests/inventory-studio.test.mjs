import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {io} from 'socket.io-client';
import {ALL_ITEMS} from '../shared/life.mjs';
import {inventoryItems,spritePosition} from '../src/inventoryView.mjs';
import {selectedFacility} from '../src/facilityOutline.mjs';
import {createLifeWorld} from '../src/lifeWorld.js';
import {disposeObject} from '../src/worldAssets.js';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';

test('inventory filtering and sorting use actual quantities and acquisition times without inventing stock',()=>{
  const data={catalog:ALL_ITEMS,inventory:[{itemId:'PUFFER',quantity:10,lastAcquiredAt:30},{itemId:'HERB',quantity:2,lastAcquiredAt:50},{itemId:'TOMATO',quantity:0}],inventoryAcquisitions:[{itemId:'PUFFER',lastAcquiredAt:30},{itemId:'HERB',lastAcquiredAt:50}],discoveries:[{itemId:'PUFFER',discoveredAt:1}]};
  assert.deepEqual(inventoryItems(data).map(item=>item.itemId),['HERB','PUFFER']);
  assert.deepEqual(inventoryItems(data,{sort:'quantity'}).map(item=>item.quantity),[10,2]);
  assert.deepEqual(inventoryItems(data,{category:'fish',query:'복'}).map(item=>item.itemId),['PUFFER']);
  assert.equal(inventoryItems(data,{query:'없는 아이템'}).length,0);
  assert.equal(inventoryItems(data,{collection:true}).length,7);
  assert.equal(inventoryItems(data,{collection:true}).filter(item=>item.discovery).length,1);
  for(const item of ALL_ITEMS.filter(i=>!['seed'].includes(i.category)&&!['APPLE','STRAWBERRY','FRUIT_SALAD'].includes(i.itemId)))assert.ok(spritePosition(item.itemId));
  assert.equal(spritePosition('unknown'),null);
});

test('retired village garden facilities no longer expose a clickable outline',()=>{
  const world=createLifeWorld();
  try{
    for(const action of ['garden:0','garden:2'])assert.equal(selectedFacility(world.facilities,action),null);
    for(const action of ['storage','kitchen'])assert.equal(selectedFacility(world.facilities,action),null);
    assert.equal(selectedFacility(world.facilities,null),null);
  }finally{disposeObject(world.root);}
});

test('removed pet courier endpoint cannot withdraw inventory',async()=>{
  const runtime=createApp({store:openStore(':memory:'),testing:true});
  try{
    await new Promise(resolve=>runtime.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${runtime.server.address().port}`;
    const response=await fetch(base+'/api/me/life/storage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),action:{intent:'TAKE_FROM_STORAGE',item:'SARDINE'}})});
    assert.equal(response.status,404);assert.equal(runtime.store.one('SELECT COUNT(*) n FROM inventory_entries').n,0);
  }finally{await runtime.close();}
});
