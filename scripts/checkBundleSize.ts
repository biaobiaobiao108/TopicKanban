import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const distDir = resolve(process.cwd(), 'dist');
const assetsDir = resolve(distDir, 'assets');
const html = await readFile(resolve(distDir, 'index.html'), 'utf8');
const assetPaths = Array.from(html.matchAll(/(?:src|href)="([^"?#]+)"/g), (match) => match[1])
  .map((assetUrl) => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(assetUrl)) return null;
    try {
      const pathname = new URL(assetUrl, 'http://bundle.local').pathname;
      if (!pathname.startsWith('/assets/')) return null;
      const relativePath = decodeURIComponent(pathname.slice('/assets/'.length));
      const candidate = resolve(assetsDir, relativePath);
      if (candidate !== assetsDir && !candidate.startsWith(`${assetsDir}${sep}`)) return null;
      return candidate;
    } catch {
      return null;
    }
  })
  .filter((assetPath): assetPath is string => assetPath !== null);

async function sizeOf(assetPath: string): Promise<number> {
  return (await stat(assetPath)).size;
}

const initialJs = [...new Set(assetPaths.filter((assetPath) => assetPath.endsWith('.js')))];
const initialCss = [...new Set(assetPaths.filter((assetPath) => assetPath.endsWith('.css')))];
const initialJsBytes = (await Promise.all(initialJs.map(sizeOf))).reduce((total, size) => total + size, 0);
const initialCssBytes = (await Promise.all(initialCss.map(sizeOf))).reduce((total, size) => total + size, 0);
const assetEntries = await readdir(assetsDir, { withFileTypes: true });
const assetFiles = assetEntries.filter((entry) => entry.isFile()).map((entry) => entry.name);
const totalBytes = (await Promise.all(assetFiles.map((name) => sizeOf(resolve(assetsDir, name))))).reduce((total, size) => total + size, 0);
const opencc = assetFiles.find((name) => /opencc.*\.js$/i.test(name));
const openccBytes = opencc ? await sizeOf(resolve(assetsDir, opencc)) : 0;

const budgets = {
  initialJs: 512 * 1024,
  initialCss: 220 * 1024,
};

console.log(`Initial JS: ${(initialJsBytes / 1024).toFixed(1)} KiB / ${(budgets.initialJs / 1024).toFixed(0)} KiB`);
console.log(`Initial CSS: ${(initialCssBytes / 1024).toFixed(1)} KiB / ${(budgets.initialCss / 1024).toFixed(0)} KiB`);
console.log(`Bun assets: ${assetFiles.length} files / ${(totalBytes / 1024).toFixed(1)} KiB`);
if (opencc) console.log(`Route chunk (OpenCC): ${(openccBytes / 1024).toFixed(1)} KiB`);

if (initialJsBytes > budgets.initialJs || initialCssBytes > budgets.initialCss) {
  console.error('Bundle size budget exceeded. Review the initial chunks before merging.');
  process.exitCode = 1;
}
