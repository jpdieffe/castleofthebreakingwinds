import { spawn } from 'node:child_process';
const children = [spawn(process.execPath, ['server/index.ts'], { stdio: 'inherit' }), spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'], { stdio: 'inherit' })];
let stopping = false;
function stop() { if (stopping) return; stopping = true; children.forEach(p => p.kill()); }
children.forEach(p => p.on('exit', () => { stop(); }));
process.on('SIGINT', stop); process.on('SIGTERM', stop);
