import { useEffect, useState } from 'react';
import { ApiError, request } from '../../lib/api';

interface AdminMemoryRow {
  id: string;
  userId: string;
  userEmail: string;
  summaryLength: number;
  updatedAt: string;
}

export function MemoryPage({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AdminMemoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    request<AdminMemoryRow[]>('/admin/memory')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load memory'));
  }

  useEffect(reload, []);

  async function purge(id: string) {
    try {
      await request(`/admin/memory/${id}/purge`, { method: 'POST' });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to purge');
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <button onClick={onBack} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h2>Memory</h2>
      <p style={{ background: '#fef3c7', padding: 8, fontSize: 12, borderRadius: 4 }}>
        B2's long-term, cross-conversation memory store isn't built yet — this shows only each
        conversation's rolling working-memory summary (A3), not TTLs, purge counts, or per-user
        cross-conversation inspection.
      </p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '6px 10px' }}>User</th>
            <th style={{ padding: '6px 10px' }}>Summary length (chars)</th>
            <th style={{ padding: '6px 10px' }}>Updated</th>
            <th style={{ padding: '6px 10px' }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '6px 10px' }}>{r.userEmail}</td>
              <td style={{ padding: '6px 10px' }}>{r.summaryLength}</td>
              <td style={{ padding: '6px 10px' }}>{r.updatedAt}</td>
              <td style={{ padding: '6px 10px' }}>
                <button onClick={() => purge(r.id)}>Purge</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p style={{ color: '#6b7280' }}>No working-memory summaries yet.</p>}
    </div>
  );
}
