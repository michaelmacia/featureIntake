'use strict';
/*
 * Development: runs the API (node --watch, port 3000) and the Vite dev server (port 5173,
 * proxying /api to the API) together. Open http://localhost:5173. Ctrl+C stops both.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const procs = [
  ['api', process.execPath, ['--watch', 'server/index.js']],
  ['web', process.execPath, [vite, 'web']],
].map(([name, cmd, args]) => {
  const child = spawn(cmd, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  const prefix = (chunk) => chunk.toString().split(/\r?\n/).filter(Boolean).map((l) => `[${name}] ${l}`).join('\n') + '\n';
  child.stdout.on('data', (c) => process.stdout.write(prefix(c)));
  child.stderr.on('data', (c) => process.stderr.write(prefix(c)));
  child.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`);
    stopAll();
  });
  return child;
});

function stopAll() {
  for (const p of procs) if (p.exitCode === null) p.kill();
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
