// Original, code-generated 3D assets; this catalog is shared by editor and server.
export const decorations = [
  {id:'planter',name:'튤립 화단',icon:'🌷',color:'#edabc5'},
  {id:'bench',name:'정원 벤치',icon:'🪑',color:'#bf947b'},
  {id:'lantern',name:'별빛 가로등',icon:'🏮',color:'#efc976'},
  {id:'fountain',name:'구름 분수',icon:'⛲',color:'#92cce9'},
  {id:'arch',name:'꽃 아치',icon:'🌸',color:'#c5abdf'},
  {id:'mushroom',name:'버섯 오두막',icon:'🍄',color:'#dca7a4'}
];
export const hats=[{id:'none',name:'벗기'},{id:'beret',name:'구름 베레모'},{id:'crown',name:'별 왕관'},{id:'sprout',name:'새싹 머리핀'}];
export const accessories=[{id:'none',name:'벗기'},{id:'scarf',name:'포근한 스카프'},{id:'bow',name:'리본 타이'},{id:'wings',name:'요정 날개'}];
export const colors=['#88b5d7','#d994b6','#a6bc83','#c8a0dd','#e5b570','#eee7da'];
export const defaultAppearance={hat:'none',accessory:'none',color:colors[0]};
export const villageThemes=[
  {id:'default',name:'기본',description:'맑고 포근한 낮의 정원',sky:0xeaf4fc,light:0xfff3e6,intensity:2.8,ambient:1.8,ground:0xb9d5db,swatch:'#dcedf7'},
  {id:'sunset',name:'노을',description:'따뜻한 살구빛이 물드는 마을',sky:0xf4c9ba,light:0xffb075,intensity:2.5,ambient:1.5,ground:0xcbb8b1,swatch:'#efb09c'},
  {id:'twilight',name:'황혼',description:'보랏빛 하늘과 은은한 가로등',sky:0x646486,light:0xd3bcff,intensity:1.3,ambient:1.2,ground:0x929bbd,swatch:'#77739c'}
];
export const defaultVillage={items:[],theme:'default'};
// Keep the central host platform and the main path free of furniture.
export function validPlacement(x,z){return Number.isFinite(x)&&Number.isFinite(z)&&Math.hypot(x,z)>=2.85&&Math.hypot(x,z)<=5.6&&!(Math.abs(x)<.85&&z>0)&&![[-3.65,-.2,1.5],[3.35,1.2,1.65],[2.1,-3.5,.85]].some(([a,b,r])=>Math.hypot(x-a,z-b)<r);}
