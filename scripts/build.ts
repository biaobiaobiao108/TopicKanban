import { cp, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import tailwind from 'bun-plugin-tailwind';
import { transform } from 'lightningcss';

const projectRoot = process.cwd();
const distDir = resolve(projectRoot, 'dist');
const publicDir = resolve(projectRoot, 'public');

await rm(distDir, { recursive: true, force: true });

const frontendResult = await Bun.build({
  entrypoints: [resolve(projectRoot, 'index.html')],
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

const assetsDir = resolve(distDir, 'assets');
for (const fileName of await readdir(assetsDir)) {
  if (!fileName.endsWith('.css')) continue;
  const filePath = resolve(assetsDir, fileName);
  const source = new Uint8Array(await Bun.file(filePath).arrayBuffer());
  const optimized = transform({ filename: fileName, code: source, minify: true });
  await Bun.write(filePath, optimized.code);
}

const serverResult = await Bun.build({
  entrypoints: [resolve(projectRoot, 'src/server/server.ts')],
  target: 'bun',
  format: 'esm',
  splitting: false,
  minify: true,
  naming: { entry: '[name].[ext]' },
  write: false,
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
await Bun.write(resolve(distDir, 'server.js'), await serverOutput.arrayBuffer());

for (const fileName of await readdir(publicDir)) {
  await cp(resolve(publicDir, fileName), resolve(distDir, fileName), { recursive: true });
}

console.log(`Bun production build completed: ${distDir}`);
