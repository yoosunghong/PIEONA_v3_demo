import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,existsSync,rmSync} from 'node:fs';
const revision=process.env.GITHUB_SHA||process.argv[2];
if(!/^[a-f0-9]{40}$/.test(revision||''))throw Error('Set GITHUB_SHA or pass full commit SHA');
if(!existsSync('dist/index.html'))throw Error('Build the frontend first');
if(existsSync('release.json'))throw Error('Remove the stale release.json before packaging');
mkdirSync('artifacts',{recursive:true});
writeFileSync('release.json',JSON.stringify({revision,builtAt:new Date().toISOString(),nodeMajor:24})+'\n');
try{execFileSync('tar',['-czf','artifacts/pieona-release.tar.gz','package.json','package-lock.json','release.json','server','shared','dist','resource','deploy/start-release.mjs'],{stdio:'inherit'});}finally{rmSync('release.json');}
console.log('Release package created; database, .env and node_modules excluded.');
