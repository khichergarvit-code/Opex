import { useEffect, useState } from 'react';
import type { AdminUser } from '@opex/shared';
import { ApiError, fetchAdminUsers, request } from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { InfoBox } from '../../components/ui/InfoBox';

interface AdminPolicyRow {
  id: string;
  name: string;
  rules: Record<string, unknown>;
}

export function PoliciesPage({ onBack: _onBack }: { onBack: () => void }) {
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
    <div>
      <PageHeader title="Policies" description="Editable policy rules, plus a 'what can this user do' preview." />
      {error && <Alert>{error}</Alert>}

      <InfoBox title="What is a policy?">
        <p>A policy is the rulebook for who may do what in OpeX. The active rules are applied to every request: which models a role may use, which tools an agent may call, upload limits, and how long memories are kept.</p>
        <ul className="list-disc pl-5">
          <li><b>allowedModelsByRole</b>: which model roles (chat, vision, image, ...) each user role may use.</li>
          <li><b>allowedTools</b>: tools a role may use, when set (empty means "the agent's own list decides").</li>
          <li><b>uploadLimitMb</b>: largest file a user may upload. <b>webAccess</b> and <b>egressCapableTools</b>: anything that could leave the building; OpeX keeps these off.</li>
          <li><b>memoryTtlDays</b>: how long learned memories live (also editable on the Memory page).</li>
        </ul>
        <p>Edit the rules as JSON below, then use the preview to check what a given user could do before relying on a change.</p>
      </InfoBox>

      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <Card key={r.id}>
            <p className="font-medium text-fg">{r.name}</p>
            {editingId === r.id ? (
              <div className="mt-2">
                <textarea
                  value={rulesText}
                  onChange={(e) => setRulesText(e.target.value)}
                  rows={12}
                  className="w-full rounded-lg border border-line bg-canvas p-2 font-mono text-xs"
                />
                <div className="mt-2 flex gap-2">
                  <Button variant="primary" size="sm" onClick={save}>
                    Save
                  </Button>
                  <Button size="sm" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <pre className="overflow-x-auto rounded-lg bg-canvas p-2 text-xs">{JSON.stringify(r.rules, null, 2)}</pre>
                <Button size="sm" className="mt-2" onClick={() => startEdit(r)}>
                  Edit
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-fg">Preview — "what can this user do"</h3>
        <div className="flex flex-wrap gap-2">
          <select
            value={previewUserId}
            onChange={(e) => setPreviewUserId(e.target.value)}
            className="rounded-lg border border-line px-2 py-1 text-sm"
          >
            <option value="">select user…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
          <input
            value={previewAction}
            onChange={(e) => setPreviewAction(e.target.value)}
            placeholder="action"
            className="rounded-lg border border-line px-2 py-1 text-sm"
          />
          <input
            value={previewCtx}
            onChange={(e) => setPreviewCtx(e.target.value)}
            placeholder="ctx JSON"
            className="w-64 rounded-lg border border-line px-2 py-1 text-sm"
          />
          <Button variant="primary" size="sm" onClick={runPreview}>
            Preview
          </Button>
        </div>
        {previewResult && <pre className="mt-3 rounded-lg bg-canvas p-2 text-xs">{previewResult}</pre>}
      </Card>
    </div>
  );
}
