import type { ApiDocument, LoginRequest, MeResponse, Project } from '@opex/shared';

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
