import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {io} from 'socket.io-client';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {generateAnswer} from '../server/ai.mjs';
import {localLifeAction} from '../server/lifeActions.mjs';
import {avatarTools,actionFromTool} from '../server/avatarTools.mjs';
import {createAvatarRuntime} from '../server/avatarRuntime.mjs';
import {villageBenches} from '../shared/benches.mjs';

const emit=(s,event,data={})=>new Promise((r,j)=>s.timeout(3000).emit(event,data,(e,v)=>e?j(e):r(v)));
async function harness(answer=async()=>({reply:'대화',emotion:'calm',memories:[],provider:'local'})){
  let time=Date.parse('2026-10-23T00:00:00Z');const sockets=[];
  const runtime=createApp({store:openStore(':memory:'),testing:true,lifeClock:()=>time,generateAnswer:answer});
  await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${runtime.server.address().port}`;
  async function request(path,user,body){const r=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body?JSON.stringify(body):undefined});assert.ok(r.ok,await r.clone().text());return {data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  async function register(name){const r=await request('/auth/register',null,{username:name,password:'test-avatar-password'});return {...r.data.user,cookie:r.cookie};}
  async function connect(user,villageId=user.id){const s=io(base,{transports:['websocket'],extraHeaders:{Cookie:user.cookie},forceNew:true});sockets.push(s);await new Promise((r,j)=>{s.once('connect',r);s.once('connect_error',j);});await emit(s,'village:join',{villageId});return s;}
  const move=async(s,user,x,z)=>{s.emit('village:move',{villageId:user.id,x,z,rotation:0,moving:false,seatId:null});await emit(s,'village:join',{villageId:user.id});};
  const conversation=async(user,target=user)=>(await request('/conversations',user,{targetId:target.id,share:false,anonymous:false})).data.id;
  const say=async(user,cid,text,requestId=randomUUID())=>(await request(`/conversations/${cid}/messages`,user,{text,requestId})).data;
  const qty=user=>runtime.store.one("SELECT quantity FROM inventory_entries WHERE owner_id=? AND item_id='SARDINE'",user.id)?.quantity||0;
  const seed=(user,n)=>runtime.store.run("INSERT INTO inventory_entries VALUES(?,'SARDINE',?)",user.id,n);
  return {runtime,register,connect,move,conversation,say,qty,seed,advance:ms=>{time+=ms;runtime.life.tick();},close:async()=>{sockets.forEach(s=>s.disconnect());await runtime.close();}};
}

test('native Gemini tool calling maps a function without trusting prose or exporting world state',async()=>{
  let sent;const result=await generateAnswer({own:true,lifeActions:true,avatarTools:true,system:'test'},'조금 가까이 와 줄 수 있어?',[],{apiKey:'test-key',fetch:async(_,init)=>{sent=JSON.parse(init.body);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'이미 도착했어'},{functionCall:{name:'move_to',args:{target:'PLAYER'}}}]}}]})};}});
  assert.equal(result.action.intent,'MOVE_TO');assert.equal(result.action.target,'PLAYER');assert.doesNotMatch(result.reply,/도착/);
  assert.deepEqual(sent.tools[0].functionDeclarations,avatarTools);assert.equal(sent.toolConfig.functionCallingConfig.mode,'AUTO');
  assert.equal(sent.generationConfig.responseMimeType,undefined);assert.doesNotMatch(sent.systemInstruction.parts[0].text,/gameState|owner_id|inventory_entries/);
  for(const call of [{name:'eval',args:{}},{name:'move_to',args:{target:'PLAYER',ownerId:'other'}},{name:'take_from_storage',args:{item:'SARDINE',quantity:-1}},{name:'move_to',args:{}}])assert.equal(actionFromTool(call).intent,'UNSUPPORTED');
});

test('multiple tools are rejected without executing a partial sequence; ordinary JSON conversation survives',async()=>{
  const run=parts=>generateAnswer({own:true,lifeActions:true,avatarTools:true,system:'test'},'입력',[],{apiKey:'test-key',fetch:async()=>({ok:true,json:async()=>({candidates:[{content:{parts}}]})})});
  assert.equal((await run([{functionCall:{name:'stand_up',args:{}}},{functionCall:{name:'sit_down',args:{}}}])).action.intent,'UNSUPPORTED');
  assert.equal((await run([{text:'```json\n{"reply":"안녕","emotion":"happy","memories":[]}\n```'}])).reply,'안녕');
});

test('offline action commands exclude quotes, negation, hypothetical and compound instructions',()=>{
  for(const t of ['나한테 와','내 옆으로 와줘'])assert.equal(localLifeAction(t)?.intent,'MOVE_TO');
  assert.equal(localLifeAction('보관함에서 정어리 2마리 꺼내와')?.quantity,2);
  for(const t of ['"나한테 와"를 번역해줘','나한테 오지 마','만약 나한테 와라고 하면?','앉아 있으면 편해','나한테 와 그리고 앉아'])assert.equal(localLifeAction(t),null,t);
});

test('chat come-here walks incrementally to the real player and stops; stop invalidates delayed requests',async()=>{
  const h=await harness();try{
    const u=await h.register('come_here'),s=await h.connect(u);await h.move(s,u,4,2);const cid=await h.conversation(u);
    const r=await h.say(u,cid,'나한테 와');assert.equal(r.action.ok,true);assert.equal(r.action.companion.state,'Moving');
    const start=h.runtime.life.companionMembers(u.id)[0];h.advance(300);const middle=h.runtime.life.companionMembers(u.id)[0];assert.ok(middle.x>start.x&&middle.x<4);
    h.advance(10000);const end=h.runtime.life.companionMembers(u.id)[0];assert.ok(Math.hypot(end.x-4,end.z-2)<1.8);
    await h.say(u,cid,'나한테 와');await h.move(s,u,-4,-2);h.advance(10000);assert.equal(h.runtime.life.snapshot(u.id).companion.state,'Moving');h.advance(10000);
    const relocated=h.runtime.life.companionMembers(u.id)[0];assert.ok(Math.hypot(relocated.x+4,relocated.z+2)<1.8);
    const epoch=h.runtime.life.epoch(u.id);await h.say(u,cid,'그만하자');assert.equal(h.runtime.life.execute(u.id,u.id,{intent:'MOVE_TO',target:'PLAYER'},epoch).ok,false);
  }finally{await h.close();}
});

test('the model-selected tool reaches the same authenticated server executor',async()=>{
  const h=await harness(async()=>({reply:'도착했다는 주장은 무시',emotion:'happy',memories:[],provider:'gemini',action:actionFromTool({name:'move_to',args:{target:'PLAYER'}})}));try{
    const u=await h.register('model_move');await h.connect(u);const cid=await h.conversation(u);const r=await h.say(u,cid,'조금 가까이 와 줄 수 있어?');
    assert.equal(r.provider,'gemini');assert.equal(r.action.ok,true);assert.doesNotMatch(r.reply,/도착했다/);assert.equal(h.runtime.life.snapshot(u.id).companion.state,'Moving');
  }finally{await h.close();}
});

test('sit reserves a real bench, animates via seat state, and stand releases it',async()=>{
  const h=await harness();try{
    const u=await h.register('sit_here');await h.connect(u);const cid=await h.conversation(u);const r=await h.say(u,cid,'앉아');assert.equal(r.action.ok,true);
    const benches=villageBenches(JSON.parse(h.runtime.store.one('SELECT village FROM users WHERE id=?',u.id).village));
    assert.ok(benches.some(b=>h.runtime.life.seatOccupied(u.id,b.id,'someone')));
    h.advance(10000);const seated=h.runtime.life.companionMembers(u.id)[0];assert.ok(benches.some(b=>b.id===seated.seatId));assert.equal(seated.activityState,'Sitting');
    await h.say(u,cid,'일어나');assert.equal(h.runtime.life.companionMembers(u.id)[0].seatId,null);assert.equal(h.runtime.life.snapshot(u.id).companion.state,'Idle');
  }finally{await h.close();}
});

test('a fishing player can call the companion without losing their own activity',async()=>{
  const h=await harness();try{
    const u=await h.register('fishing_come'),s=await h.connect(u);await h.move(s,u,-.6,5.5);
    assert.equal((await emit(s,'life:start',{anchorId:'fishing:1'})).ok,true);const cid=await h.conversation(u);
    assert.equal((await h.say(u,cid,'나한테 와')).action.ok,true);h.advance(10000);
    assert.equal(h.runtime.life.snapshot(u.id).session.state,'Fishing');assert.equal(h.runtime.life.snapshot(u.id).companion.state,'Idle');
  }finally{await h.close();}
});

test('storage retrieval physically picks up inventory then delivers once, preserving total quantity',async()=>{
  const h=await harness();try{
    const u=await h.register('bring_fish'),s=await h.connect(u);await h.move(s,u,4,0);h.seed(u,3);const cid=await h.conversation(u),rid=randomUUID();
    const r=await h.say(u,cid,'보관함에서 정어리 2마리 꺼내와',rid);assert.equal(r.action.ok,true);assert.equal(h.qty(u),3);
    h.advance(10000);assert.equal(h.qty(u),1);assert.deepEqual(h.runtime.life.snapshot(u.id).companion.carriedItem,{itemId:'SARDINE',quantity:2});
    await h.move(s,u,-4,-2);h.advance(10000);assert.equal(h.qty(u),1);h.advance(10000);assert.equal(h.qty(u),3);
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM avatar_carry').n,0);assert.equal(h.runtime.life.snapshot(u.id).companion.carriedItem,null);
    await h.say(u,cid,'보관함에서 정어리 2마리 꺼내와',rid);assert.equal(h.runtime.life.snapshot(u.id).companion.task,null);assert.equal(h.qty(u),3);
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM acquisition_events').n,0);
  }finally{await h.close();}
});

test('stop and departure refund carried inventory; out-of-stock requests never move',async()=>{
  const h=await harness();try{
    const u=await h.register('cancel_bring');await h.connect(u);h.seed(u,1);const cid=await h.conversation(u);
    assert.equal((await h.say(u,cid,'보관함에서 정어리 2마리 꺼내와')).action.ok,false);
    await h.say(u,cid,'보관함에서 정어리 꺼내와');h.advance(10000);assert.equal(h.qty(u),0);
    await h.say(u,cid,'그만하자');assert.equal(h.qty(u),1);h.advance(10000);assert.equal(h.qty(u),1);
    await h.say(u,cid,'보관함에서 정어리 꺼내와');h.advance(10000);assert.equal(h.qty(u),0);
    h.runtime.life.leave(u.id);assert.equal(h.qty(u),1);assert.deepEqual(h.runtime.life.companionMembers(u.id),[]);
  }finally{await h.close();}
});

test('ownership, coordinates and live stock are validated at execution and pickup',async()=>{
  const h=await harness();try{
    const u=await h.register('validation_move'),visitor=await h.register('visitor_move');await h.connect(u);
    assert.equal(h.runtime.life.execute(visitor.id,u.id,{intent:'MOVE_TO',target:'PLAYER'}).ok,false);
    assert.equal(h.runtime.life.execute(u.id,u.id,{intent:'MOVE_TO',target:'POSITION',x:999,z:0}).ok,false);
    h.seed(u,1);const cid=await h.conversation(u);await h.say(u,cid,'보관함에서 정어리 꺼내와');h.runtime.store.run('UPDATE inventory_entries SET quantity=0 WHERE owner_id=?',u.id);h.advance(10000);
    assert.equal(h.runtime.life.snapshot(u.id).companion.task,null);assert.equal(h.qty(u),0);assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM avatar_carry').n,0);
  }finally{await h.close();}
});

test('recovery returns durable carried items exactly once and failed pickup writes roll back inventory',async()=>{
  const h=await harness();try{
    const u=await h.register('recover_carry');await h.connect(u);h.seed(u,3);
    h.runtime.store.run('UPDATE inventory_entries SET quantity=1 WHERE owner_id=?',u.id);h.runtime.store.run("INSERT INTO avatar_carry VALUES(?,'SARDINE',2)",u.id);
    // Simulate the durable state left by a crash before the delivery tick.
    createAvatarRuntime({store:h.runtime.store});assert.equal(h.qty(u),3);createAvatarRuntime({store:h.runtime.store});assert.equal(h.qty(u),3);
    const cid=await h.conversation(u);await h.say(u,cid,'보관함에서 정어리 2마리 꺼내와');
    h.runtime.store.db.exec("CREATE TRIGGER reject_carry BEFORE INSERT ON avatar_carry BEGIN SELECT RAISE(ABORT,'test pickup failure'); END;");
    assert.throws(()=>h.advance(10000),/test pickup failure/);assert.equal(h.qty(u),3);assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM avatar_carry').n,0);
    await h.say(u,cid,'그만하자');
  }finally{await h.close();}
});
