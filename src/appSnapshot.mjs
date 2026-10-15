// Optional features must not prevent the account and people list from loading.
export async function loadAppSnapshot(request){
  const paths=['/me','/users','/survey/status'];
  const results=await Promise.allSettled(paths.map(path=>request(path)));
  const snapshot={errors:[]};
  results.forEach((result,index)=>{
    if(result.status==='rejected')snapshot.errors.push({path:paths[index],error:result.reason});
    else snapshot[['me','people','survey'][index]]=result.value;
  });
  return snapshot;
}
