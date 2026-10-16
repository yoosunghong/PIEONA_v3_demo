import {BEACH_HALF,PLAYER_SPEED,CRAB_COUNTDOWN} from '../shared/crab.mjs';

export const CRAB_CAMERA_HALF=8.2;
const clamp=n=>Math.max(-BEACH_HALF,Math.min(BEACH_HALF,n));
function move(p,input,ms){
  const length=Math.max(1,Math.hypot(input.x,input.z)),dt=Math.max(0,ms)/1000;
  p.x=clamp(p.x+input.x/length*PLAYER_SPEED*dt);p.z=clamp(p.z+input.z/length*PLAYER_SPEED*dt);
  if(Math.hypot(input.x,input.z)>.01)p.angle=Math.atan2(input.x,input.z);
}
export function newCrabMotion(player,elapsed=0){return {x:player.x,z:player.z,angle:player.angle,elapsed,pending:[],offsetX:0,offsetZ:0,ack:player.inputSeq||0,snapshotAt:elapsed};}
export function predictCrabMotion(m,input,elapsed,dt){
  move(m,input,elapsed-Math.max(m.elapsed,CRAB_COUNTDOWN));m.elapsed=Math.max(m.elapsed,elapsed);
  const decay=Math.exp(-18*dt);m.offsetX*=decay;m.offsetZ*=decay;
  return {x:clamp(m.x+m.offsetX),z:clamp(m.z+m.offsetZ),angle:m.angle};
}
export function reconcileCrabMotion(m,player,elapsed){
  const ack=player.inputSeq||0;
  if(elapsed<m.snapshotAt||ack<m.ack)return false;
  const oldX=m.x+m.offsetX,oldZ=m.z+m.offsetZ,end=Math.max(m.elapsed,elapsed);
  m.pending=m.pending.filter(event=>event.seq>ack);
  const p={x:player.x,z:player.z,angle:player.angle};
  let cursor=elapsed,input=player.input||{x:0,z:0},inputAt=player.inputAt??elapsed;
  function advance(to){const until=Math.min(to,inputAt+400);move(p,input,until-Math.max(cursor,CRAB_COUNTDOWN));cursor=to;}
  if(player.alive){for(const event of m.pending){if(event.at>end)break;advance(Math.max(cursor,event.at));input=event.input;inputAt=cursor;}advance(end);}
  Object.assign(m,{x:p.x,z:p.z,angle:p.angle,elapsed:end,ack,snapshotAt:elapsed});
  // Reconciliation changes the simulated pose immediately; only the small visual
  // correction decays. Ordinary frame movement never waits for a network packet.
  const error=Math.hypot(oldX-p.x,oldZ-p.z);
  m.offsetX=player.alive&&error<3?oldX-p.x:0;m.offsetZ=player.alive&&error<3?oldZ-p.z:0;
  return true;
}
export function crabClientTime(clock,now){clock.time=Math.max(clock.time,now-clock.start);return clock.time;}
export function syncCrabClock(clock,elapsed,sent,now){const candidate=now-elapsed-(now-sent)/2;clock.start+=Math.max(-3,Math.min(3,(candidate-clock.start)*.15));}
export function crabCameraSize(aspect){return {halfWidth:CRAB_CAMERA_HALF*Math.max(1,aspect),halfHeight:CRAB_CAMERA_HALF*Math.max(1,1/aspect)};}
