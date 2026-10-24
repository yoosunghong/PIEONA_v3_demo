import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readlinkSync,readdirSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:http';
import {deployRelease,validRevision,waitForHealth} from '../deploy/release-manager.mjs';
import {databaseAdmin} from '../deploy/db-admin.mjs';

const old='a'.repeat(40),next='b'.repeat(40);
test('deployment accepts only full commit IDs',()=>{
  assert.ok(validRevision(next));for(const value of ['main','../../etc/passwd','b'.repeat(39),next+';id','B'.repeat(40)])assert.equal(validRevision(value),false);
});
test('health gates deployment on the exact running revision',async()=>{
  let revision=old;const server=createServer((req,res)=>res.end(JSON.stringify({ok:true,revision})));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}`;
  try{await assert.rejects(waitForHealth(url,next,1),/health check failed/);revision=next;await waitForHealth(url,next,1);}finally{await new Promise(r=>server.close(r));}
});
function fixture(){
  const directory=mkdtempSync(join(tmpdir(),'pieona-deploy-')),root=join(directory,'releases-root'),data=join(directory,'data');mkdirSync(data);mkdirSync(join(root,'releases'),{recursive:true});
  const db=new DatabaseSync(join(data,'pieona.sqlite'));db.exec('CREATE TABLE marker(value); INSERT INTO marker VALUES(42)');db.close();
  function source(revision){
    const path=join(directory,revision);mkdirSync(path);
    for(const file of ['server/index.mjs','deploy/start-release.mjs','dist/index.html','package.json','package-lock.json']){mkdirSync(join(path,file,'..'),{recursive:true});writeFileSync(join(path,file),'{}');}
    writeFileSync(join(path,'release.json'),JSON.stringify({revision}));return path;
  }
  const previous=source(old);execFileSync('cp',['-a',previous,join(root,'releases',old)]);symlinkSync(join(root,'releases',old),join(root,'current'));
  let stopCalls=0,startCalls=0;
  const config={root,python:'python3',extractor:resolve('deploy/extract-release.py')};
  const controls={prepare(){},stop(){stopCalls++;},start(){startCalls++;},backup(revision){return databaseAdmin(data,'backup',revision);},restore(token){databaseAdmin(data,'restore',token);},async health(){}};
  // tar adds './'; use explicit roots to match production packaging.
  function release(path){const file=join(directory,'release.tar.gz');execFileSync('tar',['-czf',file,'-C',path,'server','deploy','dist','package.json','package-lock.json','release.json']);return file;}
  return {directory,root,data,config,controls,source,release,calls:()=>({stopCalls,startCalls}),close(){rmSync(directory,{recursive:true,force:true});}};
}
test('a healthy release switches atomically and redeploy is idempotent',{skip:process.platform!=='linux'},async()=>{
  const f=fixture();try{const archive=f.release(f.source(next));const result=await deployRelease(f.config,next,archive,f.controls);assert.equal(result.status,'deployed');assert.equal(readlinkSync(join(f.root,'current')),join(f.root,'releases',next));assert.equal(f.calls().stopCalls,1);await deployRelease(f.config,next,archive,f.controls);assert.equal(f.calls().stopCalls,1);}finally{f.close();}
});
test('failed release restores previous code AND SQLite schema while preserving failed DB',{skip:process.platform!=='linux'},async()=>{
  const f=fixture();try{
    f.controls.start=()=>{if(readlinkSync(join(f.root,'current')).endsWith(next)){const db=new DatabaseSync(join(f.data,'pieona.sqlite'));db.exec('ALTER TABLE marker ADD COLUMN changed; UPDATE marker SET value=99');db.close();}};
    f.controls.health=async revision=>{if(revision===next)throw Error('broken app');};
    await assert.rejects(deployRelease(f.config,next,f.release(f.source(next)),f.controls),/recovery=rolled-back/);
    assert.equal(readlinkSync(join(f.root,'current')),join(f.root,'releases',old));
    const db=new DatabaseSync(join(f.data,'pieona.sqlite'));assert.equal(db.prepare('SELECT value FROM marker').get().value,42);assert.equal(db.prepare('PRAGMA table_info(marker)').all().length,1);db.close();
    assert.ok(readdirSync(join(f.data,'backups')).some(name=>name.startsWith('failed-')));
    assert.match(readFileSync(join(f.root,'deployments.jsonl'),'utf8'),/rolled-back/);
  }finally{f.close();}
});
test('unsafe symlink archive and wrong revision fail before stopping service',{skip:process.platform!=='linux'},async()=>{
  const f=fixture();try{
    const source=f.source(next);symlinkSync('/etc/passwd',join(source,'server','escape'));
    await assert.rejects(deployRelease(f.config,next,f.release(source),f.controls));assert.equal(f.calls().stopCalls,0);rmSync(join(source,'server','escape'));
    writeFileSync(join(source,'release.json'),JSON.stringify({revision:old}));await assert.rejects(deployRelease(f.config,next,f.release(source),f.controls),/revision/);assert.equal(f.calls().stopCalls,0);
  }finally{f.close();}
});
