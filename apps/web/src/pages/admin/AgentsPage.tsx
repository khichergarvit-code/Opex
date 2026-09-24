import { useEffect, useState } from 'react';
import { ApiError, request } from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/Badge';
import { Alert } from '../../components/ui/Alert';

interface AdminAgentRow {
  id: string;
  name: string;
  version: number;
  description: string;
  modelRole: string;
  toolAllowlist: string[];
  enabled: boolean;
}

export function AgentsPage({ onBack: _onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AdminAgentRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [modelRole, setModelRole] = useState('general');
  const [promptContent, setPromptContent] = useState('');

  const [diffA, setDiffA] = useState<string>('');
  const [diffB, setDiffB] = useState<string>('');
  const [testAgentId, setTestAgentId] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);

  function reload() {
    request<AdminAgentRow[]>('/admin/agents')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load agents'));
  }

  useEffect(reload, []);

  const byName = new Map<string, AdminAgentRow[]>();
  for (const r of rows) {
    byName.set(r.name, [...(byName.get(r.name) ?? []), r]);
  }

  async function createVersion(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await request('/admin/agents', {
        method: 'POST',
        body: JSON.stringify({ name, description, modelRole, systemPromptContent: promptContent, toolAllowlist: [] }),
      });
      setName('');
      setDescription('');
      setPromptContent('');
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to create agent version');
    }
  }

  async function loadDiff(agentName: string, version: number, which: 'a' | 'b') {
    try {
      const result = await request<{ content: string }>(`/admin/agents/${agentName}/versions/${version}/prompt`);
      if (which === 'a') setDiffA(result.content);
      else setDiffB(result.content);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to load prompt version');
    }
  }

  async function runTestChat() {
    setError(null);
    setTestResult(null);
    try {
      const result = await request<{ content: string }>('/admin/agents/test-chat', {
        method: 'POST',
        body: JSON.stringify({ agentId: testAgentId, message: testMessage }),
      });
      setTestResult(result.content);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'test chat failed');
    }
  }

  return (
    <div>
      <PageHeader title="Agents" description="Prompt versions, a diff view, and a test chat." />
      {error && <Alert>{error}</Alert>}

      <div className="flex flex-col gap-3">
        {[...byName.entries()].map(([agentName, versions]) => (
          <Card key={agentName}>
            <p className="mb-2 font-medium text-fg">{agentName}</p>
            <ul className="flex flex-col gap-1.5 text-sm">
              {versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-2">
                  <span>
                    v{v.version} — {v.description} ({v.modelRole})
                  </span>
                  <StatusPill tone={v.enabled ? 'success' : 'neutral'}>{v.enabled ? 'enabled' : 'disabled'}</StatusPill>
                  <Button size="sm" onClick={() => loadDiff(agentName, v.version, 'a')}>
                    load as A
                  </Button>
                  <Button size="sm" onClick={() => loadDiff(agentName, v.version, 'b')}>
                    load as B
                  </Button>
                  <Button size="sm" onClick={() => setTestAgentId(v.id)}>
                    test-chat this version
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-fg">Diff</h3>
        <div className="flex gap-3">
          <pre className="flex-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-canvas p-2 text-xs">{diffA}</pre>
          <pre className="flex-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-canvas p-2 text-xs">{diffB}</pre>
        </div>
      </Card>

      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-fg">Test chat</h3>
        <div className="flex gap-2">
          <input
            placeholder="agent id"
            value={testAgentId}
            onChange={(e) => setTestAgentId(e.target.value)}
            className="w-72 rounded-lg border border-line px-2 py-1 text-sm"
          />
          <input
            placeholder="message"
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            className="flex-1 rounded-lg border border-line px-2 py-1 text-sm"
          />
          <Button variant="primary" size="sm" onClick={runTestChat}>
            Run
          </Button>
        </div>
        {testResult && <p className="mt-3 rounded-lg bg-canvas p-2 text-sm">{testResult}</p>}
      </Card>

      <Card className="mt-6 max-w-lg">
        <h3 className="mb-3 text-sm font-semibold text-fg">New version</h3>
        <form onSubmit={createVersion} className="flex flex-col gap-2">
          <input
            placeholder="agent name (e.g. doc_qa)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded-lg border border-line px-2 py-1.5 text-sm"
          />
          <input
            placeholder="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            className="rounded-lg border border-line px-2 py-1.5 text-sm"
          />
          <select value={modelRole} onChange={(e) => setModelRole(e.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-sm">
            <option value="general">general</option>
            <option value="router">router</option>
            <option value="coder">coder</option>
            <option value="vision">vision</option>
          </select>
          <textarea
            placeholder="system prompt content"
            value={promptContent}
            onChange={(e) => setPromptContent(e.target.value)}
            rows={6}
            required
            className="rounded-lg border border-line px-2 py-1.5 text-sm"
          />
          <Button type="submit" variant="primary">
            Create new version
          </Button>
        </form>
      </Card>
    </div>
  );
}
