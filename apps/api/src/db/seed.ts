import 'dotenv/config';
import argon2 from 'argon2';
import { createDb } from './client.js';
import { loadEnv } from '../env.js';
import { agents, policies, projectMembers, projects, users, workspaces } from './schema/index.js';
import { DEFAULT_POLICY_RULES } from '../policy/rules.js';

/**
 * A2 seeds general/doc_qa. A3 adds vision/analysis when the router and
 * their tools exist. systemPromptTemplate is a filename resolved against
 * apps/api/src/prompts/ at call time (see orchestrator/agents.ts).
 */
const SEED_AGENTS = [
  {
    name: 'general',
    description: 'Plain chat, no documents or tools.',
    systemPromptTemplate: 'chat-system.md',
    modelRole: 'general' as const,
    toolAllowlist: [],
  },
  {
    name: 'doc_qa',
    description: 'Answers questions from ingested project documents, with citations.',
    systemPromptTemplate: 'doc-qa-system.md',
    modelRole: 'general' as const,
    toolAllowlist: ['doc_search'],
  },
  {
    name: 'vision',
    description: 'Handles image attachments. No vision model is loaded — scaffolded, not functional.',
    systemPromptTemplate: 'vision-system.md',
    modelRole: 'general' as const,
    toolAllowlist: ['describe_image'],
  },
  {
    name: 'analysis',
    description: 'Runs sandboxed Python/matplotlib for CSV/XLSX questions and chart requests.',
    systemPromptTemplate: 'analysis-system.md',
    modelRole: 'general' as const,
    toolAllowlist: ['code_exec', 'make_chart'],
  },
];

const DEV_PASSWORD = 'opex-dev-password';

const SEED_USERS = [
  { email: 'admin@opex.local', name: 'Admin', role: 'super_admin', clearance: 3 },
  { email: 'wsadmin@opex.local', name: 'Workspace Admin', role: 'workspace_admin', clearance: 2 },
  {
    email: 'employee.confidential@opex.local',
    name: 'Employee (Confidential)',
    role: 'employee',
    clearance: 2,
  },
  {
    email: 'employee.internal@opex.local',
    name: 'Employee (Internal)',
    role: 'employee',
    clearance: 1,
  },
  { email: 'employee.public@opex.local', name: 'Employee (Public)', role: 'employee', clearance: 0 },
] as const;

async function main() {
  const env = loadEnv();
  const db = createDb(env);

  const [workspace] = await db
    .insert(workspaces)
    .values({ name: 'Default Workspace' })
    .returning();
  if (!workspace) throw new Error('failed to seed workspace');

  const [project] = await db
    .insert(projects)
    .values({ workspaceId: workspace.id, name: 'Default Project', defaultClassification: 1 })
    .returning();
  if (!project) throw new Error('failed to seed project');

  await db.insert(policies).values({ name: 'default', rules: DEFAULT_POLICY_RULES });

  for (const agent of SEED_AGENTS) {
    await db.insert(agents).values(agent);
  }

  const passwordHash = await argon2.hash(DEV_PASSWORD);

  for (const seedUser of SEED_USERS) {
    const [row] = await db
      .insert(users)
      .values({
        email: seedUser.email,
        name: seedUser.name,
        passwordHash,
        role: seedUser.role,
        clearance: seedUser.clearance,
      })
      .returning();
    if (row) {
      await db.insert(projectMembers).values({ projectId: project.id, userId: row.id });
    }
  }

  console.log(`Seeded ${SEED_USERS.length} users, 1 workspace, 1 project.`);
  console.log(`Dev password for all seeded users: ${DEV_PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
