import {advanceVolley,volleyInput} from './volleyball.mjs';

// Keep a running simulation between packets. Replaying unacknowledged inputs
// preserves short taps and releases when an older server snapshot arrives.
const MAX_PREDICTION=250;
export function newVolleyClient(game,ownId,now){
  return {ownId,snapshot:game.snapshot,predicted:structuredClone(game.snapshot),pending:[],
    origin:now-(game.serverTime-game.started),time:game.snapshot.elapsed,received:now,display:null,drawAt:now};
}
export function volleyClientTime(client,now){
  client.time=Math.max(client.time,Math.min(client.snapshot.elapsed+MAX_PREDICTION,Math.max(0,now-client.origin)));
  return client.time;
}
export function predictVolleyInput(client,input,now){
  const at=volleyClientTime(client,now);
  advanceVolley(client.predicted,at);
  volleyInput(client.predicted,client.ownId,input);
  client.pending.push({at,input:{...input}});
}
export function reconcileVolley(client,snapshot,now){
  const ack=snapshot.players.find(p=>p.id===client.ownId)?.seq||0;
  const previousAck=client.snapshot.players.find(p=>p.id===client.ownId)?.seq||0;
  if(snapshot.elapsed<client.snapshot.elapsed||ack<previousAck)return false;
  client.snapshot=snapshot;client.received=now;
  client.pending=snapshot.ended?[]:client.pending.filter(p=>p.input.seq>ack);
  const predicted=structuredClone(snapshot);
  for(const p of client.pending){advanceVolley(predicted,Math.max(snapshot.elapsed,p.at));volleyInput(predicted,client.ownId,p.input);}
  advanceVolley(predicted,volleyClientTime(client,now));client.predicted=predicted;
  return true;
}
export function syncVolleyClock(client,elapsed,sent,received){
  const rtt=received-sent;
  if(!Number.isFinite(rtt)||rtt<0||!Number.isFinite(elapsed))return;
  // A congested round trip is a poor clock sample. Do not let a transient
  // latency spike shift the simulation clock for subsequent healthy packets.
  const reference=client.rtt??rtt;client.rtt=Math.min(rtt,reference*.98+rtt*.02);
  if(rtt>Math.max(120,reference*1.8))return;
  const origin=received-elapsed-rtt/2;
  client.origin+=(origin-client.origin)*.2;
}
export function volleyFrame(client,now){
  const state=advanceVolley(client.predicted,volleyClientTime(client,now)),previous=client.display;
  const reset=!previous||state.ended||state.scores.some((score,i)=>score!==previous.scores[i]);
  const dt=Math.max(0,Math.min(50,now-client.drawAt));client.drawAt=now;
  const blend=1-Math.exp(-dt/35),ballBlend=1-Math.exp(-dt/25);
  const position=(next,old,weight)=>reset?{...next}:{...next,x:old.x+(next.x-old.x)*weight,y:old.y+(next.y-old.y)*weight};
  client.display={...state,players:state.players.map((p,i)=>position(p,previous?.players[i],blend)),ball:position(state.ball,previous?.ball,ballBlend)};
  return client.display;
}
