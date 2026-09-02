import type { ApiBindings } from './apiShared';

export type NativeNext = () => Promise<Response>;
export type NativeHandler = (context: NativeContext) => Response | Promise<Response>;
export type NativeMiddleware = (context: NativeContext, next: NativeNext) => Response | Promise<Response>;

type BunRequestLike = Request & {
  params?: Record<string, string>;
};

type BunServerLike = {
  requestIP?: (request: Request) => { address?: string } | null;
};

export class BodyLimitError extends Error {
  constructor() {
    super('Request body is too large');
    this.name = 'BodyLimitError';
  }
}

class NativeRequest {
  private readonly request: BunRequestLike;
  private readonly url: URL;
  private bodyPromise: Promise<string> | null = null;
  private bodyLength: number | null = null;
  private bodyLimitBytes = Number.POSITIVE_INFINITY;

  constructor(request: BunRequestLike) {
    this.request = request;
    this.url = new URL(request.url);
  }

  get path(): string {
    return this.url.pathname;
  }

  query(name: string): string {
    return this.url.searchParams.get(name) ?? '';
  }

  param(name: string): string {
    return this.request.params?.[name] || '';
  }

  header(name: string): string | undefined {
    return this.request.headers.get(name) ?? undefined;
  }

  setBodyLimit(maxBytes: number): void {
    this.bodyLimitBytes = Math.min(this.bodyLimitBytes, maxBytes);
  }

  contentLength(): number | null {
    const value = this.request.headers.get('content-length');
    if (value === null) return null;
    const contentLength = Number(value);
    return Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : null;
  }

  async readBody(maxBytes = Number.POSITIVE_INFINITY): Promise<string> {
    const effectiveMaxBytes = Math.min(maxBytes, this.bodyLimitBytes);
    if (this.bodyPromise) {
      const body = await this.bodyPromise;
      if ((this.bodyLength || 0) > effectiveMaxBytes) throw new BodyLimitError();
      return body;
    }

    const contentLength = this.contentLength();
    if (contentLength !== null && contentLength > effectiveMaxBytes) {
      throw new BodyLimitError();
    }

    this.bodyPromise = (async () => {
      if (!this.request.body) {
        this.bodyLength = 0;
        return '';
      }

      const reader = this.request.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          total += value.byteLength;
          if (total > effectiveMaxBytes) {
            await reader.cancel();
            throw new BodyLimitError();
          }
          chunks.push(value);
        }
      } catch (error) {
        this.bodyPromise = null;
        throw error;
      }

      this.bodyLength = total;
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return new TextDecoder().decode(bytes);
    })();

    const body = await this.bodyPromise;
    if ((this.bodyLength || 0) > effectiveMaxBytes) throw new BodyLimitError();
    return body;
  }

  async json<T = unknown>(): Promise<T> {
    return JSON.parse(await this.readBody()) as T;
  }

  async text(): Promise<string> {
    return this.readBody();
  }
}

export class NativeContext {
  readonly req: NativeRequest;
  readonly env: ApiBindings;
  private readonly responseHeaders = new Headers();

  constructor(request: BunRequestLike, env: ApiBindings) {
    this.req = new NativeRequest(request);
    this.env = env;
  }

  header(name: string, value: string): void {
    this.responseHeaders.set(name, value);
  }

