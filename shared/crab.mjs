// Shared, deterministic beach simulation. Coordinates and collisions are in meters.
export const CRAB_STEP=1000/30, CRAB_COUNTDOWN=3000, BEACH_HALF=19;
export const PLAYER_SPEED=5.8, CRAB_RADIUS=.42, PLAYER_RADIUS=.38;
export const CHAIN_POINTS_PER_SECOND=2;
export const crabSeconds=s=>Math.max(0,(s.elapsed-CRAB_COUNTDOWN)/1000);
export const crabBaseScore=p=>Math.floor(Math.max(0,(p.survived-CRAB_COUNTDOWN))/100+1e-7);
export const crabChainBonus=p=>Math.floor((p.chainBonus||0)+1e-7);
export const crabScore=p=>crabBaseScore(p)+crabChainBonus(p);
export const crabScoreRate=p=>10+Math.max(0,p.chain.length-2)*CHAIN_POINTS_PER_SECOND;
const clamp=n=>Math.max(-BEACH_HALF,Math.min(BEACH_HALF,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function random(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;}
function spawn(s,initial=false){
  let x,z;
  for(let i=0;i<40;i++){
    x=(random(s)*2-1)*(BEACH_HALF-1);z=(random(s)*2-1)*(BEACH_HALF-1);
    if(s.players.every(p=>distance(p,{x,z})>(initial?7:9)))break;
  }
  const n=s.nextId++,dynamic=crabSeconds(s)>25&&random(s)<.7;
  s.crabs.push({id:n,x,z,cx:x,cz:z,phase:random(s)*Math.PI*2,rx:1+random(s)*2,rz:1+random(s)*2,rate:(dynamic?.9:.38)+random(s)*.3,dynamic,mode:'patrol',owner:null,angle:0});
}
export function newCrabGame(players,seed=12345){
  const s={elapsed:0,seed:seed>>>0,nextId:0,nextSpawn:CRAB_COUNTDOWN+6500,players:[],crabs:[],ended:false,winner:null};
  s.players=players.map((id,i)=>({id,x:players.length===1?0:(i?4:-4),z:0,angle:0,alive:true,survived:0,chainBonus:0,input:{x:0,z:0},inputAt:-1000,inputSeq:0,trail:[],chain:[]}));
  for(const p of s.players){
    for(let i=0;i<640;i++)p.trail.push({x:p.x,z:clamp(p.z+i*PLAYER_SPEED*CRAB_STEP/1000)});
    for(let i=0;i<2;i++){const id=s.nextId++;p.chain.push(id);s.crabs.push({id,x:p.x,z:4.5+i*1.4,angle:0,mode:'chain',owner:p.id});}
  }
  for(let i=0;i<12;i++)spawn(s,true);
  return s;
}
export function crabInput(s,id,input){
  const p=s.players.find(p=>p.id===id);
  if(!p||!p.alive||s.ended||input.seq<=p.inputSeq)return;
  const n=Math.max(1,Math.hypot(input.x,input.z));
  p.input={x:input.x/n,z:input.z/n};p.inputAt=s.elapsed;p.inputSeq=input.seq;
}
function toward(o,target,speed,dt){
  const d=distance(o,target);if(d<.001)return;
  const step=Math.min(d,speed*dt);o.angle=Math.atan2(target.x-o.x,target.z-o.z);o.x+=(target.x-o.x)/d*step;o.z+=(target.z-o.z)/d*step;
}
export function chainTarget(p,index){
  // Fixed-time samples preserve turns and keep moving toward an idle player.
  return p.trail[Math.min(p.trail.length-1,Math.round((650+index*240)/CRAB_STEP))]||p;
}
export function stepCrab(s,dt=CRAB_STEP){
  if(s.ended)return s;
  s.elapsed+=dt;
  if(s.elapsed<CRAB_COUNTDOWN)return s;
  const seconds=crabSeconds(s),delta=dt/1000,speed=3.8+Math.min(1.3,seconds*.007);
  for(const p of s.players){
    if(!p.alive)continue;
    const scoringMs=Math.max(0,s.elapsed-Math.max(CRAB_COUNTDOWN,p.survived));
    p.chainBonus=(p.chainBonus||0)+Math.max(0,p.chain.length-2)*CHAIN_POINTS_PER_SECOND*scoringMs/1000;
    const input=s.elapsed-p.inputAt<400?p.input:{x:0,z:0};
    p.x=clamp(p.x+input.x*PLAYER_SPEED*delta);p.z=clamp(p.z+input.z*PLAYER_SPEED*delta);
    if(Math.hypot(input.x,input.z)>.01)p.angle=Math.atan2(input.x,input.z);
    p.trail.unshift({x:p.x,z:p.z});p.trail.length=Math.min(p.trail.length,640);
    p.survived=s.elapsed;
  }
  while(s.elapsed>=s.nextSpawn&&s.crabs.length<100){spawn(s);s.nextSpawn+=Math.max(1600,6500-seconds*32);}
  for(const c of s.crabs){
    if(c.mode==='patrol'){
      const a=c.phase+seconds*c.rate,goal={x:clamp(c.cx+Math.cos(a)*c.rx),z:clamp(c.cz+Math.sin(a)*c.rz)};
      toward(c,goal,c.dynamic?3.2:1.8,delta);
      const closest=s.players.filter(p=>p.alive).sort((a,b)=>distance(c,a)-distance(c,b))[0];
      if(closest&&distance(c,closest)<4.8){c.mode='chase';c.owner=closest.id;}
    }else{
      const p=s.players.find(p=>p.id===c.owner);if(!p)continue;
      if(c.mode==='chase'){
        const tail=s.crabs.find(v=>v.id===p.chain.at(-1))||p;
        toward(c,tail,speed+.7,delta);
        if(distance(c,tail)<1.5&&p.chain.length<52){c.mode='chain';p.chain.push(c.id);}
      }else{
        const target=chainTarget(p,p.chain.indexOf(c.id));
        toward(c,target,speed+(distance(c,target)>3?.5:0),delta);
      }
    }
  }
  // Resolve everyone against the same tick so simultaneous contacts produce a draw.
  for(const p of s.players)if(p.alive&&s.crabs.some(c=>distance(c,p)<CRAB_RADIUS+PLAYER_RADIUS)){p.alive=false;p.input={x:0,z:0};}
  const alive=s.players.filter(p=>p.alive);
  if((s.players.length===1&&!alive.length)||(s.players.length>1&&alive.length<=1)){
    s.ended=true;s.winner=s.players.length>1&&alive.length===1?alive[0].id:null;
  }
  return s;
}
export function advanceCrab(s,elapsed){while(!s.ended&&s.elapsed+CRAB_STEP<=elapsed)stepCrab(s);return s;}
export function crabSnapshot(s){return {elapsed:s.elapsed,ended:s.ended,winner:s.winner,players:s.players.map(({trail,...p})=>({...p,input:{...p.input},score:crabScore(p),baseScore:crabBaseScore(p),bonus:crabChainBonus(p),scoreRate:crabScoreRate(p)})),crabs:s.crabs.map(c=>({id:c.id,x:c.x,z:c.z,angle:c.angle,mode:c.mode,owner:c.owner,dynamic:c.dynamic}))};}
