// The drawing is stored as bounded vector strokes, never executable SVG or uploaded HTML.
const inkLayers=new WeakMap();
export function boardPath(ctx,shape){
  ctx.beginPath();
  if(shape==='arrow'){
    ctx.moveTo(65,230);ctx.lineTo(575,230);ctx.lineTo(575,130);ctx.lineTo(760,390);ctx.lineTo(575,650);ctx.lineTo(575,550);ctx.lineTo(65,550);ctx.closePath();
  }else if(shape==='hanging')ctx.roundRect(55,185,690,455,22);
  else{
    ctx.moveTo(91,173);ctx.quadraticCurveTo(59,175,55,203);ctx.lineTo(53,308);ctx.quadraticCurveTo(53,323,68,327);
    ctx.quadraticCurveTo(53,330,54,346);ctx.lineTo(56,463);ctx.quadraticCurveTo(56,480,70,483);
    ctx.quadraticCurveTo(55,486,57,503);ctx.lineTo(63,616);ctx.quadraticCurveTo(64,647,98,644);
    ctx.lineTo(713,618);ctx.quadraticCurveTo(744,617,743,591);ctx.lineTo(741,480);ctx.quadraticCurveTo(740,468,728,464);
    ctx.quadraticCurveTo(742,460,741,446);ctx.lineTo(738,330);ctx.quadraticCurveTo(738,314,726,310);
    ctx.quadraticCurveTo(742,307,739,288);ctx.lineTo(735,170);ctx.quadraticCurveTo(733,142,703,146);ctx.closePath();
  }
}
export function insideBoard(x,y,shape){
  if(shape!=='arrow')return x>=.069&&x<=.931&&y>=(shape==='hanging'?.232:.2)&&y<=.8;
  const px=x*800,py=y*800;
  return px>=65&&((px<=575&&py>=230&&py<=550)||(px>=575&&px<=760&&Math.abs(py-390)<=(760-px)*260/185));
}
export function paintStroke(ctx,stroke){
  ctx.globalCompositeOperation=stroke.tool==='erase'?'destination-out':'source-over';
  ctx.strokeStyle=stroke.color;ctx.fillStyle=stroke.color;ctx.lineWidth=stroke.size;ctx.lineCap='round';ctx.lineJoin='round';
  const [first,...rest]=stroke.points;if(!first)return;
  if(!rest.length){ctx.beginPath();ctx.arc(first[0]*800,first[1]*800,stroke.size/2,0,Math.PI*2);ctx.fill();return;}
  ctx.beginPath();ctx.moveTo(first[0]*800,first[1]*800);for(const point of rest)ctx.lineTo(point[0]*800,point[1]*800);ctx.stroke();
}
export function renderSign(canvas,sign){
  const ctx=canvas.getContext('2d');if(canvas.width!==800)canvas.width=800;if(canvas.height!==800)canvas.height=800;ctx.clearRect(0,0,800,800);
  const hanging=sign.shape==='hanging';
  const post=ctx.createLinearGradient(342,0,444,0);post.addColorStop(0,'#a76d45');post.addColorStop(.2,'#dc9f64');post.addColorStop(.55,'#bc7f4e');post.addColorStop(.8,'#e2aa70');post.addColorStop(1,'#a16b48');ctx.fillStyle=post;
  ctx.beginPath();ctx.roundRect(346,62,108,738,17);ctx.fill();
  ctx.strokeStyle='#8f603b55';ctx.lineWidth=4;for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(360+i*18,80);ctx.bezierCurveTo(350+i*18,320,380+i*16,600,360+i*18,800);ctx.stroke();}
  if(hanging){ctx.fillStyle=post;ctx.beginPath();ctx.roundRect(32,95,736,33,13);ctx.fill();ctx.strokeStyle='#665b50';ctx.lineWidth=10;for(const x of [145,655]){ctx.beginPath();ctx.moveTo(x,115);ctx.lineTo(x,210);ctx.stroke();}}
  ctx.save();ctx.shadowColor='#5f413d55';ctx.shadowBlur=12;ctx.shadowOffsetY=9;boardPath(ctx,sign.shape);ctx.fillStyle='#bd8962';ctx.fill();ctx.restore();
  ctx.save();boardPath(ctx,sign.shape);ctx.clip();
  const wood=ctx.createLinearGradient(0,160,150,650);wood.addColorStop(0,hanging?'#c3946c':'#f5d5af');wood.addColorStop(.4,hanging?'#aa754e':'#f9dfbd');wood.addColorStop(1,hanging?'#b57e56':'#efc8a3');ctx.fillStyle=wood;ctx.fillRect(0,130,800,540);
  for(let i=0;i<42;i++){const y=168+i*12;ctx.strokeStyle=i%3?'#c8926a18':'#fff4d82e';ctx.lineWidth=2+i%4;ctx.beginPath();ctx.moveTo(30,y);ctx.bezierCurveTo(200,y-20,480,y+20,780,y-12);ctx.stroke();}
  if(sign.shape!=='arrow')for(const y of [315,475]){ctx.strokeStyle='#bc88663d';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(35,y+12);ctx.quadraticCurveTo(420,y+5,770,y-7);ctx.stroke();ctx.strokeStyle='#fff5dc88';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(45,y+16);ctx.lineTo(765,y-3);ctx.stroke();}
  ctx.restore();boardPath(ctx,sign.shape);ctx.strokeStyle='#fce5c3';ctx.lineWidth=5;ctx.stroke();
  for(const [x,y] of [[84,188],[716,188],[84,613],[716,613]]){if(sign.shape==='arrow')continue;ctx.fillStyle='#ca977c99';ctx.beginPath();ctx.ellipse(x,y,8,10,-.2,0,Math.PI*2);ctx.fill();}
  let ink=inkLayers.get(canvas);if(!ink){ink=document.createElement('canvas');ink.width=800;ink.height=800;inkLayers.set(canvas,ink);}const pen=ink.getContext('2d');pen.clearRect(0,0,800,800);
  pen.globalCompositeOperation='source-over';
  pen.save();boardPath(pen,sign.shape);pen.clip();for(const stroke of sign.strokes||[])paintStroke(pen,stroke);pen.restore();ctx.drawImage(ink,0,0);
}
