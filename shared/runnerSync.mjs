import {runAction,advanceRun,jumpHeight,RUN_DURATION} from './runner.mjs';

export function predictRunInput(state,notes,elapsed,action){
  const predicted=runAction(state,notes,elapsed,action);
  // Do not queue ignored jumps while airborne, or movement past a lane edge.
  return predicted.lane!==state.lane||predicted.jumpAt!==state.jumpAt?predicted:null;
}

// Server state stays authoritative. Only inputs it has not acknowledged are replayed.
export function reconcileRun(current, incoming, pending, notes) {
  const ack = incoming.inputSeq || 0;
  if (ack < (current.inputSeq || 0) ||
      (ack === (current.inputSeq || 0) && incoming.elapsed < current.elapsed)) return null;
  const remaining = pending.filter(input => input.seq > ack);
  let predicted = {...incoming};
  for (const input of remaining) {
    const elapsed=input.elapsed;
    // Local inputs already passed the cooldown. Network delay on the previous
    // acknowledged action must not suppress the next predicted animation.
    // Keep the original input time even when the snapshot is newer. Moving a
    // pending jump to snapshot.elapsed starts a fresh jump on every broadcast.
    predicted=runAction({...predicted,lastActionAt:Math.min(predicted.lastActionAt,elapsed-110)},notes,elapsed,input.action);
  }
  return {authoritative: incoming, predicted, pending: remaining};
}

export function acknowledgeJump(visual,previous,incoming){
  if(!visual||visual.serverAt!==undefined||(incoming.inputSeq||0)<visual.seq)return visual;
  return incoming.jumpAt>previous.jumpAt?{...visual,serverAt:incoming.jumpAt}:null;
}

export function visualJumpTime(visual,authoritative){
  return visual&&((authoritative.inputSeq||0)<visual.seq||visual.serverAt===authoritative.jumpAt)?visual.at:authoritative.jumpAt;
}

// Each runner samples the match clock independently, including while spectating
// after the local runner has died or settled their reward.
export function runnerPose(state,notes,elapsed,{finished=false,jumpAt=state.jumpAt}={}){
  const predicted=finished?state:advanceRun(state,notes,Math.min(elapsed,RUN_DURATION));
  return {state:predicted,jump:jumpHeight(elapsed,jumpAt),moving:!finished&&predicted.lives>0&&elapsed>3000&&elapsed<RUN_DURATION};
}

// A clock correction is eased and never makes the displayed track run backwards.
export function runTime(clock, now, duration) {
  const target = now - clock.start;
  clock.correction *= .9;
  clock.time = Math.max(clock.time, Math.min(duration, Math.max(0, target + clock.correction)));
  return clock.time;
}
