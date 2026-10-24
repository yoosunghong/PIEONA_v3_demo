import {paintStroke} from './signDrawing.mjs';
export function renderChalkboard(canvas,strokes=[]){
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#234b43';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.save();ctx.scale(canvas.width/800,canvas.height/800);
  for(const stroke of strokes)paintStroke(ctx,stroke);
  ctx.restore();
}
