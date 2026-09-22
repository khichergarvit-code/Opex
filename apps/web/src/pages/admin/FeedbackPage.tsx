import { useEffect, useState } from 'react';
import { ApiError, request } from '../../lib/api';

interface AdminFeedbackRow {
  id: string;
  messageId: string;
  traceId: string | null;
  userId: string;
  rating: 'thumbs_up' | 'thumbs_down';
  rootCauseTag: string | null;
  exportedToEval: boolean;
  createdAt: string;
}

export function FeedbackPage({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AdminFeedbackRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [keywordDrafts, setKeywordDrafts] = useState<Record<string, string>>({});

  function reload() {
    request<AdminFeedbackRow[]>('/admin/feedback?rating=thumbs_down')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load feedback'));
  }

  useEffect(reload, []);

  async function tag(id: string) {
    const rootCauseTag = tagDrafts[id];
    if (!rootCauseTag) return;
    try {
      await request(`/admin/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({ rootCauseTag }) });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to tag feedback');
    }
  }

  async function exportToEval(id: string) {
    const expectedKeyword = keywordDrafts[id];
    if (!expectedKeyword) {
      setError('enter an expected keyword before exporting');
      return;
    }
    try {
      await request(`/admin/feedback/${id}/export-to-eval`, { method: 'POST', body: JSON.stringify({ expectedKeyword }) });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to export');
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <button onClick={onBack} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h2>Feedback triage (thumbs down)</h2>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {rows.map((r) => (
        <div key={r.id} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginBottom: 8, fontSize: 13 }}>
          <div>
            message {r.messageId} — trace {r.traceId ?? '—'} — {r.createdAt}
            {r.exportedToEval && <span style={{ color: '#16a34a' }}> (exported)</span>}
          </div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <input
              placeholder="root cause"
              value={tagDrafts[r.id] ?? r.rootCauseTag ?? ''}
              onChange={(e) => setTagDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
            />
            <button onClick={() => tag(r.id)}>Tag</button>
            <input
              placeholder="expected keyword"
              value={keywordDrafts[r.id] ?? ''}
              onChange={(e) => setKeywordDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
            />
            <button onClick={() => exportToEval(r.id)} disabled={r.exportedToEval}>
              Export to eval
            </button>
          </div>
        </div>
      ))}
      {rows.length === 0 && <p style={{ color: '#6b7280' }}>No thumbs-down feedback yet.</p>}
    </div>
  );
}
