import { useEffect, useState } from 'react';
import { ApiError, request } from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { Skeleton } from '../../components/ui/Skeleton';
import { Icon } from '../../components/ui/Icon';
import { Alert } from '../../components/ui/Alert';

interface AdminSystemResponse {
  queueByStatus: Array<{ status: string; count: number }>;
  diskUsedPct: number;
  gpu: string;
  vram: string;
  alerts: string[];
}

export function SystemPage({ onBack: _onBack }: { onBack: () => void }) {
  const [data, setData] = useState<AdminSystemResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    request<AdminSystemResponse>('/admin/system')
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load system status'));
  }, []);

  return (
    <div>
      <PageHeader title="System" description="Live disk, GPU, and job-queue status. Anything not reported by the host shows as N/A." />
      {error && <Alert>{error}</Alert>}
      {!data && !error && <Skeleton className="p-2" />}

      {data && (
        <>
          {data.alerts.length > 0 && (
            <div className="mb-4 flex flex-col gap-1 rounded-xl bg-danger-50 p-3 text-sm text-danger-700">
              {data.alerts.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Icon name="alert" className="h-4 w-4 shrink-0" />
                  {a}
                </div>
              ))}
            </div>
          )}

          <Card className="mb-6">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted">Disk used</p>
                <p className="mt-1 text-lg font-semibold text-fg">{data.diskUsedPct.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-muted">GPU</p>
                <p className="mt-1 text-lg font-semibold text-fg">{data.gpu}</p>
              </div>
              <div>
                <p className="text-muted">VRAM</p>
                <p className="mt-1 text-lg font-semibold text-fg">{data.vram}</p>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 text-sm font-semibold text-fg">Job queue</h3>
            <DataTable
              emptyMessage="No queued jobs"
              rows={data.queueByStatus.map((q) => ({ ...q, id: q.status }))}
              columns={[
                { key: 'status', label: 'Status' },
                { key: 'count', label: 'Count' },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}
