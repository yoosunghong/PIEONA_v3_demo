import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {io} from 'socket.io-client';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {FISHING_PERIOD,FISHING_ANCHORS,ITEM_DEFINITIONS,rollFish,nearestLifeInteraction,lifeInteractionKey} from '../shared/life.mjs';

const emit=(socket,event,data={})=>new Promise((resolve,reject)=>{const ack=(error,result)=>error?reject(error):resolve(result);if(event==='village:leave')socket.timeout(3000).emit(event,ack);else socket.timeout(3000).emit(event,data,ack);});
async function harness(filename=':memory:'){
  let time=Date.now(),rolls=[];
  const runtime=createApp({store:openStore(filename),testing:true,lifeClock:()=>time,lifeRandom:()=>rolls.length?rolls.shift():0});
  await new Promise(resolve=>runtime.server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${runtime.server.address().port}`,sockets=[];
  const request=async(path,user,body)=>{const response=await fetch(url+'/api'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
  async function register(username){const response=await request('/auth/register',null,{username,password:'fishing-test-password'});assert.equal(response.status,201);return {...response.body.user,cookie:response.cookie};}
  async function connect(user,villageId=user.id){const socket=io(url,{transports:['websocket'],extraHeaders:{Cookie:user.cookie},forceNew:true});sockets.push(socket);await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});assert.equal((await emit(socket,'village:join',{villageId})).ok,true);return socket;}
  async function move(socket,user,position={x:-.6,z:5.5}){socket.emit('village:move',{villageId:user.id,...position,rotation:0,moving:false,seatId:null,jumpStarted:0});await emit(socket,'village:join',{villageId:user.id});}
  return {runtime,request,register,connect,move,advance:ms=>time+=ms,rolls:values=>rolls=values,close:async()=>{for(const socket of sockets)socket.disconnect();await runtime.close();}};
}

test('fishing success and conditional rarity boundaries use the specified independent rolls',()=>{
  for(const [values,expected] of [[[.7],null],[[.699,.7199,0],'SARDINE'],[[0,.72,.99],'PUFFER'],[[0,.94,0],'GOLDEN_BREAM'],[[0,.99,0],'STAR_RAY']]){let index=0;assert.equal(rollFish(()=>values[index++])?.itemId||null,expected);}
  assert.equal(ITEM_DEFINITIONS.length,7);
  assert.equal(new Set(FISHING_ANCHORS.map(a=>a.id)).size,4);
  for(const anchor of FISHING_ANCHORS)assert.ok(Math.hypot(anchor.x,anchor.z)<6.8);
  assert.equal(nearestLifeInteraction({x:0,z:0}),null);
  assert.equal(nearestLifeInteraction({x:-.6,z:5.5}).id,'fishing:1');
  assert.notEqual(nearestLifeInteraction({x:-.6,z:5.5},[{userId:'other',seatId:'fishing:1'}],'me')?.id,'fishing:1');
  assert.equal(lifeInteractionKey({code:'KeyE',key:'ㄷ'}),true);
  assert.equal(lifeInteractionKey({code:'KeyE',target:{closest:()=>true}}),false);
  assert.equal(lifeInteractionKey({code:'KeyE',repeat:true}),false);
});

test('server enforces authentication, location, own village and a single active session',async()=>{
  const h=await harness();try{
    const owner=await h.register('fisher_owner'),visitor=await h.register('fisher_visitor');
    assert.equal((await h.request('/me/life')).status,401);
    const socket=await h.connect(owner),guest=await h.connect(visitor,owner.id);
    assert.equal((await emit(socket,'life:start',{anchorId:'fishing:1'})).ok,false);
    assert.equal((await emit(guest,'life:start',{anchorId:'fishing:1'})).ok,false);
    await h.move(socket,owner);
    assert.equal((await emit(socket,'life:start',{anchorId:'fishing:1',quantity:100})).ok,false);
    assert.equal((await emit(socket,'life:start',{anchorId:'bad'})).ok,false);
    const first=await emit(socket,'life:start',{anchorId:'fishing:1'});assert.equal(first.ok,true);
    assert.equal((await emit(socket,'life:start',{anchorId:'fishing:2'})).session.id,first.session.id);
    const second=await h.connect(owner);
    assert.equal((await emit(second,'life:start',{anchorId:'fishing:1'})).session.id,first.session.id);
    assert.equal(h.runtime.store.one("SELECT COUNT(*) n FROM life_sessions WHERE status='active'").n,1);
    const members=(await emit(socket,'village:join',{villageId:owner.id})).members;
    assert.equal(members.find(m=>m.userId===owner.id).seatId,'fishing:1');
    assert.equal((await h.request('/games',owner,{targetId:owner.id,kind:'runner'})).status,409);
    assert.deepEqual((await h.request('/me/life',visitor)).body.inventory,[]);
    assert.equal((await h.request(`/villages/${owner.id}/life`,visitor)).status,404);
  }finally{await h.close();}
});

test('45 second server settlement is atomic, idempotent, stackable and records first discovery',async()=>{
  const h=await harness();try{
    const user=await h.register('settle_fisher'),socket=await h.connect(user);await h.move(socket,user);
    const start=await emit(socket,'life:start',{anchorId:'fishing:1'});
    h.advance(FISHING_PERIOD-1);assert.deepEqual(h.runtime.life.settle(user.id),[]);
    h.advance(1);h.runtime.life.settle(user.id);h.runtime.life.settle(user.id);
    let data=(await h.request('/me/life',user)).body;assert.equal(data.inventory[0].quantity,1);assert.equal(data.session.attempts,1);assert.equal(data.discoveries.length,1);
    const discoveredAt=data.discoveries[0].discoveredAt;
    h.advance(FISHING_PERIOD*2);h.runtime.life.settle(user.id);
    data=(await h.request('/me/life',user)).body;assert.equal(data.inventory[0].quantity,3);assert.equal(data.discoveries[0].discoveredAt,discoveredAt);assert.equal(data.discoveries[0].acquiredBy,user.id);assert.equal(data.session.caught,3);
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM acquisition_events WHERE session_id=?',start.session.id).n,3);
    h.rolls([.99]);h.advance(FISHING_PERIOD);h.runtime.life.settle(user.id);
    data=(await h.request('/me/life',user)).body;assert.equal(data.session.attempts,4);assert.equal(data.session.caught,3);
    await emit(socket,'life:stop');await emit(socket,'life:stop');h.advance(FISHING_PERIOD*10);h.runtime.life.settle(user.id);
    data=(await h.request('/me/life',user)).body;assert.equal(data.session,null);assert.equal(data.inventory[0].quantity,3);
  }finally{await h.close();}
});

test('a failed inventory write rolls back rewards, event, discovery and settlement checkpoint',async()=>{
  const h=await harness();try{
    const user=await h.register('atomic_fisher'),socket=await h.connect(user);await h.move(socket,user);await emit(socket,'life:start',{anchorId:'fishing:1'});
    h.runtime.store.db.exec("CREATE TRIGGER reject_inventory BEFORE INSERT ON inventory_entries BEGIN SELECT RAISE(ABORT,'test rollback'); END");
    h.advance(FISHING_PERIOD);assert.throws(()=>h.runtime.life.settle(user.id),/test rollback/);
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM acquisition_events').n,0);assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM fish_discoveries').n,0);assert.equal(h.runtime.life.active(user.id).attempts,0);
    h.runtime.store.db.exec('DROP TRIGGER reject_inventory');h.runtime.life.settle(user.id);
    assert.equal(h.runtime.store.one('SELECT quantity FROM inventory_entries').quantity,1);assert.equal(h.runtime.life.active(user.id).attempts,1);
  }finally{await h.close();}
});

test('movement and final-tab departure cancel fishing; one remaining tab preserves it',async()=>{
  const h=await harness();try{
    const user=await h.register('leaving_fisher'),socket=await h.connect(user),second=await h.connect(user);await h.move(socket,user);await emit(socket,'life:start',{anchorId:'fishing:1'});
    await emit(second,'village:leave');assert.ok(h.runtime.life.active(user.id));
    const neighbor=await h.register('neighbor_fisher');
    await emit(second,'village:join',{villageId:neighbor.id});await emit(second,'village:leave');
    assert.ok(h.runtime.life.active(user.id),'leaving another village must not stop the first tab fishing at home');
    h.advance(FISHING_PERIOD);await h.move(socket,user,{x:0,z:5});assert.equal(h.runtime.life.active(user.id),undefined);
    assert.equal((await h.request('/me/life',user)).body.inventory[0].quantity,1);
    await h.move(socket,user);await emit(socket,'life:start',{anchorId:'fishing:1'});await emit(socket,'village:leave');assert.equal(h.runtime.life.active(user.id),undefined);
    h.advance(FISHING_PERIOD*100);assert.deepEqual(h.runtime.life.settle(user.id),[]);
  }finally{await h.close();}
});

test('SQLite reopen preserves inventory and discoveries and never grants offline catchup',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pieona-life-')),filename=join(dir,'life.sqlite');let h;
  try{
    h=await harness(filename);const user=await h.register('persistent_fisher'),socket=await h.connect(user);await h.move(socket,user);await emit(socket,'life:start',{anchorId:'fishing:1'});h.advance(FISHING_PERIOD);h.runtime.life.settle(user.id);await h.close();h=null;
    h=await harness(filename);h.advance(86400000);const data=(await h.request('/me/life',user)).body;
    assert.equal(data.session,null);assert.equal(data.inventory[0].quantity,1);assert.equal(data.discoveries.length,1);
    // Simulate an unclean stop: migration must close a persisted active session.
    h.runtime.store.run("UPDATE life_sessions SET status='active'");await h.close();h=null;
    h=await harness(filename);assert.equal(h.runtime.life.active(user.id),undefined);assert.equal((await h.request('/me/life',user)).body.inventory[0].quantity,1);
  }finally{if(h)await h.close();rmSync(dir,{recursive:true,force:true});}
});
