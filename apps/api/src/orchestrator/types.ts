import type { ModelRole } from '../models/types.js';

export type TaskType = 'chat' | 'doc_qa' | 'analysis' | 'code' | 'research' | 'vision';
export type Complexity = 'simple' | 'multi_step';
export type AgentName = 'general' | 'doc_qa' | 'vision' | 'analysis';

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
  filename: string;
  mime: string;
}
