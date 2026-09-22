import { useEffect, useState } from 'react';
import { ApiError, request } from '../../lib/api';

interface AdminAgentRow {
  id: string;
  name: string;
  version: number;
  description: string;
  modelRole: string;
  toolAllowlist: string[];
  enabled: boolean;
}

export function AgentsPage({ onBack }: { onBack: () => void }) {
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
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <button onClick={onBack} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h2>Agents</h2>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {[...byName.entries()].map(([agentName, versions]) => (
        <div key={agentName} style={{ marginBottom: 12 }}>
          <strong>{agentName}</strong>
          <ul style={{ fontSize: 13 }}>
            {versions.map((v) => (
              <li key={v.id}>
                v{v.version} — {v.description} ({v.modelRole}, {v.enabled ? 'enabled' : 'disabled'}){' '}
                <button onClick={() => loadDiff(agentName, v.version, 'a')}>load as A</button>{' '}
                <button onClick={() => loadDiff(agentName, v.version, 'b')}>load as B</button>{' '}
                <button
                  onClick={() => {
                    setTestAgentId(v.id);
                  }}
                >
                  test-chat this version
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <h3>Diff</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <pre style={{ flex: 1, fontSize: 11, background: '#f9fafb', padding: 8, whiteSpace: 'pre-wrap' }}>{diffA}</pre>
        <pre style={{ flex: 1, fontSize: 11, background: '#f9fafb', padding: 8, whiteSpace: 'pre-wrap' }}>{diffB}</pre>
      </div>

      <h3>Test chat</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="agent id" value={testAgentId} onChange={(e) => setTestAgentId(e.target.value)} style={{ width: 300 }} />
        <input placeholder="message" value={testMessage} onChange={(e) => setTestMessage(e.target.value)} style={{ flex: 1 }} />
        <button onClick={runTestChat}>Run</button>
      </div>
      {testResult && <p style={{ background: '#f3f4f6', padding: 8, marginTop: 8 }}>{testResult}</p>}

      <h3>New version</h3>
      <form onSubmit={createVersion} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 500 }}>
        <input placeholder="agent name (e.g. doc_qa)" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="description" value={description} onChange={(e) => setDescription(e.target.value)} required />
        <select value={modelRole} onChange={(e) => setModelRole(e.target.value)}>
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
        />
        <button type="submit">Create new version</button>
      </form>
    </div>
  );
}
