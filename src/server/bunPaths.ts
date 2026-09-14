const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATH = /^\\\\/;

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || WINDOWS_ABSOLUTE_PATH.test(value) || WINDOWS_UNC_PATH.test(value);
}

function encodePathForUrl(value: string): string {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .map((segment: string) => {
      if (segment === '' || segment === '.' || segment === '..') return segment;
      return encodeURIComponent(segment);
    })
    .join('/');
}

function directoryUrl(filePath: string): URL {
  const url = Bun.pathToFileURL(filePath);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

/** Resolve local filesystem paths without importing Node's path compatibility module. */
export function resolvePath(...segments: string[]): string {
  let current = directoryUrl(process.cwd());

  segments.forEach((segment, index) => {
    if (!segment) return;
    if (isAbsolutePath(segment)) {
      current = directoryUrl(segment);
    } else {
      current = new URL(encodePathForUrl(segment), current);
    }

    if (index < segments.length - 1) {
      current = directoryUrl(Bun.fileURLToPath(current));
    }
  });

  return Bun.fileURLToPath(current);
}

/** Join known local path segments while keeping the result absolute and normalized. */
export function joinPath(first: string, ...rest: string[]): string {
  return resolvePath(first, ...rest.map((segment) => segment.replace(/^[\\/]+/, '')));
}

/** Check containment using normalized file URLs, including Windows drive-letter casing. */
export function isPathInside(rootPath: string, candidatePath: string): boolean {
  const rootUrl = Bun.pathToFileURL(resolvePath(rootPath)).href.replace(/\/$/, '');
  const candidateUrl = Bun.pathToFileURL(resolvePath(candidatePath)).href.replace(/\/$/, '');
  const normalizedRoot = process.platform === 'win32' ? rootUrl.toLowerCase() : rootUrl;
  const normalizedCandidate = process.platform === 'win32' ? candidateUrl.toLowerCase() : candidateUrl;
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`);
}
