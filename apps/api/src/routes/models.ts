import { inArray } from 'drizzle-orm';
import { Router } from 'express';
import type { Db } from '../db/client.js';
import { models } from '../db/schema/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { can } from '../policy/can.js';
import type { AuthedUser } from '../policy/types.js';
import { loadUserGroupIds } from './docQa.js';

const CHAT_ROLES = ['general', 'router', 'coder', 'vision'] as const;

const ROLE_LABELS: Record<string, string> = { general: 'Quality', router: 'Fast', coder: 'Code', vision: 'Vision' };

export interface ChatModelOption {
  id: string;
  role: string;
  label: string;
  detail: string;
  /** Short caveat shown next to the name, e.g. what the model is not suited for. */
  note?: string;
  isDefault: boolean;
}

/**
 * Chat models this user may pick: enabled, policy-allowed for their role,
 * and either unrestricted or shared with one of their groups. Never exposes
 * endpoints or file paths.
 */
export async function listChatModels(db: Db, user: AuthedUser): Promise<ChatModelOption[]> {
  const rows = await db.select().from(models).where(inArray(models.role, [...CHAT_ROLES]));
  const groupIds = new Set(await loadUserGroupIds(db, user.id));
  return rows
    .filter((m) => m.enabled)
    .filter((m) => can(user, 'model:invoke', { modelRole: m.role }).allowed)
    .filter((m) => m.groupAllowlist.length === 0 || m.groupAllowlist.some((g) => groupIds.has(g)))
    // Alias entries (router/vision served by the same endpoint as the main model) are one choice, not three.
    .sort((a, b) => Number(b.role === 'general') - Number(a.role === 'general'))
    .filter((m, i, all) => all.findIndex((o) => o.endpoint === m.endpoint) === i)
    .map((m) => ({
      id: m.id,
      role: m.role,
      label: ROLE_LABELS[m.role] ?? m.role,
      detail: m.origin.split('/').pop() ?? m.origin,
      note: m.role === 'general' ? undefined : 'chat only',
      isDefault: m.role === 'general',
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

export function createModelsRouter(db: Db): Router {
  const router = Router();
  router.get('/models', requireAuth(db), async (req, res) => {
    res.json(await listChatModels(db, req.user!));
  });
  return router;
}
