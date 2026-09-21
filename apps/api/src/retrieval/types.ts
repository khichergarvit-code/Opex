import type { Classification } from '@opex/shared';

export interface RetrievedChunk {
  id: string;
  documentId: string;
  page: number;
  bbox: { x0: number; y0: number; x1: number; y1: number; crop_path?: string };
  sectionPath: string[];
  text: string;
  kind: 'text' | 'table' | 'figure_caption';
  suspicious: boolean;
  score: number;
}

export interface SearchParams {
  workspaceId: string;
  projectIds: string[];
  userId: string;
  clearance: Classification;
  groupIds: string[];
  query: string;
  vectorTopK?: number;
  ftsTopK?: number;
  finalK?: number;
}

export interface SearchResult {
  chunks: RetrievedChunk[];
  noSupport: boolean;
}

export interface SearchOutcome extends SearchResult {
  latencyMs: number;
}

export interface CitationMapEntry {
  marker: number;
  documentId: string;
  filename: string;
  page: number;
  bbox: RetrievedChunk['bbox'];
}
