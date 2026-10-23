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
  for(const item of ALL_ITEMS)assert.ok(spritePosition(item.itemId));
  assert.equal(spritePosition('unknown'),null);
});

test('the white silhouette selects the whole clicked facility, including each individual garden bed',()=>{
  const world=createLifeWorld();
  try{
    for(const [action,id] of [['storage','life-storage'],['kitchen','life-kitchen'],['garden:0','life-garden-0'],['garden:2','life-garden-2']]){
      const root=selectedFacility(world.facilities,action);
      assert.equal(root,world.facilities.get('scenery:'+id));assert.ok(root.children.length);
      root.visible=false;assert.equal(selectedFacility(world.facilities,action),null);root.visible=true;
    }
    assert.equal(selectedFacility(world.facilities,null),null);
  }finally{disposeObject(world.root);}
});

test('storage buttons authenticate, deduplicate withdrawals and return carried stock without changing another account',async()=>{
  let clock=Date.now();const runtime=createApp({store:openStore(':memory:'),testing:true,lifeClock:()=>clock});let socket;
  try{
    await new Promise(resolve=>runtime.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${runtime.server.address().port}/api`;
    const register=async username=>{const response=await fetch(base+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'inventory-test-password'})});return {...(await response.json()).user,cookie:response.headers.get('set-cookie').split(';')[0]};};
    const owner=await register('inventory_owner'),other=await register('inventory_other');
    for(const user of [owner,other])runtime.store.run("INSERT INTO inventory_entries VALUES(?,'PUFFER',10)",user.id);
    const request=(action,user=owner,requestId=randomUUID())=>fetch(base+'/me/life/storage',{method:'POST',headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:JSON.stringify({action,requestId})});
    assert.equal((await request({intent:'TAKE_FROM_STORAGE',item:'PUFFER'},null)).status,401);
    assert.equal((await request({intent:'PLANT_SEED',crop:'HERB'})).status,400);
    assert.equal((await request({intent:'STOP_ACTIVITY',actor:'BOTH'})).status,400);
    socket=io(base.slice(0,-4),{transports:['websocket'],extraHeaders:{Cookie:owner.cookie},forceNew:true});
    await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
    await new Promise(resolve=>socket.emit('village:join',{villageId:owner.id},resolve));
    const action={intent:'TAKE_FROM_STORAGE',item:'PUFFER',quantity:1},requestId=randomUUID();
    assert.equal((await request(action,owner,requestId)).status,200);
    assert.equal((await request(action,owner,requestId)).status,200);
    clock+=10000;runtime.life.tick();
    assert.equal(runtime.store.one('SELECT quantity FROM avatar_carry WHERE owner_id=?',owner.id)?.quantity,1);
    assert.equal(runtime.store.one("SELECT quantity FROM inventory_entries WHERE owner_id=? AND item_id='PUFFER'",owner.id).quantity,9);
    assert.equal((await request({intent:'STOP_ACTIVITY',actor:'COMPANION'})).status,200);
    assert.equal(runtime.store.one('SELECT quantity FROM avatar_carry WHERE owner_id=?',owner.id),undefined);
    for(const user of [owner,other])assert.equal(runtime.store.one("SELECT quantity FROM inventory_entries WHERE owner_id=? AND item_id='PUFFER'",user.id).quantity,10);
  }finally{socket?.disconnect();await runtime.close();}
});
