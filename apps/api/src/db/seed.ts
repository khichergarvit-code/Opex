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
    description: 'Answers questions about images the user attaches, using the vision model.',
    systemPromptTemplate: 'vision-system.md',
    modelRole: 'vision' as const,
    toolAllowlist: [],
  },
  {
    name: 'analysis',
    description: 'Runs sandboxed Python/matplotlib for CSV/XLSX questions and chart requests.',
    systemPromptTemplate: 'analysis-system.md',
    modelRole: 'general' as const,
    toolAllowlist: ['code_exec', 'make_chart'],
  },
  {
    // B3 adds code/research. Both run on modelRole:'general' — there is
    // no coder-role model in the manifest, so `code` doesn't get a real
    // coder model any more than `vision` gets a real vision model
    // (documented gap, same honesty pattern as A3's vision agent).
    name: 'code',
    description: 'Writes and runs code for data/analysis tasks (/code).',
    systemPromptTemplate: 'code-system.md',
    modelRole: 'general' as const,
    toolAllowlist: ['code_exec', 'make_chart'],
  },
  {
    name: 'image',
    description: 'Creates new images from a text description using the local image model.',
    systemPromptTemplate: 'image-system.md',
    modelRole: 'general' as const,
    toolAllowlist: ['generate_image'],
  },
  {
    name: 'files',
    description: "Creates, reads, edits, moves and deletes text files in the project's workspace; can read the user's saved memories. Changes always ask first.",
    systemPromptTemplate: 'files-system.md',
    modelRole: 'general' as const,
    toolAllowlist: ['list_files', 'read_file', 'read_memories', 'write_file', 'edit_file', 'delete_file', 'move_file', 'create_folder', 'run_shell'],
    requiresApprovalTools: ['write_file', 'edit_file', 'delete_file', 'move_file', 'create_folder', 'run_shell'],
  },
  {
    name: 'research',
    description: 'Answers multi-document, cross-referencing questions using document search and memory.',
    systemPromptTemplate: 'research-system.md',
    modelRole: 'general' as const,
    toolAllowlist: ['doc_search', 'memory_search'],
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

  if ((await db.select({ id: users.id }).from(users).limit(1)).length > 0) {
    console.log('Database already seeded — nothing to do.');
    process.exit(0);
  }

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
