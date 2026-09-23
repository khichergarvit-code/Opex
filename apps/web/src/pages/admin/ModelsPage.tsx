import { useEffect, useState } from 'react';
import { ApiError, request } from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/Badge';
import { DataTable } from '../../components/ui/DataTable';

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
  const [error, setError] = useState<string | null>(null);

  function reload() {
    request<AdminModelRow[]>('/admin/models')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load models'));
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
      {error && <p className="mb-4 text-sm text-danger-600">{error}</p>}

      <Card>
        <DataTable
          emptyMessage="No models configured"
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
