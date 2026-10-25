// Preserve movement made while a request was in flight; only apply the server's correction.
export function reconcileExplorationPosition(local,requested,confirmed){
 return {x:local.x+confirmed.x-requested.x,z:local.z+confirmed.z-requested.z};
}

// Stay inside the server's maximum movement allowance while waiting for an acknowledgement.
export function withinExplorationPrediction(position,confirmed){
 return Math.hypot(position.x-confirmed.x,position.z-confirmed.z)<=3;
}
