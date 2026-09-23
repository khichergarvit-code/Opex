import { useEffect, useState } from 'react';
import { ApiError, request } from '../../lib/api';

interface AdminMemoryRow {
  id: string;
  userId: string;
  userEmail: string;
  summaryLength: number;
  updatedAt: string;
}

interface LongTermMemoryRow {
  id: string;
  userId: string;
  userEmail: string;
  type: 'episodic' | 'semantic';
  scope: 'user' | 'project' | 'workspace';
  text: string;
  confidence: number;
  classification: number;
  sourceKind: 'conversation' | 'document' | 'web';
  accessCount: number;
  createdAt: string;
}

export function MemoryPage({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AdminMemoryRow[]>([]);
  const [longTerm, setLongTerm] = useState<LongTermMemoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState('');
  const [episodicDays, setEpisodicDays] = useState('90');
  const [semanticDays, setSemanticDays] = useState('180');

  function reload() {
    request<AdminMemoryRow[]>('/admin/memory')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load memory'));
    request<LongTermMemoryRow[]>('/admin/memory/long-term')
      .then(setLongTerm)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load long-term memory'));
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

  async function deleteMemory(id: string) {
    try {
      await request(`/admin/memory/long-term/${id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to delete');
    }
  }

  async function saveTtl(e: React.FormEvent) {
    e.preventDefault();
    try {
      await request('/admin/memory/ttl', {
        method: 'PUT',
        body: JSON.stringify({
          workspaceId,
          memoryTtlDays: {
            episodic: episodicDays === '' ? null : Number(episodicDays),
            semantic: semanticDays === '' ? null : Number(semanticDays),
          },
        }),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to save TTL');
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <button onClick={onBack} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h2>Memory</h2>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <h3>Long-term memory (B2 — episodic/semantic)</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '6px 10px' }}>User</th>
            <th style={{ padding: '6px 10px' }}>Type</th>
            <th style={{ padding: '6px 10px' }}>Scope</th>
            <th style={{ padding: '6px 10px' }}>Text</th>
            <th style={{ padding: '6px 10px' }}>Confidence</th>
            <th style={{ padding: '6px 10px' }}>Class.</th>
            <th style={{ padding: '6px 10px' }}>Source</th>
            <th style={{ padding: '6px 10px' }}>Accessed</th>
            <th style={{ padding: '6px 10px' }}></th>
          </tr>
        </thead>
        <tbody>
          {longTerm.map((m) => (
            <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '6px 10px' }}>{m.userEmail}</td>
              <td style={{ padding: '6px 10px' }}>{m.type}</td>
              <td style={{ padding: '6px 10px' }}>{m.scope}</td>
              <td style={{ padding: '6px 10px' }}>{m.text}</td>
              <td style={{ padding: '6px 10px' }}>{m.confidence.toFixed(2)}</td>
              <td style={{ padding: '6px 10px' }}>{m.classification}</td>
              <td style={{ padding: '6px 10px' }}>{m.sourceKind}</td>
              <td style={{ padding: '6px 10px' }}>{m.accessCount}</td>
              <td style={{ padding: '6px 10px' }}>
                <button onClick={() => deleteMemory(m.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {longTerm.length === 0 && <p style={{ color: '#6b7280' }}>No long-term memories yet.</p>}

      <h4>Set TTL (days; blank = never expires)</h4>
      <form onSubmit={saveTtl} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input placeholder="workspace id" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} required />
        <input placeholder="episodic days" value={episodicDays} onChange={(e) => setEpisodicDays(e.target.value)} />
        <input placeholder="semantic days" value={semanticDays} onChange={(e) => setSemanticDays(e.target.value)} />
        <button type="submit">Save TTL</button>
      </form>

      <h3>Working memory (A3 — per-conversation rolling summary)</h3>
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