  json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    });
  }

  text(data: string, status = 200): Response {
    return new Response(data, {
      status,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
    });
  }

  body(data: BodyInit | null, status = 200, headers?: HeadersInit): Response {
    return new Response(data, { status, headers });
  }

  html(data: string, status = 200): Response {
    return new Response(data, {
      status,
      headers: { 'Content-Type': 'text/html; charset=UTF-8' },
    });
  }

  withHeaders(response: Response): Response {
    const headers = new Headers(response.headers);
    for (const [name, value] of this.responseHeaders) headers.set(name, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

export interface BodyLimitOptions {
  maxSize: number;
  onError: (context: NativeContext) => Response | Promise<Response>;
  preflightOnly?: boolean;
}

export function bodyLimit(options: BodyLimitOptions): NativeMiddleware {
  return async (context, next) => {
    context.req.setBodyLimit(options.maxSize);
    const contentLength = context.req.contentLength();
    if (contentLength !== null && contentLength > options.maxSize) return options.onError(context);
    if (options.preflightOnly) {
      try {
        return await next();
      } catch (error) {
        if (error instanceof BodyLimitError) return options.onError(context);
        throw error;
      }
    }
    try {
      await context.req.readBody(options.maxSize);
      return await next();
    } catch (error) {
      if (error instanceof BodyLimitError) return options.onError(context);
      throw error;
    }
  };
}

interface RegisteredRoute {
  method: string;
  path: string;
  handlers: NativeMiddleware[];
  score: number;
  matcher: RegExp;
  params: string[];
}

interface RouteMatch {
  route: RegisteredRoute;
  params: Record<string, string>;
}

function compilePath(path: string): { matcher: RegExp; params: string[]; score: number } {
  const params: string[] = [];
  const segments = path.split('/').filter(Boolean);
  let score = 0;
  const pattern = segments.map((segment) => {
    if (segment === '*') {
      params.push('*');
      score += 1;
      return '(.*)';
    }
    if (segment.startsWith(':')) {
      params.push(segment.slice(1));
      score += 2;
      return '([^/]+)';
    }
    score += 3;
    return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  return { matcher: new RegExp(`^/${pattern}/?$`), params, score };
}

function matchRoute(routes: RegisteredRoute[], method: string, pathname: string): RouteMatch | null {
  const candidates = routes
    .filter((route) => route.method === method)
    .sort((a, b) => b.score - a.score);
  for (const route of candidates) {
    const match = route.matcher.exec(pathname);
    if (!match) continue;
    const params: Record<string, string> = {};
    route.params.forEach((name, index) => { params[name] = match[index + 1] || ''; });
    return { route, params };
  }
  return null;
}

export class NativeApp {
  private readonly basePath: string;
  private readonly env: ApiBindings;
  private readonly routes: RegisteredRoute[] = [];
  private readonly middlewares: NativeMiddleware[] = [];

  constructor(env: ApiBindings, basePath = '/api') {
    this.env = env;
    this.basePath = basePath.replace(/\/$/, '');
  }

  use(pathOrMiddleware: string | NativeMiddleware, ...handlers: NativeMiddleware[]): this {
    if (typeof pathOrMiddleware === 'function') {
      this.middlewares.push(pathOrMiddleware, ...handlers);
    } else {
      this.middlewares.push(...handlers);
    }
    return this;
  }

  get(path: string, ...handlers: NativeMiddleware[]): this {
    return this.addRoute('GET', path, handlers);
  }

  post(path: string, ...handlers: NativeMiddleware[]): this {
    return this.addRoute('POST', path, handlers);
  }

  put(path: string, ...handlers: NativeMiddleware[]): this {
    return this.addRoute('PUT', path, handlers);
  }

  patch(path: string, ...handlers: NativeMiddleware[]): this {
    return this.addRoute('PATCH', path, handlers);
  }

  delete(path: string, ...handlers: NativeMiddleware[]): this {
    return this.addRoute('DELETE', path, handlers);
  }

  private addRoute(method: string, path: string, handlers: NativeMiddleware[]): this {
    const fullPath = `${this.basePath}${path.startsWith('/') ? path : `/${path}`}`;
    const compiled = compilePath(fullPath);
    this.routes.push({ method, path: fullPath, handlers, ...compiled });
    return this;
  }

  private async dispatch(request: BunRequestLike, match: RouteMatch, requestIp?: string): Promise<Response> {
    const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const forwardedRealIp = request.headers.get('x-real-ip')?.trim();
    const clientIp = this.env.CLIENT_IP
      || requestIp
      || (this.env.TRUST_PROXY_HEADERS ? forwardedFor || forwardedRealIp : undefined)
      || 'unknown';
    const context = new NativeContext(request, { ...this.env, CLIENT_IP: clientIp });
    const routeHandlers = [...this.middlewares, ...match.route.handlers];
    let index = -1;
    const next = async (nextIndex: number): Promise<Response> => {
      if (nextIndex <= index) throw new Error('next() called multiple times');
      index = nextIndex;
      const handler = routeHandlers[nextIndex];
      if (!handler) return context.text('Not Found', 404);
      return handler(context, () => next(nextIndex + 1));
    };
    return context.withHeaders(await next(0));
  }

  async fetch(request: Request, requestIp?: string): Promise<Response> {
    const nativeRequest = request as BunRequestLike;
    const url = new URL(request.url);
    const match = matchRoute(this.routes, request.method.toUpperCase(), url.pathname);
    if (!match) return new Response('Not Found', { status: 404 });
    nativeRequest.params = match.params;
    return this.dispatch(nativeRequest, match, requestIp);
  }

  request(input: string | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' && input.startsWith('/')
      ? `http://localhost${input}`
      : input;
    return this.fetch(new Request(url, init));
  }

  toBunRoutes(finalize: (response: Response) => Response = (response) => response): Record<string, Record<string, (request: BunRequestLike, server: BunServerLike) => Promise<Response>>> {
    const grouped = new Map<string, Record<string, (request: BunRequestLike, server: BunServerLike) => Promise<Response>>>();
    for (const route of this.routes) {
      const methodHandlers = grouped.get(route.path) || {};
      methodHandlers[route.method] = async (request, server) => {
        return finalize(await this.dispatch(request, {
          route,
          params: request.params || {},
        }, server.requestIP?.(request)?.address));
      };
      grouped.set(route.path, methodHandlers);
    }
    return Object.fromEntries(grouped);
  }
}
