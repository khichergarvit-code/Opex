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
