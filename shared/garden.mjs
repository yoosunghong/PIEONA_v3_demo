export const WATER_INTERVAL_MS=5*60_000;
export const REQUIRED_WATERINGS=3;
export const GARDEN_BEDS=Array.from({length:9},(_,i)=>({id:`garden:${i}`,x:(i%3-1)*1.65,z:(Math.floor(i/3)-1)*1.65,approach:{x:(i%3-1)*1.65,z:(Math.floor(i/3)-1)*1.65+.7}}));
export const seedId=cropId=>`${cropId}_SEED`;
export const KITCHEN={id:'kitchen',x:2.8,z:3.8,approach:{x:2.8,z:2.85}};
export const CROPS=[
  {id:'HERB',name:'허브',icon:'🌿',growMs:5*60_000,category:'ingredient',description:'생선 요리에 향긋함을 더하는 허브.',usage:'허브 생선구이 재료'},
  {id:'TOMATO',name:'토마토',icon:'🍅',growMs:10*60_000,category:'ingredient',description:'햇살을 머금고 빨갛게 익은 토마토.',usage:'토마토 샐러드 재료'},
  {id:'FLOWER',name:'꽃',icon:'🌼',growMs:20*60_000,category:'decoration',description:'우리 텃밭에서 피어난 작은 꽃.',usage:'보관함에서 감상 · 선물과 장식 배치는 후속 업데이트'},
  {id:'STRAWBERRY',name:'딸기',icon:'🍓',category:'ingredient',description:'세 번의 물주기로 탐스럽게 익은 딸기.',usage:'과일 샐러드 재료'},
  {id:'APPLE',name:'사과',icon:'🍎',category:'ingredient',description:'농장에서 정성껏 키운 아삭한 사과.',usage:'과일 샐러드 재료'},
];
export const RECIPES=[
  {id:'GRILLED_FISH',name:'생선구이',icon:'🍽️',fishCount:1,ingredients:[],description:'물고기 1마리'},
  {id:'HERB_GRILLED_FISH',name:'허브 생선구이',icon:'🌿',fishCount:1,ingredients:[{itemId:'HERB',quantity:1}],description:'물고기 1마리 + 허브 1개'},
  {id:'SEAFOOD_PLATTER',name:'해산물 모둠',icon:'🍱',fishCount:3,distinctFish:true,ingredients:[],description:'서로 다른 물고기 3종, 각 1마리'},
  {id:'TOMATO_SALAD',name:'토마토 샐러드',icon:'🥗',fishCount:0,ingredients:[{itemId:'TOMATO',quantity:1}],description:'토마토 1개'},
  {id:'FRUIT_SALAD',name:'과일 샐러드',icon:'🥣',fishCount:0,ingredients:[{itemId:'STRAWBERRY',quantity:1},{itemId:'APPLE',quantity:1}],description:'딸기 1개 + 사과 1개'},
];
export const SEED_ITEMS=CROPS.map(c=>({itemId:seedId(c.id),cropId:c.id,name:`${c.name} 씨앗`,icon:'🌱',rarity:'common',stackable:true,category:'seed',unit:'개',description:`농장에 심으면 ${c.name}을 수확할 수 있어요.`,usage:'농장 텃밭에 심기 · 수확할 때 씨앗 1개 회수'}));
export const GARDEN_ITEMS=CROPS.map(c=>({...c,itemId:c.id,rarity:'common',stackable:true,unit:'개'}));
export const FOOD_ITEMS=RECIPES.map(r=>({itemId:r.id,name:r.name,icon:r.icon,rarity:'common',stackable:true,category:'food',unit:'개',description:`우리 마을에서 만든 ${r.name}.`,usage:'완성된 음식 보관 · 함께 식사는 후속 업데이트'}));
export function cropState(plot,now){return !plot.cropId?'Empty':(plot.waterCount||0)>=REQUIRED_WATERINGS?'Ready':'Growing';}
export function cropGrowth(plot,now){
  const state=cropState(plot,now),waterCount=plot.waterCount||0;
  const nextWaterAt=state==='Growing'?(plot.lastWateredAt??plot.plantedAt)+WATER_INTERVAL_MS:null;
  return {state,waterCount,stage:state==='Empty'?0:Math.min(3,waterCount+1),nextWaterAt,canWater:state==='Growing'&&now>=nextWaterAt};
}
