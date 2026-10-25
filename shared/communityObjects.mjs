import {validPlacement} from './world.mjs';
import {villageSign} from './sign.mjs';
import {villageGuestbook} from './guestbook.mjs';
import {villageScenery} from './scenery.mjs';

export const POLLBOX_ID='village-pollbox',CHALKBOARD_ID='village-chalkboard';
export const communityDefinitions=[{id:POLLBOX_ID,key:'pollbox',name:'마을 투표함',x:2.6,z:3.3},{id:CHALKBOARD_ID,key:'chalkboard',name:'마을 칠판',x:4.5,z:-4.25}];
export const isCommunityObject=id=>communityDefinitions.some(item=>item.id===id);
// The wider board needs room at either side, including after a quarter turn.
export const objectClearance=(a,b)=>[a,b].some(id=>/^scenery:(central-stage|stage-stone-|path-stone-)/.test(id))?0:a===CHALKBOARD_ID||b===CHALKBOARD_ID?.8:.4;
export function communityPlacements(village={}){
  const occupied=[...(village.items||[]),villageSign(village),villageGuestbook(village),...villageScenery(village)];
  return communityDefinitions.map(def=>{
    let placement={x:def.x,z:def.z,rotation:0,hidden:false,...village[def.key]};
    if(!village[def.key]){
      const free=(x,z)=>validPlacement(x,z,village.scenery)&&occupied.every(item=>item.hidden||Math.hypot(x-item.x,z-item.z)>=objectClearance(def.id,item.id));
      if(!free(placement.x,placement.z)){
        const candidates=[];
        for(let x=-5.5;x<=5.5;x+=.25)for(let z=-5.5;z<=5.5;z+=.25)if(free(x,z))candidates.push({x,z});
        candidates.sort((a,b)=>Math.hypot(a.x-def.x,a.z-def.z)-Math.hypot(b.x-def.x,b.z-def.z));
        if(candidates.length)placement={...placement,...candidates[0]};
      }
    }
    const item={...placement,id:def.id,type:def.key,name:def.name};occupied.push(item);return item;
  });
}
