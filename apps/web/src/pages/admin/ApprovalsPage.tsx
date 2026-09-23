import { useEffect, useState } from 'react';
import type { Approval } from '@opex/shared';
import { ApiError, decideApproval, fetchAdminApprovals } from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';

export function ApprovalsPage({ onBack: _onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    fetchAdminApprovals('pending')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load approvals'));
  }

  useEffect(reload, []);

  async function decide(id: string, decision: 'approved' | 'denied') {
    try {
      await decideApproval(id, decision);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to decide');
    }
  }

  return (
    <div>
      <PageHeader title="Approvals" description="Paused tool calls awaiting a decision (B4). A timeout auto-denies these." />
      {error && <p className="mb-4 text-sm text-danger-600">{error}</p>}

      {rows.length === 0 ? (
        <EmptyState title="No pending approvals" />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <p className="text-sm text-gray-800">
                <span className="font-semibold">{r.agentName}</span> agent wants to run <code className="rounded bg-gray-100 px-1">{r.toolName}</code>
              </p>
              <p className="mt-1 text-sm text-gray-500">{r.reason}</p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-50 p-2 text-xs">{JSON.stringify(r.args, null, 2)}</pre>
              <div className="mt-3 flex gap-2">
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
