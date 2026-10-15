import { spawn } from 'node:child_process';
const children = [spawn(process.execPath, ['--watch', 'server/index.mjs'], { stdio: 'inherit' }), spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' })];
function stop() { children.forEach(c => c.kill()); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
children.forEach(c => c.on('exit', () => { stop(); process.exit(); }));
