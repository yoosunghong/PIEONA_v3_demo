import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,mkdtemp,copyFile,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
async function until(check,description,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await delay(100);}throw new Error(`Timed out: ${description}`);}
async function fixture(){
  const parent=join(root,'test-results');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'console-'));
  for(const sub of ['scripts','logs','node_modules','dist'])await mkdir(join(dir,sub));
  for(const file of ['scripts/start.ps1','scripts/stop.ps1','scripts/console-lifetime.cs','scripts/serve.mjs','start-server.bat'])await copyFile(join(root,file),join(dir,file));
  await writeFile(join(dir,'.env'),'');await writeFile(join(dir,'dist/index.html'),'<p>Isolated launcher test</p>');
  // Exercise the real batch/PowerShell/supervisor with a small HTTP child.
  // Actual gameplay and action logging are covered by action-log.test.mjs.
  await writeFile(join(dir,'scripts/run-server.mjs'),`import {createServer} from 'node:http';import {createActionLogger} from ${JSON.stringify(pathToFileURL(join(root,'server/actionLog.mjs')).href)};const log=createActionLogger();createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/api/auth/register'){log('test-player','register');res.statusCode=201;}res.end(JSON.stringify({ok:true,app:'pieona'}));}).listen(Number(process.env.PORT),'127.0.0.1',()=>console.log('Isolated server ready'));`);
  // A harmless tunnel stand-in with a grandchild validates the complete process tree.
  await writeFile(join(dir,'scripts/run-tunnel.mjs'),`import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});writeFileSync('logs/grandchild.pid',String(c.pid));setInterval(()=>{},1000);`);
  const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
  const cmd=spawn('cmd.exe',['/d','/c','start-server.bat -SkipBuild'],{cwd:dir,windowsHide:true,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATABASE_PATH:':memory:',GEMINI_API_KEY:''},stdio:['pipe','pipe','pipe']});
  let output='';cmd.stdout.on('data',c=>output+=c);cmd.stderr.on('data',c=>output+=c);cmd.on('error',e=>output+=e.message);
  const pids={cmd:cmd.pid};
  const cleanup=async()=>{
    cmd.kill();
    for(const kind of ['console','server','tunnel','grandchild'])try{const pid=Number(await readFile(join(dir,`logs/${kind}.pid`),'utf8'));if(alive(pid))process.kill(pid);}catch{}
    await until(()=>!alive(cmd.pid),'test CMD cleanup',10000);
    assert.equal(dirname(dir),parent);await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200});
  };
  try{
    await until(async()=>{try{pids.grandchild=Number(await readFile(join(dir,'logs/grandchild.pid'),'utf8'));return pids.grandchild>0;}catch{if(cmd.exitCode!==null||output.includes('Server startup failed'))throw new Error(output);return false;}},'launcher ready',180000);
    for(const kind of ['console','server','tunnel'])pids[kind]=Number(await readFile(join(dir,`logs/${kind}.pid`),'utf8'));
    return {dir,cmd,pids,port,output:()=>output,cleanup};
  }catch(error){for(const name of ['server.log','server-error.log'])try{output+=await readFile(join(dir,'logs',name),'utf8');}catch{}await cleanup();throw new Error(`${error.message}\n${output}`);}
}

for(const target of ['cmd','console','server'])test(`Windows launcher terminates server and tunnel descendants when ${target} exits`,{skip:process.platform!=='win32',timeout:240000},async()=>{
  const f=await fixture();
  try{
    const url=`http://127.0.0.1:${f.port}`;
    assert.equal((await (await fetch(url+'/api/health')).json()).ok,true);
    const response=await fetch(url+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'launcher_test',password:'launcher-private-password'})});assert.equal(response.status,201);
    await until(()=>f.output().includes('"action":"register"'),'console action output');
    await until(async()=>{try{return (await readFile(join(f.dir,'logs/server.log'),'utf8')).includes('"action":"register"');}catch{return false;}},'file action output');
    assert.doesNotMatch(f.output(),/launcher-private-password/);
    process.kill(f.pids[target]);
    await until(()=>['console','server','tunnel','grandchild'].every(kind=>!alive(f.pids[kind])),'entire job tree stopped');
    await assert.rejects(fetch(url+'/api/health',{signal:AbortSignal.timeout(1000)}));
  }finally{await f.cleanup();}
});
