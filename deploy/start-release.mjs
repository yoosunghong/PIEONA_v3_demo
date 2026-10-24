import {readFileSync} from 'node:fs';
const release=JSON.parse(readFileSync(new URL('../release.json',import.meta.url),'utf8'));
if(!/^[a-f0-9]{40}$/.test(release.revision))throw Error('Invalid release revision');
process.env.APP_REVISION=release.revision;
await import('../server/index.mjs');
