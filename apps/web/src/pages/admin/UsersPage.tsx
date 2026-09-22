import { useEffect, useState } from 'react';
import type { AdminUser, Role } from '@opex/shared';
import { ApiError, createAdminUser, fetchAdminUsers, setAdminUserStatus } from '../../lib/api';

export function UsersPage({ onBack }: { onBack: () => void }) {
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
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <button onClick={onBack} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h2>Users</h2>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input placeholder="name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input
          placeholder="password (min 12 chars)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="employee">employee</option>
          <option value="workspace_admin">workspace_admin</option>
          <option value="super_admin">super_admin</option>
        </select>
        <select value={clearance} onChange={(e) => setClearance(Number(e.target.value))}>
          <option value={0}>0 Public</option>
          <option value={1}>1 Internal</option>
          <option value={2}>2 Confidential</option>
          <option value={3}>3 Restricted</option>
        </select>
        <button type="submit">Create user</button>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '6px 10px' }}>Email</th>
            <th style={{ padding: '6px 10px' }}>Name</th>
            <th style={{ padding: '6px 10px' }}>Role</th>
            <th style={{ padding: '6px 10px' }}>Clearance</th>
            <th style={{ padding: '6px 10px' }}>Status</th>
            <th style={{ padding: '6px 10px' }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '6px 10px' }}>{r.email}</td>
              <td style={{ padding: '6px 10px' }}>{r.name}</td>
              <td style={{ padding: '6px 10px' }}>{r.role}</td>
              <td style={{ padding: '6px 10px' }}>{r.clearance}</td>
              <td style={{ padding: '6px 10px' }}>{r.status}</td>
              <td style={{ padding: '6px 10px' }}>
                {r.status === 'active' ? (
                  <button onClick={() => toggle(r.id, 'disabled')}>Disable</button>
                ) : (
                  <button onClick={() => toggle(r.id, 'active')}>Enable</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p style={{ color: '#6b7280' }}>No users yet.</p>}
    </div>
  );
}
