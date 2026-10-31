import {starType} from './colony.mjs';
// Every account owns these destinations; IDs remain stable across saves and slots.
export const playerStars=Object.freeze([
  {id:'plaza',name:'광장별',caption:'이야기가 모이는 나의 첫 번째 별',color:'#bca8ef'},
  {id:'fishing',name:'낚시별',caption:'별빛 물결에 낚싯대를 드리워요',color:'#83d6ed'},
  {id:'farm',name:'농장별',caption:'작은 씨앗이 자라는 초록빛 별',color:'#b8d99a'},
]);
export const validStar=id=>playerStars.some(star=>star.id===id)||/^found-(green|red|blue)-[a-f0-9-]{36}$/.test(id||'');
export const starName=id=>playerStars.find(star=>star.id===id)?.name||starType(id)?.name||'광장별';
export const memberStar=member=>member.starId||(member.seatId?.startsWith('fishing:')?'fishing':'plaza');
