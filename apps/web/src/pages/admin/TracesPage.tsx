import { useEffect, useState } from 'react';
import { ApiError, fetchAdminLogs, type AdminSpanRow } from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { formatDateTime } from '../../lib/format';
import { StatusPill } from '../../components/ui/Badge';
import { Alert } from '../../components/ui/Alert';

const KINDS = ['', 'llm', 'retrieval', 'memory', 'tool', 'policy'];
const STATUSES = ['', 'ok', 'error'];

export function TracesPage({ onBack: _onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AdminSpanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    fetchAdminLogs({ kind: kind || undefined, status: status || undefined })
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load logs'))
      .finally(() => setLoading(false));
  }, [kind, status]);

  return (
    <div>
      <PageHeader title="Traces" description="Every LLM, retrieval, memory, tool, and policy span, filterable by kind and status." />
      <p className="mb-4 -mt-3 inline-flex items-center gap-2 text-xs text-muted">
        <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-success-600" />
        live feed
      </p>
      {error && <Alert>{error}</Alert>}

      <div className="mb-4 flex gap-3">
        <label className="flex items-center gap-2 text-sm text-fg-2">
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg border border-line px-2 py-1 text-sm">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k || 'all'}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-fg-2">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-line px-2 py-1 text-sm">
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s || 'all'}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Card>
        <DataTable
          emptyMessage="No spans recorded yet"
          loading={loading}
          error={error}
          rows={rows}
          columns={[
            { key: 'time', label: 'Time', sortValue: (r) => new Date(r.createdAt).getTime(), render: (r) => formatDateTime(r.createdAt) },
            { key: 'kind', label: 'Kind' },
            { key: 'name', label: 'Name' },
            { key: 'model', label: 'Model', render: (r) => r.model ?? '—' },
            { key: 'tokens', label: 'Tokens', sortValue: (r) => (r.tokensIn ?? 0) + (r.tokensOut ?? 0), render: (r) => `${r.tokensIn ?? '—'} / ${r.tokensOut ?? '—'}` },
            { key: 'latency', label: 'Latency', sortValue: (r) => r.latencyMs ?? 0, render: (r) => (r.latencyMs ? `${r.latencyMs}ms` : '—') },
            {
              key: 'status',
              label: 'Status',
              render: (r) => <StatusPill tone={r.status === 'error' ? 'danger' : 'success'}>{r.status}</StatusPill>,
            },
          ]}
        />
      </Card>
    </div>
  );
}
