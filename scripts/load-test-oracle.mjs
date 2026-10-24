// Run on a separate machine from the server. Uses disposable accounts on a TEST database.
import {io} from 'socket.io-client';
import {randomBytes} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {performance} from 'node:perf_hooks';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>arg.replace(/^--/,'').split('=')));
if(args['allow-test-accounts']!=='yes'||!args.url)throw Error('Usage: node scripts/load-test-oracle.mjs --url=http://127.0.0.1:5300 --allow-test-accounts=yes [--phase-seconds=180] [--output=artifacts/load-test.json]');
const base=new URL(args.url).origin,seconds=Number(args['phase-seconds']||180);
if(!Number.isFinite(seconds)||seconds<2||seconds>1800)throw Error('phase-seconds must be 2..1800');
const output=resolve(args.output||'artifacts/oracle-load-test.json');
const users=[],sockets=[],sentTimes=new Map(),report={started:new Date().toISOString(),base,clients:10,phases:[],errors:[]};
let current,cleaning=false;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const record=e=>{if(report.errors.length<100)report.errors.push(String(e?.message||e));if(current)current.errors++;};
const summarize=values=>{const ordered=values.sort((a,b)=>a-b);return {count:ordered.length,p50:ordered[Math.floor(ordered.length*.5)]??null,p95:ordered[Math.min(ordered.length-1,Math.floor(ordered.length*.95))]??null,max:ordered.at(-1)??null};};
async function request(path,user,body){
  const response=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{Origin:base,...(body?{'Content-Type':'application/json'}:{}),...(user?{Cookie:user.cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
  const data=await response.json();if(!response.ok)throw Error(`${path}: ${response.status} ${data.error||''}`);
  return {data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function ack(socket,event,data){
  const t=performance.now();const result=await socket.timeout(5000).emitWithAck(event,data);
  if(!result?.ok)throw Error(`${event}: ${result?.error||'rejected'}`);
  if(current)current.ackMs.push(performance.now()-t);return result;
}
function event(socket,name){
  return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{socket.off(name,receive);reject(Error(name+' timed out'));},6000);function receive(data){clearTimeout(timeout);resolve(data);}socket.once(name,receive);});
}
async function startPair(index){
  const a=sockets[index],b=sockets[index+1];
  const matches=[event(a,'runner:matched'),event(b,'runner:matched')];
  const invite=await ack(a,'runner:invite',{kind:'volley',userId:users[index+1].id});
  await ack(b,'runner:respond',{inviteId:invite.id,accept:true});
  const matched=await Promise.all(matches),started=[event(a,'runner:started'),event(b,'runner:started')];
  await ack(a,'runner:ready',{id:matched[0].id});await ack(b,'runner:ready',{id:matched[0].id});
  const games=(await Promise.all(started)).map(v=>v.game);
  return {index,games,seq:0,ended:false};
}
async function phase(name,duration,pairCount){
  current={name,started:new Date().toISOString(),durationSeconds:duration,pairs:pairCount,moveSent:0,moveReceived:0,snapshots:0,errors:0,disconnects:0,ackMs:[],healthMs:[],broadcastMs:[]};report.phases.push(current);
  const phaseResult=current,phaseStart=performance.now();let pairs=[];
  console.log(`Starting ${name}: 10 sockets, ${pairCount} volleyball matches, ${10-pairCount*2} walking`);
  try{
    for(let p=0;p<pairCount;p++)pairs.push(await startPair(p*2));
    let lastHealth=0,lastInput=0,lastState=0;
    while(performance.now()-phaseStart<duration*1000){
      const now=performance.now(),elapsed=(now-phaseStart)/1000;
      for(let i=pairCount*2;i<10;i++){
        const x=3*Math.sin(elapsed+i),z=3*Math.cos(elapsed+i);
        sentTimes.set(`${users[i].id}/${x}`,{time:performance.now(),phase:phaseResult});
        sockets[i].emit('village:move',{villageId:users[0].id,x,z,rotation:elapsed,moving:true});phaseResult.moveSent++;
      }
      if(now-lastInput>=100){
        lastInput=now;
        await Promise.all(pairs.flatMap(pair=>pair.ended?[]:pair.games.map((game,j)=>ack(sockets[pair.index+j],'volley:input',{id:game.id,move:Math.sin(elapsed+j)>0?1:-1,jump:Math.floor(elapsed*2)%3===0,spike:Math.floor(elapsed*4)%3===0,seq:++pair.seq}).catch(record))));
      }
      if(now-lastHealth>=2000){lastHealth=now;const t=performance.now();try{await request('/health');phaseResult.healthMs.push(performance.now()-t);}catch(e){record(e);}}
      if(now-lastState>=10000){
        lastState=now;
        for(const pair of pairs){
          try{
            const {data}=await request(`/volley-games/${pair.games[0].id}/state`,users[pair.index]);
            if(data.snapshot.ended){
              pair.ended=true;
              for(let j=0;j<2;j++)await request(`/volley-games/${pair.games[j].id}/finish`,users[pair.index+j],{});
              for(let j=0;j<2;j++)await ack(sockets[pair.index+j],'runner:leave',{});
              Object.assign(pair,await startPair(pair.index));
            }
          }catch(e){record(e);}
        }
      }
      // Bound timestamp memory in the load generator, not the server.
      for(const [key,v] of sentTimes)if(performance.now()-v.time>10000)sentTimes.delete(key);
      await pause(Math.max(1,67-(performance.now()-now)));
    }
  }finally{
    for(const pair of pairs)for(let j=0;j<2;j++)try{await ack(sockets[pair.index+j],'runner:leave',{});}catch(e){record(e);}
    phaseResult.actualSeconds=(performance.now()-phaseStart)/1000;
    phaseResult.ackMs=summarize(phaseResult.ackMs);phaseResult.healthMs=summarize(phaseResult.healthMs);phaseResult.broadcastMs=summarize(phaseResult.broadcastMs);
    phaseResult.expectedMoveReceives=phaseResult.moveSent*9;
    console.log(JSON.stringify(phaseResult));current=null;
  }
}
try{
  const password=randomBytes(24).toString('hex'),prefix='load_'+Date.now().toString(36);
  for(let i=0;i<10;i++){
    const result=await request('/auth/register',null,{username:`${prefix}_${i}`,password});
    const user={id:result.data.user.id,cookie:result.cookie};users.push(user);
    const socket=io(base,{transports:['websocket'],extraHeaders:{Cookie:user.cookie,Origin:base},forceNew:true,reconnection:false,timeout:10000});sockets.push(socket);
    await new Promise((r,j)=>{socket.once('connect',r);socket.once('connect_error',j);});
    socket.on('disconnect',reason=>{if(!cleaning){if(current)current.disconnects++;record('disconnect: '+reason);}});
    socket.on('village:move',data=>{if(data.actorKind==='PET')return;const sent=sentTimes.get(`${data.userId}/${data.x}`);if(current&&sent?.phase===current){current.moveReceived++;current.broadcastMs.push(performance.now()-sent.time);}});
    socket.on('volley:snapshot',()=>{if(current)current.snapshots++;});
    await ack(socket,'village:join',{villageId:users[0].id});
  }
  const members=await ack(sockets[0],'village:join',{villageId:users[0].id});
  if(members.members.filter(m=>m.actorKind!=='PET').length!==10)throw Error('Expected 10 distinct players in village');
  await phase('all-moving',Math.min(seconds,60),0);
  await phase('mixed-4-moving-6-playing',seconds,3);
  await phase('all-playing-5-matches',seconds,5);
}catch(e){record(e);process.exitCode=1;}
finally{
  cleaning=true;for(const socket of sockets)socket.disconnect();
  report.finished=new Date().toISOString();report.status=report.errors.length?'errors':'completed';
  mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2));console.log(`Report: ${output}`);
  if(report.errors.length)process.exitCode=1;
}
