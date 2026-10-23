import {isLifeScenery,validLifePlacement} from '../shared/lifeLayout.mjs';
import {isScenery,validSceneryPlacement,sceneryClearance,suppressedScenery} from '../shared/scenery.mjs';
import {validPlacement} from '../shared/world.mjs';

export const snapPosition=value=>Math.round(value*4)/4;
export function canPlaceDecoration(items,x,z,selected=null){
  const scenery=items.filter(item=>isScenery(item.id)).map(item=>({...item,id:item.id.slice(8)})),occupied=items.filter(item=>!item.hidden&&!suppressedScenery(item,{scenery}));
  if(isLifeScenery(selected)){const proposed={scenery:scenery.map(item=>item.id===selected.slice(8)?{...item,x,z}:item)};if(!validLifePlacement(proposed,selected,occupied))return false;}
  return (isScenery(selected)?validSceneryPlacement(x,z,{scenery},selected):validPlacement(x,z,items.some(item=>isScenery(item.id))?items.filter(item=>isScenery(item.id)).map(item=>({...item,id:item.id.slice(8)})):undefined))&&!occupied.some(item=>item.id!==selected&&Math.hypot(item.x-x,item.z-z)<(isScenery(selected)?sceneryClearance(selected,item.id):.8));
}
export function editorHistory(state,action){
  if(action.type==='undo')return state.past.length?{past:state.past.slice(0,-1),present:state.past.at(-1),future:[state.present,...state.future]}:state;
  if(action.type==='redo')return state.future.length?{past:[...state.past,state.present],present:state.future[0],future:state.future.slice(1)}:state;
  if(action.type==='change'&&JSON.stringify(action.items)!==JSON.stringify(state.present))return{past:[...state.past.slice(-79),state.present],present:action.items,future:[]};
  return state;
}
