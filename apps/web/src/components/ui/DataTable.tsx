import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

export interface DataTableColumn<Row> {
  key: string;
  label: string;
  render?: (row: Row) => ReactNode;
  /** Makes the column sortable: the value to compare rows by (click the header to sort, click again to reverse). */
  sortValue?: (row: Row) => number | string | null | undefined;
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
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const sortedRows = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!sort || !col?.sortValue) return rows;
    const value = col.sortValue;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = value(a) ?? '';
      const y = value(b) ?? '';
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sign;
    });
  }, [rows, columns, sort]);

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
              <th key={col.key} className="px-3 py-3" aria-sort={sort?.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                {col.sortValue ? (
                  <button
                    type="button"
                    onClick={() => setSort((s) => (s?.key === col.key ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: col.key, dir: 'desc' }))}
                    className="inline-flex items-center gap-1 font-medium hover:text-fg"
                    title="Click to sort"
                  >
                    {col.label}
                    <span aria-hidden="true" className={sort?.key === col.key ? 'text-accent-600' : 'text-faint'}>
                      {sort?.key === col.key ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => (
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
