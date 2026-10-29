import {DEFAULT_PLATFORM_COLOR} from './platform.mjs';
import {DECOR_RADIUS} from './villageSize.mjs';
import {inLifeArea} from './life.mjs';
// Original, code-generated 3D assets; this catalog is shared by editor and server.
export const decorations = [
  {id:'bench',name:'나무 벤치',category:'furniture',color:'#bf947b'},
  {id:'lantern',name:'가로등',category:'lighting',color:'#efc976'},
  {id:'cherry',name:'벚꽃나무',category:'plants',color:'#edabc5'},
  {id:'parasol',name:'파라솔 테이블',category:'furniture',color:'#f4dea4'},
  {id:'fountain',name:'분수대',category:'decor',color:'#92cce9'},
  {id:'cart',name:'푸드 카트',category:'buildings',color:'#9fc4d8'},
  {id:'fence',name:'울타리',category:'decor',color:'#bf947b'},
  {id:'planter',name:'꽃 화단',category:'plants',color:'#edabc5'},
  {id:'path',name:'돌길',category:'decor',color:'#d4d2df'},
  {id:'statue',name:'ILLOVA 조각상',category:'decor',color:'#e8e3f2'},
  {id:'mushroomSeat',name:'버섯 의자',category:'furniture',color:'#e4a4c8'},
  {id:'swing',name:'그네',category:'furniture',color:'#e4b9ce'},
  {id:'arch',name:'꽃 아치',category:'decor',color:'#c5abdf'},
  {id:'sign',name:'나무 안내판',category:'other',color:'#bf947b'},
  {id:'bush',name:'꽃 덤불',category:'plants',color:'#9ebc94'},
  {id:'mushroom',name:'버섯 오두막',category:'buildings',color:'#dca7a4'},
  {id:'mailbox',name:'편지함',category:'other',color:'#98b7dc'},
  {id:'picnic',name:'피크닉 바구니',category:'furniture',color:'#dfb29b'},
  {id:'flowerLamp',name:'꽃 조명',category:'lighting',color:'#f4d694'},
  {id:'gazebo',name:'정원 정자',category:'buildings',color:'#b8c8df'},
  {id:'crystal',name:'별빛 수정',category:'lighting',color:'#b8a7e9'},
  {id:'dragonNest',name:'아기용 전용 둥지',category:'decor',color:'#b9c8f3',reward:'survey-dragon-v1'}
];
// The legacy 2D catalog also uses these symbols for saved items.
const decorIcons=['🪑','🏮','🌸','⛱️','⛲','🛒','🪵','🌷','🪨','🐰','🍄','🎠','🌸','🪧','🌿','🍄','📬','🧺','🌼','🏛️','💎'];
decorations.forEach((item,index)=>{item.icon=decorIcons[index]||'🪺';item.quantity=item.reward?1:item.id==='statue'?Infinity:10;});
export const decorationQuantity=(entry,rewards=[])=>entry.reward&&!rewards.includes(entry.reward)?0:entry.quantity;
// Placed items use stock; storing or undoing a placement returns it.
export function remainingDecoration(items,type,rewards=[]){
  const entry=decorations.find(item=>item.id===type);
  return entry?Math.max(0,decorationQuantity(entry,rewards)-items.filter(item=>item.type===type&&!item.hidden).length):0;
}
export const hats=[{id:'none',name:'벗기'},{id:'beret',name:'구름 베레모'},{id:'crown',name:'별 왕관'},{id:'sprout',name:'새싹 머리핀'}];
export const accessories=[{id:'none',name:'벗기'},{id:'scarf',name:'포근한 스카프'},{id:'bow',name:'리본 타이'},{id:'wings',name:'요정 날개'}];
export const rides=[{id:'none',name:'내리기'},{id:'motorcycle',name:'오토바이'},{id:'babyDragon',name:'아기용 · 비행',reward:'survey-dragon-v1'}];
export const colors=['#88b5d7','#d994b6','#a6bc83','#c8a0dd','#e5b570','#eee7da'];
export const defaultAppearance={hat:'none',accessory:'none',color:colors[0]};
export const villageThemes=[
  {id:'milkyway',name:'은하수',description:'깊은 우주에 부드럽게 흐르는 보랏빛 별의 강',sky:0x263452,light:0xe2e7ff,intensity:1.65,ambient:1.1,ground:0x9296ae,swatch:'#7777a4'},
  {id:'cafe',name:'오로라',description:'청록빛 오로라가 흐르는 우주 정원',sky:0x315967,light:0xc5f3e7,intensity:1.8,ambient:1.3,ground:0x9296ae,swatch:'#82bcb5'},
  {id:'twilight',name:'황혼',description:'보랏빛 성운과 은은하게 빛나는 별무리',sky:0x646486,light:0xd3bcff,intensity:1.3,ambient:1.2,ground:0x9296ae,swatch:'#77739c'},
  {id:'sunset',name:'태양 노을',description:'멀리 있는 작은 주황빛 태양 무리의 은은한 온기',sky:0x35324c,light:0xf3d0b4,intensity:1.5,ambient:1.1,ground:0x9296ae,swatch:'#ad826c'},
];
export const normalizeVillageTheme=id=>villageThemes.some(theme=>theme.id===id)?id:'milkyway';
export const defaultVillage={items:[],theme:'milkyway',platformColor:DEFAULT_PLATFORM_COLOR};
export function validPlacement(x,z,scenery){return Number.isFinite(x)&&Number.isFinite(z)&&!inLifeArea(x,z,{scenery})&&Math.hypot(x,z)<=DECOR_RADIUS;}
export const characters=[
  {id:'pio',name:'피오',folder:'Meshy_AI_Pieona_biped',model:'Meshy_AI_Pieona_biped_Meshy_Merged_Animations.fbx'},
  {id:'luna',name:'루나',folder:'Meshy_AI_Luna_biped',model:'Meshy_AI_Luna_biped_Meshy_Merged_Animations.fbx'},
  {id:'moa',name:'모아',folder:'Meshy_AI_Moa_biped',model:'Meshy_AI_Moa_biped_Meshy_Merged_Animations.fbx'},
  {id:'tori',name:'토리',folder:'Meshy_AI_Tori_biped',model:'Meshy_AI_Tori_biped_Meshy_Merged_Animations.fbx'}
];
export function characterLooks(appearance={},saved={}){
  const looks=Object.fromEntries(characters.map(c=>[c.id,{...defaultAppearance,...saved[c.id],character:c.id}]));
  const current=appearance.character||'pio';
  if(looks[current])looks[current]={...looks[current],...appearance};
  return looks;
}
