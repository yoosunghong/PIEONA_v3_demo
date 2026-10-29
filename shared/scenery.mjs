import {SCENERY_RADIUS} from './villageSize.mjs';
import {lifeDefinitions,isLifeScenery} from './lifeLayout.mjs';
import {inLifeArea} from './life.mjs';
// Stable IDs preserve the original scenery in villages without saved placements.
export const perimeterRocks=Array.from({length:42},(_,i)=>{
  const angle=i*Math.PI*2/42,radius=6.48+Math.sin(i*7)*.12;
  return{id:`edge-rock-${i}`,name:'가장자리 돌',x:Math.cos(angle)*radius,z:Math.sin(angle)*radius};
});
export const perimeterTrees=[[-4.6,3.7,1.05],[3.6,4.8,1.1],[-5.6,-1.9,.85],[4.1,-4.2,.8]];
// Store the original scattered stones as three movable inventory clusters.
export const isPinkPebble=id=>typeof id==='string'&&/^(scenery:)?pink-pebble-/.test(id);
export const pinkPebbles=(()=>{
  let seed=42;const rand=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;},items=[];
  for(let i=0;i<600&&items.length<230;i++){
    const x=(rand()-.5)*12,z=(rand()-.5)*12;
    if(x*x+z*z>40||x*x+z*z<8||Math.abs(x)<.8&&z>0||x<-2&&z<1||x>2&&z<3)continue;
    items.push({id:`pink-pebble-${items.length}`,name:'분홍 자갈',x,z,y:.2+rand()*.16,scale:.7+rand()});
  }
  const anchors=[[-.5,-4.3],[-3.4,3.6],[3.6,4.2]];
  return anchors.map(([x,z],index)=>({
    id:`pink-pebble-cluster-${index}`,name:'분홍 자갈',x,z,
    stones:items.filter(stone=>anchors.reduce((best,anchor,i)=>
      Math.hypot(stone.x-anchor[0],stone.z-anchor[1])<Math.hypot(stone.x-anchors[best][0],stone.z-anchors[best][1])?i:best,0)===index)
      .map(stone=>({...stone,x:stone.x-x,z:stone.z-z})),
  }));
})();
export const sceneryDefinitions = [
  ...[[-3.7,-2.4],[3.8,-2.7],[-5,1.5],[4.8,1.3],[1,-5.1],[-2,-5.2]].map(([x,z],i)=>({id:`tree-${i}`,name:[0,3].includes(i)?'벚꽃나무':'정원 나무',x,z})),
  ...Array.from({length:17},(_,i)=>i).filter(i=>i%5!==0).map(i=>({id:`bush-${i}`,name:'정원 덤불',x:Math.cos(i*2.39996)*(4.6+Math.sin(i*4)*.8),z:Math.sin(i*2.39996)*(4.6+Math.sin(i*4)*.8)})),
  {id:'cafe',name:'별 카페',x:-3.65,z:-.2},
  {id:'pond',name:'작은 연못',x:3.35,z:1.2},
  {id:'campfire',name:'모닥불',x:2.1,z:-3.5},
  ...[[-2.7,2],[-4.3,2.1]].map(([x,z],i)=>({id:`table-${i}`,name:'카페 테이블',x,z})),
  ...[[3,-2.6],[1.2,-2.6]].map(([x,z],i)=>({id:`bench-${i}`,name:'모닥불 벤치',x,z})),
  ...[[-1.4,3.4],[1.4,3.4],[-5,-2],[4,-1.3]].map(([x,z],i)=>({id:`lamp-${i}`,name:'정원 가로등',x,z})),
  ...perimeterRocks,
  ...perimeterRocks.filter((_,i)=>i%3===0).map((item,i)=>({id:`edge-bush-${i*3}`,name:'작은 초록나무',x:item.x*.93,z:item.z*.93})),
  {id:'central-stage',name:'중앙 원형 광장',x:0,z:0},
  ...Array.from({length:12},(_,i)=>({id:`stage-stone-${i}`,name:'광장 돌계단',x:Math.sin(i*Math.PI/6)*2.5,z:Math.cos(i*Math.PI/6)*2.5})),
  ...Array.from({length:6},(_,i)=>({id:`path-stone-${i}`,name:'산책로 돌계단',x:-.25+Math.sin(i)*.13,z:2.9+i*.5})),
  ...lifeDefinitions,
  ...perimeterTrees.map(([x,z],i)=>({id:`edge-tree-${i}`,name:'가장자리 벚꽃나무',x,z})),
  ...pinkPebbles,
];
export const isScenery=id=>typeof id==='string'&&id.startsWith('scenery:');
export const suppressedScenery=(item,village={})=>isScenery(item.id)&&!isPinkPebble(item.id)&&!/^scenery:(central-stage|stage-stone-|path-stone-)/.test(item.id)&&!isLifeScenery(item.id)&&inLifeArea(item.x,item.z,village);
export function villageScenery(village={}){
  return sceneryDefinitions.map(def=>{
    const saved=village.scenery?.find(item=>item.id===def.id);
    const point=def.id==='campfire'&&village.theme==='campfire'?{x:1.2,z:.8}:def;
    return {type:'scenery',name:def.name,x:point.x,z:point.z,rotation:0,...(isPinkPebble(def.id)?{hidden:true}:{}),...saved,...(['life-storage','life-kitchen'].includes(def.id)?{hidden:true}:{}),id:'scenery:'+def.id};
  });
}
export function validSceneryPlacement(x,z,village={},selected=null){return Number.isFinite(x)&&Number.isFinite(z)&&(isPinkPebble(selected)||!inLifeArea(x,z,village,selected))&&Math.hypot(x,z)<=SCENERY_RADIUS;}

export function sceneryClearance(id,otherId){
  if([id,otherId].some(isPinkPebble))return 0;
  if([id,otherId].some(key=>/^scenery:(central-stage|stage-stone-|path-stone-)/.test(key)))return 0;
  if(isScenery(otherId))return .4;
  return ({"scenery:cafe":.75,"scenery:pond":.825,"scenery:campfire":.425})[id]??.4;
}
