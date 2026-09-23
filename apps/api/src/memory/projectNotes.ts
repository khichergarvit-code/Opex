/**
 * memory.md's "project" memory type: read "always, inside that project" —
 * no router decision needed, unlike episodic/semantic. Reads straight
 * from the already-existing projects.notesMd column; no extraction, no
 * table.
 */
export function renderProjectNotesBlock(notesMd: string): string | null {
  if (!notesMd.trim()) return null;
  return `<project_notes>\n${notesMd}\n</project_notes>`;
}
