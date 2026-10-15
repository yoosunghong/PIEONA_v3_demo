export const RUN_DURATION=45000;
export const JUMP_MS=950;
export function jumpHeight(elapsed,jumpAt){const t=(elapsed-jumpAt)/JUMP_MS;return t>0&&t<1?Math.sin(t*Math.PI)*2.25:0;}
export function newRun(){return {lane:1,jumpAt:-JUMP_MS,lastActionAt:-200,elapsed:0,resolved:0,dodged:0,lives:3};}
export function advanceRun(state,obstacles,elapsed){
  const s={...state};const end=Math.min(RUN_DURATION,Math.max(s.elapsed,elapsed));
  while(s.resolved<obstacles.length&&obstacles[s.resolved].time<=end&&s.lives>0){
    const o=obstacles[s.resolved++];
    if((o.lane===-1||o.lane===s.lane)&&jumpHeight(o.time,s.jumpAt)<o.height){s.lives--;s.lastCollision=o.time;}
    else s.dodged++;
    if(s.lives===0){s.elapsed=o.time;return s;}
  }
  if(s.lives>0)s.elapsed=end;
  return s;
}
export function runAction(state,obstacles,elapsed,action){
  const s=advanceRun(state,obstacles,elapsed);
  if(!s.lives||s.elapsed>=RUN_DURATION||elapsed-s.lastActionAt<110)return s;
  if(action==='left')s.lane=Math.max(0,s.lane-1);
  if(action==='right')s.lane=Math.min(2,s.lane+1);
  if(action==='jump'&&elapsed-s.jumpAt>=JUMP_MS)s.jumpAt=elapsed;
  s.lastActionAt=elapsed;return s;
}
export function runScore(s){return Math.floor(Math.max(0,s.elapsed-3000)/100)+s.dodged*100;}
