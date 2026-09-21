import express, { type Express } from 'express';
import type { Db } from './db/client.js';
import type { Env } from './env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createSessionMiddleware } from './middleware/session.js';
import { csrfProtection } from './middleware/csrf.js';
import { ModelGateway } from './models/gateway.js';
import { createDbSpanWriter } from './spans/writeSpan.js';
import { createAuthRouter } from './routes/auth.js';
import { createProjectsRouter } from './routes/projects.js';
import { createConversationsRouter } from './routes/conversations.js';
import { createDocumentsRouter } from './routes/documents.js';

export function createApp(db: Db, env: Env): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(createSessionMiddleware(env));
  app.use(csrfProtection);

  const spanWriter = createDbSpanWriter(db);
  const gateway = new ModelGateway({ db, spanWriter });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use(createAuthRouter(db));
  app.use(createProjectsRouter(db));
  app.use(createConversationsRouter(db, gateway, spanWriter));
  app.use(createDocumentsRouter(db, env.DATA_DIR));

  app.use(errorHandler);
  return app;
}
