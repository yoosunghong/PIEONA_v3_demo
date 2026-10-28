import {selectVariant,renderVariant,COMPANION_REQUESTS} from './personaScripts.mjs';
const tasks=COMPANION_REQUESTS;
// Existing applied personas drive request scripts without network generation at runtime.
// Older PSS versions use local templates until their next avatar update.
export function companionReply(action,active={},history){
 const [task,body]=tasks[action]||tasks.IDLE,event={id:`request.${task}.accept`,variables:[]};
 const saved=active.scripts?.events?.find(group=>group.eventId===event.id);
 if(saved){const pick=selectVariant(saved.variants,history,'happy',{});return {text:renderVariant(pick.selected,event,{}),eventId:event.id,variantId:pick.selected.id,personaVersion:active.version||0,expression:pick.selected.expression,history:pick.history};}
 const p=active.persona||{},formal=/존댓말|정중|공손/.test(p.speechStyle||'');
 const tone=formal?'formal':p.playfulness>.6?'playful':p.activity<.4?'calm':p.kindness>.6?'warm':'plain';
 const line=formal?body.replace(/할게$/, '할게요').replace(/캘게$/, '캘게요').replace(/모을게$/, '모을게요').replace(/따라갈게$/, '따라갈게요').replace(/돌아갈게$/, '돌아갈게요').replace(/기다릴게$/, '기다릴게요').replace(/막을게$/, '막을게요'):body;
 const prefix={formal:['네, ','좋아요. ','알겠어요. '],playful:['좋아, 숲의 일꾼 출동! ','내 솜씨를 보여 줄게! ','신나는 모험이네! '],calm:['천천히 둘러보면서 ','서두르지 않고 ','조용히 집중해서 '],warm:['네가 편하게 탐험하도록 ','너를 도울 수 있어 기뻐. ','우리 함께 힘내자. '],plain:['응, ','알겠어. ','좋아. ']}[tone];
 const variants=prefix.map((text,i)=>({id:`${event.id}.${tone}.${i}`,text:text+line+'.',expression:tone==='playful'?'excited':'calm',mood:'any',affinity:'any'}));
 const pick=selectVariant(variants,history,'happy',{});
 return {text:renderVariant(pick.selected,event,{}),eventId:event.id,variantId:pick.selected.id,personaVersion:active.version||0,expression:pick.selected.expression,history:pick.history};
}
