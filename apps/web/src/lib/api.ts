import type {
  AdminUser,
  ApiDocument,
  ApiGroup,
  CreateGroupRequest,
  CreateUserRequest,
  LoginRequest,
  MeResponse,
  Project,
} from '@opex/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (method !== 'GET' && csrfToken) headers.set('x-csrf-token', csrfToken);

  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function login(
  body: LoginRequest,
): Promise<MeResponse & { csrfToken: string }> {
  const result = await request<MeResponse & { csrfToken: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  setCsrfToken(result.csrfToken);
  return result;
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
  csrfToken = null;
}

export async function fetchProjects(): Promise<Project[]> {
  return request<Project[]>('/projects');
}

export async function createConversation(projectId: string): Promise<{ id: string }> {
  return request('/conversations', { method: 'POST', body: JSON.stringify({ projectId }) });
}

export async function fetchDocuments(projectId: string): Promise<ApiDocument[]> {
  return request<ApiDocument[]>(`/projects/${projectId}/documents`);
}

export async function fetchDocument(documentId: string): Promise<ApiDocument> {
  return request<ApiDocument>(`/documents/${documentId}`);
}

export interface AdminSpanRow {
  id: string;
  traceId: string;
  kind: string;
  name: string;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  status: 'ok' | 'error';
  createdAt: string;
}

export interface AdminUsageRow {
  userId: string;
  userEmail: string;
  model: string | null;
  day: string;
  tokensIn: number;
  tokensOut: number;
  callCount: number;
}

export async function fetchAdminLogs(params: { kind?: string; status?: string } = {}): Promise<AdminSpanRow[]> {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return request<AdminSpanRow[]>(`/admin/logs${qs ? `?${qs}` : ''}`);
}

export async function fetchAdminUsage(): Promise<AdminUsageRow[]> {
  return request<AdminUsageRow[]>('/admin/usage');
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  return request<AdminUser[]>('/admin/users');
}

export async function createAdminUser(body: CreateUserRequest): Promise<AdminUser> {
  return request<AdminUser>('/admin/users', { method: 'POST', body: JSON.stringify(body) });
}

export async function setAdminUserStatus(userId: string, status: 'active' | 'disabled'): Promise<AdminUser> {
  const path = status === 'disabled' ? 'disable' : 'enable';
  return request<AdminUser>(`/admin/users/${userId}/${path}`, { method: 'PATCH' });
}

export async function fetchAdminGroups(): Promise<ApiGroup[]> {
  return request<ApiGroup[]>('/admin/groups');
}

export async function createAdminGroup(body: CreateGroupRequest): Promise<ApiGroup> {
  return request<ApiGroup>('/admin/groups', { method: 'POST', body: JSON.stringify(body) });
}

export async function addGroupMember(groupId: string, userId: string): Promise<void> {
  await request(`/admin/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ userId }) });
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  await request(`/admin/groups/${groupId}/members/${userId}`, { method: 'DELETE' });
}

export interface AdminConversationRow {
  id: string;
  userId: string;
  userEmail: string;
  projectId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminMessageRow {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export async function fetchAdminConversations(userId?: string): Promise<AdminConversationRow[]> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  return request<AdminConversationRow[]>(`/admin/conversations${qs}`);
}

export async function fetchAdminConversationMessages(conversationId: string): Promise<AdminMessageRow[]> {
  return request<AdminMessageRow[]>(`/admin/conversations/${conversationId}/messages`);
}

export interface AdminAuditRow {
  id: string;
  ts: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  resource: string;
  details: unknown;
  prevHash: string | null;
  hash: string | null;
}

export async function fetchAdminAudit(params: { action?: string; actorId?: string } = {}): Promise<AdminAuditRow[]> {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return request<AdminAuditRow[]>(`/admin/audit${qs ? `?${qs}` : ''}`);
}

export async function uploadDocument(projectId: string, file: File): Promise<ApiDocument> {
  const form = new FormData();
  form.append('file', file);
  const headers = new Headers();
  const token = getCsrfToken();
  if (token) headers.set('x-csrf-token', token);
  const res = await fetch(`/projects/${projectId}/documents`, {
    method: 'POST',
    headers,
    body: form,
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return (await res.json()) as ApiDocument;
}
