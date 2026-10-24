import {z} from 'zod';
import {ITEM_DEFINITIONS,ALL_ITEMS} from '../shared/life.mjs';
import {CROPS,RECIPES,GARDEN_BEDS} from '../shared/garden.mjs';

export const LIFE_INTENTS=['START_FISHING','STOP_ACTIVITY','QUERY_INVENTORY','OPEN_STORAGE','PLANT_SEED','HARVEST_CROP','COOK_FOOD','QUERY_GARDEN','OPEN_GARDEN','QUERY_RELATIONSHIP','UNSUPPORTED'];
export const lifeActionSchema=z.object({
  intent:z.enum(LIFE_INTENTS),
  quantity:z.number().int().min(1).max(99).optional(),
  actor:z.enum(['PLAYER','BOTH']).default('PLAYER'),
  scope:z.enum(['TODAY','ALL','SESSION','STORAGE']).default('ALL'),
  item:z.enum(ALL_ITEMS.map(i=>i.itemId)).optional(),
  source:z.enum(['FISHING','HARVEST','COOKING']).default('FISHING'),
  crop:z.enum(CROPS.map(c=>c.id)).optional(),plot:z.enum(GARDEN_BEDS.map(p=>p.id)).optional(),
  recipe:z.enum(RECIPES.map(r=>r.id)).optional(),fish:z.array(z.enum(ITEM_DEFINITIONS.map(i=>i.itemId))).max(3).optional(),
  plantingId:z.string().uuid().optional(),
}).strict();
export const lifeActionResponseSchema={type:'OBJECT',nullable:true,properties:{
  intent:{type:'STRING',enum:LIFE_INTENTS},actor:{type:'STRING',enum:['PLAYER','BOTH']},
  quantity:{type:'INTEGER'},scope:{type:'STRING',enum:['TODAY','ALL','SESSION','STORAGE']},item:{type:'STRING',enum:ALL_ITEMS.map(i=>i.itemId)},
  source:{type:'STRING',enum:['FISHING','HARVEST','COOKING']},crop:{type:'STRING',enum:CROPS.map(c=>c.id)},plot:{type:'STRING',enum:GARDEN_BEDS.map(p=>p.id)},recipe:{type:'STRING',enum:RECIPES.map(r=>r.id)},fish:{type:'ARRAY',items:{type:'STRING',enum:ITEM_DEFINITIONS.map(i=>i.itemId)}},
},required:['intent']};
export const lifeActionInstructions=`일반 대화에는 action:null. 생활 행동은 플레이어 아바타만 수행한다. 펫은 산책, E 쓰다듬기, R 부르기만 가능하며 대화 상대가 아니다. 펫에게 낚시·요리·운반을 시키거나 자율·오프라인 작업을 예약할 수 없다.
명시적인 요청만 action으로 반환하라: STOP_ACTIVITY, QUERY_INVENTORY, OPEN_STORAGE, PLANT_SEED, HARVEST_CROP, COOK_FOOD, QUERY_GARDEN, OPEN_GARDEN, QUERY_RELATIONSHIP. 낚시는 바닷가에서 E 키로 시작한다. actor는 PLAYER. 실제 실행·획득·소비 결과는 서버가 확인한다. 답변에서 성공을 미리 주장하지 마라.
씨앗 crop은 HERB/TOMATO/FLOWER, plot은 garden:0/garden:1/garden:2. 지정하지 않은 작물을 추측하지 마라. 요리는 recipe GRILLED_FISH/HERB_GRILLED_FISH/SEAFOOD_PLATTER/TOMATO_SALAD, 명시한 물고기만 fish로 전달하라. 재료가 부족하면 실행하지 않는다. 희귀 물고기는 임의로 쓰지 마라. 한 번에 1회만 실행한다. 모호한 요청, 반복·예약·운반·선물·판매·펫 작업은 UNSUPPORTED. scope는 TODAY/ALL/SESSION/STORAGE, source는 FISHING/HARVEST/COOKING이다.`;

