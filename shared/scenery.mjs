// Stable IDs preserve the original scenery in villages without saved placements.
export const perimeterRocks=Array.from({length:42},(_,i)=>{
  const angle=i*Math.PI*2/42,radius=6.48+Math.sin(i*7)*.12;
  return{id:`edge-rock-${i}`,name:'가장자리 돌',x:Math.cos(angle)*radius,z:Math.sin(angle)*radius};
});
export const perimeterTrees=[[-4.6,3.7,1.05],[3.6,4.8,1.1],[-5.6,-1.9,.85],[4.1,-4.2,.8]];
export const sceneryDefinitions = [
  ...[[-3.7,-2.4],[3.8,-2.7],[-5,1.5],[4.8,1.3],[1,-5.1],[-2,-5.2]].map(([x,z],i)=>({id:`tree-${i}`,name:[0,3].includes(i)?'벚꽃나무':'정원 나무',x,z})),
  ...Array.from({length:17},(_,i)=>i).filter(i=>i%5!==0).map(i=>({id:`bush-${i}`,name:'정원 덤불',x:Math.cos(i*2.39996)*(4.6+Math.sin(i*4)*.8),z:Math.sin(i*2.39996)*(4.6+Math.sin(i*4)*.8)})),
  {id:'cafe',name:'마을 카페',x:-3.65,z:-.2},
  {id:'pond',name:'작은 연못',x:3.35,z:1.2},
  {id:'campfire',name:'모닥불',x:2.1,z:-3.5},
  ...[[-2.7,2],[-4.3,2.1]].map(([x,z],i)=>({id:`table-${i}`,name:'카페 테이블',x,z})),
  ...[[3,-2.6],[1.2,-2.6]].map(([x,z],i)=>({id:`bench-${i}`,name:'모닥불 벤치',x,z})),
  ...[[-1.4,3.4],[1.4,3.4],[-5,-2],[4,-1.3]].map(([x,z],i)=>({id:`lamp-${i}`,name:'정원 가로등',x,z})),
  ...perimeterRocks,
  ...perimeterRocks.filter((_,i)=>i%3===0).map((item,i)=>({id:`edge-bush-${i*3}`,name:'작은 초록나무',x:item.x*.93,z:item.z*.93})),
  ...perimeterTrees.map(([x,z],i)=>({id:`edge-tree-${i}`,name:'가장자리 벚꽃나무',x,z})),
];
export const isScenery=id=>typeof id==='string'&&id.startsWith('scenery:');
export function villageScenery(village={}){
  return sceneryDefinitions.map(def=>{
    const saved=village.scenery?.find(item=>item.id===def.id);
    const point=def.id==='campfire'&&village.theme==='campfire'?{x:1.2,z:.8}:def;
    return {type:'scenery',name:def.name,x:point.x,z:point.z,rotation:0,...saved,id:'scenery:'+def.id};
  });
}
export function validSceneryPlacement(x,z){return Number.isFinite(x)&&Number.isFinite(z)&&Math.hypot(x,z)<=6.7&&Math.hypot(x,z)>=2.85&&!(Math.abs(x)<.85&&z>0&&z<5.8);}

export function sceneryClearance(id,otherId){
  if(isScenery(otherId))return .8;
  return ({"scenery:cafe":1.5,"scenery:pond":1.65,"scenery:campfire":.85})[id]??.8;
}
