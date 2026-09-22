import { useEffect, useState } from 'react';
import { ApiError, fetchAdminUsage, type AdminUsageRow } from '../../lib/api';

export function UsagePage({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AdminUsageRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminUsage()
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load usage'));
  }, []);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <button onClick={onBack} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h2>Usage — tokens per user, model, day</h2>
      <p style={{ color: '#6b7280', fontSize: 12 }}>
        Raw totals only — quota burn-down isn't shown since quotas aren't enforced yet (see docs/PROGRESS.md).
      </p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '6px 10px' }}>Day</th>
            <th style={{ padding: '6px 10px' }}>User</th>
            <th style={{ padding: '6px 10px' }}>Model</th>
            <th style={{ padding: '6px 10px' }}>Calls</th>
            <th style={{ padding: '6px 10px' }}>Tokens in</th>
            <th style={{ padding: '6px 10px' }}>Tokens out</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.userId}-${r.model}-${r.day}-${i}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '6px 10px' }}>{r.day}</td>
              <td style={{ padding: '6px 10px' }}>{r.userEmail}</td>
              <td style={{ padding: '6px 10px' }}>{r.model ?? '—'}</td>
              <td style={{ padding: '6px 10px' }}>{r.callCount}</td>
              <td style={{ padding: '6px 10px' }}>{r.tokensIn}</td>
              <td style={{ padding: '6px 10px' }}>{r.tokensOut}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p style={{ color: '#6b7280' }}>No usage recorded yet.</p>}
    </div>
  );
}