// Fast, offline commands also make stop independent of model/network latency.
// Unrecognized phrasing is left to the structured model output, never guessed here.
export function localLifeAction(text){
  const t=text.trim(),compact=t.replace(/\s/g,'');
  if(/["“”「」『』]|(?:라고|라는|예를|만약|가정|명령어|번역|뜻이|심어도|만들어도|하지\s*마|하지\s*않|안\s*할|말자|싫어|좋아해|좋아하)/.test(t))return null;
  if(/자율|자동|오프라인|없는\s*동안|팔아|선물해|따라와|가져와|가져\s*줘|꺼내\s*와|앉아|일어나|내\s*옆으로\s*와/.test(t))return {intent:'UNSUPPORTED'};
  if(/낚시|물고기|텃밭|씨앗|허브|토마토|꽃|심어|수확|요리|구이|구워|샐러드|모둠/.test(t)&&/자라면|익으면|반복|예약|먹자|잡으면/.test(t))return {intent:'UNSUPPORTED'};
  const actor='PLAYER';
  if(/그만|중단|멈춰|취소|낚시.*종료/.test(t))return {intent:'STOP_ACTIVITY',actor};
  if(/추억|함께.*기억|같이.*기억/.test(t))return {intent:'QUERY_RELATIONSHIP'};
  const quantity=t.match(/(\d+)\s*(?:개|인분)/),many=quantity&&Number(quantity[1])!==1||/두\s*개|세\s*개|네\s*개|다섯|여섯|전부|모두/.test(t);
  const crop=CROPS.find(c=>t.includes(c.name)),plot=t.match(/(\d+)\s*번/),plotField=plot?{plot:`garden:${Number(plot[1])-1}`}:{},cropField=crop?{crop:crop.id}:{};
  if(plot&&(Number(plot[1])<1||Number(plot[1])>3)&&/텃밭|심어|수확/.test(t))return {intent:'UNSUPPORTED'};
  if(/텃밭|허브|토마토|꽃|씨앗/.test(t)&&/다\s*자랐|성장|언제|자라고|상태|수확\s*(?:가능|해도|할\s*수)/.test(t))return {intent:'QUERY_GARDEN',...cropField,...plotField};
  if(/텃밭/.test(t)&&/열어|보여|보기/.test(t))return {intent:'OPEN_GARDEN'};
  if(/심어|심자|심기/.test(t))return many?{intent:'UNSUPPORTED'}:{intent:'PLANT_SEED',actor:'PLAYER',...cropField,...plotField};
  if(/수확/.test(t)&&/해\s*줘|해줘|하자|해$|해[.!]|하기/.test(t))return {intent:'HARVEST_CROP',actor:'PLAYER',...cropField,...plotField};
  if(/요리|구워|구이|샐러드|모둠/.test(t)&&/만들어|만들자|만들기|구워|요리해/.test(t)){
    if(many)return {intent:'UNSUPPORTED'};
    const recipe=[...RECIPES].sort((a,b)=>b.name.length-a.name.length).find(r=>compact.includes(r.name.replace(/\s/g,'')))||(/구워/.test(t)&&/물고기|생선|정어리|고등어|전갱이|도미|복어|가오리/.test(t)?RECIPES[0]:null);
    const fish=ITEM_DEFINITIONS.filter(i=>t.includes(i.name)&&!(i.itemId==='SEA_BREAM'&&t.includes('황금도미'))).map(i=>i.itemId);
    return {intent:'COOK_FOOD',actor:'PLAYER',...(recipe?{recipe:recipe.id}:{}),...(fish.length?{fish}:{})};
  }
  if(/보관함|인벤토리|창고/.test(t)&&/열어|열기|보여/.test(t))return {intent:'OPEN_STORAGE'};
  if(/잡았|잡은|수확|만들었|요리했|요리한|요리\s*결과|획득|보관함|인벤토리|몇\s*마리|몇\s*개|낚시\s*결과/.test(t)&&/뭐|무엇|얼마|몇|보여|조회|알려|결과|잡았어|잡았니/.test(t)){
    const item=[...ALL_ITEMS].sort((a,b)=>b.name.length-a.name.length).find(i=>t.includes(i.name));
    return {intent:'QUERY_INVENTORY',actor,source:/수확/.test(t)?'HARVEST':/요리|만들었/.test(t)?'COOKING':'FISHING',scope:/보관함|인벤토리|창고|보유|몇.*(?:있어|있니|남아)/.test(t)?'STORAGE':/오늘/.test(t)?'TODAY':/이번|방금|최근/.test(t)?'SESSION':'ALL',...(item?{item:item.itemId}:{})};
  }
  if(/낚시/.test(t)&&/하자|할까|하러|해\s*줘|해봐|시작|하고\s*(?:와|있어)|해$|해[.!]$/.test(t)||/물고기.*잡아\s*(?:와|줘)/.test(t))return {intent:/같이|함께|우리/.test(t)?'UNSUPPORTED':'START_FISHING',actor};
  return null;
}

export function catchText(items){const sums=new Map();for(const i of items)sums.set(i.itemId,(sums.get(i.itemId)||0)+i.quantity);return sums.size?[...sums].map(([itemId,quantity])=>{const item=ALL_ITEMS.find(d=>d.itemId===itemId);return `${item?.name||itemId} ${quantity}${item?.unit||'개'}`;}).join(', '):'0마리';}
export function koreanDayStart(time){const offset=9*3600000;return Math.floor((time+offset)/86400000)*86400000-offset;}
