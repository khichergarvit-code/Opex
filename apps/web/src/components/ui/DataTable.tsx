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
}: {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  emptyMessage: string;
}) {
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
