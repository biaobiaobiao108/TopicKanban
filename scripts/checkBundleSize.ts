import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const distDir = resolve(process.cwd(), 'dist');
const assetsDir = resolve(distDir, 'assets');
const html = await readFile(resolve(distDir, 'index.html'), 'utf8');
const initialAssets = Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g), (match) => basename(match[1]));

async function sizeOf(name: string): Promise<number> {
  return (await stat(resolve(assetsDir, name))).size;
}

const initialJs = [...new Set(initialAssets.filter((name) => name.endsWith('.js')))];
const initialCss = [...new Set(initialAssets.filter((name) => name.endsWith('.css')))];
const initialJsBytes = (await Promise.all(initialJs.map(sizeOf))).reduce((total, size) => total + size, 0);
const initialCssBytes = (await Promise.all(initialCss.map(sizeOf))).reduce((total, size) => total + size, 0);
const assetNames = await readdir(assetsDir);
const opencc = assetNames.find((name) => /^opencc-.*\.js$/.test(name));
const openccBytes = opencc ? await sizeOf(opencc) : 0;

const budgets = {
  initialJs: 512 * 1024,
  initialCss: 200 * 1024,
};

console.log(`Initial JS: ${(initialJsBytes / 1024).toFixed(1)} KiB / ${(budgets.initialJs / 1024).toFixed(0)} KiB`);
console.log(`Initial CSS: ${(initialCssBytes / 1024).toFixed(1)} KiB / ${(budgets.initialCss / 1024).toFixed(0)} KiB`);
if (opencc) console.log(`Route chunk (OpenCC): ${(openccBytes / 1024).toFixed(1)} KiB`);

if (initialJsBytes > budgets.initialJs || initialCssBytes > budgets.initialCss) {
  console.error('Bundle size budget exceeded. Review the initial chunks before merging.');
  process.exitCode = 1;
}
