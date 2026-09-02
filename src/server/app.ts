import { NativeApp, bodyLimit } from './native';
import type { ApiBindings } from './apiShared';
import {
  MAX_REQUEST_BYTES,
  verifyQuickDropCredential,
  verifyToken,
} from './apiShared';
import { registerDealRoutes } from './routes/deals';
import { registerPeopleRoutes } from './routes/people';
import { registerPublishedRoutes } from './routes/published';
import { registerQuickDropRoutes } from './routes/quickDrops';
import { registerSharingRoutes } from './routes/sharing';
import { registerSystemRoutes } from './routes/system';
import { registerTagRoutes } from './routes/tags';
import { registerTopicRoutes } from './routes/topics';
import { registerTodoRoutes } from './routes/todos';
import { registerWorkspaceRoutes } from './routes/workspace';
import { registerWritingRoutes } from './routes/writing';

export function createApp(bindings: ApiBindings): NativeApp {
  const app = new NativeApp(bindings, '/api');

  app.use('*', bodyLimit({
    maxSize: MAX_REQUEST_BYTES,
    preflightOnly: true,
    onError: (c) => c.json({ error: 'Request body is too large' }, 413),
  }));

  app.use('*', async (c, next) => {
    const path = c.req.path;
    if (path === '/api/auth/login' || path === '/auth/login') return next();
    if (path === '/api/health' || path === '/health') return next();
    if (path.startsWith('/api/public/') || path.startsWith('/public/')) return next();
    if (path === '/api/inbox/quick-drop' || path === '/inbox/quick-drop') {
      const dropToken = c.req.header('X-Quick-Drop-Token');
      if (dropToken) {
        const credential = verifyQuickDropCredential(dropToken, c.env.QUICK_DROP_TOKEN);
        if (credential === 'missing_config') return c.json({ error: 'QUICK_DROP_TOKEN is not configured' }, 503);
        if (credential === 'invalid') return c.json({ error: 'Invalid quick drop token' }, 401);
        return next();
      }
    }
    const authorization = c.req.header('Authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const password = c.env.APP_PASSWORD;
    if (!password) return c.json({ error: 'APP_PASSWORD is not configured' }, 503);
    if (!token || !(await verifyToken(token, password))) return c.json({ error: 'Unauthorized' }, 401);
    return next();
  });

  registerSystemRoutes(app);
  registerTopicRoutes(app);
  registerTodoRoutes(app);
  registerDealRoutes(app);
  registerWorkspaceRoutes(app);
  registerPeopleRoutes(app);
  registerWritingRoutes(app);
  registerTagRoutes(app);
  registerPublishedRoutes(app);
  registerSharingRoutes(app);
  registerQuickDropRoutes(app);

  return app;
}
