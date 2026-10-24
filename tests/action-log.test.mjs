import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {io} from 'socket.io-client';
import {createActionLogger} from '../server/actionLog.mjs';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';

test('action log allowlist omits sensitive content and isolates logging failures',()=>{
  const lines=[],log=createActionLogger(line=>lines.push(line),()=>0);
  log('player','fishing_result',{itemId:'SARDINE',quantity:1,password:'secret',cookie:'secret',text:'private chat',content:'private memory',answers:['survey'],extra:{nested:'secret'}});
  assert.deepEqual(JSON.parse(lines[0].slice(9)),{time:'1970-01-01T00:00:00.000Z',player:'player',action:'fishing_result',itemId:'SARDINE',quantity:1});
  assert.doesNotThrow(()=>createActionLogger(()=>{throw new Error('disk full');})('player','test'));
});

test('actual fishing, gardening, cooking receipts produce factual console action logs',async()=>{
  let time=Date.now();const lines=[];
  const runtime=createApp({store:openStore(':memory:'),testing:true,lifeClock:()=>time,lifeRandom:()=>0,logWriter:line=>lines.push(JSON.parse(line.slice(9)))});
  let socket;
  try{
    await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${runtime.server.address().port}`;
    const registration=await fetch(url+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'action_logger',password:'private-password'})});
    const uid=(await registration.json()).user.id,cookie=registration.headers.get('set-cookie').split(';')[0];
    socket=io(url,{transports:['websocket'],extraHeaders:{Cookie:cookie},forceNew:true});
    await new Promise((r,j)=>{socket.once('connect',r);socket.once('connect_error',j);});
    const joined=await new Promise(r=>socket.emit('village:join',{villageId:uid},r));assert.equal(joined.ok,true);
    const action=data=>{const result=runtime.life.execute(uid,data,randomUUID());assert.equal(result.ok,true,result.reply);};
    const advance=ms=>{time+=ms;runtime.life.tick();};
    socket.emit('village:move',{villageId:uid,x:-.6,z:5.5,rotation:0,moving:false,seatId:null});await new Promise(r=>socket.emit('village:join',{villageId:uid},r));
    assert.equal((await new Promise(r=>socket.emit('life:start',{anchorId:'fishing:1'},r))).ok,true);advance(45000);runtime.life.stop(uid);
    action({intent:'PLANT_SEED',crop:'HERB'});advance(20000);advance(300000);
    action({intent:'HARVEST_CROP'});advance(20000);
    action({intent:'COOK_FOOD',recipe:'HERB_GRILLED_FISH'});advance(20000);
    await new Promise(r=>socket.emit('village:leave',r));advance(90000);
    for(const name of ['register','village_join','fishing_start','fishing_result','fishing_stop','life_work_start','life_work_complete','inventory_gain','inventory_spend','village_leave'])assert.ok(lines.some(l=>l.action===name),name);
    assert.equal(lines.filter(l=>l.action==='offline_settled').length,0);
    assert.ok(lines.some(l=>l.action==='inventory_gain'&&l.itemId==='HERB_GRILLED_FISH'&&l.quantity===1));
    assert.ok(lines.every(l=>l.player===uid));assert.doesNotMatch(JSON.stringify(lines),/private-password|pieona_session/);
  }finally{socket?.disconnect();await runtime.close();}
});
