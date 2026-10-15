import {validPlacement} from './world.mjs';
export const SIGN_ID='village-sign';
export const signColors=['#20364c','#999999','#fffaf4','#fa5d70','#fa91b5','#f5964f','#f8df70','#62a978','#55bce7','#338afb','#aa59cf','#965e36'];
export const signShapes=['planks','arrow','hanging'];
export const MAX_SIGN_STROKES=300;
export const MAX_SIGN_POINTS=16000;
export const defaultSign={x:-2,z:4.25,rotation:0,shape:'planks',strokes:[]};
export function villageSign(village){
  if(village?.sign)return {...defaultSign,...village.sign};
  const free=(x,z)=>validPlacement(x,z)&&!(village?.items||[]).some(item=>Math.hypot(item.x-x,item.z-z)<.8);
  if(free(defaultSign.x,defaultSign.z))return {...defaultSign};
  // Legacy villages may already have furniture in the new sign's default spot.
  const candidates=[];for(let x=-5.5;x<=5.5;x+=.25)for(let z=-5.5;z<=5.5;z+=.25)if(free(x,z))candidates.push({x,z});
  candidates.sort((a,b)=>Math.hypot(a.x-defaultSign.x,a.z-defaultSign.z)-Math.hypot(b.x-defaultSign.x,b.z-defaultSign.z));
  return {...defaultSign,...candidates[0]};
}
export const signPlacementItem=sign=>({id:SIGN_ID,type:'villageSign',x:sign.x,z:sign.z,rotation:sign.rotation});
export const signPointCount=strokes=>strokes.reduce((total,stroke)=>total+stroke.points.length,0);
// Coordinates are normalized to the same square used by the editor and the 3D texture.
export function signCameraView(sign=defaultSign){
  const angle=sign.rotation*Math.PI/2;
  return{position:[sign.x+Math.sin(angle)*4.7,1.95,sign.z+Math.cos(angle)*4.7],target:[sign.x,1.35,sign.z]};
}
