import {lifeActionSchema,lifeActionResponseSchema} from './lifeActions.mjs';

// This registry is the model's entire executable surface. No owner IDs, code,
// socket events or arbitrary method names can be supplied by the model.
const definitions=[
  ['stop_activity','STOP_ACTIVITY','플레이어의 진행 중인 생활 작업 중단.',['actor'],[]],
  ['start_fishing','START_FISHING','바닷가에서 E 키로 낚시하는 방법 안내.',['report'],[]],
  ['query_inventory','QUERY_INVENTORY','실제 보유량 또는 획득 기록 조회.',['actor','scope','item','source'],[]],
  ['open_storage','OPEN_STORAGE','보관함 화면 열기.',[],[]],
  ['plant_seed','PLANT_SEED','텃밭으로 가서 씨앗 1개 심기.',['crop','plot'],[]],
  ['harvest_crop','HARVEST_CROP','텃밭으로 가서 성숙한 작물 수확.',['crop','plot'],[]],
  ['cook_food','COOK_FOOD','요리대로 가서 재료를 소비해 음식 1개 만들기.',['recipe','fish','quantity'],[]],
  ['query_garden','QUERY_GARDEN','실제 작물 성장 조회.',['crop','plot'],[]],
  ['open_garden','OPEN_GARDEN','텃밭 화면 열기.',[],[]],
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
export const avatarToolInstructions=`생활 행동 요청에만 제공된 함수를 한 턴에 하나 호출하라. 일반 대화에는 함수 없이 reply/emotion/memories JSON으로 답하라. 행동 주체는 플레이어 아바타다. 펫은 쓰다듬기와 부르기만 가능하다. 이동·운반·자율 작업은 지원하지 않는다. 함수 인자는 현재 요청에서만 정하고 이전 명령을 반복하지 마라. 부정·인용·가정·취향에는 호출하지 마라. 성공과 획득 결과는 서버가 확인하며 미리 주장하지 마라.`;
