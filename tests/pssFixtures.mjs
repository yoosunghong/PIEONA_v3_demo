import {ACTIVE_EVENTS,TRAITS} from '../shared/personaScripts.mjs';
export const PERSONA_A={...Object.fromEntries(TRAITS.map(t=>[t,.25])),speechStyle:'차분하고 짧은 존댓말',preferences:['조용한 산책']};
export const PERSONA_B={...Object.fromEntries(TRAITS.map(t=>[t,.85])),speechStyle:'다정하고 장난스러운 반말',preferences:['친구와 마을 놀이']};
const lines={
 'fishing.start':['낚시하는 모습을 보고 있을게요.','바닷바람이 조용하네요.','느긋하게 기다려 봐요.'],
 'fishing.result.success':['{fishName}을 낚으셨네요.','{fishName}의 비늘이 반짝이네요.','한 마리 더 모였네요.'],
 'fishing.result.failure':['이번에는 조용하네요.','입질이 없었네요. 조금 더 기다려 봐요.','다음 물결을 기다려요.'],
 'fishing.result.rare':['{fishName}이라니, 귀한 만남이네요.','특별한 {fishName}을 만났네요.','{fishName}의 빛이 참 곱네요.'],
 'garden.plant.complete':['씨앗이 자랄 시간이네요.','작은 싹을 기다려 봐요.','밭에 새 이야기가 시작됐네요.'],
 'garden.harvest.complete':['정성껏 키운 작물이네요.','수확 바구니가 채워졌네요.','작물의 향기가 좋네요.'],
 'request.logging.accept':['나무를 계속 모을게요.', '네, 나무를 계속 모을게요.', '알겠어요. 나무를 계속 모을게요.'],
 'request.mining.accept':['바위를 계속 캘게요.', '네, 바위를 계속 캘게요.', '알겠어요. 바위를 계속 캘게요.'],
 'request.gathering.accept':['숲의 재료를 계속 채집할게요.', '네, 숲의 재료를 계속 채집할게요.', '알겠어요. 숲의 재료를 계속 채집할게요.'],
 'request.follow.accept':['네 곁으로 따라갈게요.', '네, 네 곁으로 따라갈게요.', '알겠어요. 네 곁으로 따라갈게요.'],
 'request.return.accept':['네 곁으로 돌아갈게요.', '네, 네 곁으로 돌아갈게요.', '알겠어요. 네 곁으로 돌아갈게요.'],
 'request.rest.accept':['작업을 멈추고 여기서 기다릴게요.', '네, 작업을 멈추고 여기서 기다릴게요.', '알겠어요. 작업을 멈추고 여기서 기다릴게요.'],
 'request.attack.accept':['슬라임을 막을게요.', '네, 슬라임을 막을게요.', '알겠어요. 슬라임을 막을게요.'],
 'cooking.complete':['요리가 완성됐네요.','따뜻한 냄새가 나네요.','보관함에 음식이 생겼네요.']
};
export const fixtureScripts=persona=>({events:ACTIVE_EVENTS.map(e=>({eventId:e.id,variants:lines[e.id].map((text,i)=>({id:e.id+'.'+(i+1),text:persona.playfulness>.5?'헤헤, '+text.replaceAll('네요.','네!').replaceAll('봐요.','보자!').replaceAll('게요.','게!'):text,expression:i===0?'calm':i===1?'happy':'excited',outcome:e.outcome,mood:i===0?'any':i===1?'happy':'excited',affinity:i===0?'any':i===1?'familiar':'trusted'}))}))});
export function fixtureProvider(){return {name:'fixture (not LLM)',analyze:async({evidence})=>({persona:evidence.messages.at(-1).content.includes('장난')?PERSONA_B:PERSONA_A,summary:evidence.messages.at(-1).content.includes('장난')?'차분한 말투에서 다정하고 장난스러운 말투로 바꿔요.':'조용하고 차분한 말투를 반영해요.',evidenceIds:[evidence.messages.at(-1).id]}),generate:async persona=>fixtureScripts(persona)};}
