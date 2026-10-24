import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,existsSync,chmodSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

const [sourceArg,destinationArg]=process.argv.slice(2);
if(!sourceArg||!destinationArg)throw new Error('Usage: node deploy/backup-db.mjs SOURCE.sqlite NEW-SNAPSHOT.sqlite');
const source=resolve(sourceArg),destination=resolve(destinationArg);
if(!existsSync(source))throw new Error('Source database does not exist');
if(existsSync(destination))throw new Error('Destination already exists; choose a new snapshot filename');
mkdirSync(dirname(destination),{recursive:true});
// VACUUM INTO includes committed WAL data and produces a standalone snapshot.
const db=new DatabaseSync(source);
try {
  db.exec('PRAGMA busy_timeout=30000');
  db.prepare('VACUUM INTO ?').run(destination);
}finally{db.close();}
if(process.platform!=='win32')chmodSync(destination,0o600);
const check=new DatabaseSync(destination,{readOnly:true});
try {
  const result=check.prepare('PRAGMA integrity_check').get();
  if(Object.values(result)[0]!=='ok')throw new Error('Snapshot integrity check failed');
}finally{check.close();}
console.log(`Snapshot verified: ${destination}`);
