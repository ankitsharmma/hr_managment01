import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serverDirectory = fileURLToPath(new URL('../server/', import.meta.url));
const clientDirectory = fileURLToPath(new URL('../client/', import.meta.url));
const viteEntrypoint = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

const services = [
  {
    name: 'backend',
    command: process.execPath,
    args: ['--watch', 'src/index.js'],
    cwd: serverDirectory
  },
  {
    name: 'frontend',
    command: process.execPath,
    args: [viteEntrypoint],
    cwd: clientDirectory
  }
];

const children = services.map(service => {
  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    stdio: 'inherit',
    env: process.env
  });

  child.on('error', error => {
    console.error(`${service.name} failed to start:`, error.message);
    stopChildren(1);
  });

  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`${service.name} stopped${signal ? ` (${signal})` : ` (exit ${code})`}`);
      stopChildren(code || 1);
    }
  });

  return child;
});

let stopping = false;

function stopChildren(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
  process.exitCode = exitCode;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stopChildren());
}
