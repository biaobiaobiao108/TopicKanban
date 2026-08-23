const children = [
  Bun.spawn(['bun', 'run', 'dev:web'], { stdout: 'inherit', stderr: 'inherit' }),
  Bun.spawn(['bun', 'run', 'dev:server'], { stdout: 'inherit', stderr: 'inherit' }),
];

let shuttingDown = false;

async function shutdown(exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    child.kill('SIGTERM');
  }
  await Promise.all(children.map((child) => child.exited));
  process.exit(exitCode);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

const exitCodes = await Promise.all(children.map((child) => child.exited));
const failed = exitCodes.find((code) => code !== 0);
await shutdown(failed ?? 0);
