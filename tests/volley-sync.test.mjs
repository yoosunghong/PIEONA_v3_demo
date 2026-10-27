import test from 'node:test';
import assert from 'node:assert/strict';
import {newVolleyGame,advanceVolley,volleyInput,volleyPoint,VOLLEY} from '../shared/volleyball.mjs';
import {newVolleyClient,predictVolleyInput,reconcileVolley,syncVolleyClock,volleyClientTime,volleyFrame} from '../shared/volleySync.mjs';

const game=()=>({snapshot:newVolleyGame(['me','friend']),started:1000,serverTime:1000});
const input=(seq,move,jump=false)=>({seq,move,jump,spike:false});
test('prediction retains a short movement tap and jump across delayed snapshots until acknowledged',()=>{
  const g=game(),c=newVolleyClient(g,'me',0);
  predictVolleyInput(c,input(1,1,true),20);predictVolleyInput(c,input(2,0),80);
  const old=advanceVolley(structuredClone(g.snapshot),50);
  assert.equal(reconcileVolley(c,old,100),true);
  assert.equal(c.pending.length,2);assert.equal(c.predicted.players[0].input.move,0);
  assert.ok(c.predicted.players[0].x>240);assert.ok(c.predicted.players[0].y<VOLLEY.floor-VOLLEY.playerRadius);
  const server=structuredClone(old);volleyInput(server,'me',input(1,1,true));advanceVolley(server,100);volleyInput(server,'me',input(2,0));
  reconcileVolley(c,server,130);assert.equal(c.pending.length,0);
  assert.equal(c.predicted.players[0].seq,2);assert.equal(c.predicted.players[0].input.move,0);
  assert.equal(reconcileVolley(c,old,140),false);
});
test('future scheduled matches stay frozen until their shared start',()=>{
  const g=game();g.started+=1000;const c=newVolleyClient(g,'me',0);
  predictVolleyInput(c,input(1,1),100);volleyFrame(c,900);assert.equal(c.predicted.elapsed,0);assert.equal(c.predicted.players[0].x,240);
  volleyFrame(c,1100);assert.ok(c.predicted.players[0].x>240);
});
test('continuous frame simulation matches fixed-step physics and does not mutate server snapshots',()=>{
  const g=game(),c=newVolleyClient(g,'me',0),expected=structuredClone(g.snapshot);
  volleyInput(expected,'me',input(1,1));predictVolleyInput(c,input(1,1),0);
  for(let t=0;t<=200;t+=4)volleyFrame(c,t);
  advanceVolley(expected,200);assert.deepEqual(c.predicted,expected);assert.equal(g.snapshot.elapsed,0);assert.equal(g.snapshot.players[0].x,240);
  assert.ok(c.display.players[0].x<c.predicted.players[0].x);
  assert.ok(c.display.players[0].x>240);
});
test('clock corrections never rewind and a network gap caps simulation work',()=>{
  const c=newVolleyClient(game(),'me',0);volleyFrame(c,200);const time=c.time;
  syncVolleyClock(c,100,180,220);assert.ok(volleyClientTime(c,220)>=time);
  volleyFrame(c,60000);assert.ok(c.predicted.elapsed<=250+VOLLEY.step);assert.equal(c.time,250);
  const next=advanceVolley(newVolleyGame(['me','friend']),1000);reconcileVolley(c,next,60010);volleyFrame(c,60020);assert.ok(c.predicted.elapsed<=1250+VOLLEY.step);
});
test('score changes snap to the next serve and terminal snapshots clear pending inputs',()=>{
  const c=newVolleyClient(game(),'me',0);volleyFrame(c,0);predictVolleyInput(c,input(1,1),50);volleyFrame(c,60);
  const next=newVolleyGame(['me','friend']);next.elapsed=100;volleyPoint(next,1);reconcileVolley(c,next,100);
  assert.equal(volleyFrame(c,100).ball.x,next.ball.x);
  next.ended=true;next.phase='ended';next.winner='friend';reconcileVolley(c,next,110);
  assert.equal(c.pending.length,0);assert.equal(volleyFrame(c,120).ended,true);
});

test('a transient round-trip spike cannot drag the clock away from healthy samples',()=>{
  const c=newVolleyClient(game(),'me',0);
  syncVolleyClock(c,100,80,120);const origin=c.origin;
  syncVolleyClock(c,200,150,1150);assert.equal(c.origin,origin);
  syncVolleyClock(c,1200,1180,1220);assert.equal(c.origin,origin);
  syncVolleyClock(c,0,100,90);assert.equal(c.origin,origin);
});
