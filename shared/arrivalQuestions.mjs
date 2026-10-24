export const arrivalQuestions = [
  ['breakfast','아침 먹었어? 먹었다면 뭐 먹었어?'],
  ['lunch','오늘 점심은 뭐 먹었어? 아직이라면 뭐 먹고 싶어?'],
  ['dinner','오늘 저녁엔 어떤 음식이 당겨?'],
  ['snack','요즘 자꾸 손이 가는 간식 있어?'],
  ['drink','지금 마시고 싶은 음료 하나 고른다면?'],
  ['mood','지금 기분을 날씨로 표현하면 어떤 날씨야?'],
  ['small-joy','오늘 작게라도 기분 좋았던 일 있었어?'],
  ['rest','잠깐 쉴 시간이 생기면 뭘 하고 싶어?'],
  ['music','요즘 자주 듣는 노래가 있어?'],
  ['weekend','이번 주말에 하고 싶은 일 하나 있어?'],
  ['sleep','어젯밤엔 잘 잤어? 기억나는 꿈도 있어?'],
  ['walk','산책한다면 바닷가랑 숲길 중 어디로 가고 싶어?'],
  ['season','가장 좋아하는 계절은 뭐야? 왜 좋아해?'],
  ['movie','최근에 재미있게 본 영화나 영상 있어?'],
  ['hobby','요즘 새로 해보고 싶은 취미가 있어?'],
  ['village','우리 마을에 하나 더 놓는다면 뭘 놓고 싶어?'],
  ['pet','작은 친구가 마을을 돌아다니는 거 봤어? 어디서 만났어?'],
  ['meal','직접 만들어보고 싶은 요리가 있어?'],
  ['memory','최근에 사진으로 남기고 싶었던 순간이 있었어?'],
  ['tomorrow','내일 기대되는 일이 하나 있어?'],
  ['color','오늘 마음에 드는 색은 무슨 색이야?'],
  ['travel','하루 동안 어디든 갈 수 있다면 어디 가고 싶어?'],
  ['proud','최근에 해내서 뿌듯했던 일이 있어?'],
  ['relax','오늘 하루 끝에 나에게 작은 선물을 준다면 뭘 줄래?'],
].map(([id,text])=>({id,text}));

export function chooseArrivalQuestion(seen,random=Math.random){
  const available=arrivalQuestions.filter(question=>!seen.has(question.id));
  // Each arrival has a 35% chance of being quiet. Exhaustion never resets history.
  if(!available.length||random()>=.65)return null;
  return available[Math.min(available.length-1,Math.floor(random()*available.length))];
}
