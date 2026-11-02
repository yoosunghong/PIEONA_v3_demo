import {validPlacement} from './world.mjs';
export const SIGN_ID='village-sign';
export const signColors=['#20364c','#999999','#fffaf4','#fa5d70','#fa91b5','#f5964f','#f8df70','#62a978','#55bce7','#338afb','#aa59cf','#965e36'];
export const MAX_CUSTOM_SIGN_COLORS=24;
export const isSignColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value);
export function rgbaSignColor(r,g,b,a){
  if(![r,g,b].every(value=>Number.isInteger(value)&&value>=0&&value<=255)||!Number.isFinite(a)||a<0||a>1)return null;
  return '#'+[r,g,b,Math.round(a*255)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
export const signShapes=['planks','arrow','hanging'];
export const MAX_SIGN_STROKES=1500;
export const MAX_SIGN_POINTS=80000;
export const defaultSign={x:-2,z:-3.6,rotation:0,shape:'planks',strokes:[]};
export function villageSign(village){
  if(village?.sign)return {...defaultSign,...village.sign};
  const free=(x,z)=>validPlacement(x,z)&&!(village?.items||[]).filter(item=>!item.hidden).some(item=>Math.hypot(item.x-x,item.z-z)<.8);
  if(free(defaultSign.x,defaultSign.z))return {...defaultSign};
  // Legacy villages may already have furniture in the new sign's default spot.
  const candidates=[];for(let x=-5.5;x<=5.5;x+=.25)for(let z=-5.5;z<=5.5;z+=.25)if(free(x,z))candidates.push({x,z});
  candidates.sort((a,b)=>Math.hypot(a.x-defaultSign.x,a.z-defaultSign.z)-Math.hypot(b.x-defaultSign.x,b.z-defaultSign.z));
  return {...defaultSign,...candidates[0]};
}
export const signPlacementItem=sign=>({id:SIGN_ID,type:'villageSign',x:sign.x,z:sign.z,rotation:sign.rotation,...(sign.hidden?{hidden:true}:{})});
export const signPointCount=strokes=>strokes.reduce((total,stroke)=>total+stroke.points.length,0);
// Coordinates are normalized to the same square used by the editor and the 3D texture.
export function signCameraView(sign=defaultSign){
  const angle=sign.rotation*Math.PI/2;
  return{position:[sign.x+Math.sin(angle)*4.7,1.95,sign.z+Math.cos(angle)*4.7],target:[sign.x,1.35,sign.z]};
}
