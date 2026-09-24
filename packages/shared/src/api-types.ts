import { z } from 'zod';
import { classificationSchema, roleSchema } from './classification.js';

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const meResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: roleSchema,
  clearance: classificationSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const createConversationRequestSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
});
export type CreateConversationRequest = z.infer<typeof createConversationRequestSchema>;

export const postMessageRequestSchema = z.object({
  content: z.string().min(1).max(8000),
  /** Optional chosen chat model id (see GET /models); defaults to the general model. */
  modelId: z.string().min(1).max(100).optional(),
  /** Ids from POST /conversations/:id/attachments (images the user attached to this message). */
  attachmentIds: z.array(z.string().uuid()).max(4).optional(),
});
export type PostMessageRequest = z.infer<typeof postMessageRequestSchema>;

export const projectSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string(),
  defaultClassification: classificationSchema,
});
export type Project = z.infer<typeof projectSchema>;

export const conversationSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().nullable(),
  createdAt: z.string(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const messageRoleSchema = z.enum(['user', 'assistant', 'system']);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const bboxSchema = z.object({
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number(),
});
export type Bbox = z.infer<typeof bboxSchema>;

export const citationSchema = z.object({
  marker: z.number().int(),
  documentId: z.string().uuid(),
  filename: z.string(),
  page: z.number().int(),
  bbox: bboxSchema,
});
export type Citation = z.infer<typeof citationSchema>;

export const messageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  role: messageRoleSchema,
  content: z.string(),
  citations: z.array(citationSchema).default([]),
  createdAt: z.string(),
});
export type Message = z.infer<typeof messageSchema>;

export const documentStatusSchema = z.enum(['queued', 'processing', 'ready', 'failed']);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const documentSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  filename: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int(),
  classification: classificationSchema,
  status: documentStatusSchema,
  pageCount: z.number().int().nullable(),
  pagesDone: z.number().int(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
});
export type ApiDocument = z.infer<typeof documentSchema>;

export const createAccessRequestSchema = z.object({
  documentId: z.string().uuid(),
  reason: z.string().min(1).max(1000),
});
export type CreateAccessRequestRequest = z.infer<typeof createAccessRequestSchema>;

export const decideAccessRequestSchema = z.object({
  decision: z.enum(['approved', 'denied']),
  expiresAt: z.string().datetime().nullable().optional(),
});
export type DecideAccessRequestRequest = z.infer<typeof decideAccessRequestSchema>;

export const accessRequestStatusSchema = z.enum(['pending', 'approved', 'denied']);
export type AccessRequestStatus = z.infer<typeof accessRequestStatusSchema>;

export const accessRequestSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  userId: z.string().uuid(),
  reason: z.string(),
  status: accessRequestStatusSchema,
  decidedBy: z.string().uuid().nullable(),
  decidedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AccessRequest = z.infer<typeof accessRequestSchema>;

export const userStatusSchema = z.enum(['active', 'disabled']);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const decideApprovalSchema = z.object({
  decision: z.enum(['approved', 'denied']),
});
export type DecideApprovalRequest = z.infer<typeof decideApprovalSchema>;

export const approvalStatusSchema = z.enum(['pending', 'approved', 'denied']);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const approvalSchema = z.object({
  id: z.string().uuid(),
  traceId: z.string().uuid(),
  conversationId: z.string().uuid(),
  requesterId: z.string().uuid(),
  agentName: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()),
  reason: z.string(),
  status: approvalStatusSchema,
  decidedBy: z.string().uuid().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Approval = z.infer<typeof approvalSchema>;

export const createUserRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(12),
  role: roleSchema,
  clearance: classificationSchema,
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const adminUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  clearance: classificationSchema,
  status: userStatusSchema,
  createdAt: z.string(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const createGroupRequestSchema = z.object({
  name: z.string().min(1).max(100),
});
export type CreateGroupRequest = z.infer<typeof createGroupRequestSchema>;

export const groupMembershipRequestSchema = z.object({
  userId: z.string().uuid(),
});
export type GroupMembershipRequest = z.infer<typeof groupMembershipRequestSchema>;

export const groupSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string(),
  memberIds: z.array(z.string().uuid()),
});
export type ApiGroup = z.infer<typeof groupSchema>;
