import {RECIPES} from '../shared/garden.mjs';
import {ITEM_DEFINITIONS} from '../shared/life.mjs';
import {cookingInputs} from '../shared/cooking.mjs';

export const recipeDetails={
  FRUIT_SALAD:{category:'salad',type:'과일 요리',description:'농장에서 수확한 딸기와 사과를 한 그릇에 담은 달콤한 샐러드예요.'},
  GRILLED_FISH:{category:'grill',type:'생선 요리',description:'갓 잡은 신선한 생선을 노릇하게 구운 고소한 요리예요.'},
  HERB_GRILLED_FISH:{category:'grill',type:'생선 요리',description:'마을에서 자란 향긋한 허브를 곁들여 생선의 풍미를 더했어요.'},
  SEAFOOD_PLATTER:{category:'platter',type:'해산물 요리',description:'서로 다른 세 가지 바다의 맛을 한 접시에 정성껏 담았어요.'},
  TOMATO_SALAD:{category:'salad',type:'채소 요리',description:'햇살을 머금은 토마토로 만든 산뜻하고 싱그러운 샐러드예요.'},
};
export const kitchenCategories=[['all','전체','grid'],['grill','구이','MACKEREL'],['platter','모둠 요리','SEAFOOD_PLATTER'],['salad','샐러드','HERB'],['dessert','디저트','🍰'],['drink','음료','🧋']];
export function kitchenRecipes(category='all',query=''){
  return RECIPES.filter(recipe=>(category==='all'||recipeDetails[recipe.id].category===category)&&recipe.name.includes(query.trim()));
}
export function kitchenPlan(recipe,inventory=[],choices=[],quantity=1){
  const bag=new Map(inventory.map(item=>[item.itemId,item.quantity]));
  const availableFish=ITEM_DEFINITIONS.filter(item=>(bag.get(item.itemId)||0)>0);
  const safe=availableFish.filter(item=>['common','uncommon'].includes(item.rarity));
  const fish=Array.from({length:recipe.fishCount},(_,index)=>choices[index]??safe[index]?.itemId??'');
  const validFish=fish.every(id=>ITEM_DEFINITIONS.some(item=>item.itemId===id))&&(!recipe.distinctFish||new Set(fish).size===recipe.fishCount);
  const inputs=cookingInputs(recipe,fish,quantity);
  const perServing=cookingInputs(recipe,fish,1);
  const maxQuantity=validFish?Math.max(0,Math.min(99,...perServing.map(input=>Math.floor((bag.get(input.itemId)||0)/input.quantity)))):0;
  return {fish,availableFish,inputs,maxQuantity,enough:validFish&&Number.isInteger(quantity)&&quantity>=1&&quantity<=maxQuantity,usesRare:fish.some(id=>ITEM_DEFINITIONS.some(item=>item.itemId===id&&['rare','special'].includes(item.rarity)))};
}
