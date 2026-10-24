const [origin,revision]=process.argv.slice(2);
const url=new URL('/api/health',origin);
if(url.protocol!=='https:'||url.username||url.password||!/^[a-f0-9]{40}$/.test(revision||''))throw Error('Expected HTTPS origin and full commit SHA');
url.searchParams.set('deployment',revision);
for(let attempt=0;attempt<12;attempt++){
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(5000),cache:'no-store'}),data=await response.json();
    if(response.ok&&data.ok&&data.revision===revision){console.log(`Public HTTPS release verified: ${revision}`);process.exit(0);}
  }catch{}
  await new Promise(r=>setTimeout(r,5000));
}
throw Error('Public endpoint is not serving the expected release');
