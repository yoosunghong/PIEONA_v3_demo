// Root-owned fixed-path helper. Called as the application user through narrow sudo rules.
import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync,copyFileSync,renameSync,chmodSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
function inspect(file){const db=new DatabaseSync(file,{readOnly:true});try{if(Object.values(db.prepare('PRAGMA integrity_check').get())[0]!=='ok')throw Error('Database integrity check failed');}finally{db.close();}}
export function databaseAdmin(root,operation,argument){
const database=join(root,'pieona.sqlite'),backups=join(root,'backups');
mkdirSync(backups,{recursive:true,mode:0o700});
if(operation==='backup'){
  if(!/^[a-f0-9]{40}$/.test(argument||''))throw Error('Invalid revision');
  if(!existsSync(database)){return 'none';}
  else{
    const filename=Date.now()+'-'+argument+'.sqlite',target=join(backups,filename);
    const db=new DatabaseSync(database);try{db.exec('PRAGMA busy_timeout=30000');db.prepare('VACUUM INTO ?').run(target);}finally{db.close();}
    chmodSync(target,0o600);inspect(target);return filename;
  }
}else if(operation==='restore'){
  if(argument!=='none'&&!/^\d{13}-[a-f0-9]{40}\.sqlite$/.test(argument||''))throw Error('Invalid backup token');
  if(argument!=='none')inspect(join(backups,argument));
  const quarantine=join(backups,'failed-'+Date.now());
  for(const suffix of ['','-wal','-shm'])if(existsSync(database+suffix))renameSync(database+suffix,quarantine+suffix);
  if(argument!=='none'){copyFileSync(join(backups,argument),database);chmodSync(database,0o600);}
}else{throw Error('Use backup REVISION or restore TOKEN');}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=databaseAdmin('/var/lib/pieona',...process.argv.slice(2));if(result)console.log(result);
}
