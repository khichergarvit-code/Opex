import type { AuthedUser } from '../policy/types.js';

export type ModelRole = 'router' | 'general' | 'coder' | 'vision' | 'embed' | 'rerank';

export interface ToolCallRequest {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Set on an assistant turn that made tool calls (native --jinja tool calling). */
  tool_calls?: ToolCallRequest[];
  /** Set on a 'tool' turn — which call this result answers. */
  tool_call_id?: string;
}

export interface ChatRequest {
  role: ModelRole;
  messages: ChatMessage[];
  tools?: unknown[];
  jsonSchema?: Record<string, unknown>;
  stream?: boolean;
  budget?: { maxTokens?: number };
  /** Use this specific model (its own role is what policy checks) instead of the role's default. */
  modelId?: string;
  signal?: AbortSignal;
  /** Stream text deltas while still returning the full result (tool calls included). */
  onToken?: (delta: string) => void;
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
