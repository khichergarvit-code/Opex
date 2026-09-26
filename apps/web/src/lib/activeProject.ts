const KEY = 'opex.activeProject';

/** The project the user last worked in, shared by Chat and Documents so they never disagree. */
export function getStoredProjectId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function storeProjectId(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // not remembered; both pages still work
  }
}

/** Picks the remembered project when it still exists, otherwise the first one. */
export function pickProject<T extends { id: string }>(projects: T[]): T | undefined {
  const stored = getStoredProjectId();
  return projects.find((p) => p.id === stored) ?? projects[0];
}
