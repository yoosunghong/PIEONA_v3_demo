import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from './api';

export function useStarWorld(ownerId,starId,fallback,socket,notify,enabled=true){
  const [saved,setSaved]=useState(null),sequence=useRef(0),context=useRef();
  context.current={ownerId,starId};
  const load=useCallback(async(destination=context.current.starId,owner=context.current.ownerId)=>{
    if(!enabled||!owner)return;const request=++sequence.current;
    const result=await api(`/users/${owner}/stars/${encodeURIComponent(destination)}/world`);
    if(request===sequence.current)setSaved({ownerId:owner,starId:destination,village:result.village});
    return result;
  },[enabled]);
  useEffect(()=>{
    if(!ownerId||!enabled)return;
    const update=()=>load().catch(e=>notify(e.message));update();
    socket?.on('world:changed',update);socket?.on('connect',update);
    return()=>{sequence.current++;socket?.off('world:changed',update);socket?.off('connect',update);};
  },[ownerId,starId,socket,load,enabled,notify]);
  return {load,village:!enabled||starId==='plaza'?fallback:saved?.ownerId===ownerId&&saved.starId===starId?saved.village:{theme:fallback?.theme||'milkyway',items:[]}};
}
