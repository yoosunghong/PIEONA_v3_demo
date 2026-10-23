import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {io} from 'socket.io-client';
import {RECIPES} from '../shared/garden.mjs';
import {cookingInputs,COOK_TIME_MS} from '../shared/cooking.mjs';
import {kitchenPlan,kitchenRecipes} from '../src/kitchenRecipes.mjs';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';

test('recipe filters and batch requirements use real stock and never auto-select rare fish',()=>{
  const herb=RECIPES.find(item=>item.id==='HERB_GRILLED_FISH'),platter=RECIPES.find(item=>item.id==='SEAFOOD_PLATTER');
  const inventory=[{itemId:'SARDINE',quantity:10},{itemId:'HERB',quantity:2},{itemId:'GOLDEN_BREAM',quantity:9}];
  const plan=kitchenPlan(herb,inventory,[],2);
  assert.equal(plan.maxQuantity,2);assert.equal(plan.enough,true);assert.deepEqual(plan.fish,['SARDINE']);assert.equal(plan.usesRare,false);
  assert.deepEqual(plan.inputs,[{itemId:'SARDINE',quantity:2},{itemId:'HERB',quantity:2}]);
  assert.equal(kitchenPlan(herb,inventory,[],3).enough,false);
  assert.equal(kitchenPlan(herb,inventory,['GOLDEN_BREAM']).usesRare,true);
  assert.equal(kitchenPlan(herb,[{itemId:'GOLDEN_BREAM',quantity:9}],[]).maxQuantity,0);
  assert.equal(kitchenPlan(platter,inventory,['SARDINE','SARDINE','GOLDEN_BREAM']).enough,false);
  assert.equal(kitchenRecipes('grill').length,2);assert.equal(kitchenRecipes('dessert').length,0);
  assert.deepEqual(kitchenRecipes('all','토마토').map(item=>item.id),['TOMATO_SALAD']);
  assert.deepEqual(cookingInputs(herb,['SARDINE'],1),[{itemId:'SARDINE',quantity:1},{itemId:'HERB',quantity:1}]);
});

test('batch cooking cancels without spending, validates enough ingredients, and awards the requested count only once',async()=>{
  let time=Date.now();const runtime=createApp({store:openStore(':memory:'),testing:true,lifeClock:()=>time});let socket;
  try{
    await new Promise(resolve=>runtime.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${runtime.server.address().port}`;
    const registration=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'kitchen_batch',password:'kitchen-test-password'})});
    const user=(await registration.json()).user,cookie=registration.headers.get('set-cookie').split(';')[0];
    const seed=(item,quantity)=>runtime.store.run('INSERT INTO inventory_entries VALUES(?,?,?) ON CONFLICT(owner_id,item_id) DO UPDATE SET quantity=excluded.quantity',user.id,item,quantity);
    const quantity=item=>runtime.store.one('SELECT quantity FROM inventory_entries WHERE owner_id=? AND item_id=?',user.id,item)?.quantity||0;
    const action=(command,requestId=randomUUID())=>fetch(base+'/api/me/life/actions',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({requestId,action:command})});
    socket=io(base,{transports:['websocket'],extraHeaders:{Cookie:cookie},forceNew:true});await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
    await new Promise(resolve=>socket.emit('village:join',{villageId:user.id},resolve));
    seed('SARDINE',10);seed('HERB',2);
    const command={intent:'COOK_FOOD',recipe:'HERB_GRILLED_FISH',fish:['SARDINE'],quantity:2};
    assert.equal((await action({...command,quantity:3})).status,409);
    assert.equal((await action({...command,quantity:0})).status,400);
    assert.equal((await action(command)).status,200);
    const op=runtime.store.one("SELECT plan FROM life_operations WHERE owner_id=? AND status='pending'",user.id);
    assert.equal(JSON.parse(op.plan).durationMs,COOK_TIME_MS*2);
    time+=3000;runtime.life.tick();assert.equal(quantity('HERB'),2);assert.equal(quantity('HERB_GRILLED_FISH'),0);
    await new Promise(resolve=>socket.emit('life:stop',{actor:'PLAYER'},resolve));assert.equal(quantity('SARDINE'),10);assert.equal(quantity('HERB'),2);
    const requestId=randomUUID();assert.equal((await action(command,requestId)).status,200);
    time+=10000;runtime.life.tick();assert.equal(quantity('HERB_GRILLED_FISH'),2);assert.equal(quantity('HERB'),0);assert.equal(quantity('SARDINE'),8);
    assert.equal((await action(command,requestId)).status,200);time+=10000;runtime.life.tick();assert.equal(quantity('HERB_GRILLED_FISH'),2);
  }finally{socket?.disconnect();await runtime.close();}
});
