// PNGs live in IndexedDB rather than the small, synchronous localStorage quota.
// The UI lists only photos keyed to the signed-in avatar ID.
let database;
function openDatabase(){
  if(!database)database=new Promise((resolve,reject)=>{
    const request=indexedDB.open('pieona-photo-album',1);
    request.onupgradeneeded=()=>{
      const store=request.result.createObjectStore('photos',{keyPath:['ownerId','id']});
      store.createIndex('owner','ownerId');
    };
    request.onsuccess=()=>{
      const db=request.result;db.onversionchange=()=>{db.close();database=undefined;};resolve(db);
    };
    request.onerror=()=>{database=undefined;reject(request.error);};
    request.onblocked=()=>{database=undefined;reject(new Error('다른 탭의 보관함을 닫고 다시 시도해 주세요.'));};
  });
  return database;
}

async function transaction(mode,operation){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('photos',mode),request=operation(tx.objectStore('photos'));
    tx.oncomplete=()=>resolve(request.result);
    tx.onerror=()=>reject(tx.error||request.error);
    tx.onabort=()=>reject(tx.error||new Error('사진 보관을 완료하지 못했어요.'));
  });
}

export async function listCaptures(ownerId){
  const rows=await transaction('readonly',store=>store.index('owner').getAll(ownerId));
  return rows.map(({ownerId:ignored,...photo})=>photo);
}
export function saveCapture(ownerId,photo){return transaction('readwrite',store=>store.put({...photo,ownerId}));}
export function deleteCapture(ownerId,id){return transaction('readwrite',store=>store.delete([ownerId,id]));}
