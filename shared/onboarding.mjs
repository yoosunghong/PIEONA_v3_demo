export const balanceQuestions = [
  {id:'weekend',title:'나만의 완벽한 주말은?',a:'포근한 집에서 충전',b:'새로운 곳으로 모험',category:'취향'},
  {id:'friend',title:'친구가 힘든 하루를 보냈다면?',a:'먼저 마음을 들어주기',b:'함께 해결책 찾아보기',category:'가치관'},
  {id:'cafe',title:'작은 카페에서 고르고 싶은 자리는?',a:'햇살 드는 조용한 창가',b:'사람들이 모이는 큰 테이블',category:'취향'},
  {id:'gift',title:'더 마음이 가는 선물은?',a:'진심이 담긴 손편지',b:'취향에 꼭 맞는 작은 물건',category:'가치관'},
  {id:'talk',title:'우리의 대화는 어떤 느낌이면 좋을까?',a:'다정하고 차분한 대화',b:'장난스럽고 활기찬 대화',category:'말투'}
].map(q=>({...q,image:`/images/onboarding/${q.id}.png`}));

export const scenarioQuestions = [
  {id:'comfort',category:'말투',title:'친구가 “오늘 실수해서 너무 속상해”라고 말했어요.',prompt:'나라면 친구에게 뭐라고 말할까요?',hint:'평소 내가 쓰는 말투 그대로, 한두 문장이면 충분해요.'},
  {id:'invitation',category:'취향',title:'친구가 “이번 주말에 우리 뭐 할까?”라고 물었어요.',prompt:'나라면 어떤 말을 건넬까요?',hint:'하고 싶은 일과 그 이유를 평소 말투로 들려주세요.'}
];
