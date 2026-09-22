import { isPathInside, joinPath, resolvePath } from '../src/server/bunPaths';

const distDir = resolvePath(process.cwd(), 'dist');
const assetsDir = joinPath(distDir, 'assets');
const html = await Bun.file(joinPath(distDir, 'index.html')).text();
const assetPaths = Array.from(html.matchAll(/(?:src|href)="([^"?#]+)"/g), (match) => match[1])
  .map((assetUrl) => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(assetUrl)) return null;
    try {
      const pathname = new URL(assetUrl, 'http://bundle.local').pathname;
      if (!pathname.startsWith('/assets/')) return null;
      const relativePath = decodeURIComponent(pathname.slice('/assets/'.length));
      const candidate = resolvePath(assetsDir, relativePath);
      if (!isPathInside(assetsDir, candidate)) return null;
      return candidate;
    } catch {
      return null;
    }
  })
  .filter((assetPath): assetPath is string => assetPath !== null);

async function sizeOf(assetPath: string): Promise<number> {
  const file = Bun.file(assetPath);
  if (!(await file.exists())) throw new Error(`Asset does not exist: ${assetPath}`);
  return file.size;
}

const initialJs = [...new Set(assetPaths.filter((assetPath) => assetPath.endsWith('.js')))];
const initialCss = [...new Set(assetPaths.filter((assetPath) => assetPath.endsWith('.css')))];
const initialJsBytes = (await Promise.all(initialJs.map(sizeOf))).reduce((total, size) => total + size, 0);
const initialCssBytes = (await Promise.all(initialCss.map(sizeOf))).reduce((total, size) => total + size, 0);
const assetFiles: string[] = [];
for await (const assetPath of new Bun.Glob('*').scan({ cwd: assetsDir, onlyFiles: true })) {
  assetFiles.push(assetPath);
}
const totalBytes = (await Promise.all(assetFiles.map((name) => sizeOf(joinPath(assetsDir, name))))).reduce((total, size) => total + size, 0);
const opencc = assetFiles.find((name) => /opencc.*\.js$/i.test(name));
const openccBytes = opencc ? await sizeOf(joinPath(assetsDir, opencc)) : 0;
const editorChunk = assetFiles.find((name) => /ScriptEditorTab.*\.js$/i.test(name));
const editorBytes = editorChunk ? await sizeOf(joinPath(assetsDir, editorChunk)) : 0;
const serviceWorkerPath = joinPath(distDir, 'sw.js');
const serviceWorkerSource = await Bun.file(serviceWorkerPath).text();
const precacheMatch = serviceWorkerSource.match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/);
const precacheUrls = precacheMatch ? JSON.parse(precacheMatch[1]) as string[] : [];
const precacheBytes = (await Promise.all(precacheUrls.map(async (url) => {
  const filePath = resolvePath(distDir, url.replace(/^\//, ''));
  const file = Bun.file(filePath);
  return (await file.exists()) ? file.size : 0;
}))).reduce((total, size) => total + size, 0);

const budgets = {
  initialJs: 512 * 1024,
  initialCss: 220 * 1024,
  totalAssets: 3.5 * 1024 * 1024,
  editorChunk: 640 * 1024,
  openccChunk: 1.25 * 1024 * 1024,
  precache: 800 * 1024,
};

console.log(`Initial JS: ${(initialJsBytes / 1024).toFixed(1)} KiB / ${(budgets.initialJs / 1024).toFixed(0)} KiB`);
console.log(`Initial CSS: ${(initialCssBytes / 1024).toFixed(1)} KiB / ${(budgets.initialCss / 1024).toFixed(0)} KiB`);
console.log(`Bun assets: ${assetFiles.length} files / ${(totalBytes / 1024).toFixed(1)} KiB / ${(budgets.totalAssets / 1024).toFixed(0)} KiB`);
if (opencc) console.log(`Route chunk (OpenCC): ${(openccBytes / 1024).toFixed(1)} KiB`);
if (editorChunk) console.log(`Route chunk (ScriptEditorTab): ${(editorBytes / 1024).toFixed(1)} KiB`);
console.log(`PWA precache: ${precacheUrls.length} files / ${(precacheBytes / 1024).toFixed(1)} KiB / ${(budgets.precache / 1024).toFixed(0)} KiB`);

if (
  initialJsBytes > budgets.initialJs
  || initialCssBytes > budgets.initialCss
  || totalBytes > budgets.totalAssets
  || editorBytes > budgets.editorChunk
  || openccBytes > budgets.openccChunk
  || precacheBytes > budgets.precache
) {
  console.error('Bundle size budget exceeded. Review initial, route and PWA precache chunks before merging.');
  process.exitCode = 1;
}
