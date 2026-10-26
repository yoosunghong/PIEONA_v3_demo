import {ITEM_DEFINITIONS} from './life.mjs';

export const FISH_POINTS={SARDINE:10,MACKEREL:12,HORSE_MACKEREL:15,SEA_BREAM:25,PUFFER:30,GOLDEN_BREAM:60,STAR_RAY:100};
export const FISHING_DURATIONS=[1,3,5,0];
export function fishingScore(items=[]){return items.reduce((sum,item)=>sum+(FISH_POINTS[item.itemId]||0)*item.quantity,0);}
export function fishingDuelView(players,aspect=1){
  const x=players.reduce((sum,p)=>sum+p.x,0)/players.length,z=players.reduce((sum,p)=>sum+p.z,0)/players.length;
  const rotation=players[0]?.rotation||0,distance=Math.max(6.5,Math.min(12,6.5/Math.max(.45,aspect))),s=Math.sin(rotation),c=Math.cos(rotation);
  return {position:[x+s*distance,4.2,z+c*distance],target:[x,2,z]};
}
export const fishLabel=id=>ITEM_DEFINITIONS.find(item=>item.itemId===id)?.name||id;
