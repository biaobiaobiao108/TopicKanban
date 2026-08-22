import { handle } from 'hono/cloudflare-pages';
import { createApp } from '../../src/server/createApp';

const app = createApp();

export const onRequest = handle(app);
