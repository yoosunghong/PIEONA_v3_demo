// Serialize writes and keep only the newest pending wardrobe snapshot.
// An in-flight save always finishes before a newer selection reaches the server.
export function createAppearanceAutosave({save,onStatus=()=>{},onSaved=()=>{},onError=()=>{}}){
  let pending=null,running=null,failed=null;
  async function drain(){
    while(pending){
      const snapshot=pending;pending=null;
      try{await save(snapshot);failed=null;}
      catch(error){
        if(pending)continue;
        failed=snapshot;onStatus('error');onError(error);return;
      }
      if(!pending){
        onStatus('saved');
        await onSaved();
      }
    }
  }
  function enqueue(snapshot){
    pending=snapshot;failed=null;onStatus('saving');
    if(!running)running=drain().finally(()=>{running=null;});
    return running;
  }
  return {enqueue,flush:async()=>{while(running)await running;return !failed;},retry:()=>failed?enqueue(failed):running};
}

// Player outfits and pet cosmetics use separate endpoints. Coalesce only within
// a subject, so changing tabs while a request is in flight cannot discard it.
export function createWardrobeAutosave(options){
  const queues=new Map(),statuses=new Map();
  function queue(subject){
    if(!queues.has(subject))queues.set(subject,createAppearanceAutosave({...options,onStatus:status=>{
      statuses.set(subject,status);
      options.onStatus?.([...statuses.values()].includes('error')?'error':[...statuses.values()].includes('saving')?'saving':'saved');
    }}));
    return queues.get(subject);
  }
  return {enqueue:snapshot=>queue(snapshot.pet?'pet':'player').enqueue(snapshot),retry:()=>Promise.all([...queues.values()].map(q=>q.retry())),flush:async()=> (await Promise.all([...queues.values()].map(q=>q.flush()))).every(Boolean)};
}
