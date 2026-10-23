export const inventorySprites={PUFFER:0,SARDINE:1,MACKEREL:2,HORSE_MACKEREL:3,SEA_BREAM:4,GOLDEN_BREAM:5,STAR_RAY:6,HERB:7,TOMATO:8,FLOWER:9,GRILLED_FISH:10,HERB_GRILLED_FISH:11,SEAFOOD_PLATTER:12,TOMATO_SALAD:13,chest:19};

export function inventoryItems(data,{category='all',query='',sort='recent',collection=false}={}){
  const entries=new Map((data?.inventoryAcquisitions||[]).map(item=>[item.itemId,item]));
  const quantities=new Map((data?.inventory||[]).map(item=>[item.itemId,item.quantity]));
  const discoveries=new Map((data?.discoveries||[]).map(item=>[item.itemId,item]));
  const items=(data?.catalog||[]).filter(item=>(collection?item.category==='fish':(quantities.get(item.itemId)||0)>0)&&(category==='all'||item.category===category)&&item.name.includes(query.trim())).map(item=>({...item,quantity:quantities.get(item.itemId)||0,discovery:discoveries.get(item.itemId),acquiredAt:entries.get(item.itemId)?.lastAcquiredAt||discoveries.get(item.itemId)?.discoveredAt||0}));
  return items.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'ko'):sort==='quantity'?b.quantity-a.quantity:sort==='rarity'?(['special','rare','uncommon','common'].indexOf(a.rarity)-['special','rare','uncommon','common'].indexOf(b.rarity)):b.acquiredAt-a.acquiredAt);
}

export function spritePosition(id){
  const cell=inventorySprites[id];
  return cell===undefined?null:{backgroundPosition:`${cell%5*25}% ${Math.floor(cell/5)*100/3}%`};
}
