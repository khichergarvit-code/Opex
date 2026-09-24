import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

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
    return <Skeleton className="p-4" lines={4} />;
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
          <tr className="border-b border-line text-xs font-medium tracking-wide text-muted">
            {columns.map((col) => (
              <th key={col.key} className="px-3 py-3">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <motion.tr
              key={row.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.03, duration: 0.24 }}
              className="border-b border-line/60 transition-colors last:border-0 hover:bg-accent-50/70"
            >
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2.5 text-fg-2">
                  {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
