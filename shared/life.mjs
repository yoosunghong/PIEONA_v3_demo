import {GARDEN_ITEMS,FOOD_ITEMS} from './garden.mjs';
export const FISHING_PERIOD = 45_000;
export const INTERACTION_REACH = 1.6;
import {villageLife,lifeFootprint} from './lifeLayout.mjs';
export {STORAGE,FISHING_ANCHORS} from './lifeLayout.mjs';
export function fishingCameraView(anchor,aspect=1){
  const distance=Math.max(1,Math.min(2,.95/aspect));
  const s=Math.sin(anchor.rotation||0),c=Math.cos(anchor.rotation||0),x=anchor.x+s*.75,z=anchor.z+c*.75;
  return {position:[x+(4.8*c+4.95*s)*distance,1.1+2.4*distance,z+(-4.8*s+4.95*c)*distance],target:[x,1.1,z]};
}
// Keep the access lane and dock clear without rewriting existing saved layouts.
export function inLifeArea(x,z,village={},exclude=null){
  return lifeFootprint(village).some(point=>point.id!==exclude&&Math.hypot(x-point.x,z-point.z)<point.radius);
}
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
export function nearestLifeInteraction(position,members=[],viewerId,village={}){
  if(!position)return null;
  const {storage,beds,kitchen,anchors}=villageLife(village);
  const candidates=[storage,...beds,kitchen,...anchors.filter(anchor=>!members.some(m=>m.userId!==viewerId&&m.seatId===anchor.id))];
  return candidates.map(item=>({...item,distance:Math.hypot(item.x-position.x,item.z-position.z)})).filter(item=>item.distance<=INTERACTION_REACH).sort((a,b)=>a.distance-b.distance)[0]||null;
}
export function lifeInteractionKey(event){
  return !event.repeat&&!event.defaultPrevented&&!event.isComposing&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.target?.isContentEditable&&!event.target?.closest?.('input,textarea,select,[role="textbox"]')&&(event.code==='KeyE'||(!event.code&&event.key?.toLowerCase()==='e'));
}
