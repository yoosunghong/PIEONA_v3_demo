export const TYPING_PHRASES=[
  '작은 정원에 우리의 이야기가 하나씩 피어나요.',
  '오늘은 친구와 함께 햇살 가득한 마을을 걸어요.',
  '따뜻한 말 한마디가 누군가의 하루를 바꿔요.',
  '별빛 아래에서 나만의 새로운 꿈을 그려봐요.',
  '서로 다른 취향이 만나 더 재미있는 세상이 돼요.'
];
// An explicit, shared village vocabulary. No external dictionary or unverifiable client validation.
export const CHAIN_WORDS=[...new Set(('사과 과일 일기 기차 차표 표범 범인 인사 사랑 구름 나무 무지개 개나리 리본 본능 능력 역사 사전 전기 기린 린넨 네모 모자 자전거 거울 울타리 리듬 음악 악기 기분 분수 수박 박수 수영 영웅 웅덩이 이불 불꽃 꽃밭 밭일 일상 상자 자두 두부 부채 채소 소풍 풍경 경치 치마 마을 을미 미소 소나무 무대 대나무 무궁화 화분 분홍 홍차 차례 예술 술래 내일 일출 출발 발자국 국수 수건 건물 물고기 기적 적금 금붕어 어부 부엉이 이슬 슬기 기지개 개구리 리더 더위 위로 로봇 봇물 물감 감자 자동차 차도 도로 로션 션트 트럭 럭비 비누 누나 나비 비행기 기쁨 꿈나라 라면 면도 도토리 리조트 트리 리모컨 컨디션 연필 필통 통나무 무인도 도서관 관찰 찰떡 떡국 국가 가방 방울 울음 음료 요리 리어카 카메라 라디오 오리 리튬 유리 리본 본문 문어 어항 항구 구두 두루미 미술 술잔 잔디 디저트 트로피 피아노 노래 내기 기념 념원 원숭이 이야기 기상 상상 상추 추억 억새 새벽 벽돌 돌고래 내음 음성 성냥 냥이 이웃 웃음 음표 표정 정원 원예 예절 절구 구슬 슬픔 마음 음미 미역 역도 도자기 기억 억양 양말 말풍선 선물 물방울 울림 임금 금요일 일요일 일곱 곱셈 셈법 법원 원두 두더지 지구 구경 경주 주말 말벌 벌집 집게 게장 장미 미니게임 임자 자라 라일락 낙엽 엽서 서랍 랍스터 터널 널뛰기 기회 회의 의자 자몽 몽상 상어 어른 놀이터 터전 전등 등대 대문 문화 화가 가수 수풀 풀잎 잎새 새싹 싹수 수채화 화원 원석 석양 양파 파도 도감 감사 사슴 슴베 베개 개미 미로 로망 망원경 경단 단풍 풍선 선풍기 기온 온도 도넛 넛지 지우개 개울 울보 보물 물결 결말 말투 투자 자화상 상담 담요 요정 정답 답장 장난 난로 로프 프랑스 스케치 치즈 즈음 음반 반달 달빛 빛깔 깔개 개성 성격 격려 여름 겨울 울림 임시 시간 간식 식물 물통 통로 로마 마법 법률 율동 동화 화장 장식 식사 사탕 탕수육 육수 수족관 관객 객실 실내 내내 내가 가을 을지로 로드 드럼 럼주 주전자 자판 판다 다람쥐 쥐불 불빛 빛살 살구 구절 절반 반지 지갑 갑옷 옷감 감동 동물 물개 개집 집밥 밥상 상식 식탁 탁구 구호 호수 수평선 선장 장갑 갑판 판소리').split(/\s+/))];
export const normalizeWord=text=>text.normalize('NFC').trim();
export function chainStarts(last){
  const code=last.charCodeAt(0)-0xac00;if(code<0||code>=11172)return [last];
  const initial=Math.floor(code/588),vowel=Math.floor(code%588/28),final=code%28,starts=[last];
  if(initial===5)starts.push(String.fromCharCode(0xac00+( [2,6,7,12,17,20].includes(vowel)?11:2)*588+vowel*28+final));
  if(initial===2&&[6,12,17,20].includes(vowel))starts.push(String.fromCharCode(0xac00+11*588+vowel*28+final));
  return [...new Set(starts)];
}
export function validateChain(word,used){
  word=normalizeWord(word);
  if(!CHAIN_WORDS.includes(word))return '마을 단어장에 있는 두 글자 이상의 낱말을 입력해주세요.';
  if(used.includes(word))return '이미 사용한 단어예요.';
  if(used.length&&!chainStarts(used.at(-1).at(-1)).includes(word[0]))return `“${chainStarts(used.at(-1).at(-1)).join(' / ')}”로 시작해주세요.`;
  return null;
}
