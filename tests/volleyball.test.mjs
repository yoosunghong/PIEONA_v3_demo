import test from 'node:test';
import assert from 'node:assert/strict';
import {VOLLEY,newVolleyGame,advanceVolley,volleyInput,volleyPoint,volleyScore} from '../shared/volleyball.mjs';

test('automatic serve clears the net and the solo AI tracks and returns the ball',()=>{
  const s=newVolleyGame();let crossed=false,returned=false;
  for(let t=0;t<10000;t+=VOLLEY.step){advanceVolley(s,t);if(s.ball.x>505&&s.ball.y< VOLLEY.netTop-17)crossed=true;if(s.lastHit?.side===1)returned=true;}
  assert.ok(crossed,'serve must clear the net');assert.ok(returned,'AI should intercept the serve');assert.notEqual(s.players[1].x,720);
});
test('player input stays in its court, jumps, rejects stale sequences and expires on lost connection',()=>{
  const s=newVolleyGame(['one','two']);volleyInput(s,'one',{move:1,jump:true,spike:false,seq:2});advanceVolley(s,300);
  assert.ok(s.players[0].x>240);assert.ok(s.players[0].y<400);assert.equal(volleyInput(s,'one',{move:-1,jump:false,spike:false,seq:1}),false);
  advanceVolley(s,1000);const x=s.players[0].x;advanceVolley(s,1500);assert.equal(s.players[0].x,x);assert.ok(x<480-32);
});
test('ball collides with the side and the top of the net without crossing it',()=>{
  for(const top of [false,true]){const s=newVolleyGame();s.phase='rally';Object.assign(s.ball,top?{x:480,y:258,vx:0,vy:200}:{x:454,y:330,vx:320,vy:0});advanceVolley(s,30);if(top)assert.ok(s.ball.vy<0);else{assert.ok(s.ball.x<480);assert.ok(s.ball.vx<0);}}
});
test('body returns automatically; aerial spike produces a fast attack',()=>{
  for(const spike of [false,true]){const s=newVolleyGame();s.phase='rally';const p=s.players[0];p.y=spike?230:420;p.spikeUntil=spike?200:0;Object.assign(s.ball,{x:p.x+15,y:p.y-46,vx:0,vy:230});advanceVolley(s,20);assert.equal(s.lastHit.side,0);assert.equal(s.lastHit.spike,spike);assert.ok(spike?s.ball.vx>=600:s.ball.vy<0);}
});
test('floor awards opponent a point, loser serves next, seven points ends the match',()=>{
  const s=newVolleyGame();s.phase='rally';Object.assign(s.ball,{x:100,y:434,vx:0,vy:200});advanceVolley(s,20);assert.deepEqual(s.scores,[0,1]);assert.equal(s.server,0);
  for(let n=0;n<6;n++)volleyPoint(s,1);assert.equal(s.ended,true);assert.equal(s.winner,'ai');assert.equal(volleyScore(s,'ai'),1000);volleyPoint(s,0);assert.deepEqual(s.scores,[0,7]);
});
test('time limit finishes ties and bounded fixed steps produce deterministic results',()=>{
  const a=newVolleyGame(),b=newVolleyGame();advanceVolley(a,8000);for(let t=10;t<=8000;t+=10)advanceVolley(b,t);assert.deepEqual(a,b);
  const tie=newVolleyGame();tie.elapsed=VOLLEY.duration-1;advanceVolley(tie,VOLLEY.duration);assert.equal(tie.ended,true);assert.equal(tie.winner,null);
});
