const projectRoot = process.cwd();
const tailwindCommand = [
  process.execPath,
  'run',
  '--bun',
  'tailwindcss',
  '--input',
  'src/index.css',
  '--output',
  'public/tailwind.generated.css',
];

const tailwindBuild = Bun.spawn({
  cmd: tailwindCommand,
  cwd: projectRoot,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
});
const tailwindExitCode = await tailwindBuild.exited;
if (tailwindExitCode !== 0) {
  throw new Error(`Tailwind CLI failed with exit code ${tailwindExitCode}.`);
}

const tailwindWatcher = Bun.spawn({
  cmd: [...tailwindCommand, '--watch=always'],
  cwd: projectRoot,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
});
let shuttingDown = false;
const stopTailwindWatcher = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (tailwindWatcher.exitCode === null) tailwindWatcher.kill('SIGTERM');
};

process.once('SIGINT', stopTailwindWatcher);
process.once('SIGTERM', stopTailwindWatcher);
process.once('exit', stopTailwindWatcher);
void tailwindWatcher.exited.then((exitCode) => {
  if (shuttingDown) return;
  console.error(`Tailwind CSS watcher exited unexpectedly with code ${exitCode}.`);
  process.kill(process.pid, 'SIGTERM');
});

try {
  const [{ default: homepage }, { startServer }] = await Promise.all([
    import('../../index.html'),
    import('./server'),
  ]);

  await startServer({
    development: true,
    frontendRoutes: {
      '/': homepage,
      '/*': homepage,
    },
  });
} catch (error) {
  stopTailwindWatcher();
  throw error;
}

export {};
