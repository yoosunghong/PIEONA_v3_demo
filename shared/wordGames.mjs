export const TYPING_ROUNDS=5;
export const TYPING_ROUND_MS=30000;
export const TYPING_WORD_POINTS=10;
export const CHAIN_ROUNDS=5;
export const CHAIN_TURN_MS=15000;
export const CHAIN_HINTS=3;
export const CHAIN_REACTIONS=['😊','👏','💛','🌸','✨','😮'];
export const TYPING_WORDS=('고양이 강아지 해바라기 무지개 나무 구름 바다 별빛 정원 나비 사과 딸기 복숭아 수박 포도 토끼 다람쥐 고슴도치 기린 코끼리 햇살 바람 산책 친구 마음 웃음 행복 사랑 꽃잎 민들레 장미 튤립 하늘 은하수 달빛 아침 노을 봄 여름 가을 겨울 눈사람 눈꽃 우산 장화 연필 공책 도서관 학교 풍선 선물 리본 초콜릿 사탕 쿠키 우유 빵 피아노 음악 노래 그림 물감 붓 모자 목도리 장갑 기차 자전거 자동차 비행기 배 여행 소풍 숲 호수 폭포 파도 조개 산호 돌고래 펭귄 수달 판다 사슴 여우 병아리 참새 올빼미 부엉이 앵무새 잠자리 개구리 거북이 무궁화 벚꽃 라벤더 백합 풀잎 이슬 오솔길 캠핑 모닥불 텐트 마을 이야기 추억 약속 용기 설렘 응원 박수 축제 놀이 공원 놀이터 미끄럼틀 그네 시소 비눗방울 종이비행기 종이배 보물 지도 열쇠 마법 요정 왕관 성 구슬 반짝임 새싹 씨앗 화분 물뿌리개 물고기 낚시 요리 도시락 김밥 주먹밥 떡볶이 팝콘 아이스크림 귤 레몬 바나나 파인애플 오렌지 망고 체리 블루베리').split(' ');
export const normalizeWord=text=>text.normalize('NFC').trim();
export function chainStarts(last){
  const code=last.charCodeAt(0)-0xac00;if(code<0||code>=11172)return [last];
  const initial=Math.floor(code/588),vowel=Math.floor(code%588/28),final=code%28,starts=[last];
  if(initial===5)starts.push(String.fromCharCode(0xac00+( [2,6,7,12,17,20].includes(vowel)?11:2)*588+vowel*28+final));
  if(initial===2&&[6,12,17,20].includes(vowel))starts.push(String.fromCharCode(0xac00+11*588+vowel*28+final));
  return [...new Set(starts)];
}
