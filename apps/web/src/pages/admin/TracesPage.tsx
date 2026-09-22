import { useEffect, useState } from 'react';
import { ApiError, fetchAdminLogs, type AdminSpanRow } from '../../lib/api';

const KINDS = ['', 'llm', 'retrieval', 'memory', 'tool', 'policy'];
const STATUSES = ['', 'ok', 'error'];

export function TracesPage({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AdminSpanRow[]>([]);
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminLogs({ kind: kind || undefined, status: status || undefined })
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load logs'));
  }, [kind, status]);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <button onClick={onBack} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h2>Traces (live span feed)</h2>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <div style={{ marginBottom: 12, display: 'flex', gap: 12 }}>
        <label>
          Kind:{' '}
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k || 'all'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status:{' '}
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s || 'all'}
              </option>
            ))}
          </select>
        </label>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '6px 10px' }}>Time</th>
            <th style={{ padding: '6px 10px' }}>Kind</th>
            <th style={{ padding: '6px 10px' }}>Name</th>
            <th style={{ padding: '6px 10px' }}>Model</th>
            <th style={{ padding: '6px 10px' }}>Tokens</th>
            <th style={{ padding: '6px 10px' }}>Latency</th>
            <th style={{ padding: '6px 10px' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '6px 10px' }}>{new Date(r.createdAt).toLocaleTimeString()}</td>
              <td style={{ padding: '6px 10px' }}>{r.kind}</td>
              <td style={{ padding: '6px 10px' }}>{r.name}</td>
              <td style={{ padding: '6px 10px' }}>{r.model ?? '—'}</td>
              <td style={{ padding: '6px 10px' }}>
                {r.tokensIn ?? '—'} / {r.tokensOut ?? '—'}
              </td>
              <td style={{ padding: '6px 10px' }}>{r.latencyMs ? `${r.latencyMs}ms` : '—'}</td>
              <td style={{ padding: '6px 10px', color: r.status === 'error' ? 'crimson' : '#16a34a' }}>
                {r.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p style={{ color: '#6b7280' }}>No spans recorded yet.</p>}
    </div>
  );
}
