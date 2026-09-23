import { useEffect, useState } from 'react';
import type { Approval } from '@opex/shared';
import { ApiError, decideApproval, fetchAdminApprovals } from '../../lib/api';

export function ApprovalsPage({ onBack }: { onBack: () => void }) {
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
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <button onClick={onBack} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h2>Approvals</h2>
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        Paused tool calls awaiting a decision (B4). A timeout auto-denies these — see docs/PROGRESS.md.
      </p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {rows.map((r) => (
        <div key={r.id} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginBottom: 8, fontSize: 13 }}>
          <div>
            <strong>{r.agentName}</strong> agent wants to run <code>{r.toolName}</code>
          </div>
          <div style={{ color: '#6b7280', marginTop: 4 }}>{r.reason}</div>
          <pre style={{ background: '#f9fafb', padding: 6, marginTop: 6, fontSize: 12, overflowX: 'auto' }}>
            {JSON.stringify(r.args, null, 2)}
          </pre>
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <button onClick={() => decide(r.id, 'approved')}>Approve</button>
            <button onClick={() => decide(r.id, 'denied')}>Deny</button>
          </div>
        </div>
      ))}
      {rows.length === 0 && <p style={{ color: '#6b7280' }}>No pending approvals.</p>}
    </div>
  );
}
