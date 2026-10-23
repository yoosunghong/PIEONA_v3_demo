import {z} from 'zod';
import {ITEM_DEFINITIONS,ALL_ITEMS} from '../shared/life.mjs';
import {CROPS,RECIPES,GARDEN_BEDS} from '../shared/garden.mjs';

export const AVATAR_INTENTS=['MOVE_TO','SIT_DOWN','STAND_UP','TAKE_FROM_STORAGE'];
export const LIFE_INTENTS=[...AVATAR_INTENTS,'START_FISHING','JOIN_FISHING','STOP_ACTIVITY','QUERY_INVENTORY','OPEN_STORAGE','PLANT_SEED','HARVEST_CROP','COOK_FOOD','QUERY_GARDEN','OPEN_GARDEN','SET_AUTONOMY','QUERY_AUTONOMY','QUERY_RELATIONSHIP','UNSUPPORTED'];
export const lifeActionSchema=z.object({
  intent:z.enum(LIFE_INTENTS),
  target:z.enum(['PLAYER','STORAGE','GARDEN','KITCHEN','POSITION']).optional(),
  x:z.number().finite().optional(),z:z.number().finite().optional(),
  seatId:z.string().min(1).max(100).optional(),quantity:z.number().int().min(1).max(99).optional(),
  actor:z.enum(['COMPANION','PLAYER','BOTH']).default('COMPANION'),
  scope:z.enum(['TODAY','ALL','SESSION','STORAGE']).default('ALL'),
  item:z.enum(ALL_ITEMS.map(i=>i.itemId)).optional(),
  source:z.enum(['FISHING','HARVEST','COOKING']).default('FISHING'),
  crop:z.enum(CROPS.map(c=>c.id)).optional(),plot:z.enum(GARDEN_BEDS.map(p=>p.id)).optional(),
  recipe:z.enum(RECIPES.map(r=>r.id)).optional(),fish:z.array(z.enum(ITEM_DEFINITIONS.map(i=>i.itemId))).max(3).optional(),
  plantingId:z.string().uuid().optional(),
  autonomy:z.object({enabled:z.boolean().optional(),offline:z.boolean().optional(),fishing:z.boolean().optional(),gardening:z.boolean().optional(),replant:z.boolean().optional(),crop:z.enum(CROPS.map(c=>c.id)).optional(),recipe:z.enum(RECIPES.map(r=>r.id)).nullable().optional()}).strict().optional(),
  report:z.boolean().default(false),
}).strict();
export const lifeActionResponseSchema={type:'OBJECT',nullable:true,properties:{
  intent:{type:'STRING',enum:LIFE_INTENTS},actor:{type:'STRING',enum:['COMPANION','PLAYER','BOTH']},
  target:{type:'STRING',enum:['PLAYER','STORAGE','GARDEN','KITCHEN','POSITION']},x:{type:'NUMBER'},z:{type:'NUMBER'},seatId:{type:'STRING'},quantity:{type:'INTEGER'},
  scope:{type:'STRING',enum:['TODAY','ALL','SESSION','STORAGE']},item:{type:'STRING',enum:ALL_ITEMS.map(i=>i.itemId)},report:{type:'BOOLEAN'},
  source:{type:'STRING',enum:['FISHING','HARVEST','COOKING']},crop:{type:'STRING',enum:CROPS.map(c=>c.id)},plot:{type:'STRING',enum:GARDEN_BEDS.map(p=>p.id)},recipe:{type:'STRING',enum:RECIPES.map(r=>r.id)},fish:{type:'ARRAY',items:{type:'STRING',enum:ITEM_DEFINITIONS.map(i=>i.itemId)}},
  autonomy:{type:'OBJECT',properties:{enabled:{type:'BOOLEAN'},offline:{type:'BOOLEAN'},fishing:{type:'BOOLEAN'},gardening:{type:'BOOLEAN'},replant:{type:'BOOLEAN'},crop:{type:'STRING',enum:CROPS.map(c=>c.id)},recipe:{type:'STRING',nullable:true,enum:RECIPES.map(r=>r.id)}}},
},required:['intent','actor','scope','report']};
export const lifeActionInstructions=`생활 행동은 action에 구조화하라. 일반 대화·취향·가정·인용·부정된 요청에는 action:null. 실행이나 획득을 reply에서 미리 주장하지 마라. 실제 결과는 서버가 응답한다.
Phase 4: 명시적인 자율 활동 설정은 SET_AUTONOMY와 autonomy 객체를 쓴다. 요청한 설정만 지정하라: enabled, offline, fishing, gardening, replant, crop, recipe. 요리는 사용자가 자동 요리와 정확한 레시피를 허용했을 때만 recipe를 지정한다. 없는 동안 텃밭 관리는 enabled/오프라인/gardening/replant true. 오프라인은 최대 2시간이며 상한이 있다. 자율 활동 중단은 STOP_ACTIVITY, 오프라인 결과 조회는 QUERY_AUTONOMY, 함께한 추억 조회는 QUERY_RELATIONSHIP. 이 명시적 모드 설정 이외의 반복·예약 요청은 UNSUPPORTED다.
허용 intent: START_FISHING(아바타 혼자), JOIN_FISHING(함께), STOP_ACTIVITY(중단), QUERY_INVENTORY(실제 기록 조회), OPEN_STORAGE, PLANT_SEED, HARVEST_CROP, COOK_FOOD, QUERY_GARDEN(성장 상태), OPEN_GARDEN, UNSUPPORTED.
씨앗 심기는 crop HERB/TOMATO/FLOWER를 사용하고 지정된 칸만 plot garden:0/garden:1/garden:2를 준다. 모호한 작물은 추측하지 말고 crop을 생략한다. 수확은 성숙한 작물만, 지정하지 않으면 전부다. 요리는 recipe GRILLED_FISH/HERB_GRILLED_FISH/SEAFOOD_PLATTER/TOMATO_SALAD, 사용자가 명시한 물고기만 fish 배열에 지정한다. 요리는 1회 1개이며 재료를 소비한다. 일회성 복수 수량 요청, 임의 조건부 예약, 먹기, 선물, 판매는 UNSUPPORTED. 자율·오프라인 모드는 위 Phase 4 규칙에 따라 명시적으로 설정한다. 희귀 물고기를 임의로 선택하지 마라. 지원하지 않는 레시피를 생선구이로 바꾸지 마라.
actor는 COMPANION/PLAYER/BOTH. 함께 낚시는 BOTH, 너는 COMPANION, 나만은 PLAYER, 그만하자는 BOTH. 텃밭·요리 명령은 COMPANION. scope는 TODAY(한국 오늘)/ALL(누적)/SESSION(최근 활동)/STORAGE(현재 보유량). '잡았어?'는 기본 COMPANION, '보관함에 있어?'는 STORAGE와 BOTH. source는 FISHING(잡은 기록)/HARVEST(수확 기록)/COOKING(요리 기록). item은 정확한 아이템 ID일 때만 제공한다. report는 '잡아와/하고 와'처럼 낚시 결과 보고를 요청하면 true(3회 판정 후 자동 종료), 일반 낚시는 false. 다른 유저나 임의 위치는 UNSUPPORTED다. 실행 전에는 '만들었어/심었어'라고 하지 마라.`;

