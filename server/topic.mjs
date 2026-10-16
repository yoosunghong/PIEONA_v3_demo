import {shortTopicTurn} from '../shared/topic.mjs';

export async function generateTopic(contexts,people,topic,answer){
  const transcript=[];
  for(let i=0;i<8;i++){
    const side=i%2,context=contexts[side];
    const topicContext={...context,topicTurn:{index:i,topic,previous:transcript.at(-1)?.text},system:context.system+`\n스페셜 토픽 대화: 두 아바타가 마주 보고 짧게 주고받는다. 매 발화는 한국어 한두 문장, 최대 120자다. 자기소개나 취향을 한꺼번에 나열하지 마라. 직전 상대의 구체적인 말에 먼저 반응하고 한 가지 생각이나 질문만 더하라. 첫 발화는 주제로 가볍게 말을 걸고, 마지막 발화는 자연스럽게 마무리하라. 대사만 reply에 쓰고 memories는 빈 배열로 둔다.`};
    const history=transcript.map(m=>({role:m.speakerId===people[side].id?'assistant':'user',content:m.text}));
    const prompt=i===0?`주제: ${topic}. 상대에게 짧게 먼저 말을 걸어줘.`:`주제: ${topic}. ${i===7?'짧게 반응하며 대화를 마무리해줘.':'상대의 마지막 말에 이어서 짧게 답해줘.'}`;
    const result=await answer(topicContext,prompt,history);
    transcript.push({speakerId:people[side].id,speaker:people[side].nickname,theme:people[side].theme,text:shortTopicTurn(result.reply),emotion:result.emotion});
  }
  return transcript;
}
