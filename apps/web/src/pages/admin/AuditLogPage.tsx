import { useEffect, useState } from 'react';
import { ApiError, fetchAdminAudit, type AdminAuditRow } from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Alert } from '../../components/ui/Alert';

export function AuditLogPage({ onBack: _onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AdminAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminAudit()
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load audit log'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Audit log" description="Append-only, hash-chained. Run pnpm audit:verify to check the chain." />
      {error && <Alert>{error}</Alert>}

      <Card>
        <DataTable
          emptyMessage="No audit entries yet"
          loading={loading}
          error={error}
          rows={rows}
          columns={[
            { key: 'ts', label: 'Time' },
            { key: 'actorEmail', label: 'Actor', render: (r) => r.actorEmail ?? '—' },
            { key: 'action', label: 'Action' },
            { key: 'resource', label: 'Resource' },
            { key: 'details', label: 'Details', render: (r) => <span className="font-mono text-xs">{JSON.stringify(r.details)}</span> },
            { key: 'hash', label: 'Hash', render: (r) => <span className="font-mono text-xs">{r.hash?.slice(0, 10) ?? '—'}</span> },
          ]}
        />
      </Card>
    </div>
  );
}
