import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './runtimeHarness.mjs';
import {FISHING_PERIOD} from '../shared/life.mjs';
import {fishingScore,fishingDuelView} from '../shared/fishingDuel.mjs';
import {createFishingDuels} from '../server/fishingDuels.mjs';

async function setup(options={}){
  const h=await harness({lifeRandom:()=>0,...options}),a=await h.register('duel_fisher_a'),b=await h.register('duel_fisher_b'),c=await h.register('duel_fisher_c');
  for(const u of [a,b,c])h.runtime.store.run('UPDATE users SET gold=100 WHERE id=?',u.id);
  const sa=await h.connect(a),sb=await h.connect(b,a.id),sc=await h.connect(c,a.id);
  for(const socket of [sa,sb,sc]){socket.emit('village:move',{villageId:a.id,x:-.6,z:5.5,rotation:0,moving:false,seatId:null,jumpStarted:0});await h.emit(socket,'village:join',{villageId:a.id});}
  assert.equal((await h.emit(sb,'life:start',{anchorId:'fishing:1'})).ok,true);
  const snapshot=async u=>(await h.request('/me/life',u)).body;
  const gold=u=>h.runtime.store.one('SELECT gold FROM users WHERE id=?',u.id).gold;
  return {...h,a,b,c,sa,sb,sc,snapshot,gold};
}
const challenge=(h,minutes=1,stake=10)=>h.emit(h.sa,'fishing:challenge',{targetId:h.b.id,minutes,stake});
const accept=(h,id)=>h.emit(h.sb,'fishing:duel',{id,action:'accept'});

test('fish scores vary by species and the front camera centers both fishers',()=>{
  assert.equal(fishingScore([{itemId:'SARDINE',quantity:2},{itemId:'STAR_RAY',quantity:1}]),120);
  const v=fishingDuelView([{x:-1,z:6,rotation:0},{x:1,z:6,rotation:0}]);assert.deepEqual(v.target,[0,2,6]);assert.ok(v.position[2]>6);
});

test('duels validate membership, input and consent before escrowing gold and starting both sessions',async()=>{
  const h=await setup();try{
    assert.equal((await challenge(h,2)).ok,false);assert.equal((await challenge(h,1,-1)).ok,false);
    const request=await challenge(h);assert.equal(request.ok,true);const id=request.duel.id;
    assert.equal(h.gold(h.a),100);assert.equal(h.gold(h.b),100);
    assert.equal((await h.emit(h.sa,'fishing:duel',{id,action:'accept'})).ok,false);
    assert.equal((await h.emit(h.sc,'fishing:duel',{id,action:'accept'})).ok,false);
    const accepted=await accept(h,id);assert.equal(accepted.ok,true);assert.equal(accepted.duel.status,'active');
    assert.equal(new Set(accepted.duel.players.map(p=>p.anchorId)).size,2);
    assert.equal(h.gold(h.a),90);assert.equal(h.gold(h.b),90);
    assert.equal((await accept(h,id)).ok,false);assert.equal(h.gold(h.a),90);
    const a=await h.snapshot(h.a),b=await h.snapshot(h.b);assert.equal(a.session.startedAt,b.session.startedAt);assert.equal(a.session.caught,0);
    h.advance(FISHING_PERIOD);
    const counted=await h.snapshot(h.a);assert.equal(counted.duel.players[0].caught,1);assert.equal(counted.duel.players[0].score,10);
    const members=await h.emit(h.sa,'village:join',{villageId:h.a.id});const p=members.members.find(p=>p.userId===h.a.id);assert.equal(p.fishingCaught,1);assert.equal(p.fishingCatch.itemId,'SARDINE');
    h.advance(15000);const ended=await h.snapshot(h.a);assert.equal(ended.duel.status,'finished');assert.equal(ended.duel.winner,null);assert.equal(h.gold(h.a),100);assert.equal(h.gold(h.b),100);
    h.runtime.life.tick();assert.equal(h.gold(h.a),100);
  }finally{await h.close();}
});

test('late ticks cap catches at the deadline and award the pot to the higher score',async()=>{
  let rolls=[];const h=await setup({lifeRandom:()=>rolls.length?rolls.shift():0});try{
    const r=await challenge(h);assert.equal((await accept(h,r.duel.id)).ok,true);
    rolls=[0,.99,0,0,0,0];h.advance(180000);
    const d=(await h.snapshot(h.a)).duel;assert.equal(d.status,'finished');assert.equal(d.players[0].caught,1);assert.equal(d.players[0].score,100);assert.equal(d.players[1].score,10);assert.equal(d.winner,h.a.id);assert.equal(h.runtime.store.one('SELECT caught FROM life_sessions WHERE id=?',d.players[0].sessionId).caught,1);
    assert.equal(h.gold(h.a),110);assert.equal(h.gold(h.b),90);h.runtime.life.tick();assert.equal(h.gold(h.a),110);
  }finally{await h.close();}
});

