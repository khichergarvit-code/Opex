import { useEffect, useState } from 'react';
import type { AccessRequest } from '@opex/shared';
import { ApiError, decideAccessRequest, fetchAdminAccessRequests } from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Alert } from '../../components/ui/Alert';

export function AccessRequestsPage({ onBack: _onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expiryDrafts, setExpiryDrafts] = useState<Record<string, string>>({});

  function reload() {
    setError(null);
    fetchAdminAccessRequests('pending')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load access requests'))
      .finally(() => setLoading(false));
  }

  useEffect(reload, []);

  async function decide(id: string, decision: 'approved' | 'denied') {
    const draft = expiryDrafts[id];
    const expiresAt = decision === 'approved' && draft ? new Date(draft).toISOString() : null;
    try {
      await decideAccessRequest(id, decision, expiresAt);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to decide');
    }
  }

  return (
    <div>
      <PageHeader title="Access requests" description="A user has requested access to a document above their default clearance." />
      {error && <Alert>{error}</Alert>}

      {loading ? (
        <Skeleton className="p-2" />
      ) : rows.length === 0 ? (
        error ? null : <EmptyState title="No pending requests" />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <p className="text-sm text-fg">
                Document <span className="font-mono text-xs">{r.documentId}</span> — user{' '}
                <span className="font-mono text-xs">{r.userId}</span>
              </p>
              <p className="mt-1 text-sm text-muted">Reason: {r.reason}</p>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="datetime-local"
                  onChange={(e) => setExpiryDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                  className="rounded-lg border border-line px-2 py-1 text-sm"
                />
                <Button variant="primary" size="sm" onClick={() => decide(r.id, 'approved')}>
                  Approve
                </Button>
                <Button variant="danger" size="sm" onClick={() => decide(r.id, 'denied')}>
                  Deny
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
