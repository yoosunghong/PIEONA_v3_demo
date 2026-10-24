import {createWriteStream,existsSync,mkdirSync,mkdtempSync,readFileSync,readlinkSync,renameSync,rmSync,symlinkSync,appendFileSync,readdirSync,statSync,statfsSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';

export const validRevision=value=>/^[a-f0-9]{40}$/.test(value);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function manifest(directory,revision){
  const value=JSON.parse(readFileSync(join(directory,'release.json'),'utf8'));
  if(value.revision!==revision)throw Error('Archive revision does not match requested commit');
  for(const file of ['server/index.mjs','package.json','package-lock.json','dist/index.html','deploy/start-release.mjs'])if(!existsSync(join(directory,file)))throw Error('Incomplete release: '+file);
}
export async function waitForHealth(url,revision,attempts=30){
  for(let i=0;i<attempts;i++){
    try{const response=await fetch(url,{signal:AbortSignal.timeout(2000)});const data=await response.json();if(response.ok&&data.ok&&data.revision===revision)return;}catch{}
    await wait(1000);
  }
  throw Error('Release health check failed: '+revision);
}
export function productionControls(config){
  const call=(command,args,options={})=>execFileSync(command,args,{stdio:['ignore','pipe','inherit'],encoding:'utf8',timeout:120000,...options});
  return {
    prepare(directory){call(config.npm,['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:directory,env:{...process.env,NODE_ENV:'production',PATH:dirname(config.node)+':'+process.env.PATH},stdio:'inherit'});},
    stop(){call('/usr/bin/sudo',['-n','/usr/bin/systemctl','stop',config.service]);},
    start(){call('/usr/bin/sudo',['-n','/usr/bin/systemctl','start',config.service]);},
    backup(revision){return call('/usr/bin/sudo',['-n','-u','pieona',config.node,'/usr/local/libexec/pieona-db-admin.mjs','backup',revision]).trim();},
    restore(token){call('/usr/bin/sudo',['-n','-u','pieona',config.node,'/usr/local/libexec/pieona-db-admin.mjs','restore',token]);},
    health(revision){return waitForHealth(config.healthUrl,revision);},
  };
}
function pointCurrent(root,target){
  const temporary=join(root,'.current-'+randomUUID());symlinkSync(target,temporary);renameSync(temporary,join(root,'current'));
}
export async function deployRelease(config,revision,archive,controls=productionControls(config)){
  if(!validRevision(revision))throw Error('Revision must be a full 40-character commit SHA');
  const root=resolve(config.root),releases=join(root,'releases'),destination=join(releases,revision),current=join(root,'current');
  mkdirSync(releases,{recursive:true});
  let previous=null;
  try{previous=resolve(dirname(current),readlinkSync(current));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(previous&&(dirname(previous)!==releases||!validRevision(basename(previous))))throw Error('Current release is outside the managed release directory');
  if(previous===destination){manifest(destination,revision);await controls.health(revision);return {revision,status:'already-current'};}
  if(existsSync(destination)){manifest(destination,revision);if(!existsSync(join(destination,'.prepared')))throw Error('Incomplete existing release');}
  else{
    const staging=mkdtempSync(join(root,'.staging-'));
    try{
      execFileSync(config.python||'python3',[config.extractor||fileURLToPath(new URL('./extract-release.py',import.meta.url)),archive,staging],{stdio:'inherit'});
      manifest(staging,revision);controls.prepare(staging);
      writeFileSync(join(staging,'.prepared'),revision+'\n');renameSync(staging,destination);
    }catch(error){rmSync(staging,{recursive:true,force:true});throw error;}
  }
  const receipt={revision,previousRevision:previous?basename(previous):null,started:new Date().toISOString()};
  let token,stopped=false,activated=false;
  try{
    controls.stop();stopped=true;token=controls.backup(revision);receipt.backup=token;
    pointCurrent(root,destination);activated=true;controls.start();await controls.health(revision);
    receipt.status='deployed';
  }catch(error){
    receipt.error=error.message;receipt.status='failed';
    try{
      if(activated){controls.stop();controls.restore(token);if(previous)pointCurrent(root,previous);else rmSync(current);}
      if(stopped&&previous){controls.start();await controls.health(basename(previous));receipt.status='rolled-back';}
    }catch(rollbackError){receipt.rollbackError=rollbackError.message;receipt.status='rollback-failed';}
    appendFileSync(join(root,'deployments.jsonl'),JSON.stringify({...receipt,finished:new Date().toISOString()})+'\n');
    throw Error(`${error.message}; recovery=${receipt.status}${receipt.rollbackError?'; '+receipt.rollbackError:''}`);
  }
  appendFileSync(join(root,'deployments.jsonl'),JSON.stringify({...receipt,finished:new Date().toISOString()})+'\n');
  const keep=new Set([revision,...readdirSync(releases).filter(validRevision).filter(v=>v!==revision).sort((a,b)=>statSync(join(releases,b)).mtimeMs-statSync(join(releases,a)).mtimeMs).slice(0,2)]);
  for(const name of readdirSync(releases).filter(validRevision))if(!keep.has(name)&&dirname(join(releases,name))===releases)rmSync(join(releases,name),{recursive:true,force:true});
  return receipt;
}
async function main(){
  const config=JSON.parse(readFileSync('/etc/pieona/deploy.json','utf8'));
  const match=/^deploy ([a-f0-9]{40})$/.exec(process.env.SSH_ORIGINAL_COMMAND||'');
  if(!match)throw Error('This key accepts only: deploy <full commit SHA>');
  const space=statfsSync(config.root);if(space.bavail*space.bsize<3*1024**3)throw Error('At least 3 GiB free disk space required');
  const incoming=join(config.root,'incoming');mkdirSync(incoming,{recursive:true});
  const archive=join(incoming,randomUUID()+'.tar.gz');let received=0;
  try{
    await pipeline(process.stdin,new Transform({transform(chunk,encoding,callback){received+=chunk.length;callback(received>1024**3?Error('Upload exceeds 1 GiB'):null,chunk);}}),createWriteStream(archive,{flags:'wx',mode:0o600}));
    console.log(JSON.stringify(await deployRelease(config,match[1],archive)));
  }finally{rmSync(archive,{force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
