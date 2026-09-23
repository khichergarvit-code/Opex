import { useEffect, useState } from 'react';
import type { AdminUser, Role } from '@opex/shared';
import { ApiError, createAdminUser, fetchAdminUsers, setAdminUserStatus } from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/Badge';
import { DataTable } from '../../components/ui/DataTable';

export function UsersPage({ onBack: _onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('employee');
  const [clearance, setClearance] = useState(1);

  function reload() {
    fetchAdminUsers()
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load users'));
  }

  useEffect(reload, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createAdminUser({ email, name, password, role, clearance: clearance as 0 | 1 | 2 | 3 });
      setEmail('');
      setName('');
      setPassword('');
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to create user');
    }
  }

  async function toggle(userId: string, status: 'active' | 'disabled') {
    try {
      await setAdminUserStatus(userId, status);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to update user');
    }
  }

  return (
    <div>
      <PageHeader title="Users" description="Create and manage OpeX accounts." />
      {error && <p className="mb-4 text-sm text-danger-600">{error}</p>}

      <Card className="mb-4">
        <form onSubmit={handleCreate} className="flex flex-wrap gap-2">
          <input
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
          />
          <input
            placeholder="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
          />
          <input
            placeholder="password (min 12 chars)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
          />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm">
            <option value="employee">employee</option>
            <option value="workspace_admin">workspace_admin</option>
            <option value="super_admin">super_admin</option>
          </select>
          <select
            value={clearance}
            onChange={(e) => setClearance(Number(e.target.value))}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
          >
            <option value={0}>0 Public</option>
            <option value={1}>1 Internal</option>
            <option value={2}>2 Confidential</option>
            <option value={3}>3 Restricted</option>
          </select>
          <Button type="submit" variant="primary">
            Create user
          </Button>
        </form>
      </Card>

      <Card>
        <DataTable
          emptyMessage="No users yet"
          rows={rows}
          columns={[
            { key: 'email', label: 'Email' },
            { key: 'name', label: 'Name' },
            { key: 'role', label: 'Role' },
            { key: 'clearance', label: 'Clearance' },
            {
              key: 'status',
              label: 'Status',
              render: (r) => <StatusPill tone={r.status === 'active' ? 'success' : 'neutral'}>{r.status}</StatusPill>,
            },
            {
              key: 'actions',
              label: '',
              render: (r) =>
                r.status === 'active' ? (
                  <Button size="sm" onClick={() => toggle(r.id, 'disabled')}>
                    Disable
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => toggle(r.id, 'active')}>
                    Enable
                  </Button>
                ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
