import type { AuthedUser } from '../policy/types.js';

export type ModelRole = 'router' | 'general' | 'coder' | 'vision' | 'embed' | 'rerank';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  role: ModelRole;
  messages: ChatMessage[];
  tools?: unknown[];
  jsonSchema?: Record<string, unknown>;
  stream?: boolean;
  budget?: { maxTokens?: number };
  user: AuthedUser;
  traceId: string;
}

export interface ChatStreamChunk {
  delta: string;
  done: boolean;
}

export interface EmbedRequest {
  texts: string[];
  user: AuthedUser;
  traceId: string;
}

export interface RerankRequest {
  query: string;
  documents: string[];
  user: AuthedUser;
  traceId: string;
}

export interface TokenizeRequest {
  role: ModelRole;
  text: string;
}
