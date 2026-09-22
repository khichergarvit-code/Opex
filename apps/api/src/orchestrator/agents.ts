import { readFile } from 'node:fs/promises';
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { agents } from '../db/schema/index.js';
import type { AgentConfig } from './types.js';

const PROMPTS_DIR = new URL('../prompts/', import.meta.url);

/** Loads the latest enabled version of a named agent from the `agents` table. */
export async function loadAgent(db: Db, name: string): Promise<AgentConfig | null> {
  const [row] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.name, name), eq(agents.enabled, true)))
    .orderBy(desc(agents.version))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    description: row.description,
    systemPromptTemplate: row.systemPromptTemplate,
    modelRole: row.modelRole,
    toolAllowlist: row.toolAllowlist,
    maxIterations: row.maxIterations,
    requiresApprovalTools: row.requiresApprovalTools,
    enabled: row.enabled,
    allowedGroups: row.allowedGroups,
  };
}

/** Resolves an agent's systemPromptTemplate (a filename) against apps/api/src/prompts/. */
export async function loadAgentSystemPrompt(agent: AgentConfig): Promise<string> {
  return readFile(new URL(agent.systemPromptTemplate, PROMPTS_DIR), 'utf8');
}
