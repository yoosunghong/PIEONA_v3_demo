import {GARDEN_BEDS,KITCHEN,GARDEN_ITEMS,FOOD_ITEMS} from './garden.mjs';
export const FISHING_PERIOD = 45_000;
export const INTERACTION_REACH = 1.6;
export const STORAGE = {id:'storage',x:-1.75,z:4.65};
export const FISHING_ANCHORS = [-1.8,-.6,.6,1.8].map((x,i)=>({id:`fishing:${i}`,x,z:6.3,height:.58,rotation:0}));
export function fishingCameraView(anchor,aspect=1){
  const distance=Math.max(1,Math.min(2,.95/aspect));
  return {position:[anchor.x+4.8*distance,1.1+2.4*distance,anchor.z+.75+4.95*distance],target:[anchor.x,1.1,anchor.z+.75]};
}
// Keep the access lane and dock clear without rewriting existing saved layouts.
export const inLifeArea=(x,z)=>Math.abs(x)<2.55&&z>5.7||GARDEN_BEDS.some(b=>Math.hypot(x-b.x,z-b.z)<.8)||Math.hypot(x-KITCHEN.x,z-KITCHEN.z)<.9;
export const RARITIES = {common:'일반',uncommon:'고급',rare:'희귀',special:'특별'};
export const ITEM_DEFINITIONS = [
  ['SARDINE','정어리','common','🐟','작지만 반짝이는 바다의 은빛 친구.'],
  ['MACKEREL','고등어','common','🐟','푸른 등을 가진 친숙한 물고기.'],
  ['HORSE_MACKEREL','전갱이','common','🐟','무리 지어 바다를 여행하는 물고기.'],
  ['SEA_BREAM','도미','uncommon','🐠','분홍빛 비늘이 햇살에 빛나요.'],
  ['PUFFER','복어','uncommon','🐡','동그란 모습의 귀여운 바다 친구.'],
  ['GOLDEN_BREAM','황금도미','rare','✨','황금빛 비늘을 만난 특별한 날을 기억해요.'],
  ['STAR_RAY','별빛가오리','special','🌟','밤하늘의 별을 닮은 바다의 선물.'],
].map(([itemId,name,rarity,icon,description])=>({itemId,name,rarity,icon,description,category:'fish',unit:'마리',stackable:true,usage:'생선구이 · 허브 생선구이 · 해산물 모둠 재료'}));
export const ALL_ITEMS=[...ITEM_DEFINITIONS,...GARDEN_ITEMS,...FOOD_ITEMS];
export function rollFish(random=Math.random){
  if(random()>=.7)return null;
  const roll=random(),rarity=roll<.72?'common':roll<.94?'uncommon':roll<.99?'rare':'special';
  const pool=ITEM_DEFINITIONS.filter(item=>item.rarity===rarity);
  return pool[Math.min(pool.length-1,Math.floor(random()*pool.length))];
}
export function nearestLifeInteraction(position,members=[],viewerId){
  if(!position)return null;
  const candidates=[STORAGE,...GARDEN_BEDS,KITCHEN,...FISHING_ANCHORS.filter(anchor=>!members.some(m=>m.userId!==viewerId&&m.seatId===anchor.id))];
  return candidates.map(item=>({...item,distance:Math.hypot(item.x-position.x,item.z-position.z)})).filter(item=>item.distance<=INTERACTION_REACH).sort((a,b)=>a.distance-b.distance)[0]||null;
}
export function lifeInteractionKey(event){
  return !event.repeat&&!event.defaultPrevented&&!event.isComposing&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.target?.isContentEditable&&!event.target?.closest?.('input,textarea,select,[role="textbox"]')&&(event.code==='KeyE'||(!event.code&&event.key?.toLowerCase()==='e'));
}
