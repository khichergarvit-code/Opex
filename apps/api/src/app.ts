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
import { createRetrievalRouter } from './routes/retrieval.js';
import { createAdminRouter } from './routes/admin.js';
import { createArtifactsRouter } from './routes/artifacts.js';
import { createRouterDebugRouter } from './routes/routerDebug.js';
import { createGroundednessDebugRouter } from './routes/groundednessDebug.js';
import { createAccessRequestsRouter } from './routes/accessRequests.js';
import { createApprovalsRouter } from './routes/approvals.js';
import { createAdminUsersRouter } from './routes/adminUsers.js';
import { createAdminGroupsRouter } from './routes/adminGroups.js';
import { createAdminModelsRouter } from './routes/adminModels.js';
import { createAdminPoliciesRouter } from './routes/adminPolicies.js';
import { createAdminAgentsRouter } from './routes/adminAgents.js';
import { createAdminMemoryRouter } from './routes/adminMemory.js';
import { createMemoryRouter } from './routes/memory.js';
import { createFeedbackRouter } from './routes/feedback.js';
import { createAdminSystemRouter } from './routes/adminSystem.js';
import { createDbAuditWriter } from './audit/writeAudit.js';

export function createApp(db: Db, env: Env): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(createSessionMiddleware(env));
  app.use(csrfProtection);

  const spanWriter = createDbSpanWriter(db);
  const auditWriter = createDbAuditWriter(db);
  const gateway = new ModelGateway({ db, spanWriter });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use(createAuthRouter(db));
  app.use(createProjectsRouter(db));
  app.use(createConversationsRouter(db, gateway, spanWriter, env));
  app.use(createDocumentsRouter(db, env.DATA_DIR));
  app.use(createRetrievalRouter(db, gateway, spanWriter));
  app.use(createAdminRouter(db, auditWriter));
  app.use(createArtifactsRouter(db, env.DATA_DIR));
  app.use(createRouterDebugRouter(db, gateway));
  app.use(createGroundednessDebugRouter(db, gateway));
  app.use(createAccessRequestsRouter(db, auditWriter));
  app.use(createApprovalsRouter(db, gateway, spanWriter, auditWriter, env));
  app.use(createAdminUsersRouter(db, auditWriter));
  app.use(createAdminGroupsRouter(db, auditWriter));
  app.use(createAdminModelsRouter(db, auditWriter));
  app.use(createAdminPoliciesRouter(db, auditWriter));
  app.use(createAdminAgentsRouter(db, gateway, auditWriter));
  app.use(createAdminMemoryRouter(db, gateway, spanWriter, auditWriter));
  app.use(createMemoryRouter(db));
  app.use(createFeedbackRouter(db, auditWriter));
  app.use(createAdminSystemRouter(db, env.DATA_DIR));

  app.use(errorHandler);
  return app;
}
