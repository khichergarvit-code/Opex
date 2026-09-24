export interface MemoryCandidate {
  text: string;
  type: 'episodic' | 'semantic';
  scope: 'user' | 'project' | 'workspace';
  confidence: number;
}

export interface SavedMemory {
  id: string;
  text: string;
}
