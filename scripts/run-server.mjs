import { fileURLToPath } from 'node:url';
import { dirname,resolve } from 'node:path';
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
await import('../server/index.mjs');
