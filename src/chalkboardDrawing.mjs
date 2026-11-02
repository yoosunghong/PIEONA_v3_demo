import {paintStroke} from './signDrawing.mjs';
const caches=new WeakMap();
const empty=[];
export function renderChalkboard(canvas,strokes=empty,draft=empty,active=null){
  let cache=caches.get(canvas);
  if(!cache||cache.strokes!==strokes||cache.draft!==draft){
    const base=document.createElement('canvas');base.width=canvas.width;base.height=canvas.height;
    const ctx=base.getContext('2d');ctx.fillStyle='#234b43';ctx.fillRect(0,0,base.width,base.height);
    ctx.save();ctx.scale(base.width/800,base.height/800);
    for(const stroke of strokes)paintStroke(ctx,stroke);
    for(const stroke of draft)paintStroke(ctx,stroke);
    ctx.restore();cache={strokes,draft,base};caches.set(canvas,cache);
  }
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(cache.base,0,0);
  if(active){ctx.save();ctx.scale(canvas.width/800,canvas.height/800);paintStroke(ctx,active);ctx.restore();}
}
