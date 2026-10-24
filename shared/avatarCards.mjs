export const CARD_LEVELS=[1,3,5,7,10];
export const cardTier=level=>CARD_LEVELS.filter(value=>value<=level).at(-1)||1;
export const cardThemes=[
  {id:'sage',name:'햇살 정원',emoji:'☀️',art:0,tags:['따뜻한','다정한','공감 잘해요']},
  {id:'rose',name:'복숭아빛 하루',emoji:'🍑',art:1,tags:['활발한','장난꾸러기','게임 좋아해요']},
  {id:'ocean',name:'달빛 고양이',emoji:'🌙',art:2,tags:['차분한','지적인','이야기 좋아해요']},
  {id:'sunset',name:'작은 탐험가',emoji:'🌿',art:3,tags:['호기심 많은','모험 좋아해요','편안한']}
];
export const preferenceQuestions=[
  {id:'hobbies',title:'시간 가는 줄 모르는 나의 취미는?',options:['게임','캠핑','독서','음악','요리','사진','산책','영화']},
  {id:'mood',title:'내 작은 세상에 담고 싶은 분위기는?',options:['포근한 정원','활기찬 마을','고요한 숲','새로운 모험']},
  {id:'food',title:'함께 먹고 싶은 음식은?',options:['달콤한 디저트','매콤한 음식','따뜻한 집밥','새로운 맛집 메뉴']}
];
export const CARD_QUESTS=[
  {id:'first-chat',title:'아바타와 첫 대화하기',description:'내 아바타와 한 번 이야기를 나눠요.',goal:1,icon:'💬'},
  {id:'garden',title:'텃밭 꾸미기',description:'내 텃밭에 씨앗을 심거나 텃밭 시설을 옮겨요.',goal:1,icon:'🌱'},
  {id:'village',title:'마을 꾸미기',description:'마을에 소품을 배치하고 저장해요.',goal:1,icon:'🏡'},
  {id:'neighbor',title:'다른 마을 아바타와 대화하기',description:'다른 마을을 방문해 아바타와 이야기해요.',goal:1,icon:'🧭'},
  {id:'social',title:'세 가지 새로운 이야기',description:'서로 다른 세 이웃의 아바타와 대화해요.',goal:3,icon:'🤝'},
  {id:'games',title:'놀이터 단골',description:'미니게임을 세 번 완료해요.',goal:3,icon:'🎮'},
  {id:'level',title:'나를 닮아가는 친구',description:'아바타 레벨 5를 달성해요.',goal:5,icon:'💗'}
];
