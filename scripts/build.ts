import tailwind from 'bun-plugin-tailwind';
import { joinPath, resolvePath } from '../src/server/bunPaths';

const projectRoot = process.cwd();
const distDir = resolvePath(projectRoot, 'dist');
const publicDir = resolvePath(projectRoot, 'public');

async function listFiles(directory: string, pattern = '*'): Promise<string[]> {
  const files: string[] = [];
  for await (const file of new Bun.Glob(pattern).scan({ cwd: directory, onlyFiles: true, dot: true })) {
    files.push(file);
  }
  return files;
}

async function removeGeneratedFiles(directory: string): Promise<void> {
  try {
    for await (const relativePath of new Bun.Glob('**/*').scan({ cwd: directory, onlyFiles: true, dot: true })) {
      await Bun.file(joinPath(directory, relativePath.replace(/\\/g, '/'))).unlink();
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
  }
}

await removeGeneratedFiles(distDir);

const frontendResult = await Bun.build({
  entrypoints: [joinPath(projectRoot, 'index.html')],
  outdir: distDir,
  target: 'browser',
  splitting: true,
  minify: true,
  publicPath: '/',
  naming: {
    entry: '[dir]/[name].[ext]',
    chunk: 'assets/[name]-[hash].[ext]',
    asset: 'assets/[name]-[hash].[ext]',
  },
  plugins: [tailwind],
});

if (!frontendResult.success) {
  console.error('Bun frontend build failed.');
  for (const message of frontendResult.logs) console.error(message);
  process.exit(1);
}

const assetsDir = joinPath(distDir, 'assets');

const serverResult = await Bun.build({
  entrypoints: [joinPath(projectRoot, 'src/server/server.ts')],
  target: 'bun',
  format: 'esm',
  splitting: false,
  minify: true,
  naming: { entry: '[name].[ext]' },
});

if (!serverResult.success) {
  console.error('Bun server build failed.');
  for (const message of serverResult.logs) console.error(message);
  process.exit(1);
}

const serverOutput = serverResult.outputs.find((output) => output.path.endsWith('server.js')) ?? serverResult.outputs[0];
if (!serverOutput) {
  console.error('Bun server build did not produce server.js.');
  process.exit(1);
}
await Bun.write(joinPath(distDir, 'server.js'), await serverOutput.arrayBuffer());

for (const relativePath of await listFiles(publicDir, '**/*')) {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  await Bun.write(
    joinPath(distDir, normalizedPath),
    Bun.file(joinPath(publicDir, normalizedPath)),
    { createPath: true },
  );
}

const precacheUrls = [
  '/',
  '/index.html',
  '/today',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
  ...(await listFiles(assetsDir)).sort().map((fileName) => `/assets/${fileName}`),
];
const serviceWorkerPath = joinPath(distDir, 'sw.js');
if (await Bun.file(serviceWorkerPath).exists()) {
  const serviceWorkerSource = await Bun.file(serviceWorkerPath).text();
  const precacheDeclaration = 'const PRECACHE_URLS = [];';
  if (!serviceWorkerSource.includes(precacheDeclaration)) {
    throw new Error('Service Worker precache placeholder is missing.');
  }
  await Bun.write(
    serviceWorkerPath,
    serviceWorkerSource.replace(
      precacheDeclaration,
      `const PRECACHE_URLS = ${JSON.stringify(precacheUrls)};`,
    ),
  );
}

console.log(`Bun production build completed: ${distDir}`);
