import {validPlacement} from './world.mjs';
import {villageSign,signCameraView} from './sign.mjs';

export const GUESTBOOK_ID='village-guestbook';
export const GUESTBOOK_PAGE_SIZE=4;
export const GUESTBOOK_MAX_LENGTH=200;
export const guestbookLength=text=>Array.from(text).length;
export const defaultGuestbook={x:2,z:4.25,rotation:0};
export function villageGuestbook(village){
  if(village?.guestbook)return {...defaultGuestbook,...village.guestbook};
  const occupied=[...(village?.items||[]),villageSign(village)];
  const free=(x,z)=>validPlacement(x,z)&&occupied.every(item=>Math.hypot(item.x-x,item.z-z)>=.8);
  if(free(defaultGuestbook.x,defaultGuestbook.z))return {...defaultGuestbook};
  const candidates=[];
  for(let x=-5.5;x<=5.5;x+=.25)for(let z=-5.5;z<=5.5;z+=.25)if(free(x,z))candidates.push({x,z});
  candidates.sort((a,b)=>Math.hypot(a.x-defaultGuestbook.x,a.z-defaultGuestbook.z)-Math.hypot(b.x-defaultGuestbook.x,b.z-defaultGuestbook.z));
  return {...defaultGuestbook,...candidates[0]};
}
export const guestbookPlacementItem=book=>({id:GUESTBOOK_ID,type:'villageGuestbook',x:book.x,z:book.z,rotation:book.rotation});
export const guestbookCameraView=book=>signCameraView(book);
