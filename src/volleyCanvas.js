import {VOLLEY} from '../shared/volleyball.mjs';
const ellipse=(c,x,y,rx,ry,color)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();};
function cloud(c,x,y,scale=1){c.save();c.translate(x,y);c.scale(scale,scale);ellipse(c,0,0,65,17,'#ffffffa6');ellipse(c,-24,-12,28,23,'#ffffffa6');ellipse(c,16,-20,32,31,'#ffffffa6');c.restore();}
export function drawVolleyCourt(c){
  c.clearRect(0,0,960,540);
  const sky=c.createLinearGradient(0,0,0,450);sky.addColorStop(0,'#a5dcf3');sky.addColorStop(1,'#ecfaf3');c.fillStyle=sky;c.fillRect(0,0,960,540);
  ellipse(c,814,92,52,52,'#fff8cf');ellipse(c,814,92,67,67,'#fff8cf33');
  cloud(c,130,94,.9);cloud(c,420,65,.65);cloud(c,672,155,.65);
  c.fillStyle='#83c7bc';c.beginPath();c.moveTo(0,330);c.quadraticCurveTo(125,200,250,330);c.quadraticCurveTo(395,190,550,330);c.quadraticCurveTo(780,220,960,330);c.lineTo(960,400);c.lineTo(0,400);c.fill();
  c.fillStyle='#73c9d1';c.fillRect(0,330,960,80);c.strokeStyle='#ffffff7a';c.lineWidth=3;
  for(let i=0;i<3;i++){c.beginPath();c.moveTo(0,347+i*21);for(let x=0;x<=960;x+=20)c.lineTo(x,347+i*21+Math.sin(x/43+i*2)*3);c.stroke();}
  c.fillStyle='#f5dfb3';c.fillRect(0,404,960,136);c.fillStyle='#fff0cf';c.fillRect(0,404,960,48);
  c.fillStyle='#d1ad7540';for(let i=0;i<54;i++)ellipse(c,(i*137)%960,466+(i*19)%68,2,1,'#d1ad7540');
  c.strokeStyle='#ffffffc9';c.lineWidth=3;c.strokeRect(30,451,900,62);c.beginPath();c.moveTo(480,452);c.lineTo(480,513);c.stroke();
  // The net is drawn behind the players and the ball.
  c.fillStyle='#ffffff36';c.fillRect(474,278,12,174);c.strokeStyle='#6a8392';c.lineWidth=3;
  for(let y=285;y<452;y+=13){c.beginPath();c.moveTo(474,y);c.lineTo(486,y);c.stroke();}
  c.fillStyle='#f9fcff';c.fillRect(471,275,18,7);c.fillStyle='#5c7792';c.fillRect(477,282,6,174);ellipse(c,480,456,13,4,'#bf9e6f');
}
export function drawVolley(c,s,{names=['나','몽글 AI'],ownId,backdrop}={}){
  if(backdrop)c.drawImage(backdrop,0,0);else drawVolleyCourt(c);
  for(let i=0;i<2;i++){
    const p=s.players[i],color=i?'#b6a0ed':'#f6cf7f',dark=i?'#7560ad':'#b27c3e',air=VOLLEY.floor-32-p.y;
    ellipse(c,p.x,456,Math.max(14,36-air*.05),6,'#977c6433');
    c.save();c.translate(p.x,p.y);c.rotate(p.vx/7000);
    ellipse(c,-21,23,15,9,dark);ellipse(c,21,23,15,9,dark);
    ellipse(c,0,-1,32,31,color);ellipse(c,0,8,24,19,i?'#e9e0fc':'#fff1d1');
    ellipse(c,-30,4,10,14,color);ellipse(c,30,p.spikeUntil>s.elapsed?-25:4,10,14,color);
    c.save();c.rotate(-.45);ellipse(c,-3,-35,8,18,'#68b99b');c.restore();c.save();c.rotate(.55);ellipse(c,5,-34,8,15,'#8bc99c');c.restore();
    ellipse(c,-11,-5,3.5,5,'#3f455b');ellipse(c,11,-5,3.5,5,'#3f455b');ellipse(c,-19,5,6,3,'#e995936e');ellipse(c,19,5,6,3,'#e995936e');
    c.strokeStyle='#5d5260';c.lineWidth=2;c.beginPath();c.arc(0,3,5,0,Math.PI);c.stroke();
    if(p.spikeUntil>s.elapsed){c.strokeStyle='#fff9d5';c.lineWidth=3;c.beginPath();c.arc(0,0,43,-2.8,-.3);c.stroke();}
    c.restore();c.font='700 15px system-ui';c.textAlign='center';c.fillStyle=i?'#615380':'#725d3e';c.fillText((names[i]||'친구').slice(0,14)+(p.id===ownId?' · 나':''),p.x,Math.max(55,p.y-66));
  }
  const b=s.ball;ellipse(c,b.x,456,Math.max(7,20-(452-b.y)*.02),4,'#977c642a');
  if(s.lastHit?.spike&&s.elapsed-s.lastHit.at<450){c.strokeStyle='#ffac6877';c.lineWidth=12;c.lineCap='round';c.beginPath();c.moveTo(b.x-b.vx*.07,b.y-b.vy*.07);c.lineTo(b.x,b.y);c.stroke();}
  c.save();c.translate(b.x,b.y);c.rotate(s.elapsed/220);ellipse(c,0,0,17,17,'#fffdf3');c.save();c.beginPath();c.arc(0,0,17,0,Math.PI*2);c.clip();c.fillStyle='#efad6e';c.fillRect(-18,-18,18,18);c.fillRect(0,0,18,18);c.strokeStyle='#6b829c';c.lineWidth=1.5;c.beginPath();c.arc(0,0,16,0,Math.PI*2);c.stroke();c.restore();c.restore();
  if(!s.ended&&s.phase==='serve'){
    const seconds=Math.ceil((s.serveAt-s.elapsed)/1000);c.textAlign='center';c.fillStyle='#ffffffdf';c.beginPath();c.roundRect(326,106,308,94,22);c.fill();c.fillStyle='#314c70';c.font='800 27px system-ui';c.fillText(s.point===null?'준비, 몽글!':`${names[s.point]||'친구'} 득점!`,480,144);c.font='600 17px system-ui';c.fillText(`${Math.max(1,seconds)}초 후 서브`,480,177);
  }
}
