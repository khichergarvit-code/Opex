import { useEffect, useState } from 'react';
import { ApiError, request } from '../../lib/api';

interface AdminModelRow {
  id: string;
  role: string;
  endpoint: string;
  vramMb: number | null;
  license: string;
  origin: string;
  enabled: boolean;
  groupAllowlist: string[];
  status: 'up' | 'down';
  vramLive: string;
}

export function ModelsPage({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AdminModelRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    request<AdminModelRow[]>('/admin/models')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load models'));
  }

  useEffect(reload, []);

  async function toggleEnabled(id: string, enabled: boolean) {
    try {
      await request(`/admin/models/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to update model');
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <button onClick={onBack} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h2>Models and tools</h2>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '6px 10px' }}>Id</th>
            <th style={{ padding: '6px 10px' }}>Role</th>
            <th style={{ padding: '6px 10px' }}>Status</th>
            <th style={{ padding: '6px 10px' }}>VRAM (configured)</th>
            <th style={{ padding: '6px 10px' }}>License</th>
            <th style={{ padding: '6px 10px' }}>Origin</th>
            <th style={{ padding: '6px 10px' }}>Enabled</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '6px 10px' }}>{r.id}</td>
              <td style={{ padding: '6px 10px' }}>{r.role}</td>
              <td style={{ padding: '6px 10px', color: r.status === 'up' ? '#16a34a' : '#dc2626' }}>{r.status}</td>
              <td style={{ padding: '6px 10px' }}>{r.vramMb ?? '—'} MB ({r.vramLive})</td>
              <td style={{ padding: '6px 10px' }}>{r.license}</td>
              <td style={{ padding: '6px 10px' }}>{r.origin}</td>
              <td style={{ padding: '6px 10px' }}>
                <button onClick={() => toggleEnabled(r.id, !r.enabled)}>{r.enabled ? 'Disable' : 'Enable'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p style={{ color: '#6b7280' }}>No models configured.</p>}
    </div>
  );
}