// Fast, offline commands also make stop independent of model/network latency.
// Unrecognized phrasing is left to the structured model output, never guessed here.
export function localLifeAction(text){
  const t=text.trim(),compact=t.replace(/\s/g,'');
  if(/^(?:이제\s*)?자동\s*요리(?:는|를)?\s*(?:하지\s*마|꺼\s*줘|중단해\s*줘)[.!?]*$/.test(t))return {intent:'SET_AUTONOMY',autonomy:{recipe:null}};
  if(/^(?:이제\s*)?오프라인\s*활동(?:은|을)?\s*(?:꺼\s*줘|중단해\s*줘)[.!?]*$/.test(t))return {intent:'SET_AUTONOMY',autonomy:{offline:false}};
  if(/["“”「」『』]|(?:라고|라는|예를|만약|가정|명령어|번역|뜻이|심어도|만들어도|하지\s*마|하지\s*않|안\s*할|말자|싫어|좋아해|좋아하)/.test(t))return null;
  // Deliberately anchored: conversation, quotes, negation and compound requests go to the model.
  if(/^(?:너(?:는)?\s*)?(?:나한테|내게|내\s*(?:옆|근처|쪽)(?:으로|에)?|여기(?:로)?)\s*(?:좀\s*)?(?:와|와줘|와\s*줘|와줄래|와봐)[.!?~]*$/.test(t))return {intent:'MOVE_TO',target:'PLAYER'};
  if(/^(?:벤치에?\s*|의자에?\s*)?(?:좀\s*)?(?:앉아|앉아줘|앉아\s*줘|앉자)[.!?~]*$/.test(t))return {intent:'SIT_DOWN'};
  if(/^(?:이제\s*)?(?:일어나|일어나줘|일어나\s*줘)[.!?~]*$/.test(t))return {intent:'STAND_UP'};
  const retrieve=t.match(/^(?:보관함|창고)(?:에서|에\s*있는)\s*(.+?)\s*(?:(\d+)\s*(?:개|마리)\s*)?(?:좀\s*)?(?:꺼내\s*(?:와|줘)|가져\s*(?:와|줘))[.!?~]*$/);
  if(retrieve){const item=ALL_ITEMS.find(i=>i.name===retrieve[1].trim());return item?{intent:'TAKE_FROM_STORAGE',item:item.itemId,quantity:retrieve[2]?Number(retrieve[2]):1}:{intent:'UNSUPPORTED'};}
  const actor=/나만|내가|플레이어/.test(t)?'PLAYER':/같이|함께|우리|둘\s*다|전체/.test(t)?'BOTH':'COMPANION';
  if(/그만|중단|멈춰|취소|낚시.*종료/.test(t))return {intent:'STOP_ACTIVITY',actor:/너만|아바타만/.test(t)?'COMPANION':/나만|플레이어만/.test(t)?'PLAYER':'BOTH'};
  if(/없는\s*동안|오프라인/.test(t)&&/뭐|무엇|결과|보고|조회/.test(t))return {intent:'QUERY_AUTONOMY'};
  if(/추억|함께.*기억|같이.*기억|지난번.*(?:낚시|수확|요리)/.test(t))return {intent:'QUERY_RELATIONSHIP'};
  if(/자율|자동|없는\s*동안/.test(t)&&/낚시|텃밭|씨앗|허브|토마토|꽃|수확|심어|구이|요리|샐러드|모둠|자율.*활동/.test(t)&&/\d+\s*(?:개|인분|분|시간|일)|두\s*개|세\s*개|한\s*시간/.test(t))return {intent:'UNSUPPORTED'};
  if(/자율\s*활동/.test(t)&&/꺼|끄기/.test(t))return {intent:'STOP_ACTIVITY',actor:'COMPANION'};
  if(/없는\s*동안/.test(t)&&/텃밭.*관리해/.test(t))return {intent:'SET_AUTONOMY',autonomy:{enabled:true,offline:true,gardening:true,replant:true,fishing:false,recipe:null,...(CROPS.find(c=>t.includes(c.name))?{crop:CROPS.find(c=>t.includes(c.name)).id}:{})}};
  if(/자율\s*활동.*(?:켜|시작)|알아서\s*생활/.test(t))return {intent:'SET_AUTONOMY',autonomy:{enabled:true}};
  if(/자동\s*낚시/.test(t)&&/켜|시작|해줘/.test(t))return {intent:'SET_AUTONOMY',autonomy:{enabled:true,fishing:true,offline:/오프라인|없는\s*동안/.test(t)}};
  if(/자동.*(?:요리|만들어)/.test(t)){const recipe=[...RECIPES].sort((a,b)=>b.name.length-a.name.length).find(r=>compact.includes(r.name.replace(/\s/g,'')));if(recipe)return {intent:'SET_AUTONOMY',autonomy:{enabled:true,recipe:recipe.id,offline:/오프라인|없는\s*동안/.test(t)}};}

  if(/알려\s*줘|알려줘/.test(t)&&/잡으면|잡을\s*때/.test(t)||/팔아|판매해|선물해|따라와/.test(t)||/낚시|물고기|텃밭|씨앗|허브|토마토|꽃|심어|수확|요리|구이|구워|샐러드|모둠/.test(t)&&/없는\s*동안|자동|반복|예약|재파종|먹자|자라면|익으면/.test(t))return {intent:'UNSUPPORTED'};
  const quantity=t.match(/(\d+)\s*(?:개|인분)/),many=quantity&&Number(quantity[1])!==1||/두\s*개|세\s*개|네\s*개|다섯|여섯|전부|모두/.test(t);
  const crop=CROPS.find(c=>t.includes(c.name)),plot=t.match(/(\d+)\s*번/),plotField=plot?{plot:`garden:${Number(plot[1])-1}`}:{},cropField=crop?{crop:crop.id}:{};
  if(plot&&(Number(plot[1])<1||Number(plot[1])>3)&&/텃밭|심어|수확/.test(t))return {intent:'UNSUPPORTED'};
  if(/텃밭|허브|토마토|꽃|씨앗/.test(t)&&/다\s*자랐|성장|언제|자라고|상태|수확\s*(?:가능|해도|할\s*수)/.test(t))return {intent:'QUERY_GARDEN',...cropField,...plotField};
  if(/텃밭/.test(t)&&/열어|보여|보기/.test(t))return {intent:'OPEN_GARDEN'};
  if(/심어|심자|심기/.test(t))return many?{intent:'UNSUPPORTED'}:{intent:'PLANT_SEED',actor:'COMPANION',...cropField,...plotField};
  if(/수확/.test(t)&&/해\s*줘|해줘|하자|해$|해[.!]|하기/.test(t))return {intent:'HARVEST_CROP',actor:'COMPANION',...cropField,...plotField};
  if(/요리|구워|구이|샐러드|모둠/.test(t)&&/만들어|만들자|만들기|구워|요리해/.test(t)){
    if(many)return {intent:'UNSUPPORTED'};
    const recipe=[...RECIPES].sort((a,b)=>b.name.length-a.name.length).find(r=>compact.includes(r.name.replace(/\s/g,'')))||(/구워/.test(t)&&/물고기|생선|정어리|고등어|전갱이|도미|복어|가오리/.test(t)?RECIPES[0]:null);
    const fish=ITEM_DEFINITIONS.filter(i=>t.includes(i.name)&&!(i.itemId==='SEA_BREAM'&&t.includes('황금도미'))).map(i=>i.itemId);
    return {intent:'COOK_FOOD',actor:'COMPANION',...(recipe?{recipe:recipe.id}:{}),...(fish.length?{fish}:{})};
  }
  if(/보관함|인벤토리|창고/.test(t)&&/열어|열기|보여/.test(t))return {intent:'OPEN_STORAGE'};
  if(/잡았|잡은|수확|만들었|요리했|요리한|요리\s*결과|획득|보관함|인벤토리|몇\s*마리|몇\s*개|낚시\s*결과/.test(t)&&/뭐|무엇|얼마|몇|보여|조회|알려|결과|잡았어|잡았니/.test(t)){
    const item=[...ALL_ITEMS].sort((a,b)=>b.name.length-a.name.length).find(i=>t.includes(i.name));
    return {intent:'QUERY_INVENTORY',actor,source:/수확/.test(t)?'HARVEST':/요리|만들었/.test(t)?'COOKING':'FISHING',scope:/보관함|인벤토리|창고|보유|몇.*(?:있어|있니|남아)/.test(t)?'STORAGE':/오늘/.test(t)?'TODAY':/이번|방금|최근/.test(t)?'SESSION':'ALL',...(item?{item:item.itemId}:{})};
  }
  if(/낚시/.test(t)&&/하자|할까|하러|해\s*줘|해봐|시작|하고\s*(?:와|있어)|해$|해[.!]$/.test(t)||/물고기.*잡아\s*(?:와|줘)/.test(t))return {intent:/같이|함께|우리/.test(t)?'JOIN_FISHING':'START_FISHING',actor,report:/잡아와|하고와/.test(compact)};
  return null;
}

export function catchText(items){const sums=new Map();for(const i of items)sums.set(i.itemId,(sums.get(i.itemId)||0)+i.quantity);return sums.size?[...sums].map(([itemId,quantity])=>{const item=ALL_ITEMS.find(d=>d.itemId===itemId);return `${item?.name||itemId} ${quantity}${item?.unit||'개'}`;}).join(', '):'0마리';}
export function koreanDayStart(time){const offset=9*3600000;return Math.floor((time+offset)/86400000)*86400000-offset;}
