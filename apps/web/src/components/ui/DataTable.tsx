import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';

export interface DataTableColumn<Row> {
  key: string;
  label: string;
  render?: (row: Row) => ReactNode;
}

export function DataTable<Row extends { id: string }>({
  columns,
  rows,
  emptyMessage,
  loading = false,
  error,
}: {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  emptyMessage: string;
  /** True while the initial fetch is still in flight — shows a neutral
   * loading message instead of the empty state, so "no data yet" and
   * "nothing here" aren't visually indistinguishable. */
  loading?: boolean;
  /** When set and there are no rows, shows this instead of the empty
   * state — "failed to load" and "there's genuinely nothing here" are
   * different situations and shouldn't render the same message. Ignored
   * once real rows exist, so an unrelated later action's error doesn't
   * hide an already-loaded table. */
  error?: string | null;
}) {
  if (loading) {
    return <p className="py-6 text-center text-sm text-gray-400">Loading…</p>;
  }
  if (rows.length === 0 && error) {
    return <p className="py-6 text-center text-sm text-danger-600">{error}</p>;
  }
  if (rows.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wide text-gray-400">
            {columns.map((col) => (
              <th key={col.key} className="px-3 py-2">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2.5 text-gray-700">
                  {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
