export const petTypes=[{id:'dog',name:'강아지',icon:'🐶'},{id:'cat',name:'고양이',icon:'🐱'},{id:'rabbit',name:'토끼',icon:'🐰'}];
export const petColors=[{id:'#c99765',name:'비스킷'},{id:'#efe4d2',name:'크림'},{id:'#9299a3',name:'회색'},{id:'#575360',name:'차콜'},{id:'#cfa193',name:'밀크티'},{id:'#ad795c',name:'코코아'}];
export const defaultPetAppearance={petType:'dog',petColor:petColors[0].id};
export function petAppearance(look={}){return {petType:petTypes.some(p=>p.id===look.petType)?look.petType:defaultPetAppearance.petType,petColor:petColors.some(p=>p.id===look.petColor)?look.petColor:defaultPetAppearance.petColor};}
