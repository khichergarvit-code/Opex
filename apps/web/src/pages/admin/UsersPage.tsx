import { useEffect, useState } from 'react';
import type { AdminUser, Role } from '@opex/shared';
import { ApiError, createAdminUser, fetchAdminUsers, setAdminUserStatus } from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/Badge';
import { DataTable } from '../../components/ui/DataTable';
import { SelectField, TextField } from '../../components/ui/Field';
import { Alert } from '../../components/ui/Alert';

export function UsersPage({ onBack: _onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('employee');
  const [clearance, setClearance] = useState(1);

  function reload() {
    setError(null);
    fetchAdminUsers()
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load users'))
      .finally(() => setLoading(false));
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
      {error && <Alert>{error}</Alert>}

      <Card className="mb-4">
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField label="Email" type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <TextField label="Name" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
          <TextField label="Password" type="password" placeholder="At least 12 characters" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="employee">Employee</option>
            <option value="workspace_admin">Workspace admin</option>
            <option value="super_admin">Super admin</option>
          </SelectField>
          <SelectField label="Clearance" hint="The most sensitive documents this person may read." value={clearance} onChange={(e) => setClearance(Number(e.target.value))}>
            <option value={0}>0 · Public</option>
            <option value={1}>1 · Internal</option>
            <option value={2}>2 · Confidential</option>
            <option value={3}>3 · Restricted</option>
          </SelectField>
          <div className="flex items-end">
            <Button type="submit" variant="primary">
              Create user
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <DataTable
          emptyMessage="No users yet"
          loading={loading}
          error={error}
          rows={rows}
          columns={[
            { key: 'email', label: 'Email' },
            { key: 'name', label: 'Name' },
            { key: 'role', label: 'Role' },
            { key: 'clearance', label: 'Clearance' },
            {
              key: 'status',
              label: 'Status',
              render: (r) => <StatusPill tone={r.status === 'active' ? 'active' : 'danger'}>{r.status === 'active' ? 'Active' : 'Disabled'}</StatusPill>,
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
