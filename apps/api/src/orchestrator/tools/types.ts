import type { Db } from '../../db/client.js';
import type { ModelGateway, SpanWriter } from '../../models/gateway.js';
import type { AuthedUser } from '../../policy/types.js';

export interface ToolContext {
  db: Db;
  gateway: ModelGateway;
  spanWriter: SpanWriter;
  user: AuthedUser;
  traceId: string;
  conversationId: string;
  workspaceId: string;
  projectId: string;
  sandboxRunnerUrl: string;
  sandboxSharedSecret: string;
  dataDir: string;
  /** ACL-filtered classification floor for the current task, for invariant #10's tool gate. */
  taskClassification: number;
}

export interface ToolResult {
  ok: boolean;
  summary: string;
  artifactIds: string[];
  /** Name and type of each artifact created, so the chat can show images inline and files as downloads. */
  artifacts?: Array<{ id: string; filename: string; mime: string }>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments, per llama-server's --jinja native tool-call format. */
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}
