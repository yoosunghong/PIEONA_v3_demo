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
  return {enqueue,retry:()=>failed?enqueue(failed):running};
}
