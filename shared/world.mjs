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
  {id:'statue',name:'피어나 조각상',category:'decor',color:'#e8e3f2'},
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
  {id:'crystal',name:'별빛 수정',category:'lighting',color:'#b8a7e9'}
];
// The legacy 2D catalog also uses these symbols for saved items.
const decorIcons=['🪑','🏮','🌸','⛱️','⛲','🛒','🪵','🌷','🪨','🐰','🍄','🎠','🌸','🪧','🌿','🍄','📬','🧺','🌼','🏛️','💎'];
decorations.forEach((item,index)=>{item.icon=decorIcons[index];});
export const hats=[{id:'none',name:'벗기'},{id:'beret',name:'구름 베레모'},{id:'crown',name:'별 왕관'},{id:'sprout',name:'새싹 머리핀'}];
export const accessories=[{id:'none',name:'벗기'},{id:'scarf',name:'포근한 스카프'},{id:'bow',name:'리본 타이'},{id:'wings',name:'요정 날개'}];
export const colors=['#88b5d7','#d994b6','#a6bc83','#c8a0dd','#e5b570','#eee7da'];
export const defaultAppearance={hat:'none',accessory:'none',color:colors[0]};
export const villageThemes=[
  {id:'default',name:'정원',description:'맑고 포근한 낮의 정원',sky:0xeaf4fc,light:0xfff3e6,intensity:2.8,ambient:1.8,ground:0xb9d5db,swatch:'#dcedf7'},
  {id:'campfire',name:'모닥불',description:'달과 별 아래 반짝이는 불씨',sky:0x273454,light:0xffc281,intensity:1.2,ambient:.9,ground:0x7f91a5,swatch:'#334666'},
  {id:'cafe',name:'카페',description:'따뜻한 창가와 작은 쉼표',sky:0xe5d9cc,light:0xffd5a2,intensity:2.2,ambient:1.5,ground:0xbcbda9,swatch:'#dbc6ab'},
  {id:'twilight',name:'황혼',description:'보랏빛 하늘과 은은한 가로등',sky:0x646486,light:0xd3bcff,intensity:1.3,ambient:1.2,ground:0x929bbd,swatch:'#77739c'},
  {id:'sunset',name:'노을',description:'따뜻한 살구빛이 물드는 마을',sky:0xf4c9ba,light:0xffb075,intensity:2.5,ambient:1.5,ground:0xcbb8b1,swatch:'#efb09c'},
];
export const defaultVillage={items:[],theme:'default'};
// Keep the central host platform and the main path free of furniture.
export function validPlacement(x,z){return Number.isFinite(x)&&Number.isFinite(z)&&Math.hypot(x,z)>=2.85&&Math.hypot(x,z)<=5.6&&!(Math.abs(x)<.85&&z>0)&&![[-3.65,-.2,1.5],[3.35,1.2,1.65],[2.1,-3.5,.85]].some(([a,b,r])=>Math.hypot(x-a,z-b)<r);}

export const characters=[
  {id:'pio',name:'피오',folder:'Meshy_AI_biped',animation:'Joyful_Dance_with_Hand_Sway'},
  {id:'luna',name:'루나',folder:'Meshy_AI_Luna_biped',animation:'Idle_02'},
  {id:'moa',name:'모아',folder:'Meshy_AI_Moa_biped',animation:'Idle_02'},
  {id:'tori',name:'토리',folder:'Meshy_AI_Tori_biped',animation:'Idle_02'}
];
export function characterLooks(appearance={},saved={}){
  const looks=Object.fromEntries(characters.map(c=>[c.id,{...defaultAppearance,...saved[c.id],character:c.id}]));
  const current=appearance.character||'pio';
  if(looks[current])looks[current]={...looks[current],...appearance};
  return looks;
}
