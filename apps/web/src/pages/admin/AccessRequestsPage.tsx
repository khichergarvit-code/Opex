import { useEffect, useState } from 'react';
import type { AccessRequest } from '@opex/shared';
import { ApiError, decideAccessRequest, fetchAdminAccessRequests } from '../../lib/api';

export function AccessRequestsPage({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AccessRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expiryDrafts, setExpiryDrafts] = useState<Record<string, string>>({});

  function reload() {
    fetchAdminAccessRequests('pending')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load access requests'));
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
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <button onClick={onBack} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h2>Access requests</h2>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {rows.map((r) => (
        <div key={r.id} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginBottom: 8, fontSize: 13 }}>
          <div>
            document {r.documentId} — user {r.userId}
          </div>
          <div style={{ color: '#6b7280' }}>reason: {r.reason}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="datetime-local"
              onChange={(e) => setExpiryDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
            />
            <button onClick={() => decide(r.id, 'approved')}>Approve</button>
            <button onClick={() => decide(r.id, 'denied')}>Deny</button>
          </div>
        </div>
      ))}
      {rows.length === 0 && <p style={{ color: '#6b7280' }}>No pending requests.</p>}
    </div>
  );
}
