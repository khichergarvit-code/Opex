import type { ModelRole } from '../models/types.js';

export type TaskType = 'chat' | 'doc_qa' | 'analysis' | 'code' | 'research' | 'vision' | 'image' | 'files';
export type Complexity = 'simple' | 'multi_step';
// The 6 built-in agents, widened with a string fallback so an admin-created
// custom agent (B5's POST /admin/agents) routes correctly without another
// type change every time one's added.
export type AgentName = 'general' | 'doc_qa' | 'vision' | 'analysis' | 'code' | 'research' | (string & {});

export interface RouteDecision {
  taskType: TaskType;
  complexity: Complexity;
  agent: AgentName;
  needs: { documents: boolean; memory: string[]; tools: string[] };
  reason: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  version: number;
  description: string;
  systemPromptTemplate: string;
  modelRole: ModelRole;
  toolAllowlist: string[];
  maxIterations: number;
  requiresApprovalTools: string[];
  enabled: boolean;
  allowedGroups: string[];
}

export interface Attachment {
  id?: string;
  filename: string;
  mime: string;
}
