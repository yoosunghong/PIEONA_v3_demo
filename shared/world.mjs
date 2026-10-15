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
export const defaultVillage={items:[]};
// Keep the central host platform and the main path free of furniture.
export function validPlacement(x,z){return Number.isFinite(x)&&Number.isFinite(z)&&Math.hypot(x,z)>=2.85&&Math.hypot(x,z)<=5.6&&!(Math.abs(x)<.85&&z>0)&&![[-3.65,-.2,1.5],[3.35,1.2,1.65],[2.1,-3.5,.85]].some(([a,b,r])=>Math.hypot(x-a,z-b)<r);}
