import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './runtimeHarness.mjs';
import {playerStars,validStar,memberStar} from '../shared/stars.mjs';

test('all accounts own three stable stars, including existing accounts',async()=>{
  const h=await harness();try{
    const u=await h.register('star_owner'),v=await h.register('star_neighbor');
    for(const user of [u,v]){const r=await h.request('/me/stars',user);assert.equal(r.status,200);assert.deepEqual(r.body.stars.map(s=>s.id),['plaza','fishing','farm']);}
    assert.equal(validStar('forest'),false);assert.equal(playerStars.length,3);
    assert.equal(memberStar({}), 'plaza');assert.equal(memberStar({seatId:'fishing:0'}),'fishing');
    assert.equal((await h.request('/exploration',u)).status,404);
  }finally{await h.close();}
});
test('travel resets poses, broadcasts the destination and stops fishing before leaving',async()=>{
  const h=await harness();try{
    const u=await h.register('star_traveler'),socket=await h.connect(u);
    assert.equal((await h.emit(socket,'star:travel',{starId:'fishing'})).ok,true);
    const join=await h.emit(socket,'village:join',{villageId:u.id});
    assert.equal(join.members.find(m=>m.userId===u.id).starId,'fishing');
    socket.emit('village:move',{villageId:u.id,x:-1.35,z:6.3,rotation:0,moving:false});
    await h.emit(socket,'village:join',{villageId:u.id});
    assert.equal((await h.emit(socket,'life:start',{anchorId:'fishing:0'})).ok,true);
    assert.ok(h.runtime.life.active(u.id));
    assert.equal((await h.emit(socket,'star:travel',{starId:'farm'})).ok,true);
    assert.equal(h.runtime.life.active(u.id),undefined);
    const after=await h.emit(socket,'village:join',{villageId:u.id});
    assert.equal(after.members.find(m=>m.userId===u.id).starId,'farm');
    assert.equal(after.members.find(m=>m.userId===u.id).seatId,null);
    assert.equal((await h.emit(socket,'star:travel',{starId:'forest'})).ok,false);
    await h.emit(socket,'star:travel',{starId:'plaza'});
    socket.emit('village:move',{villageId:u.id,x:-1.35,z:6.3,rotation:0,moving:false});
    await h.emit(socket,'village:join',{villageId:u.id});
    assert.equal((await h.emit(socket,'life:start',{anchorId:'fishing:0'})).ok,false);
    const v=await h.register('star_visitor'),guest=await h.connect(v,u.id);
    assert.equal((await h.emit(guest,'star:travel',{starId:'farm'})).ok,false);
  }finally{await h.close();}
});
