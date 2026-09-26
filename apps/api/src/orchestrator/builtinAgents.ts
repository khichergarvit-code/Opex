import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { agents } from '../db/schema/index.js';

/**
 * Agents added after the first seed. Existing databases were seeded once, so these are inserted at boot
 * when missing (never overwritten: an admin may have edited them).
 */
const BUILT_IN_AGENTS = [
  {
    name: 'image',
    description: 'Creates new images from a text description using the local image model.',
    systemPromptTemplate: 'image-system.md',
    modelRole: 'general' as const,
    toolAllowlist: ['generate_image'],
    requiresApprovalTools: [] as string[],
  },
  {
    name: 'files',
    description: "Creates, reads, edits, moves and deletes text files in the project's workspace; can read the user's saved memories. Changes always ask first.",
    systemPromptTemplate: 'files-system.md',
    modelRole: 'general' as const,
    toolAllowlist: ['list_files', 'read_file', 'read_memories', 'write_file', 'edit_file', 'delete_file', 'move_file', 'create_folder', 'run_shell'],
    requiresApprovalTools: ['write_file', 'edit_file', 'delete_file', 'move_file', 'create_folder', 'run_shell'],
  },
];

export async function ensureBuiltInAgents(db: Db): Promise<string[]> {
  const added: string[] = [];
  for (const agent of BUILT_IN_AGENTS) {
    const [existing] = await db.select({ id: agents.id }).from(agents).where(eq(agents.name, agent.name)).limit(1);
    if (!existing) {
      await db.insert(agents).values(agent);
      added.push(agent.name);
    } else {
      // Later releases add tools to a built-in agent; add them (and their approval rule) without touching anything an admin changed.
      const [row] = await db.select().from(agents).where(eq(agents.name, agent.name)).limit(1);
      const tools = [...new Set([...(row?.toolAllowlist ?? []), ...agent.toolAllowlist])];
      const approvals = [...new Set([...(row?.requiresApprovalTools ?? []), ...agent.requiresApprovalTools])];
      if (row && (tools.length !== row.toolAllowlist.length || approvals.length !== row.requiresApprovalTools.length)) {
        await db.update(agents).set({ toolAllowlist: tools, requiresApprovalTools: approvals }).where(eq(agents.id, row.id));
      }
    }
  }
  return added;
}
