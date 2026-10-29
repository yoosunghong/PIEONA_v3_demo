import {photoPalettes,photoDate} from './captureModel.mjs';

function leaf(ctx,x,y,angle,size){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);
  const shade=ctx.createLinearGradient(0,-size,0,size);shade.addColorStop(0,'#b5c785');shade.addColorStop(.5,'#7f9c53');shade.addColorStop(1,'#506f39');
  ctx.fillStyle=shade;ctx.strokeStyle='#5c7740';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(-size,-size,-size*.5,-size*1.7,0,-size*2);ctx.bezierCurveTo(size*.8,-size*1.5,size,-size*.5,0,0);ctx.fill();ctx.stroke();
  ctx.strokeStyle='#c8d99a';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-size*1.7);ctx.stroke();ctx.restore();
}
function sprig(ctx,x,y,angle){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.strokeStyle='#6b8050';ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(0,72);ctx.quadraticCurveTo(-14,-4,7,-104);ctx.stroke();
  for(let i=0;i<6;i++)leaf(ctx,i%2?1:-5,45-i*25,i%2?.85:-.85,14+i%3*3);
  ctx.restore();
}
function flower(ctx,x,y,size){
  ctx.save();ctx.translate(x,y);ctx.fillStyle='#f7d6e1';ctx.strokeStyle='#deb1c4';ctx.lineWidth=1;
  for(let i=0;i<5;i++){ctx.rotate(Math.PI*2/5);ctx.beginPath();ctx.ellipse(0,-size*.6,size*.43,size*.65,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
  ctx.fillStyle='#e6b867';ctx.beginPath();ctx.arc(0,0,size*.23,0,Math.PI*2);ctx.fill();ctx.restore();
}
function star(ctx,x,y,size){
  ctx.save();ctx.translate(x,y);ctx.fillStyle='#e8ca80';ctx.strokeStyle='#b59756';ctx.lineWidth=1;
  ctx.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,r=i%2?size*.43:size;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
}
function shell(ctx,x,y,size,angle){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle='#f2d1b9';ctx.strokeStyle='#c69f88';ctx.lineWidth=1.8;
  ctx.beginPath();ctx.moveTo(-size*.25,size*.5);ctx.bezierCurveTo(-size*1.5,-size*.6,size*1.5,-size*.9,size*.25,size*.5);ctx.closePath();ctx.fill();ctx.stroke();
  for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(0,size*.4);ctx.quadraticCurveTo(i*size*.13,-size*.2,i*size*.27,-size*.47+Math.abs(i)*size*.12);ctx.stroke();}ctx.restore();
}
function tape(ctx,x,y,angle){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle='#e7d6acbb';ctx.beginPath();ctx.moveTo(-57,-18);ctx.lineTo(57,-18);ctx.lineTo(53,-9);ctx.lineTo(59,0);ctx.lineTo(54,9);ctx.lineTo(57,18);ctx.lineTo(-57,18);ctx.lineTo(-52,8);ctx.lineTo(-59,0);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#fff5d844';for(let i=-40;i<50;i+=12){ctx.beginPath();ctx.moveTo(i,-17);ctx.lineTo(i+10,17);ctx.stroke();}ctx.restore();
}

export function wrapCaptureText(ctx,text,maxWidth){
  const lines=[];
  for(const paragraph of String(text||'').split(/\r?\n/)){
    let line='';
    for(const char of paragraph){
      if(line&&ctx.measureText(line+char).width>maxWidth){lines.push(line);line='';}
      line+=char;
    }
    lines.push(line);
  }
  return lines;
}

export async function renderCapture(photo){
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('사진을 불러오지 못했어요.'));img.src=photo.image;});
  const palette=photoPalettes[photo.themeId]||photoPalettes.default;
  const canvas=document.createElement('canvas'),width=1200,margin=54,storyMargin=96;
  const ctx=canvas.getContext('2d');
  ctx.font='700 32px sans-serif';const titleLines=wrapCaptureText(ctx,photo.title.trim()||'우리 별의 작은 순간',width-storyMargin*2);
  ctx.font='24px sans-serif';const memoLines=photo.memo?wrapCaptureText(ctx,photo.memo,width-storyMargin*2):[];
  ctx.font='20px sans-serif';const tagLines=photo.tags?.length?wrapCaptureText(ctx,photo.tags.map(tag=>'#'+tag).join('   '),width-storyMargin*2):[];
  const footer=110+titleLines.length*44+(memoLines.length?22+memoLines.length*38:0)+(tagLines.length?22+tagLines.length*30:0)+100;
  const height=Math.round(image.height/image.width*(width-margin*2));
  canvas.width=width;canvas.height=height+margin+footer;
  ctx.fillStyle=palette.raised;ctx.fillRect(0,0,width,canvas.height);
  ctx.drawImage(image,margin,margin,width-margin*2,height);
  // Subtle inner edge and paper grain keep the frame legible on bright scenes.
  ctx.strokeStyle=palette.line;ctx.lineWidth=2;ctx.strokeRect(margin,margin,width-margin*2,height);
  ctx.fillStyle=palette.ink;ctx.font='24px sans-serif';
  const stamp=[photo.showDate?photoDate(photo.at):'',photo.showTime?new Date(photo.at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):''].filter(Boolean).join('  ·  ');
  ctx.fillText(stamp,storyMargin,height+margin+53);
  const storyTop=height+margin+88;
  ctx.strokeStyle=palette.line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(storyMargin,storyTop);ctx.lineTo(width-storyMargin,storyTop);ctx.stroke();
  let y=storyTop+56;
  ctx.fillStyle=palette.ink;ctx.font='700 32px sans-serif';
  for(const line of titleLines){ctx.fillText(line,storyMargin,y);y+=44;}
  if(memoLines.length){y+=14;ctx.font='24px sans-serif';for(const line of memoLines){ctx.fillText(line,storyMargin,y);y+=38;}}
  if(tagLines.length){y+=14;ctx.fillStyle=palette.accent;ctx.font='20px sans-serif';for(const line of tagLines){ctx.fillText(line,storyMargin,y);y+=30;}}
  ctx.fillStyle=palette.muted;ctx.font='20px sans-serif';ctx.fillText(photo.location||photo.theme,storyMargin,canvas.height-63);
  ctx.textAlign='right';ctx.font='18px sans-serif';ctx.fillText('ILLOVA  /  '+photo.theme,width-margin,canvas.height-27);ctx.textAlign='left';
  const h=canvas.height;
  if(photo.frame==='botanical'){sprig(ctx,width-49,111,-.35);sprig(ctx,50,h-83,-.8);tape(ctx,width*.7,28,-.12);}
  if(photo.frame==='blossom'){
    ctx.strokeStyle='#9a8764';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(10,h-24);ctx.quadraticCurveTo(67,h-96,48,h-189);ctx.moveTo(width-10,10);ctx.quadraticCurveTo(width-110,65,width-170,43);ctx.stroke();
    [[39,h-68,25],[56,h-126,20],[width-47,38,24],[width-100,55,19],[width-154,39,14]].forEach(v=>flower(ctx,...v));tape(ctx,width*.5,27,.08);
  }
  if(photo.frame==='starlight'){
    ctx.strokeStyle='#c6b58e';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(28,0);ctx.quadraticCurveTo(width*.5,139,width-28,0);ctx.stroke();
    [[50,h-44,27],[92,h-67,13],[width-55,63,25],[width-126,29,15],[width*.45,71,18]].forEach(v=>star(ctx,...v));
    ctx.fillStyle='#d9c79b';for(let i=0;i<12;i++){ctx.beginPath();ctx.arc(20+i*7,h-115+(i%4)*21,2.5,0,Math.PI*2);ctx.fill();}
  }
  if(photo.frame==='seaside'){
    ctx.strokeStyle='#91b7c1';ctx.lineWidth=3;for(let j=0;j<2;j++){ctx.beginPath();for(let x=0;x<=190;x+=5)ctx.lineTo(13+x,h-20-j*12+Math.sin(x/17)*5);ctx.stroke();}
    shell(ctx,56,h-73,38,-.5);shell(ctx,width-49,46,37,.7);star(ctx,105,h-43,19);tape(ctx,width*.6,27,-.1);
  }
  if(photo.frame==='scrapbook'){
    tape(ctx,74,37,-.65);tape(ctx,width-75,h-40,-.65);
    ctx.save();ctx.translate(width-80,45);ctx.rotate(.15);ctx.strokeStyle=palette.accent;ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.strokeRect(-36,-25,72,50);ctx.setLineDash([]);ctx.font='bold 15px sans-serif';ctx.fillStyle=palette.accent;ctx.textAlign='center';ctx.fillText('ILLOVA',0,5);ctx.restore();
  }
  return canvas.toDataURL('image/png');
}

export function downloadCapture(url,filename){
  const data=atob(url.split(',')[1]),bytes=Uint8Array.from(data,char=>char.charCodeAt(0));
  const objectURL=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
  const link=document.createElement('a');link.href=objectURL;link.download=filename;document.body.appendChild(link);link.click();link.remove();
  // Keep the object alive until the browser has taken ownership of the download.
  setTimeout(()=>URL.revokeObjectURL(objectURL),60000);
}
