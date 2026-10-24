import {isLifeScenery} from '../shared/lifeLayout.mjs';
import {decorations,remainingDecoration,decorationQuantity} from '../shared/world.mjs';
import {isScenery} from '../shared/scenery.mjs';
import {SIGN_ID} from '../shared/sign.mjs';
import {GUESTBOOK_ID} from '../shared/guestbook.mjs';

export function fixedCatalogKey(item){
  return isScenery(item.id)?'scenery:'+item.name:item.id;
}

function sceneryCategory(item){
  if(isLifeScenery(item.id))return 'furniture';
  if(/tree|bush/.test(item.id))return 'plants';
  if(item.id==='scenery:cafe')return 'buildings';
  if(item.id.startsWith('scenery:lamp-'))return 'lighting';
  if(/scenery:(table|bench)-/.test(item.id))return 'furniture';
  return 'decor';
}

// Catalog membership and order never depend on storage state or usage history.
export function villageCatalog(items,rewards=[]){
  const catalog=decorations.map(item=>({...item,key:item.id,total:decorationQuantity(item,rewards),remaining:remainingDecoration(items,item.id,rewards)}));
  const groups=new Map();
  for(const item of items){
    if(!isScenery(item.id)&&item.id!==SIGN_ID&&item.id!==GUESTBOOK_ID)continue;
    const key=fixedCatalogKey(item);
    if(!groups.has(key))groups.set(key,{key,id:item.id,name:isScenery(item.id)?item.name:item.id===SIGN_ID?'마을 팻말':'마을 방명록',category:isScenery(item.id)?sceneryCategory(item):'other',fixed:true,total:0,remaining:0,storedIds:[]});
    const group=groups.get(key);group.total++;
    if(item.hidden){group.remaining++;group.storedIds.push(item.id);}
  }
  return [...catalog,...groups.values()];
}

export function filterVillageCatalog(catalog,{category='all',query='',sort=false,recent=[]}={}){
  let result=catalog.filter(item=>(category==='all'||category==='recent'&&recent.includes(item.key)||category===item.category)&&item.name.includes(query.trim()));
  if(category==='recent')result.sort((a,b)=>recent.indexOf(a.key)-recent.indexOf(b.key));
  else if(sort)result.sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  return result;
}

export const rememberDecoration=(recent,key)=>[key,...recent.filter(entry=>entry!==key)].slice(0,50);
