export const GARDEN_BEDS=[-4.4,-3.35,-2.3].map((x,i)=>({id:`garden:${i}`,x,z:3.9,approach:{x,z:3.05}}));
export const KITCHEN={id:'kitchen',x:2.8,z:3.8,approach:{x:2.8,z:2.85}};
export const CROPS=[
  {id:'HERB',name:'허브',icon:'🌿',growMs:5*60_000,category:'ingredient',description:'생선 요리에 향긋함을 더하는 허브.',usage:'허브 생선구이 재료'},
  {id:'TOMATO',name:'토마토',icon:'🍅',growMs:10*60_000,category:'ingredient',description:'햇살을 머금고 빨갛게 익은 토마토.',usage:'토마토 샐러드 재료'},
  {id:'FLOWER',name:'꽃',icon:'🌼',growMs:20*60_000,category:'decoration',description:'우리 텃밭에서 피어난 작은 꽃.',usage:'보관함에서 감상 · 선물과 장식 배치는 후속 업데이트'},
];
export const RECIPES=[
  {id:'GRILLED_FISH',name:'생선구이',icon:'🍽️',fishCount:1,ingredients:[],description:'물고기 1마리'},
  {id:'HERB_GRILLED_FISH',name:'허브 생선구이',icon:'🌿',fishCount:1,ingredients:[{itemId:'HERB',quantity:1}],description:'물고기 1마리 + 허브 1개'},
  {id:'SEAFOOD_PLATTER',name:'해산물 모둠',icon:'🍱',fishCount:3,distinctFish:true,ingredients:[],description:'서로 다른 물고기 3종, 각 1마리'},
  {id:'TOMATO_SALAD',name:'토마토 샐러드',icon:'🥗',fishCount:0,ingredients:[{itemId:'TOMATO',quantity:1}],description:'토마토 1개'},
];
export const GARDEN_ITEMS=CROPS.map(c=>({...c,itemId:c.id,rarity:'common',stackable:true,unit:'개'}));
export const FOOD_ITEMS=RECIPES.map(r=>({itemId:r.id,name:r.name,icon:r.icon,rarity:'common',stackable:true,category:'food',unit:'개',description:`우리 마을에서 만든 ${r.name}.`,usage:'완성된 음식 보관 · 함께 식사는 후속 업데이트'}));
export function cropState(plot,now){return !plot.cropId?'Empty':now>=plot.readyAt?'Ready':'Growing';}
