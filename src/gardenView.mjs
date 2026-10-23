import {CROPS,cropState} from '../shared/garden.mjs';

export const seedDetails={
  HERB:{category:'vegetable',description:'향긋한 허브를 키워 보세요. 수확한 허브는 생선 요리에 향을 더하는 재료로 사용할 수 있어요.'},
  TOMATO:{category:'vegetable',description:'햇살을 머금고 빨갛게 익는 토마토예요. 수확하면 싱그러운 토마토 샐러드를 만들 수 있어요.'},
  FLOWER:{category:'flower',description:'작은 텃밭을 환하게 밝혀 줄 꽃이에요. 다 자란 꽃을 수확하면 보관함에서 감상할 수 있어요.'},
};
export const gardenCategories=[['all','전체','grid'],['vegetable','채소','HERB'],['flower','꽃','FLOWER'],['tree','나무','🌳'],['special','특수','🏺']];
export function gardenSeeds(category='all'){
  return CROPS.filter(crop=>category==='all'||seedDetails[crop.id].category===category);
}
export function gardenTime(data,now=Date.now()){
  return Number.isFinite(data?.serverTime)&&Number.isFinite(data?.receivedAt)?data.serverTime+Math.max(0,now-data.receivedAt):now;
}
export function gardenPlotView(plot,now){
  const crop=CROPS.find(item=>item.id===plot.cropId),state=cropState(plot,now);
  if(!crop)return {crop:null,state:'Empty',progress:0,seconds:0,countdown:'--:--'};
  const duration=Math.max(1,plot.readyAt-plot.plantedAt),seconds=Math.max(0,Math.ceil((plot.readyAt-now)/1000));
  return {crop,state,seconds,progress:Math.max(0,Math.min(1,(now-plot.plantedAt)/duration)),countdown:`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`};
}
