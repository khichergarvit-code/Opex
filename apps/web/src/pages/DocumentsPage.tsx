import { useEffect, useRef, useState } from 'react';
import type { ApiDocument, Classification, Project } from '@opex/shared';
import { ApiError, createAccessRequest, fetchDocuments, uploadDocument } from '../lib/api';
import { Button } from '../components/ui/Button';
import { motion } from 'motion/react';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusPill, type PillTone } from '../components/ui/Badge';
import { ClassificationBanner } from '../components/ui/ClassificationBanner';
import { Skeleton } from '../components/ui/Skeleton';
import { Alert } from '../components/ui/Alert';
import { navigate } from '../lib/router';
import { ProjectSwitcher } from '../components/ProjectSwitcher';

const CLASSIFICATION_LABELS = ['Public', 'Internal', 'Confidential', 'Restricted'];
const CLASSIFICATION_TONES: PillTone[] = ['neutral', 'info', 'warning', 'danger'];

const STATUS_TONES: Record<ApiDocument['status'], PillTone> = {
  queued: 'neutral',
  processing: 'warning',
  ready: 'success',
  failed: 'danger',
};

function DocumentCard({ doc, projectId, onOpen }: { doc: ApiDocument; projectId: string; onOpen: (id: string) => void }) {
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
          className="text-left text-sm font-medium text-fg hover:text-accent-600 disabled:cursor-default disabled:text-faint"
        >
          {live.filename}
        </button>
        <StatusPill tone={CLASSIFICATION_TONES[live.classification] ?? 'neutral'}>
          {CLASSIFICATION_LABELS[live.classification] ?? 'Unknown'}
        </StatusPill>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-faint">
        <StatusPill tone={STATUS_TONES[live.status]}>{live.status}</StatusPill>
        {live.status === 'processing' && live.pageCount ? (
          <span>
            {live.pagesDone}/{live.pageCount} pages
          </span>
        ) : null}
        <span>{(live.sizeBytes / 1024).toFixed(0)} KB</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {live.status === 'ready' && (
          <Button
            size="sm"
            onClick={() => {
              try {
                sessionStorage.setItem('opex.autoSend', JSON.stringify({ projectId, text: `Summarise ${live.filename}` }));
              } catch {
                // sessionStorage unavailable — the user can type the request instead
              }
              navigate({ name: 'chat' });
            }}
          >
            Summarise
          </Button>
        )}
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
        className="w-36 rounded-lg border border-line px-2 py-1 text-xs"
      />
      <Button size="sm" variant="primary" onClick={submit}>
        Send
      </Button>
    </div>
  );
}

export function DocumentsPage({
  project,
  projects,
  onProjectChange,
  onOpenDocument,
}: {
  project: Project;
  projects: Project[];
  onProjectChange: (projectId: string) => void;
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
      <div className="mb-2">
        <ProjectSwitcher projects={projects} value={project.id} onChange={onProjectChange} />
      </div>
      <PageHeader
        title="Documents"
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
            {uploading && <span className="ml-2 text-sm text-faint">Uploading…</span>}
          </label>
        }
      />

      {error && <Alert>{error}</Alert>}

      {loading ? (
        <Skeleton className="p-2" />
      ) : docs.length === 0 ? (
        error ? null : <EmptyState title="No documents yet" description="Upload a document to get started." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {docs.map((doc, i) => (
            <motion.div
              key={doc.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.05, duration: 0.3, ease: [0.2, 0, 0, 1] }}
              whileHover={{ y: -3 }}
            >
              <DocumentCard doc={doc} projectId={project.id} onOpen={onOpenDocument} />
            </motion.div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
