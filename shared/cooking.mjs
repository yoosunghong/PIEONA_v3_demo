export const COOK_TIME_MS=2000;

export function cookingInputs(recipe,fish=[],quantity=1){
  const inputs=new Map();
  for(const input of [...fish.map(itemId=>({itemId,quantity:1})),...recipe.ingredients])inputs.set(input.itemId,(inputs.get(input.itemId)||0)+input.quantity*quantity);
  return [...inputs].map(([itemId,quantity])=>({itemId,quantity}));
}
