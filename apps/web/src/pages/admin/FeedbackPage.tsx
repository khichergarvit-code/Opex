import { useEffect, useState } from 'react';
import { ApiError, request } from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Alert } from '../../components/ui/Alert';
import { formatDateTime, formatFullDateTime } from '../../lib/format';

interface AdminFeedbackRow {
  id: string;
  messageId: string;
  traceId: string | null;
  userId: string;
  userEmail: string | null;
  answerText: string | null;
  rating: 'thumbs_up' | 'thumbs_down';
  rootCauseTag: string | null;
  exportedToEval: boolean;
  createdAt: string;
}

export function FeedbackPage({ onBack: _onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AdminFeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [keywordDrafts, setKeywordDrafts] = useState<Record<string, string>>({});

  function reload() {
    setError(null);
    request<AdminFeedbackRow[]>('/admin/feedback?rating=thumbs_down')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load feedback'))
      .finally(() => setLoading(false));
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
    <div>
      <PageHeader title="Feedback triage" description="Thumbs-down feedback, for root-cause tagging and eval export." />
      {error && <Alert>{error}</Alert>}

      {loading ? (
        <Skeleton className="p-2" />
      ) : rows.length === 0 ? (
        error ? null : <EmptyState title="No thumbs-down feedback yet" />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <p className="text-sm text-fg">
                {r.answerText ? (r.answerText.length > 240 ? `${r.answerText.slice(0, 240)}…` : r.answerText) : 'The rated message was deleted.'}
              </p>
              <p className="mt-2 text-xs text-muted" title={`message ${r.messageId} · trace ${r.traceId ?? 'none'} · ${formatFullDateTime(r.createdAt)}`}>
                {r.userEmail ?? 'unknown user'} · {formatDateTime(r.createdAt)}
                {r.exportedToEval && (
                  <StatusPill tone="success" title="Exported to eval">
                    exported
                  </StatusPill>
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  placeholder="root cause"
                  value={tagDrafts[r.id] ?? r.rootCauseTag ?? ''}
                  onChange={(e) => setTagDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                  className="rounded-lg border border-line px-2 py-1 text-sm"
                />
                <Button size="sm" onClick={() => tag(r.id)}>
                  Tag
                </Button>
                <input
                  placeholder="expected keyword"
                  value={keywordDrafts[r.id] ?? ''}
                  onChange={(e) => setKeywordDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                  className="rounded-lg border border-line px-2 py-1 text-sm"
                />
                <Button size="sm" variant="primary" disabled={r.exportedToEval} onClick={() => exportToEval(r.id)}>
                  Export to eval
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
