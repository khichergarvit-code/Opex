import { useEffect, useState } from 'react';
import type { AdminUser, ApiGroup } from '@opex/shared';
import {
  addGroupMember,
  ApiError,
  createAdminGroup,
  fetchAdminGroups,
  fetchAdminUsers,
  removeGroupMember,
} from '../../lib/api';

export function GroupsPage({ onBack }: { onBack: () => void }) {
  const [groups, setGroups] = useState<ApiGroup[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addUserId, setAddUserId] = useState('');

  function reload() {
    fetchAdminGroups()
      .then(setGroups)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load groups'));
    fetchAdminUsers()
      .then(setUsers)
      .catch(() => {});
  }

  useEffect(reload, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createAdminGroup({ name });
      setName('');
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to create group');
    }
  }

  async function handleAddMember(groupId: string) {
    if (!addUserId) return;
    try {
      await addGroupMember(groupId, addUserId);
      setAddUserId('');
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to add member');
    }
  }

  async function handleRemoveMember(groupId: string, userId: string) {
    try {
      await removeGroupMember(groupId, userId);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to remove member');
    }
  }

  const userEmailById = new Map(users.map((u) => [u.id, u.email]));

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <button onClick={onBack} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h2>Groups</h2>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input placeholder="group name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button type="submit">Create group</button>
      </form>

      {groups.map((g) => (
        <div key={g.id} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginBottom: 8 }}>
          <div
            style={{ cursor: 'pointer', fontWeight: 600 }}
            onClick={() => setExpanded(expanded === g.id ? null : g.id)}
          >
            {g.name} ({g.memberIds.length} members)
          </div>
          {expanded === g.id && (
            <div style={{ marginTop: 8, fontSize: 13 }}>
              <ul>
                {g.memberIds.map((uid) => (
                  <li key={uid}>
                    {userEmailById.get(uid) ?? uid}{' '}
                    <button onClick={() => handleRemoveMember(g.id, uid)}>remove</button>
                  </li>
                ))}
              </ul>
              <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)}>
                <option value="">select user…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                  </option>
                ))}
              </select>
              <button onClick={() => handleAddMember(g.id)}>Add member</button>
            </div>
          )}
        </div>
      ))}
      {groups.length === 0 && <p style={{ color: '#6b7280' }}>No groups yet.</p>}
    </div>
  );
}
