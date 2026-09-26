import { useEffect, useState } from 'react';
import { ApiError, request } from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { Alert } from '../../components/ui/Alert';

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
  const [rowsLoading, setRowsLoading] = useState(true);
  const [longTerm, setLongTerm] = useState<LongTermMemoryRow[]>([]);
  const [longTermLoading, setLongTermLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ttlSaved, setTtlSaved] = useState(false);
  const [episodicDays, setEpisodicDays] = useState('90');
  const [semanticDays, setSemanticDays] = useState('180');

  function reload() {
    request<AdminMemoryRow[]>('/admin/memory')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load memory'))
      .finally(() => setRowsLoading(false));
    request<LongTermMemoryRow[]>('/admin/memory/long-term')
      .then(setLongTerm)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load long-term memory'))
      .finally(() => setLongTermLoading(false));
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

  useEffect(() => {
    request<{ memoryTtlDays: { episodic: number | null; semantic: number | null } }>('/admin/memory/ttl')
      .then((r) => {
        setEpisodicDays(r.memoryTtlDays.episodic === null ? '' : String(r.memoryTtlDays.episodic));
        setSemanticDays(r.memoryTtlDays.semantic === null ? '' : String(r.memoryTtlDays.semantic));
      })
      .catch(() => {});
  }, []);

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
          memoryTtlDays: {
            episodic: episodicDays === '' ? null : Number(episodicDays),
            semantic: semanticDays === '' ? null : Number(semanticDays),
          },
        }),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to save TTL');
      return;
    }
    setTtlSaved(true);
    setTimeout(() => setTtlSaved(false), 2500);
  }

  return (
    <div>
      <PageHeader
        title="Memory (all users)"
        description="Admin, workspace-wide view of every user's long-term and working memory. Each user's own read-only view is 'What OpeX remembers' in their sidebar."
      />
      {error && <Alert>{error}</Alert>}

      <Card className="mb-6">
        <h3 className="text-sm font-semibold text-fg">How long memories are kept</h3>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Memories older than this are removed automatically every night. Leave a box empty to keep that kind of memory forever.
        </p>
        <form onSubmit={saveTtl} className="mt-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1.5 text-sm text-fg-2">
            Episodic (what happened in a chat)
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                placeholder="forever"
                value={episodicDays}
                onChange={(e) => setEpisodicDays(e.target.value)}
                className="w-28 rounded-xl border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-400"
              />
              days
            </span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-fg-2">
            Semantic (lasting facts and preferences)
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                placeholder="forever"
                value={semanticDays}
                onChange={(e) => setSemanticDays(e.target.value)}
                className="w-28 rounded-xl border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-400"
              />
              days
            </span>
          </label>
          <Button type="submit" variant="primary">
            Save
          </Button>
          {ttlSaved && <span className="pb-2 text-sm text-accent-700">Saved</span>}
        </form>
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-semibold text-fg">Long-term memory (episodic / semantic)</h3>
        <div className="max-h-[26rem] overflow-y-auto pr-1">
        <DataTable
          emptyMessage="No long-term memories yet"
          loading={longTermLoading}
          error={error}
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
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-fg">Working memory (per-conversation rolling summary)</h3>
        <DataTable
          emptyMessage="No working-memory summaries yet"
          loading={rowsLoading}
          error={error}
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
