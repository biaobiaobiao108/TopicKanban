import homepage from '../../index.html';
import { startServer } from './server';

await startServer({
  development: true,
  frontendRoutes: {
    '/': homepage,
    '/*': homepage,
  },
});
