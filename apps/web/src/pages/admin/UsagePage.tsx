import { useEffect, useState } from 'react';
import { ApiError, fetchAdminUsage, type AdminUsageRow } from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Alert } from '../../components/ui/Alert';

export function UsagePage({ onBack: _onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AdminUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminUsage()
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load usage'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Usage"
        description="Raw token totals per user, model, and day — quota burn-down isn't shown since quotas aren't enforced yet."
      />
      {error && <Alert>{error}</Alert>}

      <Card>
        <DataTable
          emptyMessage="No usage recorded yet"
          loading={loading}
          error={error}
          rows={rows.map((r, i) => ({ ...r, id: `${r.userId}-${r.model}-${r.day}-${i}` }))}
          columns={[
            { key: 'day', label: 'Day' },
            { key: 'userEmail', label: 'User' },
            { key: 'model', label: 'Model', render: (r) => r.model ?? '—' },
            { key: 'callCount', label: 'Calls' },
            { key: 'tokensIn', label: 'Tokens in' },
            { key: 'tokensOut', label: 'Tokens out' },
          ]}
        />
      </Card>
    </div>
  );
}
