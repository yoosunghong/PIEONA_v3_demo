// Dedicated test server. Never loads .env or opens a pre-existing database.
import {createApp} from '../server/app.mjs';
import {existsSync,mkdirSync,appendFileSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {monitorEventLoopDelay} from 'node:perf_hooks';

const database=process.env.LOAD_TEST_DATABASE;
if(!database)throw Error('Set LOAD_TEST_DATABASE to a NEW disposable SQLite path');
if(existsSync(database))throw Error('Refusing an existing database');
mkdirSync(dirname(resolve(database)),{recursive:true});
process.env.DATABASE_PATH=resolve(database);
process.env.GEMINI_API_KEY='';
process.env.HOST='127.0.0.1';
const port=Number(process.env.LOAD_TEST_PORT||5300);
process.env.PUBLIC_ORIGIN=process.env.LOAD_TEST_ORIGIN||`http://127.0.0.1:${port}`;
const metrics=resolve(dirname(database),'server-metrics.jsonl');
if(existsSync(metrics))throw Error('Use a new directory for each run');
const delay=monitorEventLoopDelay({resolution:20});delay.enable();
let cpu=process.cpuUsage(),sampleAt=process.hrtime.bigint();
function sample(){
  const now=process.hrtime.bigint(),next=process.cpuUsage(),memory=process.memoryUsage();
  let system={};
  if(process.platform==='linux'){
    const mem=readFileSync('/proc/meminfo','utf8');
    for(const field of ['MemTotal','MemAvailable','SwapTotal','SwapFree'])system[field+'MiB']=Number(mem.match(new RegExp(`^${field}:\\s+(\\d+)`,'m'))?.[1]||0)/1024;
    system.loadavg=readFileSync('/proc/loadavg','utf8').trim();
    system.vmstat=Object.fromEntries(readFileSync('/proc/vmstat','utf8').trim().split('\n').filter(v=>/^(pswpin|pswpout|oom_kill) /.test(v)).map(v=>{const [k,n]=v.split(' ');return [k,Number(n)];}));
  }
  appendFileSync(metrics,JSON.stringify({at:new Date().toISOString(),pid:process.pid,rssMiB:memory.rss/1048576,heapMiB:memory.heapUsed/1048576,cpuOneCorePercent:100*(next.user-cpu.user+next.system-cpu.system)/(Number(now-sampleAt)/1000),eventLoopP95Ms:delay.percentile(95)/1e6,eventLoopMaxMs:delay.max/1e6,...system})+'\n');
  cpu=next;sampleAt=now;delay.reset();
}
const runtime=createApp();
runtime.server.listen(port,'127.0.0.1',()=>console.log(`Dedicated load-test server: ${port}; metrics: ${metrics}`));
sample();const timer=setInterval(sample,2000);
let closing=false;
async function close(){if(closing)return;closing=true;clearInterval(timer);sample();await runtime.close();delay.disable();}
process.on('SIGINT',()=>close().then(()=>process.exit()));process.on('SIGTERM',()=>close().then(()=>process.exit()));
