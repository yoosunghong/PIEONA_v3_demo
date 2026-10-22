export const VOLLEY = Object.freeze({width:960,height:540,floor:452,net:480,netTop:278,ballRadius:17,playerRadius:32,gravity:1050,speed:295,jump:610,winningScore:7,duration:180000,step:1000/120});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function newVolleyGame(ids=['player','ai']){
  return {elapsed:0,phase:'serve',serveAt:3000,server:0,scores:[0,0],winner:null,ended:false,point:null,touches:0,hit:0,
    players:ids.map((id,i)=>({id,ai:id==='ai',x:i?720:240,y:VOLLEY.floor-32,vx:0,vy:0,input:{move:0,jump:false,spike:false},inputAt:0,seq:0,jumpHeld:false,spikeUntil:0,cooldown:0,aiAt:0})),ball:{x:240,y:200,vx:0,vy:0}};
}
export function volleyInput(s,id,input){
  const p=s.players.find(p=>p.id===id);if(!p||p.ai||s.ended||input.seq<=p.seq)return false;
  p.input={move:input.move,jump:input.jump,spike:input.spike};p.seq=input.seq;p.inputAt=s.elapsed;return true;
}
export function volleyPoint(s,side){
  if(s.ended)return;s.scores[side]++;s.point=side;
  if(s.scores[side]>=VOLLEY.winningScore){s.ended=true;s.phase='ended';s.winner=s.players[side].id;return;}
  s.phase='serve';s.server=1-side;s.serveAt=s.elapsed+1400;s.touches=0;
  s.players.forEach((p,i)=>{p.x=i?720:240;p.y=VOLLEY.floor-32;p.vx=0;p.vy=0;});
  Object.assign(s.ball,{x:s.server?720:240,y:200,vx:0,vy:0});
}
function aiInput(s,p){
  if(s.elapsed<p.aiAt)return;p.aiAt=s.elapsed+150;
  const b=s.ball;
  const time=clamp((-b.vy+Math.sqrt(b.vy*b.vy+2*VOLLEY.gravity*Math.max(0,350-b.y)))/VOLLEY.gravity,0,.9);
  // A delayed, imperfect landing estimate leaves short balls and spikes beatable.
  const target=b.x>445?clamp(b.x+b.vx*time+Math.sin(s.elapsed/430)*22,530,910):715;
  p.input={move:Math.abs(target-p.x)>18?Math.sign(target-p.x):0,jump:b.x>490&&Math.abs(b.x-p.x)<110&&b.y>195&&b.y<345&&b.vy>-220,spike:b.y<340&&Math.abs(b.x-p.x)<100};
}
function step(s,dt){
  const c=VOLLEY,b=s.ball;
  for(let i=0;i<2;i++){
    const p=s.players[i];if(p.ai)aiInput(s,p);else if(s.elapsed-p.inputAt>450)p.input={move:0,jump:false,spike:false};
    p.vx=p.input.move*c.speed;
    if(p.input.jump&&!p.jumpHeld&&p.y>=c.floor-c.playerRadius-.1)p.vy=-c.jump;
    p.jumpHeld=p.input.jump;
    if(p.input.spike&&s.elapsed>p.cooldown){p.spikeUntil=s.elapsed+200;p.cooldown=s.elapsed+480;}
    p.x=clamp(p.x+p.vx*dt,i?c.net+42:32,i?c.width-32:c.net-42);
    p.vy+=c.gravity*dt;p.y=Math.min(c.floor-32,p.y+p.vy*dt);if(p.y>=c.floor-32)p.vy=0;
  }
  if(s.phase==='serve'){
    if(s.elapsed<s.serveAt)return;
    s.phase='rally';s.point=null;Object.assign(b,{x:s.server?720:240,y:185,vx:s.server?-340:340,vy:-350});
  }
  const oldX=b.x,oldY=b.y;b.vy+=c.gravity*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;
  if(b.x<c.ballRadius||b.x>c.width-c.ballRadius){b.x=clamp(b.x,c.ballRadius,c.width-c.ballRadius);b.vx=-b.vx;}
  if(b.y<c.ballRadius){b.y=c.ballRadius;b.vy=Math.abs(b.vy);}
  if(Math.abs(b.x-c.net)<c.ballRadius+6&&b.y+c.ballRadius>c.netTop){
    if(oldY+c.ballRadius<=c.netTop&&b.vy>0){b.y=c.netTop-c.ballRadius;b.vy=-Math.abs(b.vy)*.7;b.vx+=(b.x<c.net?-25:25);}
    else {const side=oldX<c.net?-1:1;b.x=c.net+side*(c.ballRadius+6);b.vx=side*Math.max(90,Math.abs(b.vx)*.8);}
  }
  for(let i=0;i<2;i++){
    const p=s.players[i],dx=b.x-p.x,dy=b.y-p.y,d=Math.hypot(dx,dy),r=c.ballRadius+c.playerRadius;
    if(d>=r)continue;
    const nx=d>0?dx/d:0,ny=d>0?dy/d:-1;
    b.x=p.x+nx*(r+.5);b.y=p.y+ny*(r+.5);
    if((b.vx-p.vx)*nx+(b.vy-p.vy)*ny>=0)continue;
    const direction=i?-1:1,spike=p.spikeUntil>=s.elapsed&&p.y<c.floor-45;
    b.vx=spike?direction*650:clamp(direction*255+dx*4+p.vx*.4,-490,490);
    b.vy=spike?(b.y<c.netTop-30?160:-230):-650;
    s.touches++;s.hit++;s.lastHit={side:i,spike,at:s.elapsed};
  }
  if(b.y+c.ballRadius>=c.floor)volleyPoint(s,b.x<c.net?1:0);
}
export function advanceVolley(s,elapsed){
  const end=Math.min(Math.max(s.elapsed,elapsed),VOLLEY.duration);
  while(!s.ended&&s.elapsed+VOLLEY.step<=end+1e-6){s.elapsed+=VOLLEY.step;step(s,VOLLEY.step/1000);}
  if(!s.ended&&elapsed>=VOLLEY.duration){s.ended=true;s.phase='ended';s.winner=s.scores[0]===s.scores[1]?null:s.players[s.scores[0]>s.scores[1]?0:1].id;}
  return s;
}
export const volleySnapshot=s=>structuredClone(s);
export const volleyScore=(s,id)=>{const side=s.players.findIndex(p=>p.id===id);return side<0?0:s.scores[side]*100+(s.winner===id?300:0);};
