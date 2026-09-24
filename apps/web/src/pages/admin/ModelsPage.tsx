import { useEffect, useState } from 'react';
import { ApiError, request } from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/Badge';
import { DataTable } from '../../components/ui/DataTable';
import { Alert } from '../../components/ui/Alert';

interface AdminModelRow {
  id: string;
  role: string;
  endpoint: string;
  vramMb: number | null;
  license: string;
  origin: string;
  enabled: boolean;
  groupAllowlist: string[];
  status: 'up' | 'down';
  vramLive: string;
}

export function ModelsPage({ onBack: _onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AdminModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    setError(null);
    request<AdminModelRow[]>('/admin/models')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load models'))
      .finally(() => setLoading(false));
  }

  useEffect(reload, []);

  async function toggleEnabled(id: string, enabled: boolean) {
    try {
      await request(`/admin/models/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to update model');
    }
  }

  return (
    <div>
      <PageHeader title="Models and tools" description="Status, VRAM, license and origin, and an enable toggle." />
      {error && <Alert>{error}</Alert>}

      <Card>
        <DataTable
          emptyMessage="No models configured"
          loading={loading}
          error={error}
          rows={rows}
          columns={[
            { key: 'id', label: 'Id' },
            { key: 'role', label: 'Role' },
            { key: 'status', label: 'Status', render: (r) => <StatusPill tone={r.status === 'up' ? 'success' : 'danger'}>{r.status}</StatusPill> },
            { key: 'vram', label: 'VRAM (configured)', render: (r) => `${r.vramMb ?? '—'} MB (${r.vramLive})` },
            { key: 'license', label: 'License' },
            { key: 'origin', label: 'Origin' },
            {
              key: 'enabled',
              label: '',
              render: (r) => (
                <Button size="sm" onClick={() => toggleEnabled(r.id, !r.enabled)}>
                  {r.enabled ? 'Disable' : 'Enable'}
                </Button>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
