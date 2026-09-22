import { useEffect, useState } from 'react';
import type { AdminUser } from '@opex/shared';
import { ApiError, fetchAdminUsers, request } from '../../lib/api';

interface AdminPolicyRow {
  id: string;
  name: string;
  rules: Record<string, unknown>;
}

export function PoliciesPage({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AdminPolicyRow[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rulesText, setRulesText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [previewUserId, setPreviewUserId] = useState('');
  const [previewAction, setPreviewAction] = useState('model:invoke');
  const [previewCtx, setPreviewCtx] = useState('{"modelRole":"general"}');
  const [previewResult, setPreviewResult] = useState<string | null>(null);

  function reload() {
    request<AdminPolicyRow[]>('/admin/policies')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load policies'));
    fetchAdminUsers()
      .then(setUsers)
      .catch(() => {});
  }

  useEffect(reload, []);

  function startEdit(row: AdminPolicyRow) {
    setEditingId(row.id);
    setRulesText(JSON.stringify(row.rules, null, 2));
  }

  async function save() {
    if (!editingId) return;
    try {
      const rules = JSON.parse(rulesText);
      await request(`/admin/policies/${editingId}`, { method: 'PUT', body: JSON.stringify({ rules }) });
      setEditingId(null);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to save policy (check the JSON is valid)');
    }
  }

  async function runPreview() {
    setError(null);
    setPreviewResult(null);
    try {
      const ctx = JSON.parse(previewCtx);
      const result = await request<{ allowed: boolean; reason?: string }>('/admin/policies/preview', {
        method: 'POST',
        body: JSON.stringify({ userId: previewUserId, action: previewAction, ctx }),
      });
      setPreviewResult(JSON.stringify(result));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'preview failed (check the ctx JSON is valid)');
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <button onClick={onBack} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h2>Policies</h2>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {rows.map((r) => (
        <div key={r.id} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginBottom: 8 }}>
          <strong>{r.name}</strong>
          {editingId === r.id ? (
            <div>
              <textarea
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                rows={12}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, marginTop: 6 }}
              />
              <button onClick={save}>Save</button> <button onClick={() => setEditingId(null)}>Cancel</button>
            </div>
          ) : (
            <div>
              <pre style={{ fontSize: 11, background: '#f9fafb', padding: 8 }}>{JSON.stringify(r.rules, null, 2)}</pre>
              <button onClick={() => startEdit(r)}>Edit</button>
            </div>
          )}
        </div>
      ))}

      <h3>Preview — "what can this user do"</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <select value={previewUserId} onChange={(e) => setPreviewUserId(e.target.value)}>
          <option value="">select user…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.email}
            </option>
          ))}
        </select>
        <input value={previewAction} onChange={(e) => setPreviewAction(e.target.value)} placeholder="action" />
        <input
          value={previewCtx}
          onChange={(e) => setPreviewCtx(e.target.value)}
          placeholder="ctx JSON"
          style={{ width: 260 }}
        />
        <button onClick={runPreview}>Preview</button>
      </div>
      {previewResult && <pre style={{ fontSize: 12, background: '#f9fafb', padding: 8 }}>{previewResult}</pre>}
    </div>
  );
}
