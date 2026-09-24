import { useEffect, useState } from 'react';
import { ApiError, fetchMyMemories, type MyMemoryRow } from '../lib/api';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { StatusPill } from './ui/Badge';
import { EmptyState } from './ui/EmptyState';
import { Skeleton } from './ui/Skeleton';
import { Alert } from './ui/Alert';

/**
 * ui.md's "What OpeX remembers" panel — read-only, self-scoped (backed by
 * GET /memory/mine). Admin purge of any user's memory stays admin-only
 * in MemoryPage.tsx; this is a transparency view, not a management one.
 */
export function MyMemoriesPanel({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<MyMemoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyMemories()
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load your memories'));
  }, []);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Button variant="ghost" onClick={onBack} className="mb-4">
        ← Back
      </Button>
      <h2 className="text-xl font-semibold text-fg">What OpeX remembers</h2>
      <p className="mt-1 text-sm text-muted">
        Preferences and facts OpeX has picked up from your conversations. Ask an admin to delete anything here.
      </p>

      {error && <Alert className="mt-4">{error}</Alert>}

      <div className="mt-6 flex flex-col gap-3">
        {rows === null && !error && <Skeleton className="p-2" />}
        {rows?.length === 0 && <EmptyState title="Nothing yet" description="OpeX hasn't stored any memories about you yet." />}
        {rows?.map((m) => (
          <Card key={m.id}>
            <p className="text-sm text-fg">{m.text}</p>
            <div className="mt-2 flex items-center gap-2">
              <StatusPill tone={m.type === 'semantic' ? 'info' : 'neutral'}>{m.type}</StatusPill>
              <span className="text-xs text-faint">confidence {Math.round(m.confidence * 100)}%</span>
              <span className="text-xs text-faint">{new Date(m.createdAt).toLocaleDateString()}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
