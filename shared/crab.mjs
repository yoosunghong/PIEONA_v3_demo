// Shared, deterministic beach simulation. Coordinates and collisions are in meters.
export const CRAB_STEP=1000/30, CRAB_COUNTDOWN=3000, BEACH_HALF=19;
export const PLAYER_SPEED=5.8, CRAB_RADIUS=.42, PLAYER_RADIUS=.38;
export const CHAIN_POINTS_PER_SECOND=2;
export const CRAB_LIVES=3, CRAB_INVULNERABLE_MS=1500, CRAB_ZIGZAG_MS=7000;
export const CRAB_ITEM_TYPES=['steal','launch','zigzag'];
// A new patrol every 2.8s at first, accelerating smoothly to one every .7s.
export const crabSpawnInterval=seconds=>Math.max(700,2800*Math.exp(-Math.max(0,seconds)/42));
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
  const s={elapsed:0,seed:seed>>>0,nextId:0,nextSpawn:CRAB_COUNTDOWN+crabSpawnInterval(0),nextItem:CRAB_COUNTDOWN+7000,items:[],nextItemId:0,zigzagUntil:0,players:[],crabs:[],ended:false,winner:null};
  s.players=players.map((id,i)=>({id,x:players.length===1?0:(i?4:-4),z:0,angle:0,alive:true,lives:CRAB_LIVES,invulnerableUntil:0,lastItem:null,survived:0,chainBonus:0,input:{x:0,z:0},inputAt:-1000,inputSeq:0,trail:[],chain:[]}));
  for(const p of s.players){
    for(let i=0;i<640;i++)p.trail.push({x:p.x,z:clamp(p.z+i*PLAYER_SPEED*CRAB_STEP/1000)});
    for(let i=0;i<2;i++){const id=s.nextId++;p.chain.push(id);s.crabs.push({id,x:p.x,z:4.5+i*1.4,angle:0,mode:'chain',owner:p.id});}
  }
  for(let i=0;i<12;i++)spawn(s,true);
  for(const [i,type] of CRAB_ITEM_TYPES.entries())s.items.push({id:s.nextItemId++,type,x:(i-1)*6,z:-5,expires:CRAB_COUNTDOWN+22000});
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
function useItem(s,p,item){
  const opponent=s.players.find(v=>v.id!==p.id&&v.alive);
  let applied=false;
  if(item.type==='steal'&&p.chain.length<52){
    const crab=opponent?s.crabs.find(c=>c.id===opponent.chain.at(-1)):s.crabs.find(c=>c.mode==='patrol');
    if(crab){
      if(opponent)opponent.chain.pop();
      const tail=s.crabs.find(c=>c.id===p.chain.at(-1));
      const dx=tail?tail.x-p.x:0,dz=tail?tail.z-p.z:1,n=Math.hypot(dx,dz)||1;
      crab.x=clamp((tail?.x??p.x)+dx/n*1.4);crab.z=clamp((tail?.z??p.z)+dz/n*1.4);
      crab.owner=p.id;crab.mode='chain';p.chain.push(crab.id);applied=true;
    }
  }else if(item.type==='launch'){
    const crab=s.crabs.find(c=>c.id===p.chain.at(-1));
    if(crab){
      p.chain.pop();const target=opponent;
      const dx=target?target.x-p.x:Math.sin(p.angle),dz=target?target.z-p.z:Math.cos(p.angle),n=Math.hypot(dx,dz)||1;
      Object.assign(crab,{mode:'projectile',owner:p.id,target:opponent?.id||p.id,vx:dx/n*17,vz:dz/n*17,until:s.elapsed+2400,x:p.x,z:p.z,angle:Math.atan2(dx,dz)});applied=true;
    }
  }else if(item.type==='zigzag'){s.zigzagUntil=s.elapsed+CRAB_ZIGZAG_MS;applied=true;}
  p.lastItem={type:item.type,at:s.elapsed,applied};
}
function hit(s,p){
  if(!p.alive||s.elapsed<p.invulnerableUntil)return;
  p.lives=Math.max(0,p.lives-1);p.invulnerableUntil=s.elapsed+CRAB_INVULNERABLE_MS;
  if(!p.lives){p.alive=false;p.input={x:0,z:0};}
}
function segmentDistance(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);}
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
  while(s.elapsed>=s.nextSpawn&&s.crabs.length<100){spawn(s);s.nextSpawn+=crabSpawnInterval(crabSeconds({elapsed:s.nextSpawn}));}
  s.items=s.items.filter(item=>item.expires>s.elapsed);
  if(s.elapsed>=s.nextItem){
    if(s.items.length<5)s.items.push({id:s.nextItemId++,type:CRAB_ITEM_TYPES[Math.floor(random(s)*3)],x:(random(s)*2-1)*15,z:(random(s)*2-1)*15,expires:s.elapsed+22000});
    s.nextItem=s.elapsed+7000;
  }
  for(const item of [...s.items]){
    const picker=s.players.find(p=>p.alive&&distance(p,item)<1.15);
    if(picker){useItem(s,picker,item);s.items=s.items.filter(v=>v.id!==item.id);}
  }
  const swept=new Set();
  for(const c of s.crabs){
    if(c.mode==='projectile'){
      swept.add(c.id);
      const from={x:c.x,z:c.z};c.x=clamp(c.x+c.vx*delta);c.z=clamp(c.z+c.vz*delta);
      const victim=s.players.find(p=>p.alive&&p.id!==c.owner&&segmentDistance(p,from,c)<CRAB_RADIUS+PLAYER_RADIUS);
      if(victim)hit(s,victim);
      if(victim||s.elapsed>=c.until||Math.abs(c.x)>=BEACH_HALF||Math.abs(c.z)>=BEACH_HALF){c.mode='chase';c.owner=c.target;delete c.vx;delete c.vz;delete c.until;delete c.target;}
    }else if(c.mode==='patrol'){
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
        const index=p.chain.indexOf(c.id),base=chainTarget(p,index);
        const next=index===0?p:chainTarget(p,index-1);
        let dx=next.x-base.x,dz=next.z-base.z;
        if(Math.hypot(dx,dz)<.001){dx=Math.sin(p.angle);dz=Math.cos(p.angle);}
        const n=Math.hypot(dx,dz)||1;
        const offset=s.elapsed<s.zigzagUntil?Math.sin(seconds*5-index*1.15)*1.55:0;
        const target={x:clamp(base.x+dz/n*offset),z:clamp(base.z-dx/n*offset)};
        toward(c,target,speed+(distance(c,target)>3?.5:0),delta);
      }
    }
  }
  // Resolve everyone against the same tick so simultaneous contacts produce a draw.
  for(const p of s.players)if(s.crabs.some(c=>!swept.has(c.id)&&distance(c,p)<CRAB_RADIUS+PLAYER_RADIUS))hit(s,p);
  const alive=s.players.filter(p=>p.alive);
  if((s.players.length===1&&!alive.length)||(s.players.length>1&&alive.length<=1)){
    s.ended=true;s.winner=s.players.length>1&&alive.length===1?alive[0].id:null;
  }
  return s;
}
export function advanceCrab(s,elapsed){while(!s.ended&&s.elapsed+CRAB_STEP<=elapsed)stepCrab(s);return s;}
export function crabSnapshot(s){return {elapsed:s.elapsed,ended:s.ended,winner:s.winner,zigzagUntil:s.zigzagUntil,items:s.items.map(item=>({...item})),players:s.players.map(({trail,...p})=>({...p,chain:[...p.chain],lastItem:p.lastItem?{...p.lastItem}:null,input:{...p.input},score:crabScore(p),baseScore:crabBaseScore(p),bonus:crabChainBonus(p),scoreRate:crabScoreRate(p)})),crabs:s.crabs.map(c=>({id:c.id,x:c.x,z:c.z,angle:c.angle,mode:c.mode,owner:c.owner,dynamic:c.dynamic}))};}
