import { useEffect, useMemo, useState } from 'react';
import { ApiError, request } from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { StatusPill } from '../../components/ui/Badge';
import { Alert } from '../../components/ui/Alert';
import { InfoBox } from '../../components/ui/InfoBox';
import { formatDateTime, formatFullDateTime } from '../../lib/format';

interface FileRow {
  id: string;
  kind: 'document' | 'artifact' | 'workspace';
  name: string;
  projectName: string;
  owner: string | null;
  sizeBytes: number;
  mime: string;
  classification: number | null;
  status: string | null;
  createdAt: string;
  downloadUrl: string;
}
interface FilesResponse {
  rows: FileRow[];
  totals: { count: number; bytes: number; byKind: Record<string, number> };
}

const KINDS: Array<{ key: '' | FileRow['kind']; label: string }> = [
  { key: '', label: 'All' },
  { key: 'document', label: 'Uploaded documents' },
  { key: 'artifact', label: 'Generated (charts, images, files)' },
  { key: 'workspace', label: 'Workspace files' },
];
const KIND_LABEL: Record<FileRow['kind'], string> = { document: 'Upload', artifact: 'Generated', workspace: 'Workspace' };
const CLASS_LABEL = ['Public', 'Internal', 'Confidential', 'Restricted'];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function FilesPage({ onBack: _onBack }: { onBack: () => void }) {
  const [data, setData] = useState<FilesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<'' | FileRow['kind']>('');
  const [query, setQuery] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function reload() {
    request<FilesResponse>('/admin/files')
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load files'));
  }
  useEffect(reload, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (r) => (!kind || r.kind === kind) && (!q || `${r.name} ${r.owner ?? ''} ${r.projectName}`.toLowerCase().includes(q)),
    );
  }, [data, kind, query]);

  async function remove(r: FileRow) {
    try {
      await request(`/admin/files/${r.kind}/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
      setConfirmId(null);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to delete');
    }
  }

  return (
    <div>
      <PageHeader title="Files" description="Everything that was uploaded or created, in one place." />
      {error && <Alert>{error}</Alert>}

      <InfoBox title="What you see here">
        <p>
          <b>Uploads</b> are documents people added to a project. <b>Generated</b> files are charts, images and files the assistant created in a chat (private to the person who asked for them; you can open them as an administrator).
          <b> Workspace</b> files are the text files the assistant keeps per project. Downloads and deletions are recorded in the audit log.
        </p>
      </InfoBox>

      {data && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Files', String(data.totals.count)],
            ['Disk used', formatSize(data.totals.bytes)],
            ['Uploads', String(data.totals.byKind.document ?? 0)],
            ['Generated', String((data.totals.byKind.artifact ?? 0) + (data.totals.byKind.workspace ?? 0))],
          ].map(([label, value]) => (
            <Card key={label} className="!p-4">
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-1 text-2xl font-normal text-fg">{value}</p>
            </Card>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setKind(k.key)}
            aria-pressed={kind === k.key}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${kind === k.key ? 'bg-accent-100 font-medium text-accent-700' : 'border border-line text-fg-2 hover:bg-raised'}`}
          >
            {k.label}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, person or project…"
          aria-label="Search files"
          className="ml-auto w-full rounded-full border border-line bg-canvas px-4 py-2 text-sm outline-none focus:border-accent-400 sm:w-72"
        />
      </div>

      <Card>
        <DataTable
          emptyMessage="No files match"
          loading={!data && !error}
          error={error}
          rows={rows}
          columns={[
            { key: 'name', label: 'Name', sortValue: (r) => r.name, render: (r) => <span className="font-medium text-fg">{r.name}</span> },
            { key: 'kind', label: 'Type', sortValue: (r) => r.kind, render: (r) => <StatusPill tone={r.kind === 'document' ? 'info' : 'neutral'}>{KIND_LABEL[r.kind]}</StatusPill> },
            { key: 'projectName', label: 'Project', sortValue: (r) => r.projectName },
            { key: 'owner', label: 'By', sortValue: (r) => r.owner ?? '', render: (r) => r.owner ?? '—' },
            { key: 'size', label: 'Size', sortValue: (r) => r.sizeBytes, render: (r) => formatSize(r.sizeBytes) },
            {
              key: 'classification',
              label: 'Class.',
              sortValue: (r) => r.classification ?? -1,
              render: (r) => (r.classification === null ? '—' : (CLASS_LABEL[r.classification] ?? r.classification)),
            },
            { key: 'status', label: 'Status', render: (r) => r.status ?? '—' },
            {
              key: 'createdAt',
              label: 'When',
              sortValue: (r) => new Date(r.createdAt).getTime(),
              render: (r) => <span title={formatFullDateTime(r.createdAt)}>{formatDateTime(r.createdAt)}</span>,
            },
            {
              key: 'actions',
              label: '',
              render: (r) =>
                confirmId === r.id ? (
                  <span className="flex items-center gap-1">
                    <Button size="sm" variant="danger" onClick={() => remove(r)}>
                      Delete
                    </Button>
                    <Button size="sm" onClick={() => setConfirmId(null)}>
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    {r.downloadUrl && (
                      <a href={r.downloadUrl} download={r.name} className="rounded-full px-3 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50">
                        Download
                      </a>
                    )}
                    <button type="button" onClick={() => setConfirmId(r.id)} className="rounded-full px-3 py-1 text-xs text-muted hover:bg-danger-50 hover:text-danger-700">
                      Delete
                    </button>
                  </span>
                ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
