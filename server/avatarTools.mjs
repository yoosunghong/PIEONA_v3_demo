import {lifeActionSchema,lifeActionResponseSchema} from './lifeActions.mjs';

// This registry is the model's entire executable surface. No owner IDs, code,
// socket events or arbitrary method names can be supplied by the model.
const definitions=[
  ['move_to','MOVE_TO','지정한 장소로 걷기. 나한테 와/내 옆으로 와는 PLAYER. POSITION은 사용자가 좌표를 명시했을 때만.',['target','x','z'],['target']],
  ['sit_down','SIT_DOWN','빈 벤치로 걸어가 앉기. seatId 생략 시 가장 가까운 빈 벤치.',['seatId'],[]],
  ['stand_up','STAND_UP','앉은 자리에서 일어나기. 진행 중인 아바타 이동도 중단. ',[],[]],
  ['take_from_storage','TAKE_FROM_STORAGE','보관함에 가서 실제 재고를 꺼내 플레이어에게 가져오기. 먹기·소비·선물이 아님.',['item','quantity'],['item']],
  ['stop_activity','STOP_ACTIVITY','진행 중인 이동·생활 작업과 자율 활동 중단.',['actor'],[]],
  ['start_fishing','START_FISHING','아바타 혼자 바다로 가서 낚시.',['report'],[]],
  ['query_inventory','QUERY_INVENTORY','실제 보유량 또는 획득 기록 조회.',['actor','scope','item','source'],[]],
  ['open_storage','OPEN_STORAGE','보관함 화면 열기.',[],[]],
  ['plant_seed','PLANT_SEED','텃밭으로 가서 씨앗 1개 심기.',['crop','plot'],[]],
  ['harvest_crop','HARVEST_CROP','텃밭으로 가서 성숙한 작물 수확.',['crop','plot'],[]],
  ['cook_food','COOK_FOOD','요리대로 가서 재료를 소비해 음식 1개 만들기.',['recipe','fish'],[]],
  ['query_garden','QUERY_GARDEN','실제 작물 성장 조회.',['crop','plot'],[]],
  ['open_garden','OPEN_GARDEN','텃밭 화면 열기.',[],[]],
  ['set_autonomy','SET_AUTONOMY','사용자가 명시적으로 허용한 자율·오프라인 생활 설정.',['autonomy'],['autonomy']],
  ['query_autonomy','QUERY_AUTONOMY','오프라인 활동 결과 조회.',[],[]],
  ['query_relationship','QUERY_RELATIONSHIP','함께한 생활 추억 조회.',[],[]],
];
export const avatarTools=definitions.map(([name,,description,fields,required])=>({name,description,...(fields.length?{parameters:{type:'OBJECT',properties:Object.fromEntries(fields.map(key=>[key,lifeActionResponseSchema.properties[key]])),...(required.length?{required}:{})}}:{})}));
export function actionFromTool(call){
  const definition=definitions.find(([name])=>name===call?.name);
  if(!definition)return {intent:'UNSUPPORTED'};
  const [,intent,,fields,required]=definition,args=call.args??{};
  if(!args||Array.isArray(args)||typeof args!=='object'||Object.keys(args).some(key=>!fields.includes(key))||required.some(key=>args[key]===undefined))return {intent:'UNSUPPORTED'};
  const result=lifeActionSchema.safeParse({...args,intent,...(intent==='STOP_ACTIVITY'&&!args.actor?{actor:'BOTH'}:{})});
  return result.success?result.data:{intent:'UNSUPPORTED'};
}
export const avatarToolInstructions=`게임 내 행동 요청에는 반드시 제공된 함수 중 하나를 호출하라. 일반 대화에는 함수 호출 없이 지정된 reply/emotion/memories JSON으로 답하라. 한 턴에는 함수 하나만 선택하라. 여러 독립 행동이 필요한 요청은 순서를 확인하고 실행하지 마라. 함수 인자는 현재 사용자 요청에서만 정한다. 이전 대화의 명령을 재실행하지 마라.
"나한테 와", "내 옆으로 와"는 move_to(target:PLAYER). "앉아"는 sit_down, "일어나"는 stand_up. 보관함에서 가져오라는 요청은 take_from_storage(item,quantity). 가져오기는 보관함 → 플레이어 이동까지 서버가 수행한다. 물건을 소비하거나 획득했다고 미리 주장하지 마라. 존재하지 않는 아이템/좌표/벤치 ID를 만들지 마라. 벤치 ID는 사용자가 지정한 경우만 사용하고, 그 외에는 생략해 서버가 빈 벤치를 선택하도록 하라. 재고와 위치는 서버가 실행 시 확인한다. 명확하지 않은 물건·장소는 질문하라. 따라가기·먹기·선물·판매 등 제공되지 않은 행동은 아직 지원하지 않는다고 답하라. 부정·인용·번역·가정·취향에는 함수를 호출하지 마라. lifeActionInstructions의 action JSON 대신 함수 호출을 사용하라. 이동은 소유자의 동반자만 제어하며 플레이어 이동을 강제하지 않는다.`;
