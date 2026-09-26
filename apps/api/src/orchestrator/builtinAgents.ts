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
  },
];

export async function ensureBuiltInAgents(db: Db): Promise<string[]> {
  const added: string[] = [];
  for (const agent of BUILT_IN_AGENTS) {
    const [existing] = await db.select({ id: agents.id }).from(agents).where(eq(agents.name, agent.name)).limit(1);
    if (!existing) {
      await db.insert(agents).values(agent);
      added.push(agent.name);
    }
  }
  return added;
}
