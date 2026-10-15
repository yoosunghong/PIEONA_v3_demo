export const RUN_COUNTDOWN=3000;
export const RUN_DISTANCE=5000;
export const RUN_START_SPEED=11;
export const RUN_MAX_SPEED=50;
export const RUN_SPEED_INTERVAL=2000;
export const RUN_SPEED_STEP=5;
export const SEED_POINTS=50;
const speedStages=Array.from({length:Math.ceil((RUN_MAX_SPEED-RUN_START_SPEED)/RUN_SPEED_STEP)+1},(_,i)=>({
  seconds:i*RUN_SPEED_INTERVAL/1000,
  distance:(i*RUN_START_SPEED+RUN_SPEED_STEP*i*(i-1)/2)*RUN_SPEED_INTERVAL/1000,
  speed:Math.min(RUN_MAX_SPEED,RUN_START_SPEED+i*RUN_SPEED_STEP)
}));
export function runTimeAtDistance(distance){
  const d=Math.max(0,Math.min(RUN_DISTANCE,distance));
  const stage=speedStages.findLast(stage=>stage.distance<=d);
  return RUN_COUNTDOWN+1000*(stage.seconds+(d-stage.distance)/stage.speed);
}
export const RUN_DURATION=runTimeAtDistance(RUN_DISTANCE);
export const RUN_EXPIRY=RUN_DURATION+60000;
const runningSeconds=elapsed=>Math.max(0,Math.min(RUN_DURATION,elapsed)-RUN_COUNTDOWN)/1000;
const speedStage=seconds=>speedStages[Math.min(speedStages.length-1,Math.floor(seconds*1000/RUN_SPEED_INTERVAL))];
export function runSpeed(elapsed){return speedStage(runningSeconds(elapsed)).speed;}
export function runDistance(elapsed){const t=runningSeconds(elapsed),stage=speedStage(t);return Math.min(RUN_DISTANCE,stage.distance+(t-stage.seconds)*stage.speed);}
export function createRunnerNotes(randomLane){
  const notes=[];
  for(let distance=40,i=0;distance<RUN_DISTANCE-20;distance+=36,i++){
    notes.push({kind:'obstacle',time:runTimeAtDistance(distance),lane:i%4===0?-1:randomLane(),height:i%4===0?.9:1.15});
    const lane=randomLane();
    for(const offset of [13,19])notes.push({kind:'seed',time:runTimeAtDistance(distance+offset),lane});
  }
  return notes.sort((a,b)=>a.time-b.time);
}
export const JUMP_MS=500;
export function jumpHeight(elapsed,jumpAt){const t=(elapsed-jumpAt)/JUMP_MS;return t>0&&t<1?4*t*(1-t)*1.6:0;}
export function newRun(){return {lane:1,jumpAt:-JUMP_MS,lastActionAt:-200,elapsed:0,resolved:0,dodged:0,collectedSeeds:0,lives:3};}
export function advanceRun(state,obstacles,elapsed){
  const s={...state};const end=Math.min(RUN_DURATION,Math.max(s.elapsed,elapsed));
  while(s.resolved<obstacles.length&&obstacles[s.resolved].time<=end&&s.lives>0){
    const o=obstacles[s.resolved++];
    if(o.kind==='seed'){
      if(o.lane===s.lane)s.collectedSeeds=(s.collectedSeeds||0)+1;
      continue;
    }
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
export function runScore(s){return Math.floor(Math.max(0,s.elapsed-RUN_COUNTDOWN)/100)+s.dodged*100+(s.collectedSeeds||0)*SEED_POINTS;}
