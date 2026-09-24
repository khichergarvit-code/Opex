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
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Alert } from '../../components/ui/Alert';

export function GroupsPage({ onBack: _onBack }: { onBack: () => void }) {
  const [groups, setGroups] = useState<ApiGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addUserId, setAddUserId] = useState('');

  function reload() {
    setError(null);
    fetchAdminGroups()
      .then(setGroups)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'failed to load groups'))
      .finally(() => setGroupsLoading(false));
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
    <div>
      <PageHeader title="Groups" description="Group membership drives document ACLs." />
      {error && <Alert>{error}</Alert>}

      <Card className="mb-4">
        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            placeholder="group name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded-lg border border-line px-3 py-1.5 text-sm"
          />
          <Button type="submit" variant="primary">
            Create group
          </Button>
        </form>
      </Card>

      {groupsLoading ? (
        <Skeleton className="p-2" />
      ) : groups.length === 0 ? (
        error ? null : <EmptyState title="No groups yet" />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <Card key={g.id}>
              <button onClick={() => setExpanded(expanded === g.id ? null : g.id)} className="text-sm font-medium text-fg">
                {g.name} ({g.memberIds.length} members)
              </button>
              {expanded === g.id && (
                <div className="mt-3 flex flex-col gap-2 text-sm">
                  <ul className="flex flex-col gap-1">
                    {g.memberIds.map((uid) => (
                      <li key={uid} className="flex items-center justify-between">
                        <span>{userEmailById.get(uid) ?? uid}</span>
                        <Button size="sm" onClick={() => handleRemoveMember(g.id, uid)}>
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <select
                      value={addUserId}
                      onChange={(e) => setAddUserId(e.target.value)}
                      className="rounded-lg border border-line px-2 py-1 text-sm"
                    >
                      <option value="">select user…</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.email}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" variant="primary" onClick={() => handleAddMember(g.id)}>
                      Add member
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