test('free duels require two finish consents; stopping is a forfeit and refunds never repeat',async()=>{
  const h=await setup();try{
    let r=await challenge(h,0);let id=r.duel.id;assert.equal((await accept(h,id)).ok,true);
    h.advance(FISHING_PERIOD);
    assert.equal((await h.emit(h.sa,'fishing:duel',{id,action:'finish'})).duel.status,'active');
    assert.equal((await h.emit(h.sa,'fishing:duel',{id,action:'finish'})).duel.status,'active');
    assert.equal((await h.emit(h.sb,'fishing:duel',{id,action:'finish'})).duel.status,'finished');assert.equal(h.gold(h.a),100);
    const socket=h.sb;socket.emit('village:move',{villageId:h.a.id,x:-.6,z:5.5,rotation:0,moving:false,seatId:null});await h.emit(socket,'village:join',{villageId:h.a.id});
    assert.equal((await h.emit(socket,'life:start',{anchorId:'fishing:1'})).ok,true);
    r=await challenge(h,0);id=r.duel.id;assert.equal((await accept(h,id)).ok,true);
    await h.emit(h.sa,'life:stop',{});assert.equal((await h.snapshot(h.b)).duel.winner,h.b.id);assert.equal(h.gold(h.b),110);assert.equal(h.gold(h.a),90);
    await h.emit(h.sa,'life:stop',{});assert.equal(h.gold(h.b),110);
  }finally{await h.close();}
});

test('insufficient funds roll back escrow and invitation expiry leaves ordinary fishing intact',async()=>{
  const h=await setup();try{
    const r=await challenge(h,3,100);h.runtime.store.run('UPDATE users SET gold=0 WHERE id=?',h.b.id);
    assert.equal((await accept(h,r.duel.id)).ok,false);assert.equal(h.gold(h.a),100);assert.equal((await h.snapshot(h.b)).session.caught,0);
    h.advance(30001);assert.equal((await h.snapshot(h.a)).duel.status,'cancelled');assert.ok((await h.snapshot(h.b)).session);
  }finally{await h.close();}
});

test('three and five minute invitations can be declined without charging either player',async()=>{
  const h=await setup();try{
    for(const minutes of [3,5]){
      const r=await challenge(h,minutes);assert.equal(r.ok,true);assert.equal(r.duel.minutes,minutes);
      assert.equal((await h.emit(h.sb,'fishing:duel',{id:r.duel.id,action:'decline'})).duel.status,'cancelled');
    }
    assert.equal(h.gold(h.a),100);assert.equal(h.gold(h.b),100);
  }finally{await h.close();}
});

test('restart recovery refunds persisted escrow once across repeated initialization',async()=>{
  const h=await setup();try{
    const m={id:'interrupted-match',villageId:h.a.id,status:'active',stake:10,minutes:3,players:[{userId:h.a.id},{userId:h.b.id}]};
    for(const u of [h.a,h.b])h.runtime.store.run('UPDATE users SET gold=90 WHERE id=?',u.id);
    h.runtime.store.run('INSERT INTO fishing_duels VALUES(?,?)',m.id,JSON.stringify(m));
    const options={store:h.runtime.store,clock:Date.now,members:()=>null,anchors:()=>[],active:()=>null,busy:()=>false,startPair:()=>[],stopPlayer:()=>{},settlePlayer:()=>{},publish:()=>{},emitVillage:()=>{}};
    let recovered=createFishingDuels(options);assert.equal(recovered.snapshot(h.a.id).status,'cancelled');assert.equal(h.gold(h.a),100);assert.equal(h.gold(h.b),100);
    recovered=createFishingDuels(options);assert.equal(h.gold(h.a),100);assert.equal(h.gold(h.b),100);
  }finally{await h.close();}
});

test('a player leaving the village forfeits an active duel and releases both fishing seats',async()=>{
  const h=await setup();try{
    const r=await challenge(h,5);assert.equal((await accept(h,r.duel.id)).ok,true);
    await new Promise((resolve,reject)=>h.sa.timeout(3000).emit('village:leave',(error,result)=>error?reject(error):resolve(result)));
    const result=(await h.snapshot(h.b)).duel;assert.equal(result.status,'finished');assert.equal(result.winner,h.b.id);
    assert.equal(h.gold(h.b),110);assert.equal(h.runtime.life.active(h.a.id),undefined);assert.equal(h.runtime.life.active(h.b.id),undefined);
  }finally{await h.close();}
});
