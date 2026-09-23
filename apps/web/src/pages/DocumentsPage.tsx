import { useEffect, useRef, useState } from 'react';
import type { ApiDocument, Classification, Project } from '@opex/shared';
import { ApiError, createAccessRequest, fetchDocuments, uploadDocument } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusPill, type PillTone } from '../components/ui/Badge';
import { ClassificationBanner } from '../components/ui/ClassificationBanner';

const CLASSIFICATION_LABELS = ['Public', 'Internal', 'Confidential', 'Restricted'];
const CLASSIFICATION_TONES: PillTone[] = ['neutral', 'info', 'warning', 'danger'];

const STATUS_TONES: Record<ApiDocument['status'], PillTone> = {
  queued: 'neutral',
  processing: 'warning',
  ready: 'success',
  failed: 'danger',
};

function DocumentCard({ doc, onOpen }: { doc: ApiDocument; onOpen: (id: string) => void }) {
  const [live, setLive] = useState(doc);

  useEffect(() => {
    if (doc.status === 'ready' || doc.status === 'failed') return;
    const es = new EventSource(`/documents/${doc.id}/progress`);
    es.addEventListener('progress', (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as {
        pagesDone: number;
        pageCount: number | null;
        status: ApiDocument['status'];
      };
      setLive((prev) => ({ ...prev, pagesDone: data.pagesDone, pageCount: data.pageCount, status: data.status }));
      if (data.status === 'ready' || data.status === 'failed') es.close();
    });
    es.onerror = () => es.close();
    return () => es.close();
  }, [doc.id, doc.status]);

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => onOpen(doc.id)}
          disabled={live.status !== 'ready'}
          className="text-left text-sm font-medium text-gray-900 hover:text-accent-600 disabled:cursor-default disabled:text-gray-400"
        >
          {live.filename}
        </button>
        <StatusPill tone={CLASSIFICATION_TONES[live.classification] ?? 'neutral'}>
          {CLASSIFICATION_LABELS[live.classification] ?? 'Unknown'}
        </StatusPill>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
        <StatusPill tone={STATUS_TONES[live.status]}>{live.status}</StatusPill>
        {live.status === 'processing' && live.pageCount ? (
          <span>
            {live.pagesDone}/{live.pageCount} pages
          </span>
        ) : null}
        <span>{(live.sizeBytes / 1024).toFixed(0)} KB</span>
      </div>
      <div className="mt-3">
        <RequestAccessButton documentId={doc.id} />
      </div>
    </Card>
  );
}

function RequestAccessButton({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle');

  async function submit() {
    if (!reason.trim()) return;
    try {
      await createAccessRequest(documentId, reason);
      setStatus('sent');
      setOpen(false);
    } catch {
      setStatus('error');
    }
  }

  if (status === 'sent') return <StatusPill tone="success">Requested</StatusPill>;

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Request access
      </Button>
    );
  }

  return (
    <div className="flex gap-2">
      <input
        placeholder="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-36 rounded-lg border border-gray-200 px-2 py-1 text-xs"
      />
      <Button size="sm" variant="primary" onClick={submit}>
        Send
      </Button>
    </div>
  );
}

export function DocumentsPage({
  project,
  onOpenDocument,
}: {
  project: Project;
  onOpenDocument: (documentId: string) => void;
}) {
  const [docs, setDocs] = useState<ApiDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setError(null);
    try {
      setDocs(await fetchDocuments(project.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to load documents');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [project.id]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadDocument(project.id, file);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const highestClassification = docs.reduce<Classification>((max, d) => (d.classification > max ? (d.classification as Classification) : max), 0);

  return (
    <div>
      {docs.length > 0 && <ClassificationBanner level={highestClassification} />}
      <div className="mx-auto max-w-4xl p-6">
      <PageHeader
        title={`Documents — ${project.name}`}
        actions={
          <label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.pptx,.xlsx,.csv,.html,.png,.jpg,.jpeg,.tiff,.webp"
              onChange={handleFileChange}
              disabled={uploading}
              className="text-sm"
            />
            {uploading && <span className="ml-2 text-sm text-gray-400">Uploading…</span>}
          </label>
        }
      />

      {error && <p className="mb-4 text-sm text-danger-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : docs.length === 0 ? (
        error ? null : <EmptyState title="No documents yet" description="Upload a document to get started." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {docs.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} onOpen={onOpenDocument} />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
