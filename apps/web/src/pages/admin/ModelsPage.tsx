import { useEffect, useState } from 'react';
import { ApiError, request } from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { ToggleSwitch } from '../../components/ui/ToggleSwitch';
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
  verified: boolean;
  enabled: boolean;
  groupAllowlist: string[];
  status: 'up' | 'down';
  vramLive: string;
}

const ROLE_ORDER = ['general', 'router', 'vision', 'coder', 'image', 'embed', 'rerank'];
const byRoleThenId = (a: AdminModelRow, b: AdminModelRow) =>
  (ROLE_ORDER.indexOf(a.role) + 1 || 99) - (ROLE_ORDER.indexOf(b.role) + 1 || 99) || a.id.localeCompare(b.id);

export function ModelsPage({ onBack: _onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AdminModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    setError(null);
    request<AdminModelRow[]>('/admin/models')
      .then((r) => setRows([...r].sort(byRoleThenId)))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load models'))
      .finally(() => setLoading(false));
  }

  useEffect(reload, []);

  async function toggleEnabled(id: string, enabled: boolean) {
    // Update in place (no reload) so the row never jumps to another position.
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
    try {
      await request(`/admin/models/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
    } catch (err) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r)));
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
            {
              key: 'origin',
              label: 'Origin',
              render: (r) => (
                <span className="flex flex-wrap items-center gap-2">
                  {r.origin}
                  {!r.verified && (
                    <StatusPill tone="warning" title="Served from another host: the file cannot be SHA-256 verified">
                      unverified (external)
                    </StatusPill>
                  )}
                </span>
              ),
            },
            {
              key: 'enabled',
              label: 'Enabled',
              render: (r) => <ToggleSwitch checked={r.enabled} onChange={(v) => toggleEnabled(r.id, v)} label={`${r.enabled ? 'Disable' : 'Enable'} ${r.id}`} />,
            },
          ]}
        />
      </Card>
    </div>
  );
}
