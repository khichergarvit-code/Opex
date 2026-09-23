import { useEffect, useState } from 'react';
import { ApiError, request } from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';

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

export function MemoryPage({ onBack: _onBack }: { onBack: () => void }) {
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
    <div>
      <PageHeader
        title="Memory (all users)"
        description="Admin, workspace-wide view of every user's long-term and working memory. Each user's own read-only view is 'What OpeX remembers' in their sidebar."
      />
      {error && <p className="mb-4 text-sm text-danger-600">{error}</p>}

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Long-term memory (episodic / semantic)</h3>
        <DataTable
          emptyMessage="No long-term memories yet"
          rows={longTerm}
          columns={[
            { key: 'userEmail', label: 'User' },
            { key: 'type', label: 'Type' },
            { key: 'scope', label: 'Scope' },
            { key: 'text', label: 'Text', render: (m) => <span className="line-clamp-2 max-w-sm">{m.text}</span> },
            { key: 'confidence', label: 'Confidence', render: (m) => m.confidence.toFixed(2) },
            { key: 'classification', label: 'Class.' },
            { key: 'sourceKind', label: 'Source' },
            { key: 'accessCount', label: 'Accessed' },
            {
              key: 'actions',
              label: '',
              render: (m) => (
                <Button size="sm" variant="danger" onClick={() => deleteMemory(m.id)}>
                  Delete
                </Button>
              ),
            },
          ]}
        />

        <h4 className="mb-2 mt-6 text-sm font-medium text-gray-700">Set TTL (days; blank = never expires)</h4>
        <form onSubmit={saveTtl} className="flex flex-wrap gap-2">
          <input
            placeholder="workspace id"
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            required
            className="rounded-lg border border-gray-200 px-2 py-1 text-sm"
          />
          <input
            placeholder="episodic days"
            value={episodicDays}
            onChange={(e) => setEpisodicDays(e.target.value)}
            className="w-32 rounded-lg border border-gray-200 px-2 py-1 text-sm"
          />
          <input
            placeholder="semantic days"
            value={semanticDays}
            onChange={(e) => setSemanticDays(e.target.value)}
            className="w-32 rounded-lg border border-gray-200 px-2 py-1 text-sm"
          />
          <Button type="submit" variant="primary" size="sm">
            Save TTL
          </Button>
        </form>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Working memory (per-conversation rolling summary)</h3>
        <DataTable
          emptyMessage="No working-memory summaries yet"
          rows={rows}
          columns={[
            { key: 'userEmail', label: 'User' },
            { key: 'summaryLength', label: 'Summary length (chars)' },
            { key: 'updatedAt', label: 'Updated' },
            {
              key: 'actions',
              label: '',
              render: (r) => (
                <Button size="sm" onClick={() => purge(r.id)}>
                  Purge
                </Button>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
