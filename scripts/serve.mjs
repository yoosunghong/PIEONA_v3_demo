import {spawn} from 'node:child_process';
import {createWriteStream,writeFileSync,readFileSync,unlinkSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import dotenv from 'dotenv';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
dotenv.config();
mkdirSync('logs',{recursive:true});
const children=[],streams=[];
let stopping=false;
function launch(kind){
  const child=spawn(process.execPath,[resolve(root,`scripts/run-${kind}.mjs`)],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  children.push({kind,child});
  console.log(`[launcher] Starting ${kind} (PID ${child.pid||'pending'}).`);
  if(child.pid)writeFileSync(`logs/${kind}.pid`,String(child.pid));
  for(const [source,target,suffix] of [[child.stdout,process.stdout,''],[child.stderr,process.stderr,'-error']]){
    const log=createWriteStream(`logs/${kind}${suffix}.log`,{flags:'a'});streams.push(log);
    log.on('error',error=>{console.error(`[launcher] Cannot write ${kind} log: ${error.code}`);stop(1);});
    source.on('data',chunk=>{target.write(chunk);if(!stopping)log.write(chunk);});
  }
  child.on('error',error=>{console.error(`[launcher] ${kind} failed: ${error.code}`);stop(1);});
  child.on('exit',code=>{if(!stopping){console.error(`[launcher] ${kind} exited (${code}). Stopping this session.`);stop(code||1);}});
  return child;
}
function stop(code=0){
  if(stopping)return;stopping=true;
  console.log('[launcher] Stopping PIEONA and tunnel.');
  for(const {kind,child} of children){
    child.kill('SIGTERM');
    try{if(readFileSync(`logs/${kind}.pid`,'utf8')===String(child.pid))unlinkSync(`logs/${kind}.pid`);}catch{}
  }
  // PowerShell exiting closes the job, terminating any remaining grandchildren.
  const timeout=setTimeout(()=>process.exit(code),1500);timeout.unref();
  Promise.all(streams.map(stream=>new Promise(r=>{if(stream.destroyed)return r();stream.end(r);}))).then(()=>process.exit(code));
}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
const server=launch('server');
const url=`http://127.0.0.1:${Number(process.env.PORT||3000)}`;
let ready=false;
const deadline=Date.now()+90000;
while(Date.now()<deadline&&!stopping){
  await delay(250);
  if(server.exitCode!==null)break;
  try{const health=await (await fetch(`${url}/api/health`,{signal:AbortSignal.timeout(1000)})).json();if(health.ok&&health.app==='pieona'){ready=true;break;}}catch{}
}
if(!ready){console.error('[launcher] Server startup failed or timed out.');stop(1);}
else if(!stopping){
  console.log(`[launcher] Ready: ${url} | Action logs: logs/server.log`);
  if(existsSync('data/cloudflare/production-on-oracle.json'))console.log('[launcher] Public hosting is on Oracle. Running locally without the production tunnel.');
  else if(!process.argv.includes('--no-tunnel'))launch('tunnel');
}
