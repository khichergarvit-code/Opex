import { z } from 'zod';

/**
 * Classification / clearance levels, per core.md's data model.
 * A user's clearance must be >= a resource's classification to access it.
 */
export const CLASSIFICATION_LEVELS = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
} as const;

export const classificationSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type Classification = z.infer<typeof classificationSchema>;

export const ROLES = ['super_admin', 'workspace_admin', 'employee'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;
