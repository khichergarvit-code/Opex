import { useEffect, useState } from 'react';
import { ApiError, request } from '../../lib/api';

interface AdminSystemResponse {
  queueByStatus: Array<{ status: string; count: number }>;
  diskUsedPct: number;
  gpu: string;
  vram: string;
  alerts: string[];
}

export function SystemPage({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<AdminSystemResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    request<AdminSystemResponse>('/admin/system')
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load system status'));
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <button onClick={onBack} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h2>System</h2>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {data && (
        <>
          {data.alerts.length > 0 && (
            <div style={{ background: '#fee2e2', padding: 8, borderRadius: 4, marginBottom: 12 }}>
              {data.alerts.map((a, i) => (
                <div key={i}>⚠️ {a}</div>
              ))}
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              <tr>
                <td style={{ padding: '6px 10px', fontWeight: 600 }}>Disk used</td>
                <td style={{ padding: '6px 10px' }}>{data.diskUsedPct.toFixed(1)}%</td>
              </tr>
              <tr>
                <td style={{ padding: '6px 10px', fontWeight: 600 }}>GPU</td>
                <td style={{ padding: '6px 10px' }}>{data.gpu}</td>
              </tr>
              <tr>
                <td style={{ padding: '6px 10px', fontWeight: 600 }}>VRAM</td>
                <td style={{ padding: '6px 10px' }}>{data.vram}</td>
              </tr>
            </tbody>
          </table>
          <h3>Job queue</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '6px 10px' }}>Status</th>
                <th style={{ padding: '6px 10px' }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {data.queueByStatus.map((q) => (
                <tr key={q.status}>
                  <td style={{ padding: '6px 10px' }}>{q.status}</td>
                  <td style={{ padding: '6px 10px' }}>{q.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
