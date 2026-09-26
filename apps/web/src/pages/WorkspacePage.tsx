import { useEffect, useMemo, useState } from 'react';
import type { Project } from '@opex/shared';
import { ApiError, request } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { DataTable } from '../components/ui/DataTable';
import { Alert } from '../components/ui/Alert';
import { InfoBox } from '../components/ui/InfoBox';
import { Icon } from '../components/ui/Icon';
import { FileViewer } from '../components/FileViewer';
import { ProjectSwitcher } from '../components/ProjectSwitcher';
import { formatDateTime, formatFullDateTime } from '../lib/format';

interface Entry {
  path: string;
  isDir: boolean;
  sizeBytes: number;
  modifiedAt: string;
  projectId: string;
  projectName: string;
  userId: string;
  owner: string;
  id: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

const q = (e: Entry) => `projectId=${e.projectId}&userId=${e.userId}&path=${encodeURIComponent(e.path)}`;

/**
 * "My files": what the assistant created for you (per project, private to you). Workspace admins and super admins can switch
 * to everyone's files. Open shows the file in place; Download saves it.
 */
export function WorkspacePage({ project, projects, onProjectChange, isAdmin }: { project: Project; projects: Project[]; onProjectChange: (id: string) => void; isAdmin: boolean }) {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [everyone, setEveryone] = useState(false);
  const [viewing, setViewing] = useState<Entry | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  function load() {
    setError(null);
    request<Omit<Entry, 'id'>[]>(everyone ? '/workspace/files?all=1' : `/workspace/files?projectId=${project.id}`)
      .then((r) => setRows(r.map((e) => ({ ...e, id: `${e.projectId}/${e.userId}/${e.path}` }))))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'could not load files'));
  }
  useEffect(load, [project.id, everyone]);

  const visible = useMemo(() => {
    const s = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => !s || `${r.path} ${r.owner} ${r.projectName}`.toLowerCase().includes(s));
  }, [rows, query]);

  async function remove(e: Entry) {
    try {
      await request(`/workspace/file?${q(e)}`, { method: 'DELETE' });
      setConfirmId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not delete');
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        {!everyone && <ProjectSwitcher projects={projects} value={project.id} onChange={onProjectChange} />}
        {isAdmin && (
          <div className="inline-flex rounded-full border border-line p-0.5 text-sm">
            {[
              [false, 'My files'],
              [true, 'Everyone’s files'],
            ].map(([v, label]) => (
              <button
                key={String(label)}
                type="button"
                onClick={() => setEveryone(v as boolean)}
                aria-pressed={everyone === v}
                className={`rounded-full px-3.5 py-1 ${everyone === v ? 'bg-accent-100 font-medium text-accent-700' : 'text-fg-2 hover:bg-raised'}`}
              >
                {label as string}
              </button>
            ))}
          </div>
        )}
      </div>
      <PageHeader title={everyone ? 'Everyone’s files' : 'My files'} description="Files and folders the assistant created for you. They are private to you; administrators can also see them." />
      {error && <Alert>{error}</Alert>}
      {!everyone && (
        <InfoBox title="How to add files here">
          <p>Ask in the chat, for example “create notes.txt with today’s summary”, “create a folder called reports”, or “run wc -l notes.txt in the terminal”. Every change asks for your approval first.</p>
        </InfoBox>
      )}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search files…"
        aria-label="Search files"
        className="mb-3 w-full rounded-full border border-line bg-canvas px-4 py-2 text-sm outline-none focus:border-accent-400 sm:w-72"
      />
      <Card>
        <DataTable
          emptyMessage="No files yet"
          loading={rows === null && !error}
          error={error}
          rows={visible}
          columns={[
            {
              key: 'path',
              label: 'Name',
              sortValue: (r) => r.path,
              render: (r) => (
                <button
                  type="button"
                  disabled={r.isDir}
                  onClick={() => setViewing(r)}
                  className="inline-flex items-center gap-2 text-left font-medium text-fg hover:text-accent-700 disabled:cursor-default disabled:hover:text-fg"
                >
                  <Icon name={r.isDir ? 'layers' : 'file'} className="h-4 w-4 shrink-0 text-accent-600" />
                  {r.path}
                  {r.isDir ? '/' : ''}
                </button>
              ),
            },
            ...(everyone ? [{ key: 'owner', label: 'Owner', sortValue: (r: Entry) => r.owner }, { key: 'projectName', label: 'Project', sortValue: (r: Entry) => r.projectName }] : []),
            { key: 'sizeBytes', label: 'Size', sortValue: (r) => r.sizeBytes, render: (r) => (r.isDir ? '—' : formatSize(r.sizeBytes)) },
            { key: 'modifiedAt', label: 'Modified', sortValue: (r) => new Date(r.modifiedAt).getTime(), render: (r) => <span title={formatFullDateTime(r.modifiedAt)}>{formatDateTime(r.modifiedAt)}</span> },
            {
              key: 'actions',
              label: '',
              render: (r) =>
                confirmId === r.id ? (
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => remove(r)} className="rounded-full bg-danger-600 px-3 py-1 text-xs font-medium text-white">
                      Delete
                    </button>
                    <button type="button" onClick={() => setConfirmId(null)} className="rounded-full px-3 py-1 text-xs text-fg-2 hover:bg-raised">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    {!r.isDir && (
                      <>
                        <button type="button" onClick={() => setViewing(r)} className="rounded-full px-3 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50">
                          Open
                        </button>
                        <a href={`/workspace/file?${q(r)}&download=1`} download={r.path.split('/').pop()} className="rounded-full px-3 py-1 text-xs text-fg-2 hover:bg-raised">
                          Download
                        </a>
                      </>
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
      {viewing && <FileViewer name={viewing.path.split('/').pop() ?? viewing.path} src={`/workspace/file?${q(viewing)}`} downloadUrl={`/workspace/file?${q(viewing)}&download=1`} onClose={() => setViewing(null)} />}
    </div>
  );
}
