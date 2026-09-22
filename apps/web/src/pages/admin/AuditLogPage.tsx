import { useEffect, useState } from 'react';
import { ApiError, fetchAdminAudit, type AdminAuditRow } from '../../lib/api';

export function AuditLogPage({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AdminAuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminAudit()
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load audit log'));
  }, []);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <button onClick={onBack} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h2>Audit log</h2>
      <p style={{ color: '#6b7280', fontSize: 12 }}>
        Append-only, hash-chained (security.md). Run <code>pnpm audit:verify</code> to check the chain.
      </p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '6px 10px' }}>Time</th>
            <th style={{ padding: '6px 10px' }}>Actor</th>
            <th style={{ padding: '6px 10px' }}>Action</th>
            <th style={{ padding: '6px 10px' }}>Resource</th>
            <th style={{ padding: '6px 10px' }}>Details</th>
            <th style={{ padding: '6px 10px' }}>Hash</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '6px 10px' }}>{r.ts}</td>
              <td style={{ padding: '6px 10px' }}>{r.actorEmail ?? '—'}</td>
              <td style={{ padding: '6px 10px' }}>{r.action}</td>
              <td style={{ padding: '6px 10px' }}>{r.resource}</td>
              <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{JSON.stringify(r.details)}</td>
              <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{r.hash?.slice(0, 10) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p style={{ color: '#6b7280' }}>No audit entries yet.</p>}
    </div>
  );
}
