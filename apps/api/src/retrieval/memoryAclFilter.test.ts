import { describe, expect, it } from 'vitest';
import { memoryAclWhereClause } from './memoryAclFilter.js';

/** Flattens a drizzle SQL object's chunks into raw text + param list, so
 * we can assert the fragment's shape without a live DB. */
function render(sqlObj: { queryChunks: unknown[] }): { text: string; params: unknown[] } {
  let text = '';
  const params: unknown[] = [];
  for (const chunk of sqlObj.queryChunks) {
    if (chunk && typeof chunk === 'object' && 'value' in chunk) {
      text += (chunk as { value: string[] }).value.join('');
    } else {
      params.push(chunk);
      text += '?';
    }
  }
  return { text, params };
}

describe('memoryAclWhereClause', () => {
  it('never post-filters — the whole check is one SQL fragment', () => {
    const { text, params } = render(
      memoryAclWhereClause({ userId: 'u1', workspaceId: 'w1', projectId: 'p1', clearance: 1 }),
    );
    expect(text).toContain('m.deleted_at IS NULL');
    expect(text).toContain('m.classification <=');
    expect(text).toContain("m.scope = 'user'");
    expect(text).toContain("m.scope = 'project'");
    expect(text).toContain("m.scope = 'workspace'");
    expect(params).toEqual([1, 'u1', 'p1', 'w1']);
  });
});
