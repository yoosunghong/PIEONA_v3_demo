import {execFileSync} from 'node:child_process';
import {mkdirSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'artifacts');
mkdirSync(output,{recursive:true});
const archive=resolve(output,'pieona-oracle.tar.gz');
const entries=['package.json','package-lock.json','server','shared','dist','resource','deploy'];
for(const entry of entries)if(!existsSync(resolve(root,entry)))throw new Error(`Missing ${entry}; run npm run build first.`);
if(!existsSync(resolve(root,'dist/index.html')))throw new Error('Missing dist/index.html');
// Explicit allowlist: never package .env, local databases, logs or node_modules.
execFileSync('tar',['-czf',archive,...entries],{cwd:root,stdio:'inherit'});
console.log(`Created ${archive}\nNo credentials or player database included. Transfer a database snapshot separately.`);
