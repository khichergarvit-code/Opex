export interface MemoryCandidate {
  text: string;
  type: 'episodic' | 'semantic';
  scope: 'user' | 'project' | 'workspace';
  confidence: number;
}
