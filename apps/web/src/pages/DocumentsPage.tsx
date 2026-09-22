import { useEffect, useRef, useState } from 'react';
import type { ApiDocument, Project } from '@opex/shared';
import { ApiError, createAccessRequest, fetchDocuments, uploadDocument } from '../lib/api';

const CLASSIFICATION_LABELS = ['Public', 'Internal', 'Confidential', 'Restricted'];
const CLASSIFICATION_COLORS = ['#dcfce7', '#dbeafe', '#fef3c7', '#fee2e2'];

function ClassificationBadge({ level }: { level: number }) {
  return (
    <span
      style={{
        background: CLASSIFICATION_COLORS[level] ?? '#e5e7eb',
        borderRadius: 4,
        padding: '2px 8px',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {CLASSIFICATION_LABELS[level] ?? 'Unknown'}
    </span>
  );
}

function StatusBadge({ status }: { status: ApiDocument['status'] }) {
  const colors: Record<ApiDocument['status'], string> = {
    queued: '#e5e7eb',
    processing: '#fef3c7',
    ready: '#dcfce7',
    failed: '#fee2e2',
  };
  return (
    <span
      style={{ background: colors[status], borderRadius: 4, padding: '2px 8px', fontSize: 12 }}
    >
      {status}
    </span>
  );
}

function DocumentRow({ doc, onOpen }: { doc: ApiDocument; onOpen: (id: string) => void }) {
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
    <tr>
      <td style={{ padding: '8px 12px' }}>
        <button
          onClick={() => onOpen(doc.id)}
          disabled={live.status !== 'ready'}
          style={{ background: 'none', border: 'none', color: '#2563eb', cursor: live.status === 'ready' ? 'pointer' : 'default', padding: 0, font: 'inherit' }}
        >
          {live.filename}
        </button>
      </td>
      <td style={{ padding: '8px 12px' }}>
        <ClassificationBadge level={live.classification} />
      </td>
      <td style={{ padding: '8px 12px' }}>
        <StatusBadge status={live.status} />
        {live.status === 'processing' && live.pageCount ? (
          <span style={{ marginLeft: 8, fontSize: 12, color: '#6b7280' }}>
            {live.pagesDone}/{live.pageCount} pages
          </span>
        ) : null}
      </td>
      <td style={{ padding: '8px 12px', fontSize: 12, color: '#6b7280' }}>
        {(live.sizeBytes / 1024).toFixed(0)} KB
      </td>
      <td style={{ padding: '8px 12px' }}>
        <RequestAccessButton documentId={doc.id} />
      </td>
    </tr>
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

  if (status === 'sent') return <span style={{ fontSize: 12, color: '#16a34a' }}>Requested</span>;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ fontSize: 12 }}>
        Request access
      </button>
    );
  }

  return (
    <span style={{ display: 'flex', gap: 4 }}>
      <input
        placeholder="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ fontSize: 12, width: 140 }}
      />
      <button onClick={submit} style={{ fontSize: 12 }}>
        Send
      </button>
    </span>
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
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      setDocs(await fetchDocuments(project.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to load documents');
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

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <h2>Documents — {project.name}</h2>

      <div style={{ marginBottom: 16 }}>
        <label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.pptx,.xlsx,.csv,.html,.png,.jpg,.jpeg,.tiff,.webp"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
        {uploading && <span style={{ marginLeft: 8 }}>Uploading…</span>}
      </div>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '8px 12px' }}>Filename</th>
            <th style={{ padding: '8px 12px' }}>Classification</th>
            <th style={{ padding: '8px 12px' }}>Status</th>
            <th style={{ padding: '8px 12px' }}>Size</th>
            <th style={{ padding: '8px 12px' }}></th>
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} onOpen={onOpenDocument} />
          ))}
        </tbody>
      </table>
      {docs.length === 0 && <p style={{ color: '#6b7280' }}>No documents yet.</p>}
    </div>
  );
}
